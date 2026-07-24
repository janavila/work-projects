/**
 * Parser de CSV puro (sem dependências), tolerante a:
 * - BOM UTF-8 no início do arquivo
 * - campos entre aspas contendo vírgulas, quebras de linha e aspas escapadas ("")
 * - CRLF ou LF
 *
 * Não manipula DOM nem estado global — recebe texto, devolve estrutura.
 */
(function (global) {
  'use strict';

  /**
   * @param {string} text conteúdo bruto do arquivo CSV
   * @returns {{headers: string[], rows: Object[]}}
   */
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    const records = [];
    let field = '';
    let record = [];
    let inQuotes = false;
    const len = text.length;

    for (let i = 0; i < len; i++) {
      const c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
        continue;
      }

      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        record.push(field);
        field = '';
      } else if (c === '\r') {
        // ignora — o \n subsequente fecha o registro
      } else if (c === '\n') {
        record.push(field);
        field = '';
        records.push(record);
        record = [];
      } else {
        field += c;
      }
    }

    // último campo/registro, se o arquivo não terminar com quebra de linha
    if (field.length > 0 || record.length > 0) {
      record.push(field);
      records.push(record);
    }

    // descarta linhas totalmente vazias (comuns no fim do arquivo)
    const nonEmpty = records.filter((r) => !(r.length === 1 && r[0] === ''));

    if (nonEmpty.length === 0) {
      return { headers: [], rows: [] };
    }

    const headers = nonEmpty[0].map((h) => h.trim());
    const rows = [];

    for (let i = 1; i < nonEmpty.length; i++) {
      const rec = nonEmpty[i];
      const row = {};
      for (let j = 0; j < headers.length; j++) {
        const raw = rec[j];
        row[headers[j]] = raw === undefined ? '' : raw.trim();
      }
      rows.push(row);
    }

    return { headers, rows };
  }

  global.CSVParser = { parseCSV };
})(window);
