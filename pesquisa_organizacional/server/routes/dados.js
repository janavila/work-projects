/**
 * Rotas de dados para o dashboard — seção 3.4 do documento da v2.
 *
 *   GET /api/datasets              lista para o seletor
 *   GET /api/dados?dataset_id=X    o CSV processado daquele dataset
 *   GET /api/dicionario            data/dicionario.csv (único e compartilhado)
 *   GET /api/formulario            data/formulario.pdf (formulário em branco)
 *
 * Todas exigem sessão válida: a pasta /data deixou de ser servida estaticamente
 * na v2, então estes são os únicos caminhos para chegar aos arquivos de dados.
 *
 * Sobre a filtragem por OM (seção 2.2): o CSV vai COMPLETO para qualquer usuário
 * autenticado, e é o navegador que filtra as linhas pelas OMs permitidas —
 * decisão consciente registrada no documento, com a ressalva de que o dado de
 * OMs sem permissão ainda trafega até o navegador. O que este arquivo faz é o
 * controle de acesso ao dataset INTEIRO: quem não tem permissão em nenhuma OM de
 * um dataset não o vê no seletor nem consegue baixá-lo trocando o id na URL.
 */
'use strict';

const express = require('express');
const fs = require('fs');

const { consultar, consultarUm } = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { CAMINHO_DICIONARIO, CAMINHO_FORMULARIO, absolutoDoProjeto } = require('../services/caminhos');

const router = express.Router();

// requireAuth vai em CADA rota, não em router.use(): este router está montado em
// /api, e um router.use() aqui autenticaria também as requisições que só estão de
// passagem para /api/admin/* (consulta de usuário duplicada) e responderia 401 no
// lugar do 404 de rota de API inexistente.

/** "AAAA-MM-DD" → "dd/mm/aaaa" (mesma regra do js/format.js, para o rótulo do seletor). */
function dataBR(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

/**
 * Rótulo de exibição do dataset: o que o admin digitou ou, se vazio,
 * "nome do arquivo — período detectado" (seção 3.1).
 */
function rotuloExibicao(dataset) {
  if (dataset.rotulo && String(dataset.rotulo).trim() !== '') return String(dataset.rotulo).trim();

  const inicio = dataBR(dataset.periodo_inicio);
  const fim = dataBR(dataset.periodo_fim);
  let periodo = 'período não detectado';
  if (inicio && fim) periodo = inicio === fim ? inicio : `${inicio} a ${fim}`;
  else if (inicio || fim) periodo = inicio || fim;

  return `${dataset.nome_arquivo_original} — ${periodo}`;
}

/** Datasets processados que o usuário pode abrir (admin vê todos). */
async function datasetsVisiveis(usuario) {
  if (usuario.isAdmin) {
    return consultar(
      `SELECT id, rotulo, nome_arquivo_original, periodo_inicio, periodo_fim, total_respondentes, enviado_em
         FROM datasets
        WHERE status = 'processado'
        ORDER BY enviado_em DESC, id DESC`
    );
  }

  return consultar(
    `SELECT DISTINCT d.id, d.rotulo, d.nome_arquivo_original, d.periodo_inicio, d.periodo_fim,
            d.total_respondentes, d.enviado_em
       FROM datasets d
       JOIN dataset_om dom ON dom.dataset_id = d.id
       JOIN usuario_om_permissao p ON p.om_id = dom.om_id AND p.usuario_id = ?
      WHERE d.status = 'processado'
      ORDER BY d.enviado_em DESC, d.id DESC`,
    [usuario.id]
  );
}

router.get('/datasets', requireAuth, async (req, res, next) => {
  try {
    const linhas = await datasetsVisiveis(req.usuario);
    return res.json({
      datasets: linhas.map((d) => ({
        id: d.id,
        rotulo: rotuloExibicao(d),
        periodoInicio: d.periodo_inicio,
        periodoFim: d.periodo_fim,
        totalRespondentes: d.total_respondentes,
        enviadoEm: d.enviado_em,
      })),
    });
  } catch (erro) {
    return next(erro);
  }
});

router.get('/dados', requireAuth, async (req, res, next) => {
  try {
    const datasetId = Number(req.query.dataset_id);
    if (!Number.isInteger(datasetId) || datasetId <= 0) {
      return res.status(400).json({ erro: 'dataset_invalido', mensagem: 'Informe um dataset_id válido.' });
    }

    const dataset = await consultarUm(
      'SELECT id, caminho_processado, status FROM datasets WHERE id = ?',
      [datasetId]
    );
    if (!dataset || dataset.status !== 'processado') {
      return res.status(404).json({ erro: 'nao_encontrado', mensagem: 'Dataset não encontrado.' });
    }

    if (!req.usuario.isAdmin) {
      const permitido = await consultarUm(
        `SELECT 1 AS ok
           FROM dataset_om dom
           JOIN usuario_om_permissao p ON p.om_id = dom.om_id AND p.usuario_id = ?
          WHERE dom.dataset_id = ?
          LIMIT 1`,
        [req.usuario.id, datasetId]
      );
      if (!permitido) {
        return res.status(403).json({
          erro: 'sem_permissao',
          mensagem: 'Seu usuário não tem permissão para nenhuma organização militar presente neste dataset.',
        });
      }
    }

    const caminho = absolutoDoProjeto(dataset.caminho_processado);
    if (!fs.existsSync(caminho)) {
      return res.status(500).json({
        erro: 'arquivo_ausente',
        mensagem: 'O arquivo processado deste dataset não foi encontrado no servidor. Avise o administrador.',
      });
    }

    // Mesma regra de cache da v1: dado de pesquisa nunca fica em cache.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return fs.createReadStream(caminho).pipe(res);
  } catch (erro) {
    return next(erro);
  }
});

router.get('/dicionario', requireAuth, (req, res) => {
  if (!fs.existsSync(CAMINHO_DICIONARIO)) {
    return res.status(500).json({
      erro: 'arquivo_ausente',
      mensagem: 'Arquivo dicionario.csv não encontrado no servidor — coloque o arquivo em /data.',
    });
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return fs.createReadStream(CAMINHO_DICIONARIO).pipe(res);
});

router.get('/formulario', requireAuth, (req, res) => {
  if (!fs.existsSync(CAMINHO_FORMULARIO)) {
    return res.status(404).json({
      erro: 'arquivo_ausente',
      mensagem: 'O formulário em branco não está disponível no servidor.',
    });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="Formulario_Pesquisa_Clima_3BdaCMec.pdf"');
  return fs.createReadStream(CAMINHO_FORMULARIO).pipe(res);
});

module.exports = { router, rotuloExibicao, dataBR };
