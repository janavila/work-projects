const express = require('express');
const db = require('../db/database');
const { dataValida, hojeISO } = require('../utils/data');

const router = express.Router();

// valor_global dos empenhos já é líquido de anulações (elas reduzem a
// quantidade/valor dos itens permanentemente), então não somamos anulações
// de volta aqui — isso causaria contagem em dobro.
function baseSelectComValorAtual() {
  return `
    SELECT
      nc.*,
      nc.valor_total
        - COALESCE((SELECT SUM(e.valor_global) FROM empenhos e WHERE e.nota_credito_id = nc.id), 0) AS valor_atual
    FROM notas_credito nc
  `;
}

function calcularDiasRestantes(prazo) {
  if (!prazo) return null;
  const hoje = new Date(hojeISO() + 'T00:00:00');
  const alvo = new Date(prazo + 'T00:00:00');
  return Math.round((alvo - hoje) / (1000 * 60 * 60 * 24));
}

function comDiasPrazo(row) {
  return { ...row, dias_prazo: calcularDiasRestantes(row.prazo) };
}

function normalizar(valor) {
  return valor === undefined || valor === null ? '' : String(valor).trim();
}

// Considera duplicada quando Número da NC, PTRES, Fonte, ND, UGE, Plano Interno
// E UG coincidem — NCs iguais em tudo mais são permitidas se a UG for diferente.
function ncDuplicada(dados, excluirId) {
  const existentes = db.prepare('SELECT * FROM notas_credito').all();
  return existentes.some((nc) => {
    if (excluirId && String(nc.id) === String(excluirId)) return false;
    return normalizar(nc.numero_nc) === normalizar(dados.numero_nc)
      && normalizar(nc.ptres) === normalizar(dados.ptres)
      && normalizar(nc.fonte) === normalizar(dados.fonte)
      && normalizar(nc.nd) === normalizar(dados.nd)
      && normalizar(nc.uge) === normalizar(dados.uge)
      && normalizar(nc.plano_interno) === normalizar(dados.plano_interno)
      && normalizar(nc.ug) === normalizar(dados.ug);
  });
}

// GET /api/notas-credito - lista (usada em "Situação Geral" e na seleção do formulário de Empenho)
router.get('/', (req, res) => {
  const rows = db.prepare(baseSelectComValorAtual() + ' ORDER BY nc.data_emissao DESC').all();
  res.json(rows.map(comDiasPrazo));
});

// GET /api/notas-credito/:id
router.get('/:id', (req, res) => {
  const nc = db.prepare(baseSelectComValorAtual() + ' WHERE nc.id = ?').get(req.params.id);
  if (!nc) return res.status(404).json({ erro: 'Nota de Crédito não encontrada' });
  res.json(comDiasPrazo(nc));
});

function validarCampos(body) {
  const { data_emissao, uge, ug, numero_nc, observacao, nd, valor_total, prazo } = body;

  if (!data_emissao || !uge || !ug || !numero_nc || !nd || valor_total === undefined || !prazo) {
    return 'Campos obrigatórios ausentes';
  }
  if (!observacao || !String(observacao).trim()) {
    return 'A observação é obrigatória';
  }
  if (!dataValida(data_emissao)) {
    return 'Data de emissão inválida (não pode ser anterior a 2024)';
  }
  if (data_emissao > hojeISO()) {
    return 'A data de emissão não pode ser posterior ao dia de hoje';
  }
  if (!dataValida(prazo)) {
    return 'Prazo inválido (não pode ser anterior a 2024)';
  }
  if (prazo < data_emissao) {
    return 'O Prazo não pode ser anterior à Data de Emissão';
  }
  if (!(Number(valor_total) > 0)) {
    return 'O valor total deve ser maior que zero';
  }
  return null;
}

// POST /api/notas-credito
router.post('/', (req, res) => {
  const erro = validarCampos(req.body);
  if (erro) return res.status(400).json({ erro });

  if (ncDuplicada(req.body, null)) {
    return res.status(409).json({ erro: 'Já existe uma Nota de Crédito com este Número da NC, PTRES, Fonte, ND, UGE e Plano Interno.' });
  }

  const { data_emissao, uge, ug, numero_nc, observacao, ptres, fonte, nd, plano_interno, valor_total, prazo } = req.body;

  const info = db.prepare(`
    INSERT INTO notas_credito (data_emissao, uge, ug, numero_nc, observacao, ptres, fonte, nd, plano_interno, valor_total, prazo)
    VALUES (@data_emissao, @uge, @ug, @numero_nc, @observacao, @ptres, @fonte, @nd, @plano_interno, @valor_total, @prazo)
  `).run({
    data_emissao,
    uge,
    ug,
    numero_nc,
    observacao: observacao.trim(),
    ptres: ptres || null,
    fonte: fonte || null,
    nd,
    plano_interno: plano_interno || null,
    valor_total: Number(valor_total),
    prazo,
  });

  res.status(201).json({ id: info.lastInsertRowid });
});

// PUT /api/notas-credito/:id
router.put('/:id', (req, res) => {
  const id = req.params.id;
  const existente = db.prepare('SELECT id FROM notas_credito WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'Nota de Crédito não encontrada' });

  const erro = validarCampos(req.body);
  if (erro) return res.status(400).json({ erro });

  if (ncDuplicada(req.body, id)) {
    return res.status(409).json({ erro: 'Já existe uma Nota de Crédito com este Número da NC, PTRES, Fonte, ND, UGE e Plano Interno.' });
  }

  const { data_emissao, uge, ug, numero_nc, observacao, ptres, fonte, nd, plano_interno, valor_total, prazo } = req.body;

  db.prepare(`
    UPDATE notas_credito SET
      data_emissao = @data_emissao, uge = @uge, ug = @ug, numero_nc = @numero_nc,
      observacao = @observacao, ptres = @ptres, fonte = @fonte, nd = @nd,
      plano_interno = @plano_interno, valor_total = @valor_total, prazo = @prazo
    WHERE id = @id
  `).run({
    id,
    data_emissao,
    uge,
    ug,
    numero_nc,
    observacao: observacao.trim(),
    ptres: ptres || null,
    fonte: fonte || null,
    nd,
    plano_interno: plano_interno || null,
    valor_total: Number(valor_total),
    prazo,
  });

  res.json({ ok: true });
});

// DELETE /api/notas-credito/:id
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const existente = db.prepare('SELECT id FROM notas_credito WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'Nota de Crédito não encontrada' });

  const qtdEmpenhos = db.prepare('SELECT COUNT(*) AS n FROM empenhos WHERE nota_credito_id = ?').get(id).n;
  if (qtdEmpenhos > 0) {
    return res.status(409).json({ erro: 'Não é possível excluir uma Nota de Crédito que já possui empenhos vinculados.' });
  }

  db.prepare('DELETE FROM notas_credito WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
