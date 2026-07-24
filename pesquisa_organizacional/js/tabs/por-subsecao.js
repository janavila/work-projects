/** Aba "Por Subseção" — ver seção 6.3. Um seletor de seção + tabela por pergunta. */
(function (global) {
  'use strict';

  const C = global.Constants;
  const F = global.Format;

  const state = { secaoSelecionada: null };

  function reset() {
    state.secaoSelecionada = null;
  }

  function statusLabel(status) {
    if (status === 'sem_respostas') return 'Sem respostas';
    if (status === 'insuficiente') return 'N insuficiente';
    return null;
  }

  function renderSubsecaoCard(sub) {
    const card = document.createElement('div');
    card.className = 'card psub-card';

    const cabecalho = document.createElement('div');
    cabecalho.className = 'psub-card-cabecalho';
    let html = `<h3>${F.escapeHtml(sub.nome)}</h3><span class="n-info">N=${F.formatInteiro(sub.n)}</span>`;
    if (!sub.suprimida) {
      const cor = C.corClassificacao(sub.classificacao);
      html += `<span class="n-info">Índice <strong style="color:${cor}">${F.formatIndice(sub.indice)}</strong></span>`;
      html += `<span class="texto-classificacao" style="color:${cor}">${sub.classificacao}</span>`;
    }
    cabecalho.innerHTML = html;
    card.appendChild(cabecalho);

    if (sub.suprimida) {
      const alerta = document.createElement('div');
      alerta.className = 'alerta alerta-aviso';
      alerta.textContent = `Seleção sem dados suficientes (N=${sub.n})`;
      card.appendChild(alerta);
      return card;
    }

    const tabela = document.createElement('table');
    tabela.className = 'tabela-dados';
    tabela.innerHTML = '<thead><tr><th>Pergunta</th><th class="col-numero">N</th><th class="col-numero">Índice</th><th>Classificação</th></tr></thead>';
    const tbody = document.createElement('tbody');
    sub.itens.forEach((item) => {
      const rotuloStatus = statusLabel(item.status);
      const cor = rotuloStatus ? C.CORES.cinzaNeutro : C.corClassificacao(item.classificacao);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${F.escapeHtml(item.descricao)}</td>
        <td class="col-numero">${F.formatInteiro(item.n)}</td>
        <td class="col-numero">${rotuloStatus ? '—' : F.formatIndice(item.indice)}</td>
        <td><span class="texto-classificacao" style="color:${cor}">${rotuloStatus || item.classificacao}</span></td>
      `;
      tbody.appendChild(tr);
    });
    tabela.appendChild(tbody);
    card.appendChild(tabela);
    return card;
  }

  function render(container) {
    const App = global.App;
    const result = App.getResultadoAtual();
    const secoes = App.structure.sectionOrder;

    if (!state.secaoSelecionada || !secoes.includes(state.secaoSelecionada)) {
      state.secaoSelecionada = secoes[0];
    }

    container.innerHTML = '';

    const seletorWrap = document.createElement('div');
    seletorWrap.className = 'psub-seletor';
    const select = document.createElement('select');
    select.id = 'psub-select-secao';
    secoes.forEach((nomeSecao) => {
      const meta = C.METADADOS_SECAO[nomeSecao];
      const opt = document.createElement('option');
      opt.value = nomeSecao;
      opt.textContent = `${nomeSecao} — ${meta.titulo}`;
      opt.selected = nomeSecao === state.secaoSelecionada;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => {
      state.secaoSelecionada = select.value;
      render(container);
    });
    seletorWrap.appendChild(select);
    container.appendChild(seletorWrap);

    const meta = C.METADADOS_SECAO[state.secaoSelecionada];
    const cabecalhoSecao = document.createElement('div');
    cabecalhoSecao.className = 'psub-cabecalho-secao';
    cabecalhoSecao.innerHTML = `
      <span class="icone">${meta.icone}</span>
      <div>
        <div class="titulo">${state.secaoSelecionada} — ${F.escapeHtml(meta.titulo)}</div>
        <div class="subtitulo">${F.escapeHtml(meta.subtitulo)}</div>
      </div>
    `;
    container.appendChild(cabecalhoSecao);

    const secaoResult = result.secoes.get(state.secaoSelecionada);
    secaoResult.subsecoes.forEach((sub) => {
      container.appendChild(renderSubsecaoCard(sub));
    });
  }

  global.Tabs = global.Tabs || {};
  global.Tabs.porSubsecao = { render, reset };
})(window);
