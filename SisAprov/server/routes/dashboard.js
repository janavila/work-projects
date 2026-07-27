const express = require('express');
const dashboardService = require('../services/dashboard');

const router = express.Router();

// GET /api/dashboard/resumo
router.get('/resumo', (req, res) => {
  res.json(dashboardService.getResumo());
});

// GET /api/dashboard/graficos - todos os dados agregados para os gráficos
router.get('/graficos', (req, res) => {
  res.json({
    porNaturezaDespesa: dashboardService.getPorNaturezaDespesa(),
    porModalidade: dashboardService.getPorModalidade(),
    porUg: dashboardService.getPorUg(),
    notasCredito: dashboardService.getNotasCreditoValorAtual(),
    recebimentosPorMes: dashboardService.getRecebimentosPorMes(),
    topFavorecidos: dashboardService.getTopFavorecidos(10),
    empenhosMaisAntigos: dashboardService.getEmpenhosMaisAntigos(10),
  });
});

module.exports = router;
