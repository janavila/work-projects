# Instalação e operação — v2 (login, permissões por OM e bases de dados)

Guia para colocar o Dashboard de Clima Organizacional da 3ª Bda C Mec no ar
**numa máquina limpa**, do zero até o primeiro login.

A v1 era estática: bastava `node server.js` e qualquer pessoa da rede via tudo.
A v2 tem servidor Node com Express e banco MySQL por trás, com login obrigatório
e permissão por Organização Militar. O cálculo dos índices continua 100% no
navegador — o que mudou é de onde o CSV vem e quem pode vê-lo.

---

## 1. O que precisa estar instalado

| Programa | Versão | Para quê |
|---|---|---|
| [Node.js](https://nodejs.org) | 18 ou superior | roda o servidor |
| MySQL (ou MariaDB) | 8.0 / 10.5 ou superior | usuários, permissões, sessões e metadados |

Só a máquina que **hospeda** precisa dos dois. Quem apenas **acessa** o dashboard
usa o navegador, sem instalar nada.

Confira o que já tem:

```bash
node -v      # deve mostrar v18 ou maior
mysql --version
```


### 1.1 Nesta máquina (macOS, Homebrew) — já instalado

O MySQL local desta estação foi instalado assim, e o serviço já sobe junto com o
login do usuário:

```bash
brew install mysql@8.4          # 8.4 LTS, mesma linha do que roda em servidor
brew services start mysql@8.4   # sobe agora e a cada login
brew services stop mysql@8.4    # para o serviço, quando quiser
```

A fórmula `mysql@8.4` é *keg-only*: o comando `mysql` não entra no PATH
automaticamente. Use o caminho completo:

```bash
/opt/homebrew/opt/mysql@8.4/bin/mysql -u root
```

Ou, para digitar só `mysql`, acrescente ao seu `~/.zshrc`:

```bash
export PATH="/opt/homebrew/opt/mysql@8.4/bin:$PATH"
```

> **A conta root do MySQL ficou sem senha** — é o padrão do Homebrew, e o servidor
> só aceita conexões de `localhost`. Para definir uma senha de root:
> `/opt/homebrew/opt/mysql@8.4/bin/mysql_secure_installation`. A aplicação não usa
> root (ela usa `clima_app`), então isso não afeta o dashboard.

---

## 2. Copiar o projeto e instalar as dependências

```bash
cd caminho/para/pesquisa_organizacional
npm install
```

São sete dependências, todas em JavaScript puro — **não é preciso compilador**
(por isso o projeto usa `bcryptjs` em vez do `bcrypt` nativo: em máquina Windows
sem Visual Studio Build Tools, o `bcrypt` nativo não instala).

Não há build, nem bundler, nem passo de compilação do frontend: o navegador
continua carregando `<script src="...">` direto, como na v1.

---

## 3. Criar o banco e o usuário do MySQL

Este passo é feito **uma vez**, com uma conta administrativa do MySQL (root).
O usuário da aplicação é criado com **privilégio mínimo** (seção 4.2 do documento
da v2): só lê e escreve nas tabelas do próprio banco, e não pode criar banco,
conceder privilégio nem derrubar nada.

```bash
mysql -u root -p
```

```sql
CREATE DATABASE clima_organizacional
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Troque 'senha-forte-aqui' por uma senha longa e aleatória.
CREATE USER 'clima_app'@'localhost' IDENTIFIED BY 'senha-forte-aqui';

GRANT SELECT, INSERT, UPDATE, DELETE
  ON clima_organizacional.*
  TO 'clima_app'@'localhost';

FLUSH PRIVILEGES;
EXIT;
```

Ainda como root, crie a tabela de sessões. Ela é a única tabela que o pacote
`express-mysql-session` criaria sozinho — e como o usuário da aplicação não tem
`CREATE`, quem a cria é você, agora:

```sql
USE clima_organizacional;
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  expires INT UNSIGNED NOT NULL,
  data TEXT COLLATE utf8mb4_bin,
  PRIMARY KEY (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> Alternativa mais frouxa, se preferir não criar tabela à mão:
> `GRANT CREATE ON clima_organizacional.* TO 'clima_app'@'localhost';` e deixar o
> pacote criá-la na primeira subida. A opção acima é a recomendada: mantém o
> usuário da aplicação sem nenhum privilégio de DDL.

Se o MySQL estiver em outra máquina, troque `'localhost'` pelo host de onde o
servidor Node se conecta (ex.: `'clima_app'@'192.168.0.%'`).

---

## 4. Rodar as migrations

A primeira cria as cinco tabelas da aplicação: `usuarios`, `organizacoes_militares`,
`usuario_om_permissao`, `datasets` e `dataset_om`.

```bash
mysql -u root -p clima_organizacional < server/migrations/001_criar_tabelas.sql
```

> **Rode como root (ou outra conta administrativa), não como `clima_app`.** Criar
> tabela é DDL, e o usuário da aplicação não tem `CREATE` justamente por isso —
> com ele o comando falha na primeira tabela:
> `ERROR 1142 (42000): CREATE command denied to user 'clima_app'@'localhost' for table 'usuarios'`.
> Migration é operação de instalação, feita uma vez por quem administra o banco;
> o servidor em operação nunca precisa desse privilégio.

Depois dela, rode a segunda migration, que troca a credencial de entrada de
e-mail para nome de cadastro e torna o e-mail opcional:

```bash
mysql -u root -p clima_organizacional < server/migrations/002_login_por_nome_cadastro.sql
```

As duas usam `CREATE TABLE IF NOT EXISTS`: rodar de novo por engano não apaga
nem duplica nada. (Os dois `CREATE INDEX` do fim reclamam se já existirem —
mensagem inofensiva, pode ignorar nesse caso.)

---

## 5. Configurar o `.env`

```bash
cp .env.example .env
```

Abra o `.env` e preencha. Ele **nunca** vai para o controle de versão (já está no
`.gitignore`), porque guarda a senha do banco e o segredo da sessão.

| Variável | O que é | Observação |
|---|---|---|
| `PORT` | porta HTTP | 8080 por padrão |
| `DB_HOST` / `DB_PORT` | onde está o MySQL | `127.0.0.1` / `3306` |
| `DB_USER` / `DB_PASSWORD` | usuário da aplicação | o `clima_app` do passo 3 — **nunca root** |
| `DB_NAME` | nome do banco | `clima_organizacional` |
| `SESSION_SECRET` | assina o cookie de sessão | mínimo 32 caracteres; trocar derruba todas as sessões |
| `ADMIN_USUARIO` | **nome de cadastro** do primeiro admin | é com isto que ele entra; usado só no bootstrap |
| `ADMIN_EMAIL` | e-mail do primeiro admin | **opcional** — só contato; se ADMIN_USUARIO faltar, o nome de cadastro é derivado da parte antes do @ |
| `ADMIN_SENHA_INICIAL` | senha do primeiro admin | mínimo 8 caracteres — **troque no primeiro acesso** |
| `ADMIN_NOME` | nome do primeiro admin | opcional |

Gere um `SESSION_SECRET` aleatório com:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

O servidor recusa subir se `DB_USER`, `DB_NAME` ou `SESSION_SECRET` estiverem
faltando, ou se o segredo for curto demais — com mensagem dizendo qual falta.

---

## 6. Subir o servidor pela primeira vez

```bash
npm start
```

Na primeira subida o servidor:

1. confere as variáveis de ambiente;
2. testa a conexão com o MySQL (e para com mensagem clara se não conseguir);
3. cria a tabela `sessions`, se ainda não existir e tiver permissão;
4. **cria a primeira conta de administrador** a partir de `ADMIN_EMAIL` e
   `ADMIN_SENHA_INICIAL`, se não houver nenhum admin no banco.

Saída esperada:

```
[admin] Primeira conta de administrador criada: admin@3bdacmec.eb.mil.br
[admin] ATENÇÃO: troque esta senha no primeiro acesso (Gestão > Usuários > Redefinir senha).
Dashboard de Clima Organizacional (v2) rodando em:
  Local:  http://localhost:8080/
  Rede:   http://<IP-desta-máquina>:8080/
  Login:  /login.html   ·   Gestão: /admin.html
```

O bootstrap do admin **não sobrescreve senha de admin existente**: em toda subida
seguinte ele apenas verifica e segue em frente. Quer rodar só esse passo, sem
subir o servidor? `npm run criar-admin`.

Abra `http://localhost:8080/` e entre com o e-mail e a senha do `.env`.

---

## 7. Migrar a base de dados que já existe

Se a máquina já tem `data/resultados.csv` e `data/meta.json` da v1, traga-os para
dentro do novo modelo — **sem reprocessar nada**:

```bash
npm run migrar-dataset-inicial
```

O script cadastra as OMs presentes no arquivo (ativas), cria o dataset id 1
apontando para uma cópia em `data/datasets/1/`, e registra o N de cada OM. Os
arquivos originais em `data/` são preservados. Rodar duas vezes não faz nada na
segunda (é idempotente).

Não tem base da v1? Pule este passo e envie a planilha pela tela de gestão
(passo 8.2).

---

### 7.1 Cadastrar as OMs da Brigada

Para o administrador poder conceder permissão a uma OM, ela precisa estar
cadastrada — e isso não depende de existir base de dados dela. O comando abaixo
cadastra, como ativas, as OMs da 3ª Bda C Mec que ainda não estiverem no banco:

```bash
npm run cadastrar-oms              # cadastra o que falta
node server/scripts/cadastrar_oms.js --conferir   # só mostra, não grava
```

A lista está no topo de `server/scripts/cadastrar_oms.js` e saiu da questão 1 do
formulário impresso (`data/formulario.pdf`).

> **Confira a grafia contra o formulário eletrônico.** O nome cadastrado precisa
> ser idêntico ao valor da coluna `om` do CSV, e sabemos que os dois formulários
> divergem: no papel é "QG 3ª Bda C Mec" e "Esqd Cmdo", mas no CSV veio
> "Cmdo 3ª Bda C Mec" e "Esqd Cmdo 3ª Bda C Mec". Essas duas já estão corretas no
> banco (vieram do dado). As outras nove usam o nome do papel e podem divergir.
>
> Se divergirem, nada se perde: quando a base daquela OM for enviada, o upload
> cadastra a grafia verdadeira como uma OM nova (inativa) e você verá as duas em
> Gestão > Organizações Militares. Basta renomear a antiga para a grafia certa —
> a permissão já concedida continua valendo, porque ela aponta para o id da OM e
> não para o nome — e ignorar/desativar a duplicada.

---

## 8. Operação do dia a dia

Tudo abaixo fica em **⚙️ Gestão** (`/admin.html`), visível só para administradores.

### 8.1 Criar contas e dar acesso

A entrada no sistema é por **nome de cadastro + senha**. O e-mail é opcional e
serve apenas como contato — não é usado para entrar e pode ficar em branco.

1. **Organizações Militares** — as 11 OMs da Brigada já vêm cadastradas e ativas
   (ver passo 7.1). Confira se a OM que você precisa está lá e **ativa**. O nome
   precisa ser **idêntico** ao valor da coluna `om` dentro do CSV; é essa string
   que decide o que cada usuário vê.
2. **Usuários > + Nova conta** — nome completo, **nome de cadastro** (é a
   credencial de entrada: letras sem acento, números, ponto, hífen e sublinhado,
   sem espaços, mínimo 3 caracteres, não diferencia maiúsculas), senha inicial
   (mínimo 8), e-mail se quiser, perfil e as OMs que a conta pode ver.
   - *Usuário comum*: vê apenas as OMs marcadas.
   - *Administrador*: vê todas as OMs e a área de gestão.
   - **A permissão pode ser dada a qualquer OM ativa, inclusive às que ainda não
     têm base de dados nenhuma.** A conta fica com a permissão guardada e, no dia
     em que a primeira pesquisa daquela OM for enviada, ela já a vê — sem precisar
     de novo cadastro. Enquanto não houver base, o dashboard dessa pessoa mostra o
     aviso de que não há base disponível para as OMs dela (não um erro). Na lista
     de OMs do formulário, as que ainda não têm dado aparecem marcadas com
     "— sem dados ainda".
   - Conta sem nenhuma OM marcada entra no dashboard e recebe o aviso
     **"sem organizações liberadas para seu usuário"**.
3. Senha esquecida ou conta travada por tentativas? **Redefinir senha** resolve os
   dois (redefinir libera o bloqueio). Não existe recuperação automática: a senha
   nova é informada pessoalmente.

### 8.2 Enviar uma nova base de dados

Em **Bases de dados > + Enviar base de dados**, escolha o **CSV bruto exportado
do formulário** — o mesmo arquivo de sempre, com ID, nome e registro de tempo do
respondente, sem editar nada. O rótulo é opcional.

O servidor roda o mesmo pré-processamento que antes era `node scripts/preprocessar_resultados.js`:
descarta as três colunas identificáveis, valida o alinhamento das 86 perguntas,
converte `"3 - Concordo"` em `3`, gera o `respondent_id` anônimo, calcula o
período e detecta as OMs. Só o CSV **processado e anonimizado** é gravado; o
arquivo bruto não fica no servidor.

- Limite de 10 MB. Não é a extensão que vale: um PDF ou XLSX renomeado para
  `.csv` é recusado pelo conteúdo.
- Se a validação falhar, a tentativa fica registrada com situação **Falhou** e a
  explicação do que não bateu — normalmente "o formulário mudou", e aí o
  mapeamento em `server/services/preprocessamento.js` (`MAPA_COLUNAS`) precisa ser
  revisado.
- **OM nova encontrada no arquivo é cadastrada automaticamente como INATIVA.**
  Confira a grafia e ative em *Organizações Militares* antes de liberá-la a alguém.
- Excluir base é **definitivo**: apaga o arquivo processado e o registro.

### 8.3 Quem usa o dashboard

Entra em `/`, escolhe a base no seletor **"Base de dados (pesquisa aplicada)"** e
usa os filtros como antes. Cada conta vê apenas as OMs liberadas para ela; o
seletor só lista bases que contêm alguma dessas OMs.

---

## 9. Disponibilizar para a rede interna

O servidor escuta em `0.0.0.0`, então já responde na rede. Nos outros
computadores, abra `http://<IP-do-servidor>:8080/`.

Descubra o IP: `ipconfig` (Windows) ou `ifconfig` / `ip addr` (Linux/Mac).
Se ninguém conectar, libere a porta 8080 no firewall da máquina servidora.

Para manter rodando sem terminal aberto: Agendador de Tarefas ou serviço no
Windows; `nohup npm start &`, `screen`/`tmux`, `systemd` ou `launchd` no Linux/Mac.

---

## 10. Segurança: o que está e o que não está nesta versão

**Está implementado**

- Entrada por **nome de cadastro + senha** (o e-mail é opcional e não serve como
  credencial). Mensagem de erro única para nome inexistente e senha errada, com o
  mesmo tempo de resposta nos dois casos, para não revelar quais contas existem.
- Senhas em **bcrypt custo 12**; `senha_hash` nunca aparece em resposta de API.
- **Bloqueio de 15 minutos após 5 tentativas** de login malsucedidas.
- Cookie de sessão **httpOnly** + **sameSite strict**, ID de sessão **regenerado
  no login**, expiração por **inatividade de 8 horas**.
- Autorização **checada no servidor em toda rota** (`requireAuth` nas rotas de
  dados, `requireAdmin` nas de gestão) — esconder botão é só conveniência visual.
- **Prepared statements em 100% das consultas** SQL.
- Usuário do MySQL com **privilégio mínimo** (passo 3).
- Upload com **validação do conteúdo real**, limite de 10 MB e **nome de arquivo
  sanitizado** antes de virar caminho em disco.
- **A pasta `data/` não é mais servida estaticamente.** Dicionário, formulário e
  bases só saem por `/api/dicionario`, `/api/formulario` e `/api/dados`, todos
  atrás de login. Isso fecha a brecha da v1, em que qualquer pessoa da rede
  baixava `data/resultados.csv` digitando o caminho.
- O `server.js` da v1 (sem login, que expunha `data/`) foi **travado**: ele se
  recusa a subir e aponta para `npm start`.

**Não está implementado — por decisão consciente registrada no documento da v2**

- **HTTPS.** O ambiente é rede interna fechada. Senha, cookie e dados trafegam em
  **texto puro na rede local** — é por isso que o cookie não usa `secure: true`
  (com HTTPS ausente, o navegador não o enviaria e ninguém conseguiria entrar).
- **Tabela de auditoria.** Nada registra quem viu ou baixou o quê. A adição é
  aditiva e não quebra o desenho atual.
- **Filtragem de permissão no servidor.** O servidor entrega o CSV **completo**
  para qualquer usuário autenticado, e o navegador filtra as OMs permitidas. Quem
  tem conhecimento técnico e abre o DevTools consegue ver, na resposta de rede,
  linhas de OM que não deveria. O que o servidor **garante** é o acesso à base
  inteira: quem não tem permissão em nenhuma OM de uma base não a lista nem a
  baixa, mesmo trocando o `dataset_id` na URL. Filtrar linha por linha no `WHERE`
  fica como possível v2.1, se o cenário de ameaça mudar.

Continua valendo da v1: **não exponha esta pasta à internet** e não versione
`data/resultados.csv`, `data/resultados_cta.csv` nem `data/datasets/`.

---

## 11. Quando algo dá errado

| Sintoma | Causa provável e saída |
|---|---|
| `Variáveis de ambiente obrigatórias ausentes` | falta preencher o `.env` (passo 5) |
| `SESSION_SECRET curto demais` | gere um segredo de 32+ caracteres (passo 5) |
| `Não foi possível conectar ao MySQL` | serviço parado, host/porta errados ou senha errada no `.env` |
| `ER_NO_SUCH_TABLE` no console | a migration não rodou (passo 4) |
| `Table 'sessions' doesn't exist` | falta `CREATE` ao usuário ou a tabela manual (passo 3) |
| "Nome de cadastro ou senha inválidos" ao usar o e-mail | a entrada é pelo **nome de cadastro**, não pelo e-mail; veja qual é em Gestão > Usuários |
| Login recusa a senha do `.env` | a senha só vale na criação do admin; se já existe admin, ela não é aplicada — use *Redefinir senha* por outro admin, ou apague a conta no banco e suba de novo |
| "Conta temporariamente bloqueada" | 5 tentativas erradas; espere 15 min ou peça a um admin para redefinir a senha |
| Dashboard diz "sem organizações liberadas" | a conta não tem OM marcada, ou as OMs dela estão inativas (Gestão > Usuários / Organizações Militares) |
| Base enviada aparece como **Falhou** | leia a mensagem na coluna Situação; se disser 86 colunas, o formulário mudou e o `MAPA_COLUNAS` precisa de revisão |
| `CREATE command denied to user 'clima_app'` | você rodou a migration com o usuário da aplicação; rode como root (passo 4) |
| `EADDRINUSE: address already in use 0.0.0.0:8080` | outro programa já ocupa a porta. Veja quem é com `lsof -nP -iTCP:8080 -sTCP:LISTEN` (Linux/Mac) ou `netstat -ano \| findstr :8080` (Windows); encerre-o ou troque `PORT` no `.env` |
| Navegador volta para a tela de login sozinho | sessão expirada por 8h de inatividade — é o comportamento esperado |
| `Arquivo não encontrado` ao pedir `/data/...` | correto: `data/` deixou de ser pública na v2 |

---

## 12. Comandos, num resumo

```bash
npm install                      # dependências (uma vez)
npm start                        # sobe o servidor (cria o admin inicial se faltar)
npm run criar-admin              # só o bootstrap do admin
npm run migrar-dataset-inicial   # importa o resultados.csv da v1 como base id 1
npm run cadastrar-oms            # cadastra as OMs da Brigada que faltarem

# pré-processamento pela linha de comando, como na v1 (continua funcionando):
node scripts/preprocessar_resultados.js [caminho-do-csv-bruto]
```

Documentos de referência: `SISTEMA_ATUAL.md` (como a v1 funciona, regra por
regra) e `v2_autenticacao_permissoes_datasets.md` (as decisões desta versão).
