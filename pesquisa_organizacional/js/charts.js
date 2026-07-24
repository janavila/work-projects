/**
 * Camada de gráficos — wrappers sobre ECharts implementando as especificações
 * visuais da seção 8. Cada função recebe um elemento DOM + dados já calculados
 * pelo motor (js/engine.js) e devolve a instância ECharts (para dispose/resize).
 */
(function (global) {
  'use strict';

  const C = global.Constants;
  const F = global.Format;
  const FONTE = 'Helvetica, Arial, sans-serif';

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function baseOption() {
    return { textStyle: { fontFamily: FONTE, color: C.CORES.cinzaTexto }, backgroundColor: '#fff' };
  }

  function initChart(container) {
    const existing = global.echarts.getInstanceByDom(container);
    if (existing) existing.dispose();
    return global.echarts.init(container);
  }

  /**
   * Barras horizontais (Por Seção — subseções; Por OM — ranking). Ver 8.2.
   * @param {Array<{name:string, indice:?number, classificacao:?string, suprimida:boolean}>} items
   */
  function renderBarrasHorizontais(container, items, opts) {
    const options = opts || {};
    const suprimidos = items.filter((i) => i.suprimida);
    const validos = items.filter((i) => !i.suprimida).sort((a, b) => a.indice - b.indice);
    const ordered = suprimidos.concat(validos);

    const height = Math.max(options.minHeight || 240, ordered.length * 42 + 40);
    container.style.height = `${height}px`;
    const chart = initChart(container);

    const categorias = ordered.map((i) => i.name);
    const dados = ordered.map((i) => ({
      value: i.suprimida ? 0 : Math.round(i.indice * 10) / 10,
      itemStyle: { color: i.suprimida ? '#D9D9D9' : C.corClassificacao(i.classificacao), borderRadius: [0, 3, 3, 0] },
    }));

    chart.setOption(Object.assign(baseOption(), {
      grid: { left: options.leftMargin || 160, right: 60, top: 16, bottom: 28, containLabel: false },
      xAxis: { type: 'value', min: 0, max: 108, splitLine: { lineStyle: { color: '#EDEDED' } }, axisLabel: { formatter: (v) => v } },
      yAxis: { type: 'category', data: categorias, axisTick: { show: false }, axisLine: { lineStyle: { color: '#ccc' } } },
      series: [{
        type: 'bar',
        data: dados,
        barCategoryGap: '32%',
        label: {
          show: true,
          position: 'right',
          formatter: (params) => (ordered[params.dataIndex].suprimida ? 'N insuf.' : F.formatIndice(ordered[params.dataIndex].indice)),
          color: C.CORES.cinzaTexto,
          fontFamily: FONTE,
        },
      }],
    }));

    if (options.onClick) {
      chart.on('click', (params) => {
        const item = ordered[params.dataIndex];
        if (!item.suprimida || options.clickOnSuprimida) options.onClick(item.name);
      });
    }

    return chart;
  }

  /** Velocímetro do Índice Geral. Legenda das faixas em HTML acima do gauge (ver 8.3). */
  function renderGauge(container, indice, classificacao) {
    container.style.height = '260px';
    const chart = initChart(container);
    const cor = C.corClassificacao(classificacao);
    const valor = indice === null ? 0 : Math.round(indice * 10) / 10;

    chart.setOption(Object.assign(baseOption(), {
      series: [
        {
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          min: 0,
          max: 100,
          radius: '95%',
          center: ['50%', '78%'],
          progress: { show: false },
          // Agulha colorida pela classificação marca o valor exato — as 3 faixas de
          // fundo abaixo precisam ficar sempre visíveis por inteiro, então nenhuma
          // barra de progresso sólida é desenhada por cima delas (cobriria a faixa
          // "Ruim" sempre que o valor fosse ≥ 50).
          pointer: { show: true, length: '58%', width: 6, itemStyle: { color: cor } },
          axisLine: {
            lineStyle: {
              width: 22,
              color: [
                [0.5, hexToRgba(C.CORES.ruim, 0.4)],
                [0.75, hexToRgba(C.CORES.bom, 0.4)],
                [1, hexToRgba(C.CORES.excelente, 0.4)],
              ],
            },
          },
          axisTick: { show: false },
          splitLine: { distance: -22, length: 10, lineStyle: { color: '#fff', width: 2 } },
          axisLabel: { distance: -32, color: C.CORES.cinzaTexto, fontSize: 11, fontFamily: FONTE, formatter: (v) => v },
          anchor: { show: true, size: 12, itemStyle: { color: cor, borderWidth: 0 } },
          title: { show: false },
          detail: {
            valueAnimation: true,
            offsetCenter: [0, '-5%'],
            fontSize: 34,
            fontWeight: 'bold',
            fontFamily: FONTE,
            color: cor,
            formatter: () => F.formatIndice(indice),
          },
          data: [{ value: valor }],
        },
      ],
    }));

    return chart;
  }

  /**
   * Barras divergentes combinadas (drill-down de distribuição, escala 1-4).
   * Uma linha por item, 4 segmentos empilhados divergindo do centro. Ver 8.4.
   * @param {Array<{descricao:string, n:number, pct:Object}>} itens
   */
  function renderBarrasDivergentes(container, itens) {
    const height = Math.max(140, itens.length * 56 + 70);
    container.style.height = `${height}px`;
    const chart = initChart(container);

    const categorias = itens.map((it) => it.descricao);
    const [corDT, corD, corC, corCT] = C.CORES_DIVERGENTE;
    const [labelDT, labelD, labelC, labelCT] = C.LABELS_DIVERGENTE;

    const labelFormatter = (params) => {
      const v = Math.abs(params.value);
      return v > 3 ? F.formatPercentual(v) : '';
    };

    const series = [
      {
        name: labelD,
        type: 'bar',
        stack: 'neg',
        data: itens.map((it) => -(it.pct[2] || 0)),
        itemStyle: { color: corD },
        label: { show: true, formatter: labelFormatter, color: C.CORES.cinzaTexto, fontFamily: FONTE },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: '#999' }, label: { show: false }, data: [{ xAxis: 0 }] },
      },
      {
        name: labelDT,
        type: 'bar',
        stack: 'neg',
        data: itens.map((it) => -(it.pct[1] || 0)),
        itemStyle: { color: corDT },
        label: { show: true, formatter: labelFormatter, color: '#fff', fontFamily: FONTE },
      },
      {
        name: labelC,
        type: 'bar',
        stack: 'pos',
        data: itens.map((it) => it.pct[3] || 0),
        itemStyle: { color: corC },
        label: { show: true, formatter: labelFormatter, color: C.CORES.cinzaTexto, fontFamily: FONTE },
      },
      {
        name: labelCT,
        type: 'bar',
        stack: 'pos',
        data: itens.map((it) => it.pct[4] || 0),
        itemStyle: { color: corCT },
        label: { show: true, formatter: labelFormatter, color: '#fff', fontFamily: FONTE },
      },
    ];

    chart.setOption(Object.assign(baseOption(), {
      legend: { top: 0, data: [labelDT, labelD, labelC, labelCT], textStyle: { fontFamily: FONTE, color: C.CORES.cinzaTexto } },
      grid: { left: 220, right: 30, top: 40, bottom: 10, containLabel: true },
      xAxis: { type: 'value', axisLabel: { show: false }, axisLine: { show: false }, splitLine: { show: false }, min: -100, max: 100 },
      yAxis: { type: 'category', data: categorias, inverse: true, axisTick: { show: false } },
      series,
    }));

    return chart;
  }

  /** Heatmap OM × Seção. Ver 8.5. */
  function renderHeatmap(container, oms, secoesCols, matriz, onHover) {
    const height = Math.max(260, oms.length * 38 + 90);
    container.style.height = `${height}px`;
    const chart = initChart(container);

    const data = [];
    matriz.forEach((linha, yi) => {
      linha.forEach((cel, xi) => {
        data.push({
          value: [xi, yi, cel.indice],
          itemStyle: { color: cel.suprimida ? '#E8E8E8' : C.corClassificacao(cel.classificacao), borderColor: C.CORES.cinzaClaro, borderWidth: 2 },
          _meta: cel,
        });
      });
    });

    chart.setOption(Object.assign(baseOption(), {
      grid: { left: 160, right: 20, top: 20, bottom: 90, containLabel: false },
      tooltip: {
        formatter: (params) => {
          const meta = params.data._meta;
          if (!meta) return '';
          const partes = [
            `<b>${meta.om}</b>`,
            meta.secaoLabel,
            meta.secaoDescricao,
            `Índice: ${meta.suprimida ? '—' : F.formatIndice(meta.indice)}`,
            `Classificação: ${meta.suprimida ? 'N insuficiente' : meta.classificacao}`,
          ];
          return partes.join('<br/>');
        },
      },
      xAxis: { type: 'category', data: secoesCols, axisLabel: { rotate: -20, fontFamily: FONTE, color: C.CORES.cinzaTexto } },
      yAxis: { type: 'category', data: oms, axisLabel: { fontFamily: FONTE, color: C.CORES.cinzaTexto } },
      series: [{
        type: 'heatmap',
        data,
        label: {
          show: true,
          formatter: (params) => {
            const meta = params.data._meta;
            return meta && !meta.suprimida ? F.formatIndice(meta.indice) : '—';
          },
          color: '#fff',
          fontFamily: FONTE,
        },
      }],
    }));

    return chart;
  }

  /** Donut de composição demográfica. Ver 8.6. */
  function renderDonut(container, titulo, dados) {
    const chart = initChart(container);
    const paleta = C.PALETA_CATEGORICA;

    chart.setOption(Object.assign(baseOption(), {
      title: { text: titulo, left: 'center', top: 0, textStyle: { fontSize: 14, fontFamily: FONTE, color: C.CORES.cinzaTexto } },
      color: paleta,
      legend: { bottom: 0, type: 'scroll', textStyle: { fontFamily: FONTE, color: C.CORES.cinzaTexto, fontSize: 11 } },
      series: [{
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '48%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { formatter: '{b}: {d}%', fontFamily: FONTE, color: C.CORES.cinzaTexto, fontSize: 11 },
        data: dados.map((d) => ({ name: d.nome, value: d.valor })),
      }],
    }));

    return chart;
  }

  function dispose(chart) {
    if (chart && !chart.isDisposed()) chart.dispose();
  }

  global.Charts = { renderBarrasHorizontais, renderGauge, renderBarrasDivergentes, renderHeatmap, renderDonut, dispose, initChart };
})(window);
