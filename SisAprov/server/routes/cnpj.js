const express = require('express');
const { lookupCnpj } = require('../services/cnpjLookup');

const router = express.Router();

// GET /api/cnpj/:numero - consulta razão social via BrasilAPI
router.get('/:numero', async (req, res) => {
  try {
    const nomeCredor = await lookupCnpj(req.params.numero);
    if (!nomeCredor) return res.status(404).json({ erro: 'CNPJ não encontrado' });
    res.json({ nomeCredor });
  } catch (err) {
    res.status(502).json({ erro: err.message || 'Falha ao consultar CNPJ' });
  }
});

module.exports = router;
