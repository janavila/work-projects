-- ===========================================================================
-- Migration 001 — Autenticação, permissões por OM e gestão de datasets (v2)
--
-- DDL consolidado das seções 2.3 e 3.2 do documento
-- v2_autenticacao_permissoes_datasets.md.
--
-- Como rodar (ver README_V2.md, seção "Rodar as migrations"):
--   mysql -u root -p <nome_do_banco> < server/migrations/001_criar_tabelas.sql
--
-- Rode com uma conta ADMINISTRATIVA do MySQL (root ou equivalente). O usuário da
-- aplicação (clima_app) não tem privilégio CREATE de propósito — com ele este
-- arquivo falha na primeira tabela, com ERROR 1142.
--
-- Este arquivo NÃO cria o banco nem o usuário da aplicação — isso é feito uma
-- única vez pelo DBA/administrador com privilégio de root (ver README_V2.md),
-- justamente porque o usuário da aplicação tem privilégio mínimo e não pode
-- executar CREATE DATABASE / GRANT (seção 4.2 do documento de mudanças).
--
-- A tabela `sessions` NÃO está aqui: ela é criada e mantida automaticamente
-- pelo pacote express-mysql-session na primeira subida do servidor.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Contas de acesso.
--
-- `tentativas_falhas` / `bloqueado_ate` implementam o bloqueio de 5 tentativas
-- por 15 minutos (seção 4.2). `senha_hash` guarda sempre bcrypt custo 12 e
-- nunca é devolvido por nenhuma rota da API.
--
-- `criado_por` usa ON DELETE SET NULL: sem isso, excluir um admin que criou
-- outras contas violaria a chave estrangeira e a rota DELETE /api/admin/
-- usuarios/:id ficaria impossível de executar na prática.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  nome                VARCHAR(150) NOT NULL,
  email               VARCHAR(150) NOT NULL UNIQUE,
  senha_hash          VARCHAR(255) NOT NULL,
  is_admin            BOOLEAN NOT NULL DEFAULT FALSE,
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  tentativas_falhas   INT NOT NULL DEFAULT 0,
  bloqueado_ate       DATETIME NULL,
  criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  criado_por          INT NULL,
  CONSTRAINT fk_usuarios_criado_por
    FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Organizações Militares.
--
-- `nome` precisa bater EXATAMENTE com o valor da coluna `om` dos dados
-- processados — é essa string que o navegador compara para decidir o que o
-- usuário pode ver. OM detectada num upload e ainda não cadastrada entra aqui
-- com ativo = FALSE, para o admin revisar antes de liberar acesso (seção 3.1).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizacoes_militares (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  nome                VARCHAR(150) NOT NULL UNIQUE,
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Permissão de visualização, por OM, multi-seleção (uma linha por par).
--
-- Admin NÃO precisa de linhas aqui: `is_admin` já significa "todas as OMs"
-- (seção 2.1). Usuário comum sem nenhuma linha vê o aviso "sem organizações
-- liberadas para seu usuário" no dashboard.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuario_om_permissao (
  usuario_id          INT NOT NULL,
  om_id               INT NOT NULL,
  concedido_em        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  concedido_por       INT NULL,
  PRIMARY KEY (usuario_id, om_id),
  CONSTRAINT fk_permissao_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_permissao_om
    FOREIGN KEY (om_id) REFERENCES organizacoes_militares(id) ON DELETE CASCADE,
  CONSTRAINT fk_permissao_concedido_por
    FOREIGN KEY (concedido_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Datasets (metadado apenas — o CSV processado fica em disco, em
-- data/datasets/<id>/resultados.csv, ver seção 3.2 do documento).
--
-- periodo_inicio, periodo_fim e total_respondentes são NULL-áveis de propósito:
-- o fluxo da seção 3.3 manda registrar a tentativa de upload que falhou na
-- validação (status = 'erro' + mensagem_erro), e nesse caso o período e o total
-- de respondentes não existem — o arquivo nem chegou a ser processado.
-- Datasets com status = 'erro' nunca aparecem no seletor do dashboard; existem
-- só como histórico na tela de gestão.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS datasets (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  rotulo                 VARCHAR(150) NULL,
  nome_arquivo_original  VARCHAR(255) NOT NULL,
  caminho_processado     VARCHAR(255) NOT NULL,
  periodo_inicio         DATE NULL,
  periodo_fim            DATE NULL,
  total_respondentes     INT NULL,
  enviado_por            INT NOT NULL,
  enviado_em             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status                 ENUM('processado','erro') NOT NULL DEFAULT 'processado',
  mensagem_erro          VARCHAR(500) NULL,
  CONSTRAINT fk_datasets_enviado_por
    FOREIGN KEY (enviado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Quais OMs aparecem em cada dataset, com o N de respondentes de cada uma.
--
-- Detectado automaticamente no upload a partir da coluna `om` dos dados
-- processados (seção 3.1) — o admin não separa nada à mão. É esta tabela que
-- decide quais datasets um usuário comum vê no seletor.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dataset_om (
  dataset_id             INT NOT NULL,
  om_id                  INT NOT NULL,
  total_respondentes_om  INT NOT NULL,
  PRIMARY KEY (dataset_id, om_id),
  CONSTRAINT fk_dataset_om_dataset
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  CONSTRAINT fk_dataset_om_om
    FOREIGN KEY (om_id) REFERENCES organizacoes_militares(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices de apoio às consultas mais frequentes da aplicação.
CREATE INDEX idx_datasets_status ON datasets (status, enviado_em);
CREATE INDEX idx_permissao_om ON usuario_om_permissao (om_id);
