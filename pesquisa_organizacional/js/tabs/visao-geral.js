/** Aba "Visão Geral" — ver seção 6.1 da especificação. */
(function (global) {
  'use strict';

  const C = global.Constants;
  const F = global.Format;

  const SECOES_CARD = ['Seção 1', 'Seção 2', 'Seção 3', 'Seção 4', 'Seção 5', 'Seção 6'];

  function dadosCardSecao(result, nomeSecao) {
    if (nomeSecao === 'Seção 6') {
      const s6 = result.fechamentoS6;
      const ok = s6 && !s6.suprimida;
      return { indice: ok ? s6.indice : null, classificacao: ok ? s6.classificacao : null };
    }
    const s = result.secoes.get(nomeSecao);
    const ok = s && !s.suprimida;
    return { indice: ok ? s.indice : null, classificacao: ok ? s.classificacao : null };
  }

  function renderCardSecao(nomeSecao, dados) {
    const meta = C.METADADOS_SECAO[nomeSecao];
    const cor = C.corClassificacao(dados.classificacao);
    const card = document.createElement('div');
    card.className = 'card card-secao hover-elevar';
    card.style.borderTopColor = cor;
    card.innerHTML = `
      <div class="icone">${meta.icone}</div>
      <div class="nome-curto">${F.escapeHtml(nomeSecao.toUpperCase())}</div>
      <div class="titulo">${F.escapeHtml(meta.titulo)}</div>
      <div class="subtitulo">${F.escapeHtml(meta.subtitulo)}</div>
      <div class="numero-indice" style="color:${cor}">${dados.indice !== null ? F.formatIndice(dados.indice) : '—'}</div>
      <div class="tag-classificacao" style="background:${cor}">${dados.classificacao || 'N insuficiente'}</div>
    `;
    return card;
  }

  function renderGrupoLista(titulo, grupos, fallback) {
    let html = `<div class="leitura-grupo-titulo">${titulo}</div>`;
    if (!grupos.length) {
      html += `<div class="leitura-lista"><span class="fallback">${fallback}</span></div>`;
      return html;
    }
    grupos.forEach((g) => {
      const meta = C.METADADOS_SECAO[g.secao];
      html += `<div style="font-size:12.5px;font-weight:700;margin-top:8px;color:var(--verde-escuro)">${F.escapeHtml(g.secao)} — ${F.escapeHtml(meta.titulo)}</div>`;
      html += '<ul class="leitura-lista">';
      g.pontos.forEach((p) => {
        const cor = C.corClassificacao(p.classificacao);
        html += `<li>${F.escapeHtml(p.subsecao)} — <span class="texto-classificacao" style="color:${cor}">${p.classificacao}</span></li>`;
      });
      html += '</ul>';
    });
    return html;
  }

  function renderLeituraPainel(l) {
    const div = document.createElement('div');
    div.className = 'card leitura-painel';
    if (!l.suficiente) {
      div.innerHTML = `<div class="leitura-cabecalho">${F.escapeHtml(l.cabecalho)}</div><div class="leitura-insuficiente">${F.escapeHtml(l.paragrafo)}</div>`;
      return div;
    }
    let html = `<div class="leitura-cabecalho">${F.escapeHtml(l.cabecalho)}</div><div class="leitura-paragrafo">${F.escapeHtml(l.paragrafo)}</div>`;
    html += renderGrupoLista('Positivos', l.positivos, 'Nenhum destaque positivo identificado nesta seleção.');
    html += renderGrupoLista('Negativos', l.negativos, 'Nenhum ponto crítico identificado nesta seleção.');
    div.innerHTML = html;
    return div;
  }

  async function onExportar(formato, btn) {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Gerando…';
    try {
      await global.Exportador.exportar(formato);
    } catch (e) {
      window.alert(`Não foi possível gerar a exportação: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  function render(container) {
    const App = global.App;
    const result = App.getResultadoAtual();

    container.innerHTML = '';

    // ---------- linha do topo: N total + exportação ----------
    const topo = document.createElement('div');
    topo.className = 'vg-topo';
    topo.innerHTML = `<div class="vg-n-total">N = ${F.formatInteiro(result.n)} respondentes no recorte atual</div>`;

    const exportDiv = document.createElement('div');
    exportDiv.className = 'vg-exportar';
    exportDiv.innerHTML = `
      <select id="vg-export-formato" aria-label="Formato de exportação">
        <option value="pdf">PDF</option>
        <option value="docx">Word</option>
      </select>
      <button id="vg-export-btn" type="button">Exportar</button>
    `;
    topo.appendChild(exportDiv);
    container.appendChild(topo);

    exportDiv.querySelector('#vg-export-btn').addEventListener('click', (e) => {
      const formato = exportDiv.querySelector('#vg-export-formato').value;
      onExportar(formato, e.currentTarget);
    });

    // ---------- duas colunas: gauge+resultado geral | cards de seção ----------
    const colunas = document.createElement('div');
    colunas.className = 'vg-colunas';

    const colEsq = document.createElement('div');
    colEsq.className = 'vg-gauge-card';

    const gaugeCard = document.createElement('div');
    gaugeCard.className = 'card';
    gaugeCard.innerHTML = `
      <div class="gauge-legenda">
        <span><span class="marcador" style="background:${C.CORES.ruim}"></span>Ruim (0–49)</span>
        <span><span class="marcador" style="background:${C.CORES.bom}"></span>Bom (50–74)</span>
        <span><span class="marcador" style="background:${C.CORES.excelente}"></span>Excelente (75–100)</span>
      </div>
      <div class="chart-container" id="vg-gauge-container"></div>
    `;
    colEsq.appendChild(gaugeCard);

    const corGeral = C.corClassificacao(result.classificacaoGeral);
    const resultadoCard = document.createElement('div');
    resultadoCard.className = 'card card-secao';
    resultadoCard.style.borderTopColor = corGeral;
    resultadoCard.innerHTML = `
      <div class="icone">🎯</div>
      <div class="nome-curto">RESULTADO GERAL</div>
      <div class="titulo">Índice Geral</div>
      <div class="subtitulo">Média das Seções 1 a 5 (a Seção 6 é nota de fechamento à parte).</div>
      <div class="numero-indice" style="color:${corGeral}">${result.indiceGeral !== null ? F.formatIndice(result.indiceGeral) : '—'}</div>
      <div class="tag-classificacao" style="background:${corGeral}">${result.classificacaoGeral || 'N insuficiente'}</div>
    `;
    colEsq.appendChild(resultadoCard);
    colunas.appendChild(colEsq);

    const colDir = document.createElement('div');
    colDir.className = 'vg-cards-grid';
    SECOES_CARD.forEach((nomeSecao) => {
      colDir.appendChild(renderCardSecao(nomeSecao, dadosCardSecao(result, nomeSecao)));
    });
    colunas.appendChild(colDir);

    container.appendChild(colunas);

    // ---------- leitura interpretada ----------
    const { eixo, leituras } = global.Interpretation.gerarLeituras(App.structure, App.allRows, App.filtros);
    const wrap = document.createElement('div');
    if (eixo) {
      const aviso = document.createElement('div');
      aviso.className = 'leituras-aviso';
      aviso.textContent = `Comparação por ${C.FILTROS_ROTULO[eixo]} ativa — mostrando uma leitura interpretada independente para cada valor selecionado.`;
      wrap.appendChild(aviso);
    }
    const grid = document.createElement('div');
    grid.className = 'leituras-grid';
    leituras.forEach((l) => grid.appendChild(renderLeituraPainel(l)));
    wrap.appendChild(grid);
    container.appendChild(wrap);

    // ---------- gauge (depois de inserido no DOM) ----------
    global.Charts.renderGauge(document.getElementById('vg-gauge-container'), result.indiceGeral, result.classificacaoGeral);
  }

  global.Tabs = global.Tabs || {};
  global.Tabs.visaoGeral = { render };
})(window);
