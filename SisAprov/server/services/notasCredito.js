const db = require('../db/database');

// valor_global dos empenhos já é líquido de anulações (a anulação reduz a
// quantidade/valor dos itens permanentemente), então basta subtrair a soma
// dos valor_global vinculados — sem somar anulações de volta, o que hoje
// causaria contagem em dobro.
function calcularValorAtual(notaCreditoId, excluirEmpenhoId) {
  const nc = db.prepare('SELECT valor_total FROM notas_credito WHERE id = ?').get(notaCreditoId);
  if (!nc) return null;

  const empenhosVinculados = db.prepare(
    'SELECT SUM(valor_global) AS total FROM empenhos WHERE nota_credito_id = ? AND id != ?'
  ).get(notaCreditoId, excluirEmpenhoId || -1).total || 0;

  return nc.valor_total - empenhosVinculados;
}

module.exports = { calcularValorAtual };
