# v2 — Autenticação, Permissões e Gestão de Datasets

> **Como usar este documento**
> Este arquivo descreve o **primeiro pacote de mudanças da v2** do Dashboard de Clima
> Organizacional (3ª Bda C Mec), construído em cima do sistema descrito em
> `SISTEMA_ATUAL.md` (documento de contexto da v1/beta, leitura obrigatória antes deste).
> Ele cobre três módulos discutidos e decididos em conversa: **autenticação e permissões
> por OM**, **upload e versionamento de datasets** e as **decisões de segurança** que
> atravessam os dois. Termina com um prompt pronto para orientar a implementação via
> Claude Code.

---

## 1. Resumo do que muda

| Módulo | O que era (v1) | O que passa a ser (v2) |
|---|---|---|
| Acesso | Aberto, sem login, qualquer um na rede acessa | Login obrigatório, com contas geridas por um admin |
| Visibilidade de dados | Todo mundo vê todas as OMs | Cada conta só deveria ver as OMs permitidas (filtro aplicado no navegador — ver seção 4) |
| Dados de entrada | Um único CSV pré-processado manualmente via CLI | Múltiplos datasets, enviados via upload na interface, versionados e selecionáveis |
| Persistência | Nenhuma (tudo em arquivo estático) | MySQL para usuários, OMs, permissões, sessões e metadados de datasets |

**Isso quebra deliberadamente o Invariante 11 do documento v1** ("funciona offline e sem
backend obrigatório") — autenticação exige servidor com estado. O cálculo do motor
(`Engine`) continua 100% client-side, isso não muda. Todos os demais invariantes (1–10,
16) do documento v1 permanecem válidos e não devem ser quebrados por esta implementação.

---

## 2. Módulo 1 — Autenticação e Permissões

### 2.1 Regras de negócio

- Existe **um papel administrador** (`is_admin = true`). Só o admin pode criar, editar,
  desativar/excluir contas e atribuir permissões.
- A primeira conta admin é criada no **bootstrap do servidor**, a partir de variáveis de
  ambiente (`ADMIN_EMAIL`, `ADMIN_SENHA_INICIAL`) — se não existir nenhum admin no banco
  na subida do servidor, ele é criado automaticamente com esses valores.
- Permissão é **por Organização Militar (OM)**, multi-seleção: uma conta pode ter acesso a
  uma ou várias OMs.
- **Admin vê o dashboard inteiro** (todas as OMs), além da área de gestão — não precisa de
  linhas de permissão cadastradas para ele.
- Usuário comum **sem nenhuma OM permitida** (esquecimento do admin): o dashboard carrega
  normalmente, mas exibe o aviso **"sem organizações liberadas para seu usuário"** em vez de
  dado vazio ou erro genérico.
- Admin também pode **redefinir a senha** de qualquer conta (não há fluxo de recuperação por
  e-mail neste primeiro pacote).
- Login em **página separada**, visualmente consistente com o dashboard atual; após
  autenticar, redireciona direto para o dashboard.

### 2.2 Onde a filtragem por permissão acontece (decisão registrada)

**Decisão tomada:** o servidor entrega o dataset completo (todas as OMs) para qualquer
usuário autenticado; o **navegador** é quem filtra a exibição pelas OMs permitidas ao
usuário logado (a lista de OMs permitidas vem no `/api/me`, junto com os dados do usuário).

**Ressalva registrada em conversa, para constar:** essa escolha é mais simples de
implementar, mas significa que o dado de OMs sem permissão ainda trafega até o navegador do
usuário — alguém com conhecimento técnico e acesso ao DevTools do navegador consegue, em
tese, inspecionar a resposta de rede e ver dados de OM que não deveria. A alternativa mais
segura (filtrar no servidor, no `WHERE` da consulta) foi apresentada e **conscientemente
recusada** em favor da simplicidade, dado o ambiente de rede interna fechada. Fica como
possível v2.1 se o cenário de ameaça mudar.

### 2.3 Schema SQL — autenticação e permissões

```sql
CREATE TABLE usuarios (
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
  FOREIGN KEY (criado_por) REFERENCES usuarios(id)
);

CREATE TABLE organizacoes_militares (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  nome                VARCHAR(150) NOT NULL UNIQUE,  -- deve bater com o valor da coluna `om` nos dados
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE usuario_om_permissao (
  usuario_id          INT NOT NULL,
  om_id               INT NOT NULL,
  concedido_em        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  concedido_por       INT NULL,
  PRIMARY KEY (usuario_id, om_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (om_id) REFERENCES organizacoes_militares(id) ON DELETE CASCADE,
  FOREIGN KEY (concedido_por) REFERENCES usuarios(id)
);

-- A tabela `sessions` é criada e gerida automaticamente pelo pacote
-- `express-mysql-session` — não precisa de DDL manual.
```

### 2.4 Rotas da API — autenticação

| Rota | Método | Acesso | Descrição |
|---|---|---|---|
| `/api/login` | POST | Público | Recebe `email` + `senha`; valida bcrypt; bloqueia após 5 tentativas falhas (15 min); regenera sessão; devolve cookie |
| `/api/logout` | POST | Autenticado | Destrói a sessão |
| `/api/me` | GET | Autenticado | Devolve dados do usuário logado + lista de OMs permitidas (ou `is_admin: true` sem lista, significando "todas") |

### 2.5 Rotas da API — gestão (admin only)

| Rota | Método | Descrição |
|---|---|---|
| `/api/admin/usuarios` | GET | Lista todas as contas |
| `/api/admin/usuarios` | POST | Cria conta (nome, email, senha inicial, `is_admin`, lista de OMs) |
| `/api/admin/usuarios/:id` | PUT | Edita dados cadastrais e/ou lista de permissões de OM |
| `/api/admin/usuarios/:id` | DELETE | Exclui conta |
| `/api/admin/usuarios/:id/senha` | PUT | Redefine a senha da conta (rota própria, separada da edição geral) |
| `/api/admin/oms` | GET | Lista OMs cadastradas (inclui inativas, com destaque visual) |
| `/api/admin/oms` | POST | Cadastra nova OM |
| `/api/admin/oms/:id` | PUT | Renomeia / ativa / desativa uma OM |

---

## 3. Módulo 2 — Upload e Gestão de Datasets

### 3.1 Regras de negócio

- O arquivo enviado é a **planilha bruta** da plataforma CTA (com ID/nome/timestamp do
  respondente) — o servidor roda o **mesmo pré-processamento** que hoje é manual
  (`scripts/preprocessar_resultados.js`), reaproveitando sua lógica de remoção de colunas
  identificáveis, validação de 86 colunas e conversão de valores.
- Só o **admin** envia e exclui datasets. Qualquer usuário autenticado pode **selecionar**
  qual dataset visualizar no dashboard.
- Um dataset pode conter **uma OM ou várias** (planilha "consolidada" da Brigada inteira) —
  o sistema **detecta automaticamente** quais OMs aparecem nos dados processados, sem exigir
  que o admin separe nada manualmente.
- Cada dataset aparece no seletor do dashboard com um **rótulo opcional** digitado pelo
  admin; se vazio, usa `nome_do_arquivo — período detectado` como *fallback*.
- Exclusão de dataset é **definitiva** (apaga arquivo físico + registro no banco).
- Os arquivos já existentes em produção (`data/resultados.csv` + `data/meta.json`) são
  migrados como o **dataset id 1**, sem reprocessamento — só criando os registros de
  metadado que apontam para o arquivo já pronto.
- O `dicionario.csv` continua **único e compartilhado** entre todos os datasets (decisão
  registrada — se o formulário mudar de estrutura no futuro, isso precisa ser revisitado,
  mas não é escopo deste pacote).
- Se um dataset trouxer uma **OM desconhecida** (não cadastrada em `organizacoes_militares`),
  ela é **cadastrada automaticamente como inativa** — aparece na tela de gestão de OMs para o
  admin revisar e ativar antes de conceder permissão a alguém nela.

### 3.2 Schema SQL — datasets

```sql
CREATE TABLE datasets (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  rotulo                 VARCHAR(150) NULL,
  nome_arquivo_original  VARCHAR(255) NOT NULL,
  caminho_processado     VARCHAR(255) NOT NULL,   -- ex: data/datasets/3/resultados.csv
  periodo_inicio         DATE NOT NULL,
  periodo_fim            DATE NOT NULL,
  total_respondentes     INT NOT NULL,
  enviado_por            INT NOT NULL,
  enviado_em             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status                 ENUM('processado','erro') NOT NULL DEFAULT 'processado',
  mensagem_erro          VARCHAR(500) NULL,
  FOREIGN KEY (enviado_por) REFERENCES usuarios(id)
);

CREATE TABLE dataset_om (
  dataset_id             INT NOT NULL,
  om_id                  INT NOT NULL,
  total_respondentes_om  INT NOT NULL,
  PRIMARY KEY (dataset_id, om_id),
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY (om_id) REFERENCES organizacoes_militares(id)
);
```

Por que o CSV processado fica em **disco**, e não em BLOB no MySQL: o motor de cálculo
(`Engine`) já é 100% client-side e consome CSV — manter esse formato evita reescrever a
lógica de agregação/anonimato em SQL. O MySQL guarda só metadado; o dado pesado continua
arquivo, um por dataset (`data/datasets/<id>/resultados.csv` + `meta.json`).

### 3.3 Fluxo de upload

```
Admin escolhe arquivo (.csv bruto) na tela de gestão, com rótulo opcional
        │
        ▼
POST /api/admin/datasets  (multipart/form-data)
        │
        ▼
servidor roda o pré-processamento (reaproveitando scripts/preprocessar_resultados.js):
  1. valida extensão e conteúdo do arquivo (não confia só na extensão .csv)
  2. valida tamanho máximo (10 MB)
  3. remove colunas identificáveis (ID do usuário, Nome de exibição, Registro de Tempo)
  4. valida alinhamento de 86 colunas → falha => grava dataset com status='erro' + mensagem
  5. converte valores, gera respondent_id sequencial
  6. calcula período de apuração
  7. detecta OMs distintas presentes na coluna `om` processada
  8. para cada OM não cadastrada: cria em organizacoes_militares com ativo=false
        │
        ▼
grava data/datasets/<id>/resultados.csv + meta.json (nome de arquivo sanitizado)
insere linha em `datasets` + uma linha em `dataset_om` por OM encontrada
        │
        ▼
dataset aparece no seletor do dashboard
```

### 3.4 Rotas da API — datasets

| Rota | Método | Acesso | Descrição |
|---|---|---|---|
| `/api/datasets` | GET | Autenticado | Lista datasets disponíveis (rótulo/fallback, período, N) para o seletor |
| `/api/dados` | GET | Autenticado | `?dataset_id=X` — devolve o CSV completo daquele dataset (mesmo formato de sempre, o `Engine` não muda) |
| `/api/admin/datasets` | POST | Admin | Upload + processamento (ver fluxo acima) |
| `/api/admin/datasets/:id` | DELETE | Admin | Exclusão definitiva (arquivo + registro + `dataset_om` em cascata) |

### 3.5 Migração dos dados existentes

Script único, rodado uma vez: lê `data/meta.json` atual, detecta as OMs já conhecidas hoje
(`Esqd Cmdo 3ª Bda C Mec` e `Cmdo 3ª Bda C Mec`), cria essas duas linhas em
`organizacoes_militares` (ativas), cria a linha em `datasets` (id 1) apontando para o
`data/resultados.csv` já existente **sem reprocessar**, e as linhas correspondentes em
`dataset_om`.

---

## 4. Segurança — decisões e práticas obrigatórias

### 4.1 Decisões conscientes registradas (não mudar sem revisitar com o usuário)

- **HTTP simples**, sem HTTPS — ambiente é rede interna fechada do quartel, sem acesso
  externo. Decisão tomada cientes de que senha, cookie de sessão e dados trafegam em texto
  puro na rede local.
- **Sem tabela de auditoria** (`log_auditoria`) neste pacote — pode ser adicionada depois
  sem quebrar nada do desenho atual (é aditiva).
- **Filtragem de permissão no navegador**, não no servidor (ver seção 2.2).

### 4.2 Práticas obrigatórias de implementação (sem trade-off, aplicar sempre)

- **bcrypt**, custo (`saltRounds`) 12, para toda senha. Nunca logar ou devolver
  `senha_hash` em nenhuma resposta de API.
- **Bloqueio por tentativas**: 5 tentativas de login malsucedidas → bloqueio de 15 min
  (campos `tentativas_falhas` / `bloqueado_ate` em `usuarios`).
- **Cookie de sessão**: `httpOnly`, `sameSite: 'strict'`. Regenerar o ID de sessão no
  login (evitar session fixation). Expiração por inatividade (8h).
- **Autorização checada no servidor em toda rota**, nunca só escondendo botão na
  interface — `requireAuth` em toda rota de dados, `requireAdmin` em toda rota de gestão.
- **Prepared statements / parameterized queries** em 100% das consultas SQL — nunca
  concatenar string SQL.
- **Usuário do MySQL da aplicação com privilégio mínimo** (`SELECT/INSERT/UPDATE/DELETE`
  só nas tabelas da aplicação — nunca root, nunca `GRANT`/`DROP DATABASE`).
- **Segredos em variáveis de ambiente** (`.env`, fora do controle de versão): senha do
  MySQL, `ADMIN_EMAIL`, `ADMIN_SENHA_INICIAL`, chave de sessão (`SESSION_SECRET`).
- **Upload de planilha**: validar conteúdo real (não só extensão), limite de 10 MB, nome
  de arquivo sanitizado antes de usar em qualquer caminho de disco (nunca usar o nome
  enviado pelo usuário diretamente sem sanitizar — risco de path traversal).

---

## 5. Estrutura de arquivos sugerida (adição ao mapa de arquivos do v1)

```
server/
  app.js                        entrada do servidor Express (substitui/complementa server.js atual)
  db.js                         pool de conexão mysql2
  middlewares/
    auth.js                     requireAuth, requireAdmin
  routes/
    auth.js                     /api/login, /api/logout, /api/me
    admin-usuarios.js           CRUD de usuários + permissões
    admin-oms.js                CRUD de OMs
    admin-datasets.js           upload e exclusão de datasets
    dados.js                    /api/datasets, /api/dados
  services/
    preprocessamento.js         lógica reaproveitada de scripts/preprocessar_resultados.js
  migrations/
    001_criar_tabelas.sql       DDL consolidado deste documento
  scripts/
    migrar_dataset_inicial.js   importa o dataset id 1 a partir dos arquivos já existentes
    criar_admin.js              bootstrap do admin a partir de variáveis de ambiente (roda no start)

data/
  datasets/
    1/
      resultados.csv            dataset migrado (o já existente hoje)
      meta.json
    2/ 3/ ...                   novos datasets enviados via upload

js/  (frontend existente, mudanças pontuais)
  app.js                        troca fetch estático por /api/dados?dataset_id=X; aplica filtro de OM permitida; redireciona para login.html em 401
  login.js                      novo — tela de login
  admin/                        novo — telas de gestão (usuários, OMs, datasets)

login.html                      novo
admin.html                      novo
```

---

## 6. Prompt para o Claude Code

```
Estou implementando a v2 de um dashboard de clima organizacional que hoje é 100%
estático (HTML/CSS/JS puro, sem backend, sem build). O contexto completo do sistema
atual está em SISTEMA_ATUAL.md e as mudanças que preciso que você implemente estão
detalhadas em v2_autenticacao_permissoes_datasets.md — leia os dois arquivos por
completo antes de escrever qualquer código.

Preciso que você implemente, nesta ordem:

1. As migrations SQL (seção 2.3 e 3.2 do documento de mudanças) num arquivo
   server/migrations/001_criar_tabelas.sql.
2. O backend Express (server/app.js, db.js, middlewares, routes, services) cobrindo
   TODAS as rotas listadas nas seções 2.4, 2.5 e 3.4, com as práticas de segurança da
   seção 4.2 aplicadas em 100% do código (bcrypt custo 12, prepared statements,
   requireAuth/requireAdmin em toda rota que precisa, bloqueio de tentativas de login,
   cookie httpOnly/sameSite strict, validação de upload).
3. O script de bootstrap do admin (server/scripts/criar_admin.js) e o de migração do
   dataset existente (server/scripts/migrar_dataset_inicial.js), ambos descritos na
   seção 3.5.
4. O serviço de pré-processamento (server/services/preprocessamento.js), reaproveitando
   ao máximo a lógica já existente em scripts/preprocessar_resultados.js (não reescreva
   do zero regras de validação/conversão que já existem e funcionam).
5. As mudanças no frontend: login.html + login.js (tela separada, mesmo estilo visual
   do dashboard atual — reaproveite css/styles.css), admin.html + js/admin/*.js (CRUD de
   usuários, OMs e datasets), e as alterações em js/app.js para: consumir /api/me e
   /api/datasets, adicionar o seletor de dataset na interface, trocar o fetch estático
   por /api/dados?dataset_id=X, aplicar o filtro de OMs permitidas nos dados recebidos
   antes de passar para o Engine, e redirecionar para login.html quando receber 401.

Restrições importantes:
- NÃO altere js/engine.js, js/interpretation.js, js/charts.js nem as abas em js/tabs/ —
  elas continuam recebendo dados no mesmo formato de hoje; a única mudança é de ONDE o
  CSV vem (API autenticada em vez de arquivo estático).
- Mantenha 100% do código, comentários e textos de interface em português, seguindo o
  padrão de nomenclatura já usado no projeto (ex: nomes de variáveis e funções em
  português, como no restante do código-base).
- Não introduza build step nem bundler no frontend — continue com <script> tags simples,
  a única mudança de infraestrutura é a existência de um servidor Node com Express e
  MySQL por trás.
- Siga as decisões de segurança da seção 4 do documento à risca, incluindo as decisões
  conscientes de NÃO implementar HTTPS e NÃO implementar tabela de auditoria neste
  pacote — não adicione essas features por conta própria.
- Ao final, gere um README ou seção de instruções explicando como configurar as
  variáveis de ambiente (.env), rodar as migrations, e subir o servidor pela primeira
  vez numa máquina limpa.

Se encontrar alguma ambiguidade não coberta pelos dois documentos, pare e pergunte antes
de assumir uma decisão de arquitetura ou de regra de negócio.
```
