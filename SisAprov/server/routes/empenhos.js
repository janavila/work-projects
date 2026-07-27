const express = require('express');
const db = require('../db/database');
const { recalcularSaldo } = require('../services/saldo');
const { calcularValorAtual } = require('../services/notasCredito');
const { gerarPdfEmpenhos } = require('../services/pdfExport');
const { dataValida, hojeISO } = require('../utils/data');
const { itensDisponiveisDoEmpenho } = require('../services/itensDisponiveis');

const router = express.Router();

const EPSILON = 0.005;

const ORDER_COLUMNS = {
  data: 'e.data_emissao',
  dias: 'e.data_emissao',
  saldo: 'e.saldo_atual',
  planoInterno: 'nc.plano_interno',
};

function validarFavorecido(favorecido) {
  const digits = String(favorecido || '').replace(/\D/g, '');
  if (digits.length !== 11 && digits.length !== 14) {
    return null;
  }
  return digits;
}

// Quantidade só pode ser número natural positivo (sem negativos, sem casas decimais).
function quantidadeValida(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0;
}

function calcularDias(dataEmissao) {
  const emissao = new Date(dataEmissao);
  const hoje = new Date();
  return Math.floor((hoje - emissao) / (1000 * 60 * 60 * 24));
}

function baseSelect() {
  return `
    SELECT
      e.*,
      nc.numero_nc AS nc_numero,
      nc.plano_interno AS plano_interno,
      nc.data_emissao AS nc_data_emissao,
      (SELECT COUNT(*) FROM recebimentos r WHERE r.empenho_id = e.id) AS quantidade_provisoes,
      (SELECT COUNT(*) FROM anulacoes a WHERE a.empenho_id = e.id) AS quantidade_anulacoes
    FROM empenhos e
    LEFT JOIN notas_credito nc ON nc.id = e.nota_credito_id
  `;
}

// GET /api/empenhos - lista com filtros e ordenação
router.get('/', (req, res) => {
  const { planoInterno, favorecido, naturezaDespesa, dataInicio, dataFim, orderBy, orderDir, apenasAtivos, notaCreditoId, situacao } = req.query;

  const where = [];
  const params = {};

  if (planoInterno) {
    where.push('nc.plano_interno = @planoInterno');
    params.planoInterno = planoInterno;
  }
  if (favorecido) {
    where.push("e.favorecido LIKE '%' || @favorecido || '%'");
    params.favorecido = favorecido.replace(/\D/g, '') || favorecido;
  }
  if (naturezaDespesa) {
    where.push('e.natureza_despesa = @naturezaDespesa');
    params.naturezaDespesa = naturezaDespesa;
  }
  if (dataInicio) {
    where.push('e.data_emissao >= @dataInicio');
    params.dataInicio = dataInicio;
  }
  if (dataFim) {
    where.push('e.data_emissao <= @dataFim');
    params.dataFim = dataFim;
  }
  if (apenasAtivos === 'true') {
    where.push('e.saldo_atual > 0');
  }
  if (situacao === 'ativo') {
    where.push('e.saldo_atual > 0');
  } else if (situacao === 'liquidado') {
    where.push('e.saldo_atual <= 0');
  }
  if (notaCreditoId) {
    where.push('e.nota_credito_id = @notaCreditoId');
    params.notaCreditoId = notaCreditoId;
  }

  let sql = baseSelect();
  if (where.length) sql += ' WHERE ' + where.join(' AND ');

  const orderColumn = ORDER_COLUMNS[orderBy] || 'e.data_emissao';
  const dir = orderDir === 'asc' ? 'ASC' : 'DESC';
  sql += ` ORDER BY ${orderColumn} ${dir}`;

  const rows = db.prepare(sql).all(params);
  const resultado = rows.map((r) => ({ ...r, dias: calcularDias(r.data_emissao) }));

  res.json(resultado);
});

// GET /api/empenhos/extrair/pdf - extração em PDF dos empenhos ativos
router.get('/extrair/pdf', (req, res) => {
  const { planoInterno, favorecido, naturezaDespesa, dataInicio, dataFim } = req.query;

  const where = ['e.saldo_atual > 0'];
  const params = {};

  if (planoInterno) {
    where.push('nc.plano_interno = @planoInterno');
    params.planoInterno = planoInterno;
  }
  if (favorecido) {
    where.push("e.favorecido LIKE '%' || @favorecido || '%'");
    params.favorecido = favorecido.replace(/\D/g, '') || favorecido;
  }
  if (naturezaDespesa) {
    where.push('e.natureza_despesa = @naturezaDespesa');
    params.naturezaDespesa = naturezaDespesa;
  }
  if (dataInicio) {
    where.push('e.data_emissao >= @dataInicio');
    params.dataInicio = dataInicio;
  }
  if (dataFim) {
    where.push('e.data_emissao <= @dataFim');
    params.dataFim = dataFim;
  }

  const sql = baseSelect() + ' WHERE ' + where.join(' AND ') + ' ORDER BY e.data_emissao ASC';
  const rows = db.prepare(sql).all(params).map((r) => ({ ...r, dias: calcularDias(r.data_emissao) }));

  gerarPdfEmpenhos(res, rows);
});

// GET /api/empenhos/acompanhamento - empenhos na modalidade Ordinário com
// saldo, para a tela de Acompanhamento (entregas únicas: obras, serviços etc.)
router.get('/acompanhamento', (req, res) => {
  const sql = baseSelect() + " WHERE e.modalidade = 'Ordinário' AND e.saldo_atual > 0 ORDER BY e.data_emissao ASC";
  const rows = db.prepare(sql).all();
  res.json(rows.map((r) => ({ ...r, dias: calcularDias(r.data_emissao) })));
});

// GET /api/empenhos/:id - detalhe com itens
router.get('/:id', (req, res) => {
  const empenho = db.prepare(baseSelect() + ' WHERE e.id = ?').get(req.params.id);
  if (!empenho) return res.status(404).json({ erro: 'Empenho não encontrado' });

  const itens = db.prepare('SELECT * FROM itens_empenho WHERE empenho_id = ? ORDER BY numero').all(req.params.id);
  empenho.dias = calcularDias(empenho.data_emissao);
  res.json({ ...empenho, itens });
});

// GET /api/empenhos/:id/itens-disponiveis - itens com quantidade ainda disponível
// para recebimento/anulação (desconta o que já foi recebido e o que já foi anulado)
router.get('/:id/itens-disponiveis', (req, res) => {
  const { excluirRecebimentoId, excluirAnulacaoId } = req.query;
  const itens = itensDisponiveisDoEmpenho(req.params.id, {
    excluirRecebimentoId: excluirRecebimentoId ? Number(excluirRecebimentoId) : undefined,
    excluirAnulacaoId: excluirAnulacaoId ? Number(excluirAnulacaoId) : undefined,
  });
  res.json(itens);
});

function validarNotaCredito(nota_credito_id, data_emissao, valorGlobal, excluirEmpenhoId, ug) {
  if (!nota_credito_id) return null;

  const nc = db.prepare('SELECT * FROM notas_credito WHERE id = ?').get(nota_credito_id);
  if (!nc) return { status: 404, erro: 'Nota de Crédito não encontrada' };

  if (ug && nc.ug && ug !== nc.ug) {
    return { status: 400, erro: 'A UG do empenho deve ser igual à UG da Nota de Crédito selecionada.' };
  }

  if (data_emissao && nc.data_emissao && data_emissao < nc.data_emissao) {
    return { status: 400, erro: 'A data de emissão do empenho não pode ser anterior à data de emissão da Nota de Crédito.' };
  }

  const valorAtual = calcularValorAtual(nota_credito_id, excluirEmpenhoId);
  if (valorAtual - valorGlobal < -EPSILON) {
    return { status: 409, erro: 'Não é possível salvar: a Nota de Crédito ficaria com saldo negativo.' };
  }

  return null;
}

// POST /api/empenhos - criação
router.post('/', (req, res) => {
  const { numero_empenho, favorecido, nome_credor, data_emissao, ug, natureza_despesa, modalidade, nota_credito_id, descricao, itens } = req.body;

  const favorecidoLimpo = validarFavorecido(favorecido);
  if (!favorecidoLimpo) return res.status(400).json({ erro: 'Favorecido inválido' });

  if (!numero_empenho || !data_emissao || !ug || !natureza_despesa || !modalidade) {
    return res.status(400).json({ erro: 'Campos obrigatórios ausentes' });
  }
  if (!descricao || !String(descricao).trim()) {
    return res.status(400).json({ erro: 'A descrição do empenho é obrigatória' });
  }
  if (!dataValida(data_emissao)) {
    return res.status(400).json({ erro: 'Data de emissão inválida (não pode ser anterior a 2024)' });
  }
  if (data_emissao > hojeISO()) {
    return res.status(400).json({ erro: 'A data de emissão não pode ser posterior ao dia de hoje' });
  }
  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ erro: 'Inclua ao menos um item' });
  }
  if (itens.some((it) => !quantidadeValida(it.quantidade))) {
    return res.status(400).json({ erro: 'A quantidade dos itens deve ser um número inteiro positivo' });
  }

  const numeroEmpenhoLimpo = String(numero_empenho).trim();
  const duplicado = db.prepare('SELECT id FROM empenhos WHERE numero_empenho = ? AND ug = ?').get(numeroEmpenhoLimpo, ug);
  if (duplicado) {
    return res.status(409).json({ erro: 'Já existe um empenho cadastrado com este número para esta UG.' });
  }

  const valorGlobal = itens.reduce((soma, it) => soma + Number(it.quantidade) * Number(it.valor_unitario), 0);

  const erroNc = validarNotaCredito(nota_credito_id, data_emissao, valorGlobal, null, ug);
  if (erroNc) return res.status(erroNc.status).json({ erro: erroNc.erro });

  const inserirTudo = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO empenhos
        (numero_empenho, favorecido, nome_credor, data_emissao, ug, natureza_despesa, valor_global, saldo_atual, modalidade, nota_credito_id, descricao)
      VALUES (@numero_empenho, @favorecido, @nome_credor, @data_emissao, @ug, @natureza_despesa, @valor_global, @valor_global, @modalidade, @nota_credito_id, @descricao)
    `).run({
      numero_empenho: numeroEmpenhoLimpo,
      favorecido: favorecidoLimpo,
      nome_credor: nome_credor || null,
      data_emissao,
      ug,
      natureza_despesa,
      valor_global: valorGlobal,
      modalidade,
      nota_credito_id: nota_credito_id || null,
      descricao: descricao || null,
    });

    const empenhoId = info.lastInsertRowid;
    const inserirItem = db.prepare(`
      INSERT INTO itens_empenho (empenho_id, numero, descricao, quantidade, valor_unitario, valor_total)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    itens.forEach((it, idx) => {
      const valorTotal = Number(it.quantidade) * Number(it.valor_unitario);
      inserirItem.run(empenhoId, idx + 1, it.descricao, it.quantidade, it.valor_unitario, valorTotal);
    });

    return empenhoId;
  });

  const empenhoId = inserirTudo();
  res.status(201).json({ id: empenhoId });
});

// PUT /api/empenhos/:id - edição
router.put('/:id', (req, res) => {
  const id = req.params.id;
  const existente = db.prepare('SELECT * FROM empenhos WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'Empenho não encontrado' });

  const { numero_empenho, favorecido, nome_credor, data_emissao, ug, natureza_despesa, modalidade, nota_credito_id, descricao, itens } = req.body;

  const favorecidoLimpo = validarFavorecido(favorecido);
  if (!favorecidoLimpo) return res.status(400).json({ erro: 'Favorecido inválido' });

  if (!descricao || !String(descricao).trim()) {
    return res.status(400).json({ erro: 'A descrição do empenho é obrigatória' });
  }
  if (!dataValida(data_emissao)) {
    return res.status(400).json({ erro: 'Data de emissão inválida (não pode ser anterior a 2024)' });
  }
  if (data_emissao > hojeISO()) {
    return res.status(400).json({ erro: 'A data de emissão não pode ser posterior ao dia de hoje' });
  }

  const numeroEmpenhoLimpo = String(numero_empenho).trim();
  const duplicado = db.prepare('SELECT id FROM empenhos WHERE numero_empenho = ? AND ug = ? AND id != ?').get(numeroEmpenhoLimpo, ug, id);
  if (duplicado) {
    return res.status(409).json({ erro: 'Já existe um empenho cadastrado com este número para esta UG.' });
  }

  if (Array.isArray(itens) && itens.some((it) => !quantidadeValida(it.quantidade))) {
    return res.status(400).json({ erro: 'A quantidade dos itens deve ser um número inteiro positivo' });
  }

  const qtdRecebimentos = db.prepare('SELECT COUNT(*) AS n FROM recebimentos WHERE empenho_id = ?').get(id).n;
  const qtdAnulacoes = db.prepare('SELECT COUNT(*) AS n FROM anulacoes WHERE empenho_id = ?').get(id).n;

  if (Array.isArray(itens) && (qtdRecebimentos > 0 || qtdAnulacoes > 0)) {
    return res.status(409).json({ erro: 'Não é possível editar os itens de um empenho que já possui recebimentos ou anulações vinculadas.' });
  }

  const valorGlobal = Array.isArray(itens)
    ? itens.reduce((soma, it) => soma + Number(it.quantidade) * Number(it.valor_unitario), 0)
    : existente.valor_global;

  const erroNc = validarNotaCredito(nota_credito_id, data_emissao, valorGlobal, id, ug);
  if (erroNc) return res.status(erroNc.status).json({ erro: erroNc.erro });

  const atualizarTudo = db.transaction(() => {
    if (Array.isArray(itens)) {
      db.prepare('DELETE FROM itens_empenho WHERE empenho_id = ?').run(id);
      const inserirItem = db.prepare(`
        INSERT INTO itens_empenho (empenho_id, numero, descricao, quantidade, valor_unitario, valor_total)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      itens.forEach((it, idx) => {
        const valorTotal = Number(it.quantidade) * Number(it.valor_unitario);
        inserirItem.run(id, idx + 1, it.descricao, it.quantidade, it.valor_unitario, valorTotal);
      });
    }

    db.prepare(`
      UPDATE empenhos SET
        numero_empenho = @numero_empenho,
        favorecido = @favorecido,
        nome_credor = @nome_credor,
        data_emissao = @data_emissao,
        ug = @ug,
        natureza_despesa = @natureza_despesa,
        valor_global = @valor_global,
        modalidade = @modalidade,
        nota_credito_id = @nota_credito_id,
        descricao = @descricao
      WHERE id = @id
    `).run({
      id,
      numero_empenho: numeroEmpenhoLimpo,
      favorecido: favorecidoLimpo,
      nome_credor: nome_credor || null,
      data_emissao,
      ug,
      natureza_despesa,
      valor_global: valorGlobal,
      modalidade,
      nota_credito_id: nota_credito_id || null,
      descricao: descricao || null,
    });

    recalcularSaldo(id);
  });

  atualizarTudo();
  res.json({ ok: true });
});

// PATCH /api/empenhos/:id/observacao - adiciona/edita a observação (via Visualizar Empenhos)
router.patch('/:id/observacao', (req, res) => {
  const id = req.params.id;
  const existente = db.prepare('SELECT id FROM empenhos WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'Empenho não encontrado' });

  const { observacao } = req.body;
  db.prepare('UPDATE empenhos SET observacao = ? WHERE id = ?').run(observacao || null, id);
  res.json({ ok: true });
});

const CAMPOS_ACOMPANHAMENTO = {
  enviado: 'acompanhamento_enviado',
  recebido_empresa: 'acompanhamento_recebido_empresa',
  recebido_om: 'acompanhamento_recebido_om',
  notificado: 'acompanhamento_notificado',
  processo_administrativo: 'acompanhamento_processo_administrativo',
};

// PATCH /api/empenhos/:id/acompanhamento - marca/desmarca uma caixa de
// acompanhamento (Enviado, Recebido pela Empresa, Recebido na OM, Notificado,
// Processo Administrativo)
router.patch('/:id/acompanhamento', (req, res) => {
  const id = req.params.id;
  const existente = db.prepare('SELECT id FROM empenhos WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'Empenho não encontrado' });

  const coluna = CAMPOS_ACOMPANHAMENTO[req.body.campo];
  if (!coluna) return res.status(400).json({ erro: 'Campo de acompanhamento inválido' });

  db.prepare(`UPDATE empenhos SET ${coluna} = ? WHERE id = ?`).run(req.body.valor ? 1 : 0, id);
  res.json({ ok: true });
});

// DELETE /api/empenhos/:id
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const existente = db.prepare('SELECT id FROM empenhos WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'Empenho não encontrado' });

  const qtdRecebimentos = db.prepare('SELECT COUNT(*) AS n FROM recebimentos WHERE empenho_id = ?').get(id).n;
  const qtdAnulacoes = db.prepare('SELECT COUNT(*) AS n FROM anulacoes WHERE empenho_id = ?').get(id).n;

  if (qtdRecebimentos > 0 || qtdAnulacoes > 0) {
    return res.status(409).json({ erro: 'Não é possível excluir um empenho que já possui recebimentos ou anulações vinculadas.' });
  }

  db.prepare('DELETE FROM empenhos WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
