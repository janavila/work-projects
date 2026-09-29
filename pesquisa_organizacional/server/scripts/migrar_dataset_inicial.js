#!/usr/bin/env node
/**
 * Migração do dataset que já está em produção — seção 3.5 do documento da v2.
 *
 * "Script único, rodado uma vez: lê data/meta.json atual, detecta as OMs já
 * conhecidas hoje, cria essas linhas em organizacoes_militares (ativas), cria a
 * linha em datasets (id 1) apontando para o data/resultados.csv já existente SEM
 * REPROCESSAR, e as linhas correspondentes em dataset_om."
 *
 * Uso:
 *   node server/scripts/migrar_dataset_inicial.js
 *   npm run migrar-dataset-inicial
 *
 * O que ele faz:
 *   1. exige que o banco já esteja migrado (tabelas criadas) e que exista um admin
 *      — é a conta registrada como "quem enviou" o dataset 1;
 *   2. lê data/resultados.csv e data/meta.json como estão, sem passar pelo
 *      pré-processamento (o arquivo já está processado desde a v1);
 *   3. detecta as OMs presentes na coluna `om` e cadastra as que faltarem, ATIVAS
 *      (diferente do upload, onde OM nova entra inativa: aqui são as OMs que já
 *      estavam em uso e em produção, então já nascem liberadas para permissão);
 *   4. copia os dois arquivos para data/datasets/1/ e cria os registros;
 *   5. é idempotente: se o dataset 1 já existir, não faz nada.
 *
 * Os arquivos originais em data/ são preservados (cópia, não movimentação), para
 * o comando de linha da v1 continuar funcionando como antes.
 */
'use strict';

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const { consultarUm, comTransacao, pool } = require('../db');
const { CSVParser } = require('../services/modulos-navegador');
const { detectarOMs } = require('../services/preprocessamento');
const { DIR_DADOS, dirDataset, caminhoRelativoProcessado } = require('../services/caminhos');

const ID_DATASET_INICIAL = 1;
const CAMINHO_RESULTADOS = path.join(DIR_DADOS, 'resultados.csv');
const CAMINHO_META = path.join(DIR_DADOS, 'meta.json');

async function migrar() {
  // --- 1. pré-condições -----------------------------------------------------
  const existente = await consultarUm('SELECT id, rotulo FROM datasets WHERE id = ?', [ID_DATASET_INICIAL]);
  if (existente) {
    console.log(`Dataset ${ID_DATASET_INICIAL} já existe no banco — nada a fazer (script é idempotente).`);
    return;
  }

  const admin = await consultarUm('SELECT id, nome_cadastro FROM usuarios WHERE is_admin = TRUE ORDER BY id LIMIT 1');
  if (!admin) {
    throw new Error(
      'Não existe nenhuma conta de administrador no banco. Rode primeiro `npm run criar-admin` ' +
      '(ou suba o servidor uma vez) para criar o admin inicial, depois rode esta migração.'
    );
  }

  if (!fs.existsSync(CAMINHO_RESULTADOS)) {
    throw new Error(`Arquivo não encontrado: ${CAMINHO_RESULTADOS}. Não há dataset da v1 para migrar.`);
  }

  // --- 2. lê os arquivos como estão, sem reprocessar -------------------------
  const csv = await fsp.readFile(CAMINHO_RESULTADOS, 'utf8');
  const { rows, headers } = CSVParser.parseCSV(csv);
  if (rows.length === 0) {
    throw new Error(`${CAMINHO_RESULTADOS} não contém nenhuma resposta.`);
  }
  if (!headers.includes('om')) {
    throw new Error(`${CAMINHO_RESULTADOS} não tem a coluna "om" — arquivo inesperado para migração.`);
  }

  let meta = null;
  if (fs.existsSync(CAMINHO_META)) {
    try {
      meta = JSON.parse(await fsp.readFile(CAMINHO_META, 'utf8'));
    } catch (erro) {
      console.warn(`Aviso: ${CAMINHO_META} existe mas é inválido (${erro.message}). O período ficará em branco.`);
    }
  } else {
    console.warn(`Aviso: ${CAMINHO_META} não encontrado. O período de apuração ficará em branco.`);
  }

  const periodoInicio = (meta && meta.periodoInicio) || null;
  const periodoFim = (meta && meta.periodoFim) || null;
  const totalRespondentes = (meta && Number(meta.totalRespondentes)) || rows.length;

  // --- 3. OMs presentes no dado ---------------------------------------------
  const omsDetectadas = detectarOMs(rows);
  if (omsDetectadas.length === 0) {
    throw new Error('Nenhuma OM encontrada na coluna "om" de data/resultados.csv.');
  }
  console.log(`OMs detectadas: ${omsDetectadas.map((o) => `${o.nome} (${o.total})`).join(', ')}`);

  // --- 4. registros + arquivos ----------------------------------------------
  const pasta = dirDataset(ID_DATASET_INICIAL);
  let pastaCriada = false;

  try {
    await comTransacao(async (conexao) => {
      await conexao.execute(
        `INSERT INTO datasets
           (id, rotulo, nome_arquivo_original, caminho_processado, periodo_inicio, periodo_fim,
            total_respondentes, enviado_por, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'processado')`,
        [
          ID_DATASET_INICIAL,
          'Pesquisa de Clima 2026 (dataset migrado da v1)',
          'resultados.csv',
          caminhoRelativoProcessado(ID_DATASET_INICIAL),
          periodoInicio,
          periodoFim,
          totalRespondentes,
          admin.id,
        ]
      );

      for (const om of omsDetectadas) {
        const [existentes] = await conexao.execute(
          'SELECT id FROM organizacoes_militares WHERE nome = ?',
          [om.nome]
        );
        let omId;
        if (existentes.length > 0) {
          omId = existentes[0].id;
          // OM que já estava em uso na v1 entra/permanece ativa.
          await conexao.execute('UPDATE organizacoes_militares SET ativo = TRUE WHERE id = ?', [omId]);
        } else {
          const [inserida] = await conexao.execute(
            'INSERT INTO organizacoes_militares (nome, ativo) VALUES (?, TRUE)',
            [om.nome]
          );
          omId = inserida.insertId;
        }

        await conexao.execute(
          'INSERT INTO dataset_om (dataset_id, om_id, total_respondentes_om) VALUES (?, ?, ?)',
          [ID_DATASET_INICIAL, omId, om.total]
        );
      }

      await fsp.mkdir(pasta, { recursive: true });
      pastaCriada = true;
      await fsp.copyFile(CAMINHO_RESULTADOS, path.join(pasta, 'resultados.csv'));
      if (fs.existsSync(CAMINHO_META)) {
        await fsp.copyFile(CAMINHO_META, path.join(pasta, 'meta.json'));
      } else {
        await fsp.writeFile(
          path.join(pasta, 'meta.json'),
          JSON.stringify({ totalRespondentes, periodoInicio, periodoFim, processadoEm: new Date().toISOString() }, null, 2) + '\n',
          'utf8'
        );
      }
    });
  } catch (erro) {
    if (pastaCriada) {
      try { await fsp.rm(pasta, { recursive: true, force: true }); } catch (e) { /* nada a fazer */ }
    }
    throw erro;
  }

  console.log(`\nDataset ${ID_DATASET_INICIAL} migrado com sucesso.`);
  console.log(`  Arquivos: ${path.relative(process.cwd(), pasta)}/resultados.csv e meta.json`);
  console.log(`  Respondentes: ${totalRespondentes}   Período: ${periodoInicio || '—'} a ${periodoFim || '—'}`);
  console.log(`  Registrado como enviado por: ${admin.nome_cadastro}`);
  console.log('  Os arquivos originais em data/ foram preservados (cópia, não movimentação).');
  console.log('\nPróximo passo: em Gestão > Usuários, conceda a cada conta as OMs que ela pode ver.');
}

migrar()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((erro) => {
    console.error('\nFalha na migração do dataset inicial:');
    console.error(`  ${erro.message}\n`);
    pool.end().finally(() => process.exit(1));
  });
