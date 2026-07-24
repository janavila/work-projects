/**
 * Parsing do dicionário de variáveis e construção da estrutura hierárquica
 * Seção → Subseção → Itens. Módulo puro (sem DOM).
 */
(function (global) {
  'use strict';

  const { ITENS_INVERTIDOS, SECOES_EXCLUIDAS_DO_INDICE } = global.Constants;

  /**
   * Divide o campo "secao" em { secao, subsecao } conforme a regra:
   * contém " — " → divide; senão, seção inteira também é o nome da subseção.
   */
  function splitSecao(secaoRaw) {
    const SEP = ' — ';
    const idx = secaoRaw.indexOf(SEP);
    if (idx === -1) {
      return { secao: secaoRaw, subsecao: secaoRaw };
    }
    return {
      secao: secaoRaw.slice(0, idx),
      subsecao: secaoRaw.slice(idx + SEP.length),
    };
  }

  /**
   * Determina natureza + domínio numérico a partir de tipo + escala_dominio.
   */
  function determinarNatureza(tipo, escalaDominio) {
    if (tipo === 'Nota') {
      return { natureza: 'nota', min: 0, max: 10 };
    }
    if (tipo === 'Escala' || tipo === 'Escala (condicional)' || tipo === 'Frequência') {
      const dominio = (escalaDominio || '').startsWith('1 a 5') ? { min: 1, max: 5 } : { min: 1, max: 4 };
      return { natureza: 'escala', min: dominio.min, max: dominio.max };
    }
    if (tipo === 'Categórica') {
      return { natureza: 'categorica', min: null, max: null };
    }
    if (tipo === 'Texto (obrigatório)' || tipo === 'Texto (opcional)' || tipo === 'Texto (aberto)') {
      return { natureza: 'texto', min: null, max: null };
    }
    return { natureza: 'outro', min: null, max: null };
  }

  /**
   * @param {string} csvText conteúdo bruto de dicionario.csv
   * @returns {Array<Object>} lista de itens, na ordem original do arquivo
   */
  function parseDictionary(csvText) {
    const { rows } = global.CSVParser.parseCSV(csvText);

    return rows.map((row, index) => {
      const { secao, subsecao } = splitSecao(row.secao);
      const { natureza, min, max } = determinarNatureza(row.tipo, row.escala_dominio);
      const isFechamentoS6 = secao === 'Seção 6' && natureza === 'nota';

      return {
        coluna: row.coluna,
        secaoRaw: row.secao,
        secao,
        subsecao,
        tipo: row.tipo,
        escalaDominio: row.escala_dominio,
        descricao: row.descricao,
        natureza,
        dominioMin: min,
        dominioMax: max,
        invertido: ITENS_INVERTIDOS.has(row.coluna),
        entraNoIndice: (natureza === 'escala' || natureza === 'nota') && !SECOES_EXCLUIDAS_DO_INDICE.has(secao),
        isFechamentoS6,
        ordem: index,
      };
    });
  }

  /**
   * Constrói a estrutura hierárquica Seção → Subseção → Itens (só itens que entram no índice),
   * mais índices auxiliares para lookup rápido.
   */
  function buildStructure(items) {
    const bySecao = new Map();
    const sectionOrder = [];

    items.forEach((item) => {
      if (!item.entraNoIndice) return;
      if (!bySecao.has(item.secao)) {
        bySecao.set(item.secao, { nome: item.secao, subsecoes: new Map(), ordem: item.ordem });
        sectionOrder.push(item.secao);
      }
      const secaoObj = bySecao.get(item.secao);
      if (!secaoObj.subsecoes.has(item.subsecao)) {
        secaoObj.subsecoes.set(item.subsecao, { nome: item.subsecao, itens: [], ordem: item.ordem });
      }
      secaoObj.subsecoes.get(item.subsecao).itens.push(item);
    });

    sectionOrder.sort((a, b) => bySecao.get(a).ordem - bySecao.get(b).ordem);

    // ordena subseções por ordem de aparição dentro de cada seção
    bySecao.forEach((secaoObj) => {
      const entries = Array.from(secaoObj.subsecoes.values());
      entries.sort((a, b) => a.ordem - b.ordem);
      const ordered = new Map();
      entries.forEach((e) => ordered.set(e.nome, e));
      secaoObj.subsecoes = ordered;
    });

    const itemByColuna = new Map(items.map((it) => [it.coluna, it]));
    const textItems = items.filter((it) => it.natureza === 'texto');
    const closingItem = items.find((it) => it.isFechamentoS6) || null;

    const filterFields = items
      .filter((it) => it.secao === 'Caracterização' && it.natureza === 'categorica')
      .map((it) => it.coluna);

    return {
      bySecao,
      sectionOrder,
      itemByColuna,
      textItems,
      closingItem,
      filterFields,
      allItems: items,
    };
  }

  global.Dictionary = { parseDictionary, buildStructure, splitSecao, determinarNatureza };
})(window);
