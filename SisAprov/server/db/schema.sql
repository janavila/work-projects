-- SisAprov — Schema SQLite

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS notas_credito (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  data_emissao    TEXT NOT NULL,
  uge             TEXT NOT NULL,
  ug              TEXT NOT NULL CHECK (ug IN ('160364', '167364')),
  numero_nc       TEXT NOT NULL,
  observacao      TEXT,
  ptres           TEXT,
  fonte           TEXT,
  nd              TEXT NOT NULL CHECK (nd IN ('339000', '339030', '339039', '449052')),
  plano_interno   TEXT,
  valor_total     REAL NOT NULL DEFAULT 0,
  prazo           TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS empenhos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_empenho    TEXT NOT NULL,
  favorecido        TEXT NOT NULL,
  nome_credor       TEXT,
  data_emissao      TEXT NOT NULL,
  ug                TEXT NOT NULL CHECK (ug IN ('160364', '167364')),
  natureza_despesa  TEXT NOT NULL CHECK (natureza_despesa IN ('339030', '339039', '449052')),
  valor_global      REAL NOT NULL DEFAULT 0,
  saldo_atual       REAL NOT NULL DEFAULT 0,
  modalidade        TEXT NOT NULL CHECK (modalidade IN ('Global', 'Estimativo', 'Ordinário')),
  nota_credito_id   INTEGER REFERENCES notas_credito(id),
  descricao         TEXT,
  observacao        TEXT,
  acompanhamento_enviado                  INTEGER NOT NULL DEFAULT 0,
  acompanhamento_recebido_empresa         INTEGER NOT NULL DEFAULT 0,
  acompanhamento_recebido_om              INTEGER NOT NULL DEFAULT 0,
  acompanhamento_notificado               INTEGER NOT NULL DEFAULT 0,
  acompanhamento_processo_administrativo  INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS itens_empenho (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  empenho_id      INTEGER NOT NULL REFERENCES empenhos(id) ON DELETE CASCADE,
  numero          INTEGER NOT NULL,
  descricao       TEXT NOT NULL,
  quantidade      INTEGER NOT NULL,
  valor_unitario  REAL NOT NULL,
  valor_total     REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS anulacoes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  empenho_id      INTEGER NOT NULL REFERENCES empenhos(id),
  valor_anulado   REAL NOT NULL,
  data            TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comissoes (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  bi_nomeacao             TEXT NOT NULL,
  data_nomeacao           TEXT NOT NULL,
  presidente_nome         TEXT NOT NULL,
  presidente_posto        TEXT NOT NULL CHECK (presidente_posto IN ('1º Ten', '2º Ten')),
  membro1_nome            TEXT NOT NULL,
  membro1_posto           TEXT NOT NULL CHECK (membro1_posto IN ('3º Sgt', '2º Sgt', '1º Sgt')),
  membro2_nome            TEXT NOT NULL,
  membro2_posto           TEXT NOT NULL CHECK (membro2_posto IN ('3º Sgt', '2º Sgt', '1º Sgt')),
  fiscal_nome             TEXT NOT NULL,
  fiscal_posto            TEXT NOT NULL CHECK (fiscal_posto IN ('Cel', 'TC', 'Maj')),
  mes                     TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recebimentos (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  empenho_id            INTEGER NOT NULL REFERENCES empenhos(id),
  valor_total_ne        REAL NOT NULL,
  numero_nota_fiscal    TEXT NOT NULL,
  data_nota_fiscal      TEXT NOT NULL,
  valor_nf              REAL NOT NULL,
  data_recebimento      TEXT NOT NULL,
  comissao_id           INTEGER REFERENCES comissoes(id),
  presidente_comissao   TEXT,
  relatorio             INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS itens_recebidos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  recebimento_id    INTEGER NOT NULL REFERENCES recebimentos(id) ON DELETE CASCADE,
  item_empenho_id   INTEGER NOT NULL REFERENCES itens_empenho(id),
  quantidade        INTEGER NOT NULL,
  valor_unitario    REAL NOT NULL,
  valor_total       REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS itens_anulados (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  anulacao_id       INTEGER NOT NULL REFERENCES anulacoes(id) ON DELETE CASCADE,
  item_empenho_id   INTEGER NOT NULL REFERENCES itens_empenho(id),
  quantidade        INTEGER NOT NULL,
  valor_unitario    REAL NOT NULL,
  valor_total       REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_itens_empenho_empenho ON itens_empenho(empenho_id);
CREATE INDEX IF NOT EXISTS idx_anulacoes_empenho ON anulacoes(empenho_id);
CREATE INDEX IF NOT EXISTS idx_recebimentos_empenho ON recebimentos(empenho_id);
CREATE INDEX IF NOT EXISTS idx_itens_recebidos_recebimento ON itens_recebidos(recebimento_id);
CREATE INDEX IF NOT EXISTS idx_itens_recebidos_item ON itens_recebidos(item_empenho_id);
CREATE INDEX IF NOT EXISTS idx_itens_anulados_anulacao ON itens_anulados(anulacao_id);
CREATE INDEX IF NOT EXISTS idx_itens_anulados_item ON itens_anulados(item_empenho_id);
CREATE INDEX IF NOT EXISTS idx_empenhos_nota_credito ON empenhos(nota_credito_id);
