const express = require('express');
const db = require('../db/database');
const { recalcularSaldo } = require('../services/saldo');
const { dataValida, hojeISO } = require('../utils/data');
const { quantidadeDisponivel, ajustarQuantidadeItem } = require('../services/itensDisponiveis');

const router = express.Router();

const EPSILON = 0.005;

const ORDER_COLUMNS = {
  data: 'r.data_recebimento',
  numeroEmpenho: 'e.numero_empenho',
};

function baseSelect() {
  return `
    SELECT
      r.*,
      e.numero_empenho,
      e.favorecido,
      e.nome_credor,
      nc.plano_interno AS plano_interno,
      (SELECT COUNT(*) FROM recebimentos r2 WHERE r2.empenho_id = r.empenho_id AND r2.id <= r.id) AS numero_provisao
    FROM recebimentos r
    JOIN empenhos e ON e.id = r.empenho_id
    LEFT JOIN notas_credito nc ON nc.id = e.nota_credito_id
  `;
}

function itensDoRecebimento(recebimentoId) {
  return db.prepare(`
    SELECT ir.*, ie.descricao
    FROM itens_recebidos ir
    JOIN itens_empenho ie ON ie.id = ir.item_empenho_id
    WHERE ir.recebimento_id = ?
  `).all(recebimentoId);
}

// GET /api/recebimentos - lista com filtros e ordenação
router.get('/', (req, res) => {
  const { dataInicio, dataFim, favorecido, empenhoId, numeroNotaFiscal, relatorio, orderBy, orderDir } = req.query;

  const where = [];
  const params = {};

  if (dataInicio) {
    where.push('r.data_recebimento >= @dataInicio');
    params.dataInicio = dataInicio;
  }
  if (dataFim) {
    where.push('r.data_recebimento <= @dataFim');
    params.dataFim = dataFim;
  }
  if (favorecido) {
    where.push("e.favorecido LIKE '%' || @favorecido || '%'");
    params.favorecido = favorecido.replace(/\D/g, '') || favorecido;
  }
  if (empenhoId) {
    where.push('r.empenho_id = @empenhoId');
    params.empenhoId = empenhoId;
  }
  if (numeroNotaFiscal) {
    where.push("r.numero_nota_fiscal LIKE '%' || @numeroNotaFiscal || '%'");
    params.numeroNotaFiscal = numeroNotaFiscal;
  }
  if (relatorio === 'true') {
    where.push('r.relatorio = 1');
  } else if (relatorio === 'false') {
    where.push('r.relatorio = 0');
  }

  let sql = baseSelect();
  if (where.length) sql += ' WHERE ' + where.join(' AND ');

  const orderColumn = ORDER_COLUMNS[orderBy] || ORDER_COLUMNS.data;
  const dir = orderDir === 'asc' ? 'ASC' : 'DESC';
  sql += ` ORDER BY ${orderColumn} ${dir}`;

  const rows = db.prepare(sql).all(params);
  const resultado = rows.map((r) => ({ ...r, itens: itensDoRecebimento(r.id), relatorio: Boolean(r.relatorio) }));
  res.json(resultado);
});

// GET /api/recebimentos/:id
router.get('/:id', (req, res) => {
  const recebimento = db.prepare(baseSelect() + ' WHERE r.id = ?').get(req.params.id);
  if (!recebimento) return res.status(404).json({ erro: 'Recebimento não encontrado' });
  res.json({ ...recebimento, itens: itensDoRecebimento(recebimento.id), relatorio: Boolean(recebimento.relatorio) });
});

function validarDadosBasicos({ itens, numero_nota_fiscal, data_nota_fiscal, valor_nf, data_recebimento }) {
  if (!Array.isArray(itens) || itens.length === 0) {
    return { erro: 'Selecione ao menos um item recebido' };
  }
  if (!numero_nota_fiscal || !data_nota_fiscal || valor_nf === undefined || !data_recebimento) {
    return { erro: 'Campos obrigatórios ausentes' };
  }
  if (!dataValida(data_nota_fiscal)) {
    return { erro: 'Data da Nota Fiscal inválida (não pode ser anterior a 2024)' };
  }
  if (!dataValida(data_recebimento)) {
    return { erro: 'Data de Recebimento inválida (não pode ser anterior a 2024)' };
  }
  if (data_nota_fiscal > hojeISO()) {
    return { erro: 'A data da Nota Fiscal não pode ser posterior ao dia de hoje.' };
  }
  if (data_recebimento > hojeISO()) {
    return { erro: 'A data de Recebimento não pode ser posterior ao dia de hoje.' };
  }
  return null;
}

function validarDatasContraEmpenho(empenho, data_nota_fiscal, data_recebimento) {
  if (data_nota_fiscal < empenho.data_emissao) {
    return { erro: 'A data da Nota Fiscal não pode ser anterior à data de emissão do empenho.' };
  }
  if (data_recebimento < empenho.data_emissao) {
    return { erro: 'A data de Recebimento não pode ser anterior à data de emissão do empenho.' };
  }
  if (data_recebimento < data_nota_fiscal) {
    return { erro: 'A data de Recebimento não pode ser anterior à data da Nota Fiscal.' };
  }
  return null;
}

function validarItens(empenhoId, itens, opts) {
  const itensValidados = [];
  for (const it of itens) {
    const itemEmpenho = quantidadeDisponivel(it.item_empenho_id, opts);
    if (!itemEmpenho || itemEmpenho.empenho_id !== Number(empenhoId)) {
      return { erro: 'Item não pertence ao empenho selecionado' };
    }
    const quantidade = Number(it.quantidade);
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      return { erro: `A quantidade do item "${itemEmpenho.descricao}" deve ser um número inteiro positivo` };
    }
    if (quantidade > itemEmpenho.quantidade_disponivel) {
      return { erro: `Quantidade indisponível para o item "${itemEmpenho.descricao}"` };
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

// POST /api/recebimentos
router.post('/', (req, res) => {
  const { empenho_id, itens, numero_nota_fiscal, data_nota_fiscal, valor_nf, data_recebimento, comissao_id } = req.body;

  if (!empenho_id) return res.status(400).json({ erro: 'Selecione o empenho' });

  const erroBasico = validarDadosBasicos(req.body);
  if (erroBasico) return res.status(400).json(erroBasico);

  const empenho = db.prepare('SELECT * FROM empenhos WHERE id = ?').get(empenho_id);
  if (!empenho) return res.status(404).json({ erro: 'Empenho não encontrado' });
  if (empenho.saldo_atual <= 0) {
    return res.status(409).json({ erro: 'Este empenho não possui saldo disponível' });
  }

  const erroDatas = validarDatasContraEmpenho(empenho, data_nota_fiscal, data_recebimento);
  if (erroDatas) return res.status(400).json(erroDatas);

  // O número da NF só pode se repetir se o favorecido for diferente.
  const nfDuplicada = db.prepare(`
    SELECT r.id FROM recebimentos r
    JOIN empenhos e2 ON e2.id = r.empenho_id
    WHERE r.numero_nota_fiscal = ? AND e2.favorecido = ?
  `).get(String(numero_nota_fiscal).trim(), empenho.favorecido);
  if (nfDuplicada) {
    return res.status(409).json({ erro: 'Já existe um recebimento com este número de Nota Fiscal para este favorecido.' });
  }

  if (empenho.modalidade === 'Ordinário') {
    const qtdRecebimentos = db.prepare('SELECT COUNT(*) AS n FROM recebimentos WHERE empenho_id = ?').get(empenho_id).n;
    if (qtdRecebimentos > 0) {
      return res.status(409).json({ erro: 'Empenhos na modalidade Ordinário admitem apenas um único recebimento.' });
    }
  }

  const { erro: erroItens, itensValidados } = validarItens(empenho_id, itens, {});
  if (erroItens) return res.status(409).json({ erro: erroItens });

  const valorTotalNe = itensValidados.reduce((soma, it) => soma + it.valor_total, 0);

  if (Math.abs(Number(valor_nf) - valorTotalNe) > EPSILON) {
    return res.status(400).json({ erro: 'O valor da Nota Fiscal deve ser exatamente igual ao Valor Total da NE.' });
  }

  const comissaoEscolhida = comissao_id
    ? db.prepare('SELECT * FROM comissoes WHERE id = ?').get(comissao_id)
    : db.prepare('SELECT * FROM comissoes ORDER BY CAST(bi_nomeacao AS INTEGER) DESC LIMIT 1').get();
  const presidenteTexto = comissaoEscolhida
    ? `${comissaoEscolhida.presidente_posto} ${comissaoEscolhida.presidente_nome}`
    : null;

  const executar = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO recebimentos
        (empenho_id, valor_total_ne, numero_nota_fiscal, data_nota_fiscal, valor_nf, data_recebimento, comissao_id, presidente_comissao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      empenho_id,
      valorTotalNe,
      String(numero_nota_fiscal).trim(),
      data_nota_fiscal,
      valor_nf,
      data_recebimento,
      comissaoEscolhida ? comissaoEscolhida.id : null,
      presidenteTexto
    );

    const recebimentoId = info.lastInsertRowid;
    const inserirItem = db.prepare(`
      INSERT INTO itens_recebidos (recebimento_id, item_empenho_id, quantidade, valor_unitario, valor_total)
      VALUES (?, ?, ?, ?, ?)
    `);
    itensValidados.forEach((it) => {
      inserirItem.run(recebimentoId, it.item_empenho_id, it.quantidade, it.valor_unitario, it.valor_total);
      ajustarQuantidadeItem(it.item_empenho_id, -it.quantidade);
    });

    recalcularSaldo(empenho_id);
    return recebimentoId;
  });

  const id = executar();
  res.status(201).json({ id });
});

// PUT /api/recebimentos/:id - edição
router.put('/:id', (req, res) => {
  const id = req.params.id;
  const existente = db.prepare('SELECT * FROM recebimentos WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'Recebimento não encontrado' });

  const { itens, numero_nota_fiscal, data_nota_fiscal, valor_nf, data_recebimento, comissao_id } = req.body;

  const erroBasico = validarDadosBasicos(req.body);
  if (erroBasico) return res.status(400).json(erroBasico);

  const empenho = db.prepare('SELECT * FROM empenhos WHERE id = ?').get(existente.empenho_id);

  const erroDatas = validarDatasContraEmpenho(empenho, data_nota_fiscal, data_recebimento);
  if (erroDatas) return res.status(400).json(erroDatas);

  const nfDuplicada = db.prepare(`
    SELECT r.id FROM recebimentos r
    JOIN empenhos e2 ON e2.id = r.empenho_id
    WHERE r.numero_nota_fiscal = ? AND e2.favorecido = ? AND r.id != ?
  `).get(String(numero_nota_fiscal).trim(), empenho.favorecido, id);
  if (nfDuplicada) {
    return res.status(409).json({ erro: 'Já existe um recebimento com este número de Nota Fiscal para este favorecido.' });
  }

  const comissaoEscolhida = comissao_id
    ? db.prepare('SELECT * FROM comissoes WHERE id = ?').get(comissao_id)
    : null;
  const presidenteTexto = comissaoEscolhida
    ? `${comissaoEscolhida.presidente_posto} ${comissaoEscolhida.presidente_nome}`
    : existente.presidente_comissao;

  const itensAntigos = itensDoRecebimento(id);

  const executar = db.transaction(() => {
    // Desfaz o efeito da versão anterior deste recebimento antes de revalidar.
    itensAntigos.forEach((it) => ajustarQuantidadeItem(it.item_empenho_id, it.quantidade));
    db.prepare('DELETE FROM itens_recebidos WHERE recebimento_id = ?').run(id);

    const { erro: erroItens, itensValidados } = validarItens(existente.empenho_id, itens, {});
    if (erroItens) {
      const erro = new Error(erroItens);
      erro.status = 409;
      throw erro;
    }

    const valorTotalNe = itensValidados.reduce((soma, it) => soma + it.valor_total, 0);
    if (Math.abs(Number(valor_nf) - valorTotalNe) > EPSILON) {
      const erro = new Error('O valor da Nota Fiscal deve ser exatamente igual ao Valor Total da NE.');
      erro.status = 400;
      throw erro;
    }

    const inserirItem = db.prepare(`
      INSERT INTO itens_recebidos (recebimento_id, item_empenho_id, quantidade, valor_unitario, valor_total)
      VALUES (?, ?, ?, ?, ?)
    `);
    itensValidados.forEach((it) => {
      inserirItem.run(id, it.item_empenho_id, it.quantidade, it.valor_unitario, it.valor_total);
      ajustarQuantidadeItem(it.item_empenho_id, -it.quantidade);
    });

    db.prepare(`
      UPDATE recebimentos SET
        valor_total_ne = ?, numero_nota_fiscal = ?, data_nota_fiscal = ?,
        valor_nf = ?, data_recebimento = ?,
        comissao_id = COALESCE(?, comissao_id), presidente_comissao = ?
      WHERE id = ?
    `).run(
      valorTotalNe,
      String(numero_nota_fiscal).trim(),
      data_nota_fiscal,
      valor_nf,
      data_recebimento,
      comissaoEscolhida ? comissaoEscolhida.id : null,
      presidenteTexto,
      id
    );

    recalcularSaldo(existente.empenho_id);
  });

  try {
    executar();
  } catch (erro) {
    return res.status(erro.status || 500).json({ erro: erro.message || 'Erro interno do servidor' });
  }

  res.json({ ok: true });
});

// DELETE /api/recebimentos/:id
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const existente = db.prepare('SELECT * FROM recebimentos WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'Recebimento não encontrado' });

  const itensAntigos = itensDoRecebimento(id);

  const executar = db.transaction(() => {
    itensAntigos.forEach((it) => ajustarQuantidadeItem(it.item_empenho_id, it.quantidade));
    db.prepare('DELETE FROM recebimentos WHERE id = ?').run(id);
    recalcularSaldo(existente.empenho_id);
  });
  executar();

  res.json({ ok: true });
});

// PATCH /api/recebimentos/:id/relatorio - marca/desmarca o recebimento para o relatório
router.patch('/:id/relatorio', (req, res) => {
  const existente = db.prepare('SELECT id FROM recebimentos WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Recebimento não encontrado' });

  db.prepare('UPDATE recebimentos SET relatorio = ? WHERE id = ?').run(req.body.relatorio ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
