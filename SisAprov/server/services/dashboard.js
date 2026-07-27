const db = require('../db/database');

function getResumo() {
  const valorEmpenhado = db.prepare(
    `SELECT COALESCE(SUM(valor_global), 0) AS total FROM empenhos`
  ).get().total;

  const valorRecebido = db.prepare(
    `SELECT COALESCE(SUM(valor_total_ne), 0) AS total FROM recebimentos`
  ).get().total;

  const saldoDisponivel = db.prepare(
    `SELECT COALESCE(SUM(saldo_atual), 0) AS total FROM empenhos WHERE saldo_atual > 0`
  ).get().total;

  const valorAnulado = db.prepare(
    `SELECT COALESCE(SUM(valor_anulado), 0) AS total FROM anulacoes`
  ).get().total;

  return {
    valorEmpenhado,
    valorRecebido,
    saldoDisponivel,
    valorAnulado,
  };
}

function getPorNaturezaDespesa() {
  return db.prepare(`
    SELECT natureza_despesa AS label, COALESCE(SUM(valor_global), 0) AS valor
    FROM empenhos GROUP BY natureza_despesa
  `).all();
}

function getPorModalidade() {
  return db.prepare(`
    SELECT modalidade AS label, COALESCE(SUM(valor_global), 0) AS valor
    FROM empenhos GROUP BY modalidade
  `).all();
}

function getPorUg() {
  return db.prepare(`
    SELECT ug AS label, COALESCE(SUM(valor_global), 0) AS valor
    FROM empenhos GROUP BY ug
  `).all();
}

// valor_global dos empenhos já é líquido de anulações, então não somamos
// anulações de volta aqui (evita contagem em dobro).
function getNotasCreditoValorAtual() {
  return db.prepare(`
    SELECT
      nc.id,
      nc.numero_nc,
      nc.valor_total AS valorTotal,
      nc.valor_total
        - COALESCE((SELECT SUM(e.valor_global) FROM empenhos e WHERE e.nota_credito_id = nc.id), 0) AS valorAtual
    FROM notas_credito nc
    ORDER BY nc.numero_nc
  `).all();
}

function getRecebimentosPorMes() {
  return db.prepare(`
    SELECT strftime('%Y-%m', data_recebimento) AS mes,
           COUNT(*) AS quantidade,
           COALESCE(SUM(valor_total_ne), 0) AS valor
    FROM recebimentos
    GROUP BY mes
    ORDER BY mes
  `).all();
}

function getTopFavorecidos(limit = 10) {
  return db.prepare(`
    SELECT favorecido, MAX(nome_credor) AS nomeCredor, COALESCE(SUM(valor_global), 0) AS total
    FROM empenhos
    GROUP BY favorecido
    ORDER BY total DESC
    LIMIT ?
  `).all(limit);
}

function getEmpenhosMaisAntigos(limit = 10) {
  const rows = db.prepare(`
    SELECT id, numero_empenho, favorecido, nome_credor, data_emissao, saldo_atual
    FROM empenhos
    WHERE saldo_atual > 0
    ORDER BY data_emissao ASC
    LIMIT ?
  `).all(limit);

  const hoje = new Date();
  return rows.map((r) => {
    const emissao = new Date(r.data_emissao);
    const dias = Math.floor((hoje - emissao) / (1000 * 60 * 60 * 24));
    return { ...r, dias };
  }).sort((a, b) => b.dias - a.dias);
}

module.exports = {
  getResumo,
  getPorNaturezaDespesa,
  getPorModalidade,
  getPorUg,
  getNotasCreditoValorAtual,
  getRecebimentosPorMes,
  getTopFavorecidos,
  getEmpenhosMaisAntigos,
};
