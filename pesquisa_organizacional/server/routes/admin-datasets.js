/**
 * Upload, listagem administrativa e exclusão de datasets — seções 3.3 e 3.4 do
 * documento da v2. Restrito a administradores.
 *
 *   GET    /api/admin/datasets       histórico completo (inclui status = 'erro')
 *   POST   /api/admin/datasets       upload + pré-processamento
 *   DELETE /api/admin/datasets/:id   exclusão definitiva (arquivo + registro)
 *
 * O upload recebe a PLANILHA BRUTA da plataforma CTA (com ID/nome/timestamp do
 * respondente) e roda no servidor exatamente o mesmo pré-processamento que era
 * manual na v1 — a lógica vem de server/services/preprocessamento.js, que é a
 * mesma usada pelo comando de linha.
 */
'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const { consultar, consultarUm, executar, comTransacao } = require('../db');
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const {
  validarConteudoCsv,
  processarPlanilhaBruta,
  ErroValidacaoPlanilha,
} = require('../services/preprocessamento');
const {
  DIR_DATASETS,
  CAMINHO_DICIONARIO,
  dirDataset,
  caminhoRelativoProcessado,
  absolutoDoProjeto,
  dentroDe,
  sanitizarNomeArquivo,
} = require('../services/caminhos');
const { rotuloExibicao } = require('./dados');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB (seção 4.2)

/**
 * O arquivo fica em MEMÓRIA, nunca em pasta temporária com nome escolhido pelo
 * cliente: o conteúdo só vai para o disco depois de validado e processado, e
 * sempre com nome e caminho definidos pelo servidor (data/datasets/<id>/resultados.csv).
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_BYTES, files: 1, fields: 5 },
  fileFilter: (req, arquivo, callback) => {
    // Primeira barreira, barata: extensão e tipo declarado. A validação que
    // realmente decide é a do CONTEÚDO, feita depois por validarConteudoCsv().
    const extensao = path.extname(arquivo.originalname || '').toLowerCase();
    const tiposAceitos = [
      'text/csv', 'application/csv', 'text/plain',
      'application/vnd.ms-excel', 'application/octet-stream', '',
    ];
    if (extensao !== '.csv') {
      return callback(new ErroValidacaoPlanilha('Envie a exportação do formulário em formato .csv.'));
    }
    if (!tiposAceitos.includes(arquivo.mimetype)) {
      return callback(new ErroValidacaoPlanilha(`Tipo de arquivo não aceito (${arquivo.mimetype}). Envie um CSV.`));
    }
    return callback(null, true);
  },
}).single('arquivo');

/** Encapsula o multer para transformar seus erros em mensagens em português. */
function receberArquivo(req, res, next) {
  upload(req, res, (erro) => {
    if (!erro) return next();
    if (erro instanceof multer.MulterError) {
      if (erro.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          erro: 'arquivo_grande',
          mensagem: 'O arquivo passa de 10 MB, o limite aceito pelo servidor.',
        });
      }
      if (erro.code === 'LIMIT_FILE_COUNT' || erro.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ erro: 'upload_invalido', mensagem: 'Envie um único arquivo, no campo "arquivo".' });
      }
      return res.status(400).json({ erro: 'upload_invalido', mensagem: `Falha no envio do arquivo: ${erro.message}` });
    }
    if (erro.validacao) {
      return res.status(400).json({ erro: 'planilha_invalida', mensagem: erro.message });
    }
    return next(erro);
  });
}

// ============================== LISTAGEM ADMINISTRATIVA ==============================

/**
 * Listagem da tela de gestão. Diferente de GET /api/datasets (que alimenta o
 * seletor do dashboard e mostra só o que está processado e permitido), esta
 * devolve TODO o histórico, inclusive as tentativas com status = 'erro' e a
 * mensagem do que deu errado, mais quem enviou e quais OMs foram detectadas.
 */
router.get('/', async (req, res, next) => {
  try {
    const datasets = await consultar(
      `SELECT d.id, d.rotulo, d.nome_arquivo_original, d.caminho_processado, d.periodo_inicio, d.periodo_fim,
              d.total_respondentes, d.enviado_em, d.status, d.mensagem_erro,
              u.nome AS enviado_por_nome
         FROM datasets d
         JOIN usuarios u ON u.id = d.enviado_por
        ORDER BY d.enviado_em DESC, d.id DESC`
    );

    const oms = await consultar(
      `SELECT dom.dataset_id, om.id AS om_id, om.nome, om.ativo, dom.total_respondentes_om
         FROM dataset_om dom
         JOIN organizacoes_militares om ON om.id = dom.om_id
        ORDER BY dom.total_respondentes_om DESC`
    );

    const omsPorDataset = new Map();
    oms.forEach((o) => {
      if (!omsPorDataset.has(o.dataset_id)) omsPorDataset.set(o.dataset_id, []);
      omsPorDataset.get(o.dataset_id).push({
        id: o.om_id,
        nome: o.nome,
        ativo: Boolean(o.ativo),
        totalRespondentes: Number(o.total_respondentes_om),
      });
    });

    return res.json({
      datasets: datasets.map((d) => ({
        id: d.id,
        rotulo: d.rotulo,
        rotuloExibicao: rotuloExibicao(d),
        nomeArquivoOriginal: d.nome_arquivo_original,
        periodoInicio: d.periodo_inicio,
        periodoFim: d.periodo_fim,
        totalRespondentes: d.total_respondentes,
        enviadoEm: d.enviado_em,
        enviadoPor: d.enviado_por_nome,
        status: d.status,
        mensagemErro: d.mensagem_erro,
        oms: omsPorDataset.get(d.id) || [],
      })),
    });
  } catch (erro) {
    return next(erro);
  }
});

// ============================== UPLOAD ==============================

/** Grava a tentativa que falhou na validação, para o admin ver o histórico (seção 3.3, passo 4). */
async function registrarFalha({ rotulo, nomeArquivo, usuarioId, mensagem }) {
  const mensagemCortada = String(mensagem || 'Falha não identificada.').slice(0, 500);
  await executar(
    `INSERT INTO datasets
       (rotulo, nome_arquivo_original, caminho_processado, periodo_inicio, periodo_fim,
        total_respondentes, enviado_por, status, mensagem_erro)
     VALUES (?, ?, '', NULL, NULL, NULL, ?, 'erro', ?)`,
    [rotulo, nomeArquivo, usuarioId, mensagemCortada]
  );
  return mensagemCortada;
}

/**
 * Garante que a OM existe em organizacoes_militares e devolve seu id.
 * OM desconhecida é cadastrada como INATIVA (seção 3.1) — o admin revisa e ativa
 * antes de conceder permissão a alguém nela.
 */
async function garantirOM(conexao, nomeOM) {
  const [existentes] = await conexao.execute(
    'SELECT id FROM organizacoes_militares WHERE nome = ?',
    [nomeOM]
  );
  if (existentes.length > 0) return { id: existentes[0].id, criada: false };

  const [resultado] = await conexao.execute(
    'INSERT INTO organizacoes_militares (nome, ativo) VALUES (?, FALSE)',
    [nomeOM]
  );
  return { id: resultado.insertId, criada: true };
}

router.post('/', receberArquivo, async (req, res, next) => {
  const rotuloBruto = String((req.body && req.body.rotulo) || '').trim();
  const rotulo = rotuloBruto === '' ? null : rotuloBruto.slice(0, 150);
  const nomeArquivo = sanitizarNomeArquivo(req.file && req.file.originalname);

  if (!req.file) {
    return res.status(400).json({ erro: 'upload_invalido', mensagem: 'Nenhum arquivo foi enviado.' });
  }

  let processado;
  try {
    // 1 e 2 do fluxo (conteúdo real + tamanho) — o tamanho já foi barrado pelo
    // multer; aqui se confirma que o conteúdo é mesmo um CSV de texto.
    const textoBruto = validarConteudoCsv(req.file.buffer);

    if (!fs.existsSync(CAMINHO_DICIONARIO)) {
      return res.status(500).json({
        erro: 'arquivo_ausente',
        mensagem: 'Arquivo dicionario.csv não encontrado no servidor — coloque o arquivo em /data antes de enviar datasets.',
      });
    }
    const textoDicionario = await fsp.readFile(CAMINHO_DICIONARIO, 'utf8');

    // 3 a 7 do fluxo: descarte de colunas identificáveis, alinhamento de 86
    // colunas, conversão de valores, respondent_id, período, OMs detectadas.
    processado = processarPlanilhaBruta({ textoBruto, textoDicionario });
  } catch (erro) {
    if (erro.validacao) {
      const mensagem = await registrarFalha({ rotulo, nomeArquivo, usuarioId: req.usuario.id, mensagem: erro.message });
      return res.status(400).json({ erro: 'planilha_invalida', mensagem });
    }
    return next(erro);
  }

  const { csv, meta, omsDetectadas } = processado;

  if (omsDetectadas.length === 0) {
    const mensagem = await registrarFalha({
      rotulo,
      nomeArquivo,
      usuarioId: req.usuario.id,
      mensagem: 'Nenhuma organização militar foi encontrada na coluna "om" da planilha processada.',
    });
    return res.status(400).json({ erro: 'planilha_invalida', mensagem: mensagem });
  }

  let pastaCriada = null;
  try {
    const resultado = await comTransacao(async (conexao) => {
      // O caminho depende do id, e o id só existe depois do INSERT — por isso o
      // caminho entra vazio e é preenchido no UPDATE logo abaixo.
      const [inserido] = await conexao.execute(
        `INSERT INTO datasets
           (rotulo, nome_arquivo_original, caminho_processado, periodo_inicio, periodo_fim,
            total_respondentes, enviado_por, status)
         VALUES (?, ?, '', ?, ?, ?, ?, 'processado')`,
        [rotulo, nomeArquivo, meta.periodoInicio, meta.periodoFim, meta.totalRespondentes, req.usuario.id]
      );
      const datasetId = inserido.insertId;

      const omsCriadas = [];
      for (const om of omsDetectadas) {
        const { id: omId, criada } = await garantirOM(conexao, om.nome);
        if (criada) omsCriadas.push(om.nome);
        await conexao.execute(
          'INSERT INTO dataset_om (dataset_id, om_id, total_respondentes_om) VALUES (?, ?, ?)',
          [datasetId, omId, om.total]
        );
      }

      const caminhoRelativo = caminhoRelativoProcessado(datasetId);
      await conexao.execute('UPDATE datasets SET caminho_processado = ? WHERE id = ?', [caminhoRelativo, datasetId]);

      // Arquivos vão para o disco antes do commit: se a gravação falhar, a
      // transação é desfeita e não sobra registro apontando para arquivo inexistente.
      const pasta = dirDataset(datasetId);
      await fsp.mkdir(pasta, { recursive: true });
      pastaCriada = pasta;
      await fsp.writeFile(path.join(pasta, 'resultados.csv'), csv, 'utf8');
      await fsp.writeFile(path.join(pasta, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');

      return { datasetId, omsCriadas };
    });

    return res.status(201).json({
      id: resultado.datasetId,
      totalRespondentes: meta.totalRespondentes,
      periodoInicio: meta.periodoInicio,
      periodoFim: meta.periodoFim,
      oms: omsDetectadas,
      omsCriadasInativas: resultado.omsCriadas,
      mensagem: resultado.omsCriadas.length > 0
        ? `Dataset processado. Atenção: ${resultado.omsCriadas.length} OM(s) nova(s) foram cadastradas como INATIVAS e precisam ser revisadas e ativadas: ${resultado.omsCriadas.join(', ')}.`
        : 'Dataset processado.',
    });
  } catch (erro) {
    // Transação já foi desfeita; limpa a pasta para não deixar arquivo órfão.
    if (pastaCriada) {
      try { await fsp.rm(pastaCriada, { recursive: true, force: true }); } catch (e) { /* nada a fazer */ }
    }
    return next(erro);
  }
});

// ============================== EXCLUSÃO ==============================

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ erro: 'id_invalido', mensagem: 'Identificador de dataset inválido.' });
    }

    const dataset = await consultarUm('SELECT id, caminho_processado FROM datasets WHERE id = ?', [id]);
    if (!dataset) return res.status(404).json({ erro: 'nao_encontrado', mensagem: 'Dataset não encontrado.' });

    // dataset_om cai em cascata (ON DELETE CASCADE na migration).
    await executar('DELETE FROM datasets WHERE id = ?', [id]);

    // Apaga a pasta do dataset. A exclusão é definitiva (seção 3.1) — não há
    // lixeira. Antes de apagar, confirma que o caminho está mesmo dentro de
    // data/datasets, para um registro adulterado no banco nunca poder apontar o
    // `rm` para outro lugar do disco.
    const pasta = dirDataset(id);
    if (dentroDe(pasta, DIR_DATASETS) && fs.existsSync(pasta)) {
      await fsp.rm(pasta, { recursive: true, force: true });
    } else if (dataset.caminho_processado) {
      try {
        const arquivo = absolutoDoProjeto(dataset.caminho_processado);
        if (dentroDe(arquivo, DIR_DATASETS) && fs.existsSync(arquivo)) await fsp.rm(arquivo, { force: true });
      } catch (e) { /* caminho inválido no banco — registro já foi removido */ }
    }

    return res.json({ mensagem: 'Dataset excluído definitivamente.' });
  } catch (erro) {
    return next(erro);
  }
});

module.exports = router;
