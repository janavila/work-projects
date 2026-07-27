(() => {
  const { api, formatMoeda, formatDataBR } = SisAprov;

  const COR = {
    blue: '#2a78d6',
    orange: '#eb6834',
    aqua: '#1baf7a',
    textMuted: '#898781',
    textSecondary: '#52514e',
    grid: '#e1e0d9',
  };
  const CATEGORICO = [COR.blue, COR.orange, COR.aqua];

  const NATUREZA_LABEL = {
    '339030': 'Mat. Consumo (339030)',
    '339039': 'Serviço (339039)',
    '449052': 'Mat. Permanente (449052)',
  };

  let instanciasChart = [];

  function destruirCharts() {
    instanciasChart.forEach((c) => c.destroy());
    instanciasChart = [];
  }

  Chart.defaults.font.family = "'Segoe UI', Roboto, Arial, sans-serif";
  Chart.defaults.color = COR.textSecondary;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;

  function criarPizza(canvas, labels, valores) {
    const chart = new Chart(canvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data: valores,
          backgroundColor: CATEGORICO.slice(0, labels.length),
          borderColor: '#ffffff',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${formatMoeda(ctx.parsed)}`,
            },
          },
        },
      },
    });
    instanciasChart.push(chart);
  }

  function eixoPadrao() {
    return {
      x: { grid: { color: COR.grid }, ticks: { color: COR.textMuted } },
      y: { grid: { color: COR.grid }, ticks: { color: COR.textMuted }, beginAtZero: true },
    };
  }

  function criarBarraUnica(canvas, labels, valores, horizontal = false, formatarValor = formatMoeda) {
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: valores,
          backgroundColor: COR.blue,
          borderRadius: 4,
          maxBarThickness: 24,
        }],
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => formatarValor(ctx.parsed[horizontal ? 'x' : 'y']) } },
        },
        scales: eixoPadrao(),
      },
    });
    instanciasChart.push(chart);
  }

  function criarBarraDupla(canvas, labels, serie1, serie2, nome1, nome2) {
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: nome1, data: serie1, backgroundColor: COR.blue, borderRadius: 4, maxBarThickness: 24 },
          { label: nome2, data: serie2, backgroundColor: COR.orange, borderRadius: 4, maxBarThickness: 24 },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatMoeda(ctx.parsed.y)}` } },
        },
        scales: eixoPadrao(),
      },
    });
    instanciasChart.push(chart);
  }

  async function render(container) {
    destruirCharts();

    container.innerHTML = `
      <div class="cards-resumo" id="cardsResumo">
        <div class="vazio">Carregando indicadores…</div>
      </div>
      <div class="graficos-grid">
        <div class="grafico-card"><h4>Empenhos por Natureza de Despesa</h4><canvas id="chartNatureza"></canvas></div>
        <div class="grafico-card"><h4>Empenhos por Modalidade</h4><canvas id="chartModalidade"></canvas></div>
        <div class="grafico-card"><h4>Empenhos por UG</h4><canvas id="chartUg"></canvas></div>
        <div class="grafico-card grafico-card--largo"><h4>Valor Total × Valor Atual por Nota de Crédito</h4><canvas id="chartNc"></canvas></div>
        <div class="grafico-card"><h4>Recebimentos por Mês (R$)</h4><canvas id="chartRecebimentosMes"></canvas></div>
        <div class="grafico-card"><h4>Top 10 Favorecidos por Valor</h4><canvas id="chartTopFavorecidos"></canvas></div>
        <div class="grafico-card grafico-card--largo"><h4>Empenhos Mais Antigos em Aberto (dias sem recebimento)</h4><canvas id="chartAntigos"></canvas></div>
      </div>
    `;

    const [resumo, graficos] = await Promise.all([
      api.get('/api/dashboard/resumo'),
      api.get('/api/dashboard/graficos'),
    ]);

    container.querySelector('#cardsResumo').innerHTML = `
      <div class="card-resumo"><h4>Valor Total Empenhado</h4><strong>${formatMoeda(resumo.valorEmpenhado)}</strong></div>
      <div class="card-resumo"><h4>Valor Total Recebido</h4><strong>${formatMoeda(resumo.valorRecebido)}</strong></div>
      <div class="card-resumo"><h4>Saldo Total Disponível</h4><strong>${formatMoeda(resumo.saldoDisponivel)}</strong></div>
      <div class="card-resumo"><h4>Valor Total Anulado</h4><strong>${formatMoeda(resumo.valorAnulado)}</strong></div>
    `;

    criarPizza(
      container.querySelector('#chartNatureza'),
      graficos.porNaturezaDespesa.map((r) => NATUREZA_LABEL[r.label] || r.label),
      graficos.porNaturezaDespesa.map((r) => r.valor)
    );

    criarPizza(
      container.querySelector('#chartModalidade'),
      graficos.porModalidade.map((r) => r.label),
      graficos.porModalidade.map((r) => r.valor)
    );

    criarPizza(
      container.querySelector('#chartUg'),
      graficos.porUg.map((r) => r.label),
      graficos.porUg.map((r) => r.valor)
    );

    criarBarraDupla(
      container.querySelector('#chartNc'),
      graficos.notasCredito.map((n) => n.numero_nc),
      graficos.notasCredito.map((n) => n.valorTotal),
      graficos.notasCredito.map((n) => n.valorAtual),
      'Valor Total',
      'Valor Atual (saldo)'
    );

    criarBarraUnica(
      container.querySelector('#chartRecebimentosMes'),
      graficos.recebimentosPorMes.map((r) => r.mes),
      graficos.recebimentosPorMes.map((r) => r.valor)
    );

    criarBarraUnica(
      container.querySelector('#chartTopFavorecidos'),
      graficos.topFavorecidos.map((f) => f.nomeCredor || SisAprov.formatFavorecido(f.favorecido)),
      graficos.topFavorecidos.map((f) => f.total),
      true
    );

    criarBarraUnica(
      container.querySelector('#chartAntigos'),
      graficos.empenhosMaisAntigos.map((e) => `${e.numero_empenho} (${e.dias}d)`),
      graficos.empenhosMaisAntigos.map((e) => e.dias),
      true,
      (v) => `${v} dias`
    );
  }

  SisAprov.registrarView('graficos', render);
})();
