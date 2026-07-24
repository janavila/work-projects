/**
 * Motor de cálculo — índices de favorabilidade, agregação hierárquica,
 * classificação, filtros e as 3 regras de anonimato.
 *
 * Módulo puro: recebe estrutura de dicionário + linhas de dados, devolve
 * estruturas de dados. Não toca DOM.
 */
(function (global) {
  'use strict';

  const C = global.Constants;
  const { LIMIAR_ANONIMATO, SECOES_INDICE_GERAL, FILTROS_ORDEM, classificar } = C;

  function mean(arr) {
    if (arr.length === 0) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * Converte um valor bruto de célula em índice 0-100 para um item numérico
   * (escala ou nota), aplicando reversão de sentido quando aplicável.
   * Retorna null se o valor for branco/inválido — nunca 0.
   */
  function indiceFromValor(item, rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === '') return null;
    const v = parseFloat(rawValue);
    if (Number.isNaN(v)) return null;
    const vRevertido = item.invertido ? (item.dominioMin + item.dominioMax - v) : v;
    return ((vRevertido - item.dominioMin) / (item.dominioMax - item.dominioMin)) * 100;
  }

  /**
   * N de um grupo de itens = respondentes distintos com pelo menos 1 resposta
   * não-branca entre as colunas informadas (nunca soma das respostas por item).
   */
  function countN(rows, colunas) {
    let n = 0;
    for (const r of rows) {
      for (const c of colunas) {
        if (r[c] !== undefined && r[c] !== '') { n++; break; }
      }
    }
    return n;
  }

  function filterRows(rows, filtros) {
    return rows.filter((r) => FILTROS_ORDEM.every((campo) => {
      const selecionados = filtros && filtros[campo];
      if (!selecionados || selecionados.length === 0) return true;
      return selecionados.includes(r[campo]);
    }));
  }

  /** Índice + N agregados de um único item numérico sobre um conjunto de linhas. */
  function indiceItemAgregado(item, rows) {
    const valores = [];
    for (const r of rows) {
      const idx = indiceFromValor(item, r[item.coluna]);
      if (idx !== null) valores.push(idx);
    }
    return { indice: valores.length ? mean(valores) : null, n: valores.length };
  }

  /**
   * Calcula índice/classificação/N de uma subseção (nível 2 de anonimato).
   * Se suprimida, `itens` vem vazio (a UI mostra alerta no lugar da tabela).
   */
  function indiceSubsecao(subsecaoObj, rows) {
    const colunas = subsecaoObj.itens.map((it) => it.coluna);
    const n = countN(rows, colunas);
    if (n < LIMIAR_ANONIMATO) {
      return { nome: subsecaoObj.nome, n, indice: null, classificacao: null, suprimida: true, ordem: subsecaoObj.ordem, itens: [] };
    }

    const itensResult = subsecaoObj.itens.map((item) => {
      const { indice, n: nItem } = indiceItemAgregado(item, rows);
      let status = 'ok';
      if (nItem === 0) status = 'sem_respostas';
      else if (nItem < LIMIAR_ANONIMATO) status = 'insuficiente';
      return {
        coluna: item.coluna,
        descricao: item.descricao,
        n: nItem,
        indice: status === 'ok' ? indice : null,
        classificacao: status === 'ok' ? classificar(indice) : null,
        status,
        indiceBruto: indice, // usado internamente para agregação, mesmo quando status !== 'ok'
      };
    });

    const indicesValidos = itensResult.filter((it) => it.indiceBruto !== null).map((it) => it.indiceBruto);
    const indice = mean(indicesValidos);
    return {
      nome: subsecaoObj.nome,
      n,
      indice,
      classificacao: classificar(indice),
      suprimida: false,
      ordem: subsecaoObj.ordem,
      itens: itensResult,
    };
  }

  /** Calcula índice/classificação de uma seção — média simples das subseções não-suprimidas. */
  function indiceSecao(secaoObj, rows) {
    const subsecoes = [];
    secaoObj.subsecoes.forEach((sub) => subsecoes.push(indiceSubsecao(sub, rows)));
    const naoSuprimidas = subsecoes.filter((s) => !s.suprimida);
    const indice = naoSuprimidas.length ? mean(naoSuprimidas.map((s) => s.indice)) : null;
    return {
      nome: secaoObj.nome,
      ordem: secaoObj.ordem,
      indice,
      classificacao: classificar(indice),
      suprimida: naoSuprimidas.length === 0,
      subsecoes,
    };
  }

  /** Seção 6 — nota de fechamento, tratada à parte (nunca entra no Índice Geral). */
  function calcularFechamentoS6(structure, rows) {
    const item = structure.closingItem;
    if (!item) return null;
    const n = countN(rows, [item.coluna]);
    if (n < LIMIAR_ANONIMATO) {
      return { coluna: item.coluna, descricao: item.descricao, n, indice: null, classificacao: null, suprimida: true };
    }
    const { indice } = indiceItemAgregado(item, rows);
    return { coluna: item.coluna, descricao: item.descricao, n, indice, classificacao: classificar(indice), suprimida: false };
  }

  /**
   * Calcula o resultado completo do motor para um recorte (linhas já filtradas
   * ou a filtrar). Aplica a regra de anonimato de nível 1 antes de qualquer
   * outro cálculo — se N < 5, retorna `suficiente: false` sem calcular o resto.
   */
  function computeResult(structure, allRows, filtros) {
    const rows = filterRows(allRows, filtros || {});
    const n = rows.length;

    if (n < LIMIAR_ANONIMATO) {
      return { rows, n, suficiente: false, secoes: new Map(), indiceGeral: null, classificacaoGeral: null, fechamentoS6: null };
    }

    const secoes = new Map();
    structure.sectionOrder.forEach((nomeSecao) => {
      secoes.set(nomeSecao, indiceSecao(structure.bySecao.get(nomeSecao), rows));
    });

    const indicesGeral = SECOES_INDICE_GERAL
      .map((nome) => secoes.get(nome))
      .filter((s) => s && s.indice !== null)
      .map((s) => s.indice);
    const indiceGeral = indicesGeral.length ? mean(indicesGeral) : null;

    return {
      rows,
      n,
      suficiente: true,
      secoes,
      indiceGeral,
      classificacaoGeral: classificar(indiceGeral),
      fechamentoS6: calcularFechamentoS6(structure, rows),
    };
  }

  /**
   * Distribuição percentual das respostas brutas (sem reversão) de um item de
   * escala 1-4 simples, para o gráfico de barras divergentes (drill-down).
   * Retorna null se o item não existir na base ou tiver N < 5.
   */
  function distribuicaoItem(item, rows) {
    const valores = [];
    for (const r of rows) {
      const raw = r[item.coluna];
      if (raw !== undefined && raw !== '') valores.push(Number(raw));
    }
    const n = valores.length;
    if (n < LIMIAR_ANONIMATO) return null;

    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    valores.forEach((v) => { if (counts[v] !== undefined) counts[v]++; });
    const pct = {};
    [1, 2, 3, 4].forEach((k) => { pct[k] = (counts[k] / n) * 100; });
    return { n, pct, counts };
  }

  /** Itens elegíveis para drill-down de distribuição: tipo "Escala" simples (1-4), não condicional/frequência. */
  function itensParaDrilldown(subsecaoObj) {
    return subsecaoObj.itens.filter((it) => it.tipo === 'Escala' && it.dominioMax === 4);
  }

  /**
   * Recalcula o motor uma vez por OM (aplicando os demais filtros ativos,
   * exceto OM), para a tela "Por Organização Militar". OMs com N<5 no recorte
   * ficam de fora, listadas em `excluidas`.
   */
  function computeByOM(structure, allRows, omValues, filtrosSemOM) {
    const incluidas = [];
    const excluidas = [];

    omValues.forEach((om) => {
      const filtros = Object.assign({}, filtrosSemOM, { om: [om] });
      const resultado = computeResult(structure, allRows, filtros);
      if (!resultado.suficiente) {
        excluidas.push({ om, n: resultado.n });
      } else {
        incluidas.push({ om, n: resultado.n, resultado });
      }
    });

    return { incluidas, excluidas };
  }

  /** Composição demográfica de uma dimensão categórica, agrupando o excedente além de 7 categorias como "Outros". */
  function composicaoDemografica(rows, campo) {
    const counts = new Map();
    rows.forEach((r) => {
      const v = r[campo] || '(não informado)';
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    if (entries.length <= 7) return entries.map(([nome, valor]) => ({ nome, valor }));

    const principais = entries.slice(0, 6);
    const outros = entries.slice(6).reduce((acc, [, v]) => acc + v, 0);
    return principais.map(([nome, valor]) => ({ nome, valor })).concat([{ nome: 'Outros', valor: outros }]);
  }

  /**
   * Prevalência bruta de comportamento de risco no bloco de Apostas (seção 3.9
   * da especificação). Calculado para eventual uso futuro; não exibido na UI
   * hoje (decisão de produto preservada da versão anterior).
   */
  function prevalenciaApostas(structure, rows) {
    const secao3 = structure.bySecao.get('Seção 3');
    if (!secao3) return null;
    const apostas = secao3.subsecoes.get('Apostas');
    if (!apostas) return null;

    const colunas = apostas.itens.map((it) => it.coluna);
    const n = countN(rows, colunas);
    if (n < LIMIAR_ANONIMATO) return null;

    const perItem = apostas.itens.map((item) => {
      const valores = rows.map((r) => r[item.coluna]).filter((v) => v !== '').map(Number);
      const total = valores.length;
      const concordantes = valores.filter((v) => v === 3 || v === 4).length;
      return { coluna: item.coluna, descricao: item.descricao, n: total, pct: total > 0 ? (concordantes / total) * 100 : null };
    });

    const piorCaso = perItem.reduce((max, it) => (it.pct !== null && it.pct > max ? it.pct : max), 0);
    return { n, perItem, piorCaso };
  }

  global.Engine = {
    indiceFromValor,
    countN,
    filterRows,
    indiceItemAgregado,
    indiceSubsecao,
    indiceSecao,
    calcularFechamentoS6,
    computeResult,
    distribuicaoItem,
    itensParaDrilldown,
    computeByOM,
    composicaoDemografica,
    prevalenciaApostas,
    mean,
  };
})(window);
