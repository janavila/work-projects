/**
 * Motor de leitura interpretada — 100% gerado por template, determinístico,
 * zero IA/LLM. Produz dados estruturados; quem monta a frase final e aplica
 * cor é a camada de apresentação (ver seção 4.1 da especificação).
 */
(function (global) {
  'use strict';

  const C = global.Constants;
  const { LIMIAR_ANONIMATO, FILTROS_ORDEM, FILTROS_ROTULO } = C;

  function gerarCabecalho(filtros) {
    const partes = [];
    FILTROS_ORDEM.forEach((campo) => {
      const valores = (filtros && filtros[campo]) || [];
      if (valores.length === 0) return;
      const rotulo = FILTROS_ROTULO[campo];
      partes.push(campo === 'om' ? valores.join(', ') : `${rotulo}: ${valores.join(', ')}`);
    });
    return partes.length ? partes.join(', ') : 'Brigada — todos os militares';
  }

  /**
   * Acha melhor (maior índice entre Excelente) e pior (menor índice entre Ruim)
   * subseção não-suprimida, percorrendo a estrutura na ordem do instrumento.
   * Desempate: primeiro na ordem do instrumento vence (nunca sorteio/alfabético).
   */
  function encontrarMelhorPior(structure, result) {
    let melhor = null; // { nome, indice, ordem }
    let pior = null;

    structure.sectionOrder.forEach((nomeSecao) => {
      const secaoResult = result.secoes.get(nomeSecao);
      if (!secaoResult) return;
      secaoResult.subsecoes.forEach((sub) => {
        if (sub.suprimida) return;
        if (sub.classificacao === 'Excelente') {
          if (!melhor || sub.indice > melhor.indice
            || (sub.indice === melhor.indice && sub.ordem < melhor.ordem)) {
            melhor = { nome: sub.nome, indice: sub.indice, ordem: sub.ordem };
          }
        }
        if (sub.classificacao === 'Ruim') {
          if (!pior || sub.indice < pior.indice
            || (sub.indice === pior.indice && sub.ordem < pior.ordem)) {
            pior = { nome: sub.nome, indice: sub.indice, ordem: sub.ordem };
          }
        }
      });
    });

    return { melhor, pior };
  }

  function gerarParagrafo(result, melhor, pior) {
    if (result.indiceGeral === null) {
      return 'Índice Geral não pôde ser calculado para este recorte (todas as subseções ficaram abaixo do limiar de anonimato).';
    }
    const indiceFmt = global.Format.formatIndice(result.indiceGeral);
    const base = `Com os filtros aplicados, o clima apresentou índice geral de ${indiceFmt} (${result.classificacaoGeral})`;

    if (melhor && pior) {
      return `${base}, impulsionado por bons resultados em ${melhor.nome}, mas prejudicado por ${pior.nome}, que exige atenção.`;
    }
    if (melhor) {
      return `${base}, impulsionado por bons resultados em ${melhor.nome}.`;
    }
    if (pior) {
      return `${base}, mas prejudicado por ${pior.nome}, que exige atenção.`;
    }
    return `${base}.`;
  }

  /** Monta os grupos de positivos/negativos, agrupados por Seção, na ordem do instrumento. */
  function gerarListas(structure, result) {
    const positivos = [];
    const negativos = [];

    structure.sectionOrder.forEach((nomeSecao) => {
      const secaoResult = result.secoes.get(nomeSecao);
      if (!secaoResult) return;

      const pontosPositivos = [];
      const pontosNegativos = [];
      secaoResult.subsecoes.forEach((sub) => {
        if (sub.suprimida) return;
        if (sub.classificacao === 'Excelente') pontosPositivos.push({ subsecao: sub.nome, classificacao: sub.classificacao });
        if (sub.classificacao === 'Ruim') pontosNegativos.push({ subsecao: sub.nome, classificacao: sub.classificacao });
      });

      if (pontosPositivos.length) positivos.push({ secao: nomeSecao, pontos: pontosPositivos });
      if (pontosNegativos.length) negativos.push({ secao: nomeSecao, pontos: pontosNegativos });
    });

    return { positivos, negativos };
  }

  /** Gera uma única leitura interpretada (sem considerar eixo de comparação). */
  function gerarLeituraUnica(structure, allRows, filtros) {
    const cabecalho = gerarCabecalho(filtros);
    const n = global.Engine.filterRows(allRows, filtros).length;

    if (n < LIMIAR_ANONIMATO) {
      return {
        cabecalho,
        paragrafo: 'Dados insuficientes para leitura interpretada nesta seleção.',
        positivos: [],
        negativos: [],
        suficiente: false,
        n_total: n,
      };
    }

    const result = global.Engine.computeResult(structure, allRows, filtros);
    const { melhor, pior } = encontrarMelhorPior(structure, result);
    const paragrafo = gerarParagrafo(result, melhor, pior);
    const { positivos, negativos } = gerarListas(structure, result);

    return { cabecalho, paragrafo, positivos, negativos, suficiente: true, n_total: result.n, indiceGeral: result.indiceGeral, classificacaoGeral: result.classificacaoGeral };
  }

  /**
   * Gera 1+ leituras, considerando o "eixo de comparação" (seção 4.6): a
   * primeira dimensão de filtro (na ordem om > posto > vínculo > escolaridade)
   * com mais de 1 valor selecionado vira um eixo — uma leitura por valor,
   * mantendo as demais dimensões fixas. Sem eixo, gera uma leitura combinada.
   */
  function gerarLeituras(structure, allRows, filtros) {
    const filtrosSeguro = filtros || {};
    let eixo = null;
    for (const campo of FILTROS_ORDEM) {
      const valores = filtrosSeguro[campo] || [];
      if (valores.length > 1) { eixo = campo; break; }
    }

    if (!eixo) {
      return { eixo: null, leituras: [gerarLeituraUnica(structure, allRows, filtrosSeguro)] };
    }

    const valoresEixo = filtrosSeguro[eixo];
    const leituras = valoresEixo.map((valor) => {
      const filtrosIndividuais = Object.assign({}, filtrosSeguro, { [eixo]: [valor] });
      return gerarLeituraUnica(structure, allRows, filtrosIndividuais);
    });

    return { eixo, leituras };
  }

  global.Interpretation = {
    gerarCabecalho,
    encontrarMelhorPior,
    gerarParagrafo,
    gerarListas,
    gerarLeituraUnica,
    gerarLeituras,
  };
})(window);
