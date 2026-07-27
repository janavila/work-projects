const db = require('../db/database');

// Desde que a anulação passou a reduzir permanentemente a quantidade/valor dos
// itens do empenho (e portanto o próprio valor_global), o saldo é apenas o
// valor_global (já líquido de anulações) menos o que já foi recebido.
function recalcularSaldo(empenhoId) {
  const empenho = db.prepare('SELECT valor_global FROM empenhos WHERE id = ?').get(empenhoId);
  if (!empenho) return null;

  const recebido = db.prepare(
    'SELECT COALESCE(SUM(valor_total_ne), 0) AS total FROM recebimentos WHERE empenho_id = ?'
  ).get(empenhoId).total;

  const saldo = empenho.valor_global - recebido;
  db.prepare('UPDATE empenhos SET saldo_atual = ? WHERE id = ?').run(saldo, empenhoId);
  return saldo;
}

// Recalcula o valor_global do empenho a partir da soma atual dos itens
// (chamado após qualquer mutação de quantidade/valor_total em itens_empenho,
// como as reduções permanentes aplicadas por anulações).
function recalcularValorGlobal(empenhoId) {
  const total = db.prepare(
    'SELECT COALESCE(SUM(valor_total), 0) AS total FROM itens_empenho WHERE empenho_id = ?'
  ).get(empenhoId).total;
  db.prepare('UPDATE empenhos SET valor_global = ? WHERE id = ?').run(total, empenhoId);
  return total;
}

module.exports = { recalcularSaldo, recalcularValorGlobal };
