/**
 * Formatação numérica e de data em PT-BR. Centralizado aqui para nunca haver
 * inconsistência entre telas (regra da seção 10 da especificação).
 */
(function (global) {
  'use strict';

  /**
   * Formata um índice (0-100) com 1 casa decimal, vírgula como separador decimal.
   * null/undefined/NaN → "—".
   */
  function formatIndice(valor) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
    return valor.toFixed(1).replace('.', ',');
  }

  function formatPercentual(valor) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
    return `${valor.toFixed(1).replace('.', ',')}%`;
  }

  /**
   * Formata um inteiro com separador de milhar em ponto (ex.: 1234 → "1.234").
   */
  function formatInteiro(valor) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
    return valor.toLocaleString('pt-BR');
  }

  /**
   * Formata uma data JS como dd/mm/aaaa [hh:mm].
   */
  function formatData(date, comHora) {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    let out = `${dd}/${mm}/${yyyy}`;
    if (comHora) {
      const hh = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      out += ` ${hh}:${min}`;
    }
    return out;
  }

  /**
   * Converte "AAAA-MM-DD" (formato do CSV) para dd/mm/aaaa. Retorna "—" se inválido/vazio.
   */
  function formatDataISO(isoStr) {
    if (!isoStr) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoStr);
    if (!m) return isoStr;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  /**
   * data-hoje em formato ISO (AAAA-MM-DD), usado para sugerir nome de arquivo de exportação.
   */
  function dataHojeISO() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  /** Escapa texto vindo dos CSVs antes de interpolar em innerHTML (respostas livres, rótulos de categoria). */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
  }

  global.Format = { formatIndice, formatPercentual, formatInteiro, formatData, formatDataISO, dataHojeISO, escapeHtml };
})(window);
