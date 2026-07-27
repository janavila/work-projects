const express = require('express');
const db = require('../db/database');
const { dataValida } = require('../utils/data');

const router = express.Router();

const POSTOS_PRESIDENTE = ['1º Ten', '2º Ten'];
const POSTOS_MEMBRO = ['3º Sgt', '2º Sgt', '1º Sgt'];
const POSTOS_FISCAL = ['Cel', 'TC', 'Maj'];
const NOME_APENAS_TEXTO = /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/;

function validarCampos(body) {
  const {
    bi_nomeacao, data_nomeacao, mes,
    presidente_nome, presidente_posto,
    membro1_nome, membro1_posto,
    membro2_nome, membro2_posto,
    fiscal_nome, fiscal_posto,
  } = body;

  if (!bi_nomeacao || !data_nomeacao || !mes) return 'Campos obrigatórios ausentes';
  if (!dataValida(data_nomeacao)) return 'Data de nomeação inválida (não pode ser anterior a 2024)';
  if (!presidente_nome || !NOME_APENAS_TEXTO.test(presidente_nome.trim()) || !POSTOS_PRESIDENTE.includes(presidente_posto)) return 'Presidente da Comissão inválido';
  if (!membro1_nome || !NOME_APENAS_TEXTO.test(membro1_nome.trim()) || !POSTOS_MEMBRO.includes(membro1_posto)) return 'Membro 1 inválido';
  if (!membro2_nome || !NOME_APENAS_TEXTO.test(membro2_nome.trim()) || !POSTOS_MEMBRO.includes(membro2_posto)) return 'Membro 2 inválido';
  if (!fiscal_nome || !NOME_APENAS_TEXTO.test(fiscal_nome.trim()) || !POSTOS_FISCAL.includes(fiscal_posto)) return 'Fiscal Administrativo inválido';
  return null;
}

function comComposicao(row) {
  return {
    ...row,
    presidenteCompleto: `${row.presidente_posto} ${row.presidente_nome}`,
    membro1Completo: `${row.membro1_posto} ${row.membro1_nome}`,
    membro2Completo: `${row.membro2_posto} ${row.membro2_nome}`,
    fiscalCompleto: `${row.fiscal_posto} ${row.fiscal_nome}`,
  };
}

// GET /api/comissoes - ordenada por BI de nomeação, decrescente
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM comissoes ORDER BY CAST(bi_nomeacao AS INTEGER) DESC, data_nomeacao DESC').all();
  res.json(rows.map(comComposicao));
});

// GET /api/comissoes/atual - comissão com o maior número de BI
router.get('/atual', (req, res) => {
  const atual = db.prepare('SELECT * FROM comissoes ORDER BY CAST(bi_nomeacao AS INTEGER) DESC LIMIT 1').get();
  res.json(atual ? comComposicao(atual) : null);
});

function camposCorpo(body) {
  return {
    bi_nomeacao: String(body.bi_nomeacao).replace(/\D/g, ''),
    data_nomeacao: body.data_nomeacao,
    mes: body.mes,
    presidente_nome: body.presidente_nome,
    presidente_posto: body.presidente_posto,
    membro1_nome: body.membro1_nome,
    membro1_posto: body.membro1_posto,
    membro2_nome: body.membro2_nome,
    membro2_posto: body.membro2_posto,
    fiscal_nome: body.fiscal_nome,
    fiscal_posto: body.fiscal_posto,
  };
}

// POST /api/comissoes
router.post('/', (req, res) => {
  const erro = validarCampos(req.body);
  if (erro) return res.status(400).json({ erro });

  const c = camposCorpo(req.body);
  const info = db.prepare(`
    INSERT INTO comissoes
      (bi_nomeacao, data_nomeacao, presidente_nome, presidente_posto, membro1_nome, membro1_posto, membro2_nome, membro2_posto, fiscal_nome, fiscal_posto, mes)
    VALUES (@bi_nomeacao, @data_nomeacao, @presidente_nome, @presidente_posto, @membro1_nome, @membro1_posto, @membro2_nome, @membro2_posto, @fiscal_nome, @fiscal_posto, @mes)
  `).run(c);

  res.status(201).json({ id: info.lastInsertRowid });
});

// PUT /api/comissoes/:id
router.put('/:id', (req, res) => {
  const existente = db.prepare('SELECT id FROM comissoes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Comissão não encontrada' });

  const erro = validarCampos(req.body);
  if (erro) return res.status(400).json({ erro });

  const c = camposCorpo(req.body);
  db.prepare(`
    UPDATE comissoes SET
      bi_nomeacao = @bi_nomeacao, data_nomeacao = @data_nomeacao,
      presidente_nome = @presidente_nome, presidente_posto = @presidente_posto,
      membro1_nome = @membro1_nome, membro1_posto = @membro1_posto,
      membro2_nome = @membro2_nome, membro2_posto = @membro2_posto,
      fiscal_nome = @fiscal_nome, fiscal_posto = @fiscal_posto,
      mes = @mes
    WHERE id = @id
  `).run({ ...c, id: req.params.id });

  res.json({ ok: true });
});

// DELETE /api/comissoes/:id
router.delete('/:id', (req, res) => {
  const existente = db.prepare('SELECT id FROM comissoes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Comissão não encontrada' });

  db.prepare('DELETE FROM comissoes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
