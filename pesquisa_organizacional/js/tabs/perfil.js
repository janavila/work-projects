/** Aba "Perfil dos Respondentes" — 4 donuts de composição demográfica. Ver 6.6. */
(function (global) {
  'use strict';

  const F = global.Format;

  const CAMPOS = [
    { campo: 'om', titulo: 'Organização Militar' },
    { campo: 'posto_graduacao', titulo: 'Posto/Graduação' },
    { campo: 'vinculo', titulo: 'Vínculo' },
    { campo: 'escolaridade', titulo: 'Escolaridade' },
  ];

  function render(container) {
    const App = global.App;
    const result = App.getResultadoAtual();

    container.innerHTML = '';

    const nDiv = document.createElement('div');
    nDiv.className = 'perfil-n';
    nDiv.textContent = `N = ${F.formatInteiro(result.n)} respondentes no recorte atual`;
    container.appendChild(nDiv);

    const grid = document.createElement('div');
    grid.className = 'perfil-grid';
    CAMPOS.forEach(({ campo }, idx) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="chart-container perfil-donut-container" id="perfil-donut-${idx}"></div>`;
      grid.appendChild(card);
    });
    container.appendChild(grid);

    CAMPOS.forEach(({ campo, titulo }, idx) => {
      const dados = global.Engine.composicaoDemografica(result.rows, campo);
      global.Charts.renderDonut(document.getElementById(`perfil-donut-${idx}`), titulo, dados);
    });
  }

  global.Tabs = global.Tabs || {};
  global.Tabs.perfil = { render };
})(window);
