/** Aba "Respostas Qualitativas" — ver seção 6.5. */
(function (global) {
  'use strict';

  const C = global.Constants;
  const F = global.Format;

  /** Agrupa os itens de texto por subseção, preservando a ordem do instrumento. */
  function agruparPorSubsecao(textItems) {
    const map = new Map();
    textItems.forEach((item) => {
      const key = `${item.secao}|${item.subsecao}`;
      if (!map.has(key)) map.set(key, { secao: item.secao, subsecao: item.subsecao, itens: [] });
      map.get(key).itens.push(item);
    });
    return Array.from(map.values());
  }

  /**
   * Determina se o grupo de textos deve ficar oculto (regra de anonimato nível 2).
   * Herda o status de supressão da subseção numérica correspondente quando ela
   * existe; para grupos de texto "soltos" (sem itens numéricos na mesma
   * subseção — ex.: comentário livre da Seção 2), calcula N próprio.
   */
  function statusGrupo(grupo, App, result) {
    if (grupo.secao === 'Seção 6') {
      return { suprimida: !result.fechamentoS6 || result.fechamentoS6.suprimida };
    }
    const secaoObj = App.structure.bySecao.get(grupo.secao);
    const subComputada = secaoObj && secaoObj.subsecoes.get(grupo.subsecao);
    if (subComputada) {
      const secaoResult = result.secoes.get(grupo.secao);
      const subResult = secaoResult.subsecoes.find((s) => s.nome === grupo.subsecao);
      return { suprimida: subResult.suprimida };
    }
    const colunas = grupo.itens.map((it) => it.coluna);
    const n = global.Engine.countN(result.rows, colunas);
    return { suprimida: n < C.LIMIAR_ANONIMATO };
  }

  function coletarTextos(grupo, rows) {
    const textos = [];
    rows.forEach((r) => {
      grupo.itens.forEach((item) => {
        const v = r[item.coluna];
        if (v && v.trim() !== '') textos.push(v.trim());
      });
    });
    return textos;
  }

  function render(container) {
    const App = global.App;
    const result = App.getResultadoAtual();
    const grupos = agruparPorSubsecao(App.structure.textItems);

    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'qual-grid';
    let algumCard = false;

    grupos.forEach((grupo) => {
      const { suprimida } = statusGrupo(grupo, App, result);
      if (suprimida) return;

      const textos = coletarTextos(grupo, result.rows);
      if (textos.length === 0) return;

      algumCard = true;
      const card = document.createElement('div');
      card.className = 'card qual-card';
      card.innerHTML = `<h3>${F.escapeHtml(grupo.subsecao)} (${F.formatInteiro(textos.length)} respostas)</h3>`;

      const ul = document.createElement('ul');
      ul.className = 'qual-lista';
      textos.forEach((t) => {
        const li = document.createElement('li');
        li.textContent = t;
        ul.appendChild(li);
      });
      card.appendChild(ul);
      grid.appendChild(card);
    });

    if (!algumCard) {
      container.innerHTML = '<div class="alerta alerta-info">Nenhuma resposta qualitativa disponível para este recorte.</div>';
      return;
    }
    container.appendChild(grid);
  }

  global.Tabs = global.Tabs || {};
  global.Tabs.qualitativas = { render };
})(window);
