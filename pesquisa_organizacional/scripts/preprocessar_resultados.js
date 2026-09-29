#!/usr/bin/env node
/**
 * Converte a exportação bruta do formulário (Google Forms/CTA — perguntas por
 * extenso, uma coluna por resposta, + ID do usuário/Nome/Registro de Tempo)
 * em data/resultados.csv, no formato de colunas codificadas que o dashboard
 * espera (mesmas chaves de data/dicionario.csv).
 *
 * Uso:
 *   node scripts/preprocessar_resultados.js [caminho-do-csv-bruto]
 *
 * Sem argumento, lê data/resultados_cta.csv e grava em data/resultados.csv.
 *
 * A PARTIR DA v2 as regras de validação e conversão moram em
 * server/services/preprocessamento.js, para serem as mesmas usadas pela rota de
 * upload do dashboard (POST /api/admin/datasets). Este arquivo continua sendo o
 * caminho de linha de comando e faz só o que é dele: ler os arquivos do disco,
 * chamar o serviço e gravar a saída. O comportamento observável do comando não
 * mudou em nada.
 *
 * O que o pré-processamento faz (detalhes e mensagens de erro no serviço):
 * - Descarta "ID do usuário", "Nome de exibição do usuário" e "Registro de
 *   Tempo" (dado identificável/sensível, não interessa ao dashboard).
 * - Gera um respondent_id sequencial anônimo (1..N, ordem de chegada).
 * - Mapeia cada pergunta do formulário para a coluna codificada correspondente
 *   em dicionario.csv (MAPA_COLUNAS, alinhada por posição).
 * - Converte respostas de escala/frequência no formato "N - Rótulo" (ex.:
 *   "3 - Concordo") para o inteiro N puro, que é o que o motor de cálculo
 *   (js/engine.js) espera.
 * - Colunas do dicionário que o novo formulário não pergunta mais ficam em
 *   branco — o motor já trata célula vazia como "sem resposta".
 * - s3_fusex_usuario recebe "Sim" para todas as linhas.
 * - Grava data/meta.json com o período de apuração (menor/maior data do
 *   "Registro de Tempo" bruto).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const {
  processarPlanilhaBruta,
  COLUNAS_DESCARTADAS,
  SEM_CORRESPONDENCIA_NO_FORMULARIO,
} = require('../server/services/preprocessamento');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RAW_PATH = process.argv[2] || path.join(DATA_DIR, 'resultados_cta.csv');
const DIC_PATH = path.join(DATA_DIR, 'dicionario.csv');
const OUT_PATH = path.join(DATA_DIR, 'resultados.csv');
const META_PATH = path.join(DATA_DIR, 'meta.json');

function main() {
  const textoDicionario = fs.readFileSync(DIC_PATH, 'utf8');
  const textoBruto = fs.readFileSync(RAW_PATH, 'utf8');

  const { csv, meta, omsDetectadas } = processarPlanilhaBruta({ textoBruto, textoDicionario });

  fs.writeFileSync(OUT_PATH, csv, 'utf8');
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + '\n', 'utf8');

  console.log(`OK: ${meta.totalRespondentes} respondentes processados.`);
  console.log(`Lido:  ${path.relative(process.cwd(), RAW_PATH)}`);
  console.log(`Gravado: ${path.relative(process.cwd(), OUT_PATH)}`);
  console.log(`Gravado: ${path.relative(process.cwd(), META_PATH)} (período de apuração: ${meta.periodoInicio} a ${meta.periodoFim})`);
  console.log(`Colunas descartadas: ${COLUNAS_DESCARTADAS.join(', ')}`);
  console.log(`Colunas sem pergunta no formulário atual (gravadas em branco, exceto s3_fusex_usuario="Sim"): ${SEM_CORRESPONDENCIA_NO_FORMULARIO.size}`);
  console.log(`OMs detectadas nos dados: ${omsDetectadas.map((o) => `${o.nome} (${o.total})`).join(', ')}`);
}

main();
