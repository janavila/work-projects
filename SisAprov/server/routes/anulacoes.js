const express = require('express');
const db = require('../db/database');
const { recalcularSaldo, recalcularValorGlobal } = require('../services/saldo');
const { dataValida, hojeISO } = require('../utils/data');
const { quantidadeDisponivel, ajustarQuantidadeItem } = require('../services/itensDisponiveis');

const router = express.Router();

function baseSelect() {
  return `
    SELECT
      a.*,
      e.numero_empenho,
      e.favorecido,
      e.nome_credor
    FROM anulacoes a
    JOIN empenhos e ON e.id = a.empenho_id
  `;
}

function itensDaAnulacao(anulacaoId) {
  return db.prepare(`
    SELECT ia.*, ie.descricao
    FROM itens_anulados ia
    JOIN itens_empenho ie ON ie.id = ia.item_empenho_id
    WHERE ia.anulacao_id = ?
  `).all(anulacaoId);
}

// GET /api/anulacoes?empenho_id= - lista (geral ou filtrada por empenho)
router.get('/', (req, res) => {
  const { empenho_id } = req.query;

  let sql = baseSelect();
  const params = [];
  if (empenho_id) {
    sql += ' WHERE a.empenho_id = ?';
    params.push(empenho_id);
  }
  sql += ' ORDER BY a.data DESC, a.id DESC';

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map((a) => ({ ...a, itens: itensDaAnulacao(a.id) })));
});

// GET /api/anulacoes/:id
router.get('/:id', (req, res) => {
  const anulacao = db.prepare(baseSelect() + ' WHERE a.id = ?').get(req.params.id);
  if (!anulacao) return res.status(404).json({ erro: 'Anulação não encontrada' });
  res.json({ ...anulacao, itens: itensDaAnulacao(anulacao.id) });
});

function validarItens(empenhoId, itens, opts) {
  const itensValidados = [];
  for (const it of itens) {
    const itemEmpenho = quantidadeDisponivel(it.item_empenho_id, opts);
    if (!itemEmpenho || itemEmpenho.empenho_id !== Number(empenhoId)) {
      return { erro: 'Item não pertence ao empenho selecionado' };
    }
    const quantidade = Number(it.quantidade);
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      return { erro: `A quantidade a anular do item "${itemEmpenho.descricao}" deve ser um número inteiro positivo` };
    }
    if (quantidade > itemEmpenho.quantidade_disponivel) {
      return { erro: `Quantidade indisponível para anular o item "${itemEmpenho.descricao}"` };
    }
    itensValidados.push({
      item_empenho_id: itemEmpenho.id,
      quantidade,
      valor_unitario: itemEmpenho.valor_unitario,
      valor_total: quantidade * itemEmpenho.valor_unitario,
    });
  }
  return { itensValidados };
}

function validarData(data, empenho) {
  if (!dataValida(data)) {
    return 'Data inválida (não pode ser anterior a 2024)';
  }
  if (data < empenho.data_emissao) {
    return 'A data da anulação não pode ser anterior à data de emissão do empenho.';
  }
  if (data > hojeISO()) {
    return 'A data da anulação não pode ser posterior ao dia de hoje.';
  }
  return null;
}

// POST /api/anulacoes
router.post('/', (req, res) => {
  const { empenho_id, data, itens } = req.body;

  if (!empenho_id || !data) {
    return res.status(400).json({ erro: 'Campos obrigatórios ausentes' });
  }
  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ erro: 'Selecione ao menos um item para anular' });
  }

  const empenho = db.prepare('SELECT * FROM empenhos WHERE id = ?').get(empenho_id);
  if (!empenho) return res.status(404).json({ erro: 'Empenho não encontrado' });

  const erroData = validarData(data, empenho);
  if (erroData) return res.status(400).json({ erro: erroData });

  const { erro: erroItens, itensValidados } = validarItens(empenho_id, itens, {});
  if (erroItens) return res.status(409).json({ erro: erroItens });

  const valorAnulado = itensValidados.reduce((soma, it) => soma + it.valor_total, 0);

  const executar = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO anulacoes (empenho_id, valor_anulado, data)
      VALUES (?, ?, ?)
    `).run(empenho_id, valorAnulado, data);

    const anulacaoId = info.lastInsertRowid;
    const inserirItem = db.prepare(`
      INSERT INTO itens_anulados (anulacao_id, item_empenho_id, quantidade, valor_unitario, valor_total)
      VALUES (?, ?, ?, ?, ?)
    `);
    itensValidados.forEach((it) => {
      inserirItem.run(anulacaoId, it.item_empenho_id, it.quantidade, it.valor_unitario, it.valor_total);
      ajustarQuantidadeItem(it.item_empenho_id, -it.quantidade);
    });

    recalcularValorGlobal(empenho_id);
    recalcularSaldo(empenho_id);
    return anulacaoId;
  });

  const id = executar();
  res.status(201).json({ id });
});

// PUT /api/anulacoes/:id - edição
router.put('/:id', (req, res) => {
  const id = req.params.id;
  const existente = db.prepare('SELECT * FROM anulacoes WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'Anulação não encontrada' });

  const { data, itens } = req.body;

  if (!data) return res.status(400).json({ erro: 'Campos obrigatórios ausentes' });
  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ erro: 'Selecione ao menos um item para anular' });
  }

  const empenho = db.prepare('SELECT * FROM empenhos WHERE id = ?').get(existente.empenho_id);
  const erroData = validarData(data, empenho);
  if (erroData) return res.status(400).json({ erro: erroData });

  const itensAntigos = itensDaAnulacao(id);

  const executar = db.transaction(() => {
    // Desfaz o efeito da versão anterior desta anulação antes de revalidar.
    itensAntigos.forEach((it) => ajustarQuantidadeItem(it.item_empenho_id, it.quantidade));
    db.prepare('DELETE FROM itens_anulados WHERE anulacao_id = ?').run(id);

    const { erro: erroItens, itensValidados } = validarItens(existente.empenho_id, itens, {});
    if (erroItens) {
      const erro = new Error(erroItens);
      erro.status = 409;
      throw erro;
    }

    const inserirItem = db.prepare(`
      INSERT INTO itens_anulados (anulacao_id, item_empenho_id, quantidade, valor_unitario, valor_total)
      VALUES (?, ?, ?, ?, ?)
    `);
    const valorAnulado = itensValidados.reduce((soma, it) => soma + it.valor_total, 0);
    itensValidados.forEach((it) => {
      inserirItem.run(id, it.item_empenho_id, it.quantidade, it.valor_unitario, it.valor_total);
      ajustarQuantidadeItem(it.item_empenho_id, -it.quantidade);
    });

    db.prepare('UPDATE anulacoes SET valor_anulado = ?, data = ? WHERE id = ?').run(valorAnulado, data, id);

    recalcularValorGlobal(existente.empenho_id);
    recalcularSaldo(existente.empenho_id);
  });

  try {
    executar();
  } catch (erro) {
    return res.status(erro.status || 500).json({ erro: erro.message || 'Erro interno do servidor' });
  }

  res.json({ ok: true });
});

// DELETE /api/anulacoes/:id
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const existente = db.prepare('SELECT * FROM anulacoes WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'Anulação não encontrada' });

  const itensAntigos = itensDaAnulacao(id);

  const executar = db.transaction(() => {
    itensAntigos.forEach((it) => ajustarQuantidadeItem(it.item_empenho_id, it.quantidade));
    db.prepare('DELETE FROM anulacoes WHERE id = ?').run(id);
    recalcularValorGlobal(existente.empenho_id);
    recalcularSaldo(existente.empenho_id);
  });
  executar();

  res.json({ ok: true });
});

module.exports = router;
