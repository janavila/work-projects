/**
 * Pool de conexão MySQL e helpers de consulta.
 *
 * REGRA ABSOLUTA deste arquivo (seção 4.2 do documento da v2): toda consulta
 * usa prepared statement / parâmetros — nunca concatenação de string SQL.
 * Por isso os helpers abaixo só aceitam `sql` + `parametros`, e quem precisa de
 * uma lista variável de valores (cláusula IN) monta os `?` com
 * `placeholders()`, nunca interpolando os valores.
 */
'use strict';

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  // Datas voltam como string 'AAAA-MM-DD' / 'AAAA-MM-DD hh:mm:ss' em vez de
  // objeto Date, evitando qualquer conversão de fuso horário entre o MySQL, o
  // Node e o navegador (mesma precaução do script de pré-processamento).
  dateStrings: true,
});

/** Executa uma consulta parametrizada e devolve as linhas. */
async function consultar(sql, parametros) {
  const [linhas] = await pool.execute(sql, parametros || []);
  return linhas;
}

/** Executa uma consulta parametrizada de escrita e devolve o resultado (insertId, affectedRows). */
async function executar(sql, parametros) {
  const [resultado] = await pool.execute(sql, parametros || []);
  return resultado;
}

/** Devolve a primeira linha de uma consulta, ou null. */
async function consultarUm(sql, parametros) {
  const linhas = await consultar(sql, parametros);
  return linhas.length > 0 ? linhas[0] : null;
}

/**
 * Monta a lista de `?` para uma cláusula IN de tamanho variável.
 * Os VALORES continuam indo como parâmetros — aqui só se gera a pontuação.
 */
function placeholders(quantidade) {
  return Array(quantidade).fill('?').join(', ');
}

/**
 * Roda uma função dentro de uma transação, com commit automático em caso de
 * sucesso e rollback em qualquer erro. A função recebe a conexão dedicada.
 */
async function comTransacao(tarefa) {
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();
    const resultado = await tarefa(conexao);
    await conexao.commit();
    return resultado;
  } catch (erro) {
    try { await conexao.rollback(); } catch (e) { /* conexão já perdida */ }
    throw erro;
  } finally {
    conexao.release();
  }
}

/** Testa a conexão na subida do servidor, para falhar cedo com mensagem clara. */
async function verificarConexao() {
  const conexao = await pool.getConnection();
  try {
    await conexao.query('SELECT 1');
  } finally {
    conexao.release();
  }
}

module.exports = { pool, consultar, consultarUm, executar, placeholders, comTransacao, verificarConexao };
