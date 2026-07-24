/** Aba "Por Seção" — ver seção 6.2. Drill-down por clique abre distribuição de respostas por item. */
(function (global) {
  'use strict';

  const C = global.Constants;
  const F = global.Format;

  const state = { secaoSelecionada: null, subsecaoSelecionada: null };

  function reset() {
    state.secaoSelecionada = null;
    state.subsecaoSelecionada = null;
  }

  function renderDrilldown(container, App, result) {
    container.innerHTML = '';
    if (!state.subsecaoSelecionada) return;

    const secaoObj = App.structure.bySecao.get(state.secaoSelecionada);
    const subsecaoObj = secaoObj && secaoObj.subsecoes.get(state.subsecaoSelecionada);
    if (!subsecaoObj) { reset(); return; }

    const painel = document.createElement('div');
    painel.className = 'ps-drilldown';

    const titulo = document.createElement('div');
    titulo.className = 'ps-drilldown-titulo';
    titulo.innerHTML = `<h3>Distribuição de respostas — ${F.escapeHtml(state.secaoSelecionada)} / ${F.escapeHtml(state.subsecaoSelecionada)}</h3>`;
    const fechar = document.createElement('button');
    fechar.type = 'button';
    fechar.className = 'ps-drilldown-fechar';
    fechar.textContent = 'Fechar ✕';
    fechar.addEventListener('click', () => { reset(); render(document.getElementById('aba-por-secao')); });
    titulo.appendChild(fechar);
    painel.appendChild(titulo);

    const itensElegiveis = global.Engine.itensParaDrilldown(subsecaoObj);
    const itensComDados = itensElegiveis
      .map((item) => {
        const dist = global.Engine.distribuicaoItem(item, result.rows);
        return dist ? { descricao: item.descricao, n: dist.n, pct: dist.pct } : null;
      })
      .filter(Boolean);

    if (itensComDados.length === 0) {
      const alerta = document.createElement('div');
      alerta.className = 'alerta alerta-info';
      alerta.textContent = 'Nenhum item com dados suficientes para exibir a distribuição nesta subseção.';
      painel.appendChild(alerta);
    } else {
      const chartDiv = document.createElement('div');
      chartDiv.className = 'chart-container';
      painel.appendChild(chartDiv);
      container.appendChild(painel);
      global.Charts.renderBarrasDivergentes(chartDiv, itensComDados);
      return;
    }

    container.appendChild(painel);
  }

  function renderSecaoCard(nomeSecao, secaoResult, chartId) {
    const card = document.createElement('div');
    card.className = 'card ps-secao-card hover-elevar';

    const titulo = document.createElement('div');
    titulo.className = 'ps-secao-titulo';
    titulo.textContent = secaoResult.suprimida
      ? `${nomeSecao} — N insuficiente`
      : `${nomeSecao} — ${F.formatIndice(secaoResult.indice)} (${secaoResult.classificacao})`;
    card.appendChild(titulo);

    const corpo = document.createElement('div');
    corpo.className = 'ps-secao-corpo';

    const tabela = document.createElement('table');
    tabela.className = 'tabela-dados';
    tabela.innerHTML = '<thead><tr><th>Subseção</th><th class="col-numero">N</th><th class="col-numero">Índice</th><th>Classificação</th></tr></thead>';
    const tbody = document.createElement('tbody');
    secaoResult.subsecoes.forEach((sub) => {
      const cor = C.corClassificacao(sub.classificacao);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${F.escapeHtml(sub.nome)}</td>
        <td class="col-numero">${F.formatInteiro(sub.n)}</td>
        <td class="col-numero">${sub.suprimida ? '—' : F.formatIndice(sub.indice)}</td>
        <td><span class="texto-classificacao" style="color:${cor}">${sub.suprimida ? 'N insuficiente' : sub.classificacao}</span></td>
      `;
      tbody.appendChild(tr);
    });
    tabela.appendChild(tbody);
    corpo.appendChild(tabela);

    const chartDiv = document.createElement('div');
    chartDiv.className = 'chart-container';
    chartDiv.id = chartId;
    corpo.appendChild(chartDiv);

    card.appendChild(corpo);
    return card;
  }

  function render(container) {
    const App = global.App;
    const result = App.getResultadoAtual();

    container.innerHTML = '';

    const instrucao = document.createElement('div');
    instrucao.className = 'ps-instrucao';
    instrucao.textContent = 'Clique numa barra de subseção para ver a distribuição de respostas por item.';
    container.appendChild(instrucao);

    const drilldownArea = document.createElement('div');
    container.appendChild(drilldownArea);

    const secoesInfo = [];
    App.structure.sectionOrder.forEach((nomeSecao, idx) => {
      const secaoResult = result.secoes.get(nomeSecao);
      const chartId = `ps-chart-${idx}`;
      container.appendChild(renderSecaoCard(nomeSecao, secaoResult, chartId));
      secoesInfo.push({ nomeSecao, secaoResult, chartId });
    });

    renderDrilldown(drilldownArea, App, result);

    // gráficos são inicializados depois de tudo estar no DOM (ECharts precisa de dimensões reais)
    secoesInfo.forEach(({ nomeSecao, secaoResult, chartId }) => {
      const chartDiv = document.getElementById(chartId);
      if (!chartDiv) return;
      const items = secaoResult.subsecoes.map((sub) => ({
        name: sub.nome, indice: sub.indice, classificacao: sub.classificacao, suprimida: sub.suprimida,
      }));
      global.Charts.renderBarrasHorizontais(chartDiv, items, {
        onClick: (nomeSubsecao) => {
          state.secaoSelecionada = nomeSecao;
          state.subsecaoSelecionada = nomeSubsecao;
          render(container);
          container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      });
    });
  }

  global.Tabs = global.Tabs || {};
  global.Tabs.porSecao = { render, reset };
})(window);
