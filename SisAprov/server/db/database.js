const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'sisaprov.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

// Migração leve: adiciona colunas novas em bancos já existentes (CREATE TABLE
// IF NOT EXISTS não altera tabelas já criadas em versões anteriores do schema).
const COLUNAS_EMPENHOS_NOVAS = {
  acompanhamento_enviado: 'INTEGER NOT NULL DEFAULT 0',
  acompanhamento_recebido_empresa: 'INTEGER NOT NULL DEFAULT 0',
  acompanhamento_recebido_om: 'INTEGER NOT NULL DEFAULT 0',
  acompanhamento_notificado: 'INTEGER NOT NULL DEFAULT 0',
  acompanhamento_processo_administrativo: 'INTEGER NOT NULL DEFAULT 0',
};
const colunasExistentes = db.prepare('PRAGMA table_info(empenhos)').all().map((c) => c.name);
Object.entries(COLUNAS_EMPENHOS_NOVAS).forEach(([coluna, definicao]) => {
  if (!colunasExistentes.includes(coluna)) {
    db.exec(`ALTER TABLE empenhos ADD COLUMN ${coluna} ${definicao}`);
  }
});

module.exports = db;
