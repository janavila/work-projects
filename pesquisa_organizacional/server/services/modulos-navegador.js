/**
 * Carrega, no Node, os módulos que originalmente são do navegador
 * (js/csv-parser.js, js/constants.js, js/dictionary.js).
 *
 * Eles são IIFEs que se anexam a `window`; o truque `global.window = global` é
 * o mesmo já usado por scripts/preprocessar_resultados.js desde a v1. Ele está
 * centralizado aqui para existir em um lugar só, em vez de repetido em cada
 * script/serviço do servidor.
 *
 * Motivo de reaproveitar em vez de reescrever: o parser de CSV e as regras do
 * dicionário (divisão seção/subseção, natureza, domínio numérico) precisam ser
 * EXATAMENTE as mesmas no servidor e no navegador. Duas implementações
 * significariam, na primeira divergência, um índice calculado diferente de um
 * lado e do outro.
 */
'use strict';

if (!global.window) {
  global.window = global;
}

require('../../js/csv-parser.js');
require('../../js/constants.js');
require('../../js/dictionary.js');

module.exports = {
  CSVParser: global.CSVParser,
  Constants: global.Constants,
  Dictionary: global.Dictionary,
};
