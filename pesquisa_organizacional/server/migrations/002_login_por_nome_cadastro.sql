-- ===========================================================================
-- Migration 002 — Login por nome de cadastro; e-mail passa a ser opcional
--
-- Como rodar (conta ADMINISTRATIVA do MySQL — é DDL, ver README_V2.md):
--   mysql -u root -p <nome_do_banco> < server/migrations/002_login_por_nome_cadastro.sql
--
-- O que muda em relação à migration 001:
--   - `nome_cadastro` passa a ser a credencial de entrada (única, obrigatória);
--   - `email` deixa de ser obrigatório e passa a ser informação opcional de
--     contato. Ele continua ÚNICO quando informado: o MySQL permite vários NULL
--     num índice único, então duas contas sem e-mail convivem, mas duas contas
--     com o mesmo e-mail não.
--
-- A migration é segura de rodar num banco que já tem contas: as existentes
-- recebem um nome de cadastro derivado do e-mail (a parte antes do @), com
-- colisões resolvidas pelo id. Confira e ajuste depois em Gestão > Usuários.
-- ===========================================================================

-- --- 1. cria a coluna aceitando NULL, para poder preencher as contas já existentes
ALTER TABLE usuarios
  ADD COLUMN nome_cadastro VARCHAR(60) NULL AFTER nome;

-- --- 2. deriva o nome de cadastro do e-mail: parte antes do @, em minúsculas,
--        mantendo apenas letras, dígitos, ponto, hífen e sublinhado
UPDATE usuarios
   SET nome_cadastro = REGEXP_REPLACE(LOWER(SUBSTRING_INDEX(email, '@', 1)), '[^a-z0-9._-]', '')
 WHERE nome_cadastro IS NULL;

-- --- 3. rede de segurança: e-mail estranho que tenha virado string vazia
UPDATE usuarios
   SET nome_cadastro = CONCAT('usuario', id)
 WHERE nome_cadastro IS NULL OR nome_cadastro = '';

-- --- 4. desempata nomes de cadastro repetidos acrescentando o id
UPDATE usuarios u
  JOIN (
    SELECT nome_cadastro
      FROM usuarios
     GROUP BY nome_cadastro
    HAVING COUNT(*) > 1
  ) repetidos ON repetidos.nome_cadastro = u.nome_cadastro
   SET u.nome_cadastro = CONCAT(u.nome_cadastro, '_', u.id);

-- --- 5. agora sim: obrigatório e único
ALTER TABLE usuarios
  MODIFY COLUMN nome_cadastro VARCHAR(60) NOT NULL,
  ADD UNIQUE KEY uk_usuarios_nome_cadastro (nome_cadastro);

-- --- 6. e-mail deixa de ser obrigatório (segue único quando informado)
ALTER TABLE usuarios
  MODIFY COLUMN email VARCHAR(150) NULL;
