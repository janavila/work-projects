/** Aba "Por Organização Militar" — ranking + heatmap. Ver seção 6.4. */
(function (global) {
  'use strict';

  const C = global.Constants;

  function render(container) {
    const App = global.App;
    const filtrosSemOM = Object.assign({}, App.filtros, { om: [] });
    const todasOMs = App.domainValues.om;
    const { incluidas, excluidas } = global.Engine.computeByOM(App.structure, App.allRows, todasOMs, filtrosSemOM);

    container.innerHTML = '';

    const instrucao = document.createElement('div');
    instrucao.className = 'pom-instrucao';
    instrucao.textContent = 'Clique numa barra de OM para aplicá-la como filtro.';
    container.appendChild(instrucao);

    const grid = document.createElement('div');
    grid.className = 'pom-grid';

    const rankCard = document.createElement('div');
    rankCard.className = 'card hover-elevar';
    rankCard.innerHTML = '<div class="pom-card-titulo">Ranking por OM — Índice Geral</div><div class="chart-container" id="pom-rank-chart"></div>';
    grid.appendChild(rankCard);

    const heatCard = document.createElement('div');
    heatCard.className = 'card hover-elevar';
    heatCard.innerHTML = '<div class="pom-card-titulo">Heatmap OM × Seção</div><div class="chart-container" id="pom-heat-chart"></div>';
    grid.appendChild(heatCard);

    container.appendChild(grid);

    if (excluidas.length > 0) {
      const aviso = document.createElement('div');
      aviso.className = 'pom-aviso-exclusao';
      const nomes = excluidas.map((e) => e.om).join(', ');
      aviso.textContent = `${excluidas.length} OM(s) sem dados suficientes no recorte atual e não exibidas: ${nomes}.`;
      container.appendChild(aviso);
    }

    if (incluidas.length === 0) {
      document.getElementById('pom-rank-chart').outerHTML = '<div class="alerta alerta-aviso">Nenhuma OM com dados suficientes neste recorte.</div>';
      document.getElementById('pom-heat-chart').outerHTML = '';
      return;
    }

    // ---------- ranking ----------
    const rankItems = incluidas.map((inc) => ({
      name: inc.om,
      indice: inc.resultado.indiceGeral,
      classificacao: inc.resultado.classificacaoGeral,
      suprimida: inc.resultado.indiceGeral === null,
    }));
    global.Charts.renderBarrasHorizontais(document.getElementById('pom-rank-chart'), rankItems, {
      minHeight: 260,
      leftMargin: 150,
      onClick: (omName) => App.adicionarValorFiltro('om', omName),
    });

    // ---------- heatmap ----------
    const omsAlfabetico = incluidas.map((i) => i.om).slice().sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const resultadoPorOM = new Map(incluidas.map((i) => [i.om, i.resultado]));
    const secoesCols = C.SECOES_INDICE_GERAL.map((n) => `${n} — ${C.METADADOS_SECAO[n].titulo}`);

    const matriz = omsAlfabetico.map((om) => C.SECOES_INDICE_GERAL.map((nomeSecao) => {
      const secaoResult = resultadoPorOM.get(om).secoes.get(nomeSecao);
      const meta = C.METADADOS_SECAO[nomeSecao];
      return {
        om,
        secaoLabel: `${nomeSecao} — ${meta.titulo}`,
        secaoDescricao: meta.subtitulo,
        indice: secaoResult.suprimida ? null : secaoResult.indice,
        classificacao: secaoResult.suprimida ? null : secaoResult.classificacao,
        suprimida: secaoResult.suprimida,
      };
    }));

    global.Charts.renderHeatmap(document.getElementById('pom-heat-chart'), omsAlfabetico, secoesCols, matriz);
  }

  global.Tabs = global.Tabs || {};
  global.Tabs.porOM = { render };
})(window);
