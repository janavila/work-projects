/**
 * Caminhos de disco do projeto e as travas que impedem sair deles.
 *
 * Seção 4.2 do documento da v2: "nome de arquivo sanitizado antes de usar em
 * qualquer caminho de disco (nunca usar o nome enviado pelo usuário diretamente
 * sem sanitizar — risco de path traversal)". Aqui estão as duas defesas:
 *   - `sanitizarNomeArquivo` limpa o nome recebido no upload, que é usado
 *     APENAS como texto informativo no banco (o arquivo em disco sempre se chama
 *     resultados.csv, dentro de uma pasta com o id numérico do dataset);
 *   - `dentroDe` confirma que qualquer caminho calculado continua dentro da
 *     pasta esperada antes de ler, gravar ou apagar qualquer coisa.
 */
'use strict';

const path = require('path');

const RAIZ_PROJETO = path.join(__dirname, '..', '..');
const DIR_DADOS = path.join(RAIZ_PROJETO, 'data');
const DIR_DATASETS = path.join(DIR_DADOS, 'datasets');
const CAMINHO_DICIONARIO = path.join(DIR_DADOS, 'dicionario.csv');
const CAMINHO_FORMULARIO = path.join(DIR_DADOS, 'formulario.pdf');

/** Pasta de um dataset: data/datasets/<id>. O id é sempre inteiro validado antes. */
function dirDataset(id) {
  const idNumero = Number(id);
  if (!Number.isInteger(idNumero) || idNumero <= 0) {
    throw new Error(`Identificador de dataset inválido: ${id}`);
  }
  return path.join(DIR_DATASETS, String(idNumero));
}

/** Caminho relativo gravado em datasets.caminho_processado (sempre com "/"). */
function caminhoRelativoProcessado(id) {
  return `data/datasets/${Number(id)}/resultados.csv`;
}

/** Resolve um caminho relativo do banco para absoluto, sem sair da raiz do projeto. */
function absolutoDoProjeto(caminhoRelativo) {
  const absoluto = path.resolve(RAIZ_PROJETO, caminhoRelativo);
  if (!dentroDe(absoluto, RAIZ_PROJETO)) {
    throw new Error('Caminho de arquivo fora da raiz do projeto.');
  }
  return absoluto;
}

/** Verifica se `alvo` está dentro de `base` (compara caminhos já normalizados). */
function dentroDe(alvo, base) {
  const alvoNormalizado = path.resolve(alvo);
  const baseNormalizada = path.resolve(base);
  return alvoNormalizado === baseNormalizada || alvoNormalizado.startsWith(baseNormalizada + path.sep);
}

/**
 * Limpa o nome de arquivo recebido no upload: descarta qualquer componente de
 * diretório, caracteres de controle e os caracteres proibidos em nome de arquivo
 * no Windows, e corta em 255 caracteres. Nunca devolve string vazia.
 */
function sanitizarNomeArquivo(nomeOriginal) {
  const somenteNome = path.basename(String(nomeOriginal || ''));
  /* eslint-disable no-control-regex */
  const limpo = somenteNome
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  /* eslint-enable no-control-regex */
  const cortado = limpo.slice(0, 255);
  return cortado === '' ? 'planilha.csv' : cortado;
}

module.exports = {
  RAIZ_PROJETO,
  DIR_DADOS,
  DIR_DATASETS,
  CAMINHO_DICIONARIO,
  CAMINHO_FORMULARIO,
  dirDataset,
  caminhoRelativoProcessado,
  absolutoDoProjeto,
  dentroDe,
  sanitizarNomeArquivo,
};
