# SisAprov — Documento de Contexto do Sistema

> Documento de contexto para desenvolvimento assistido por IA (Claude Code).
> Sistema de controle de gestão orçamentária do setor de aprovisionamento do
> Comando da 3ª Brigada de Cavalaria Mecanizada (Cmdo 3ª Bda C Mec).

---

## 1. Visão Geral

**Nome do sistema:** SisAprov (Sistema de Aprovisionamento)

**Objetivo:** Organizar e coordenar todas as notas de empenho emitidas pelo
setor de aprovisionamento — tanto de material de consumo/permanente (PASA)
quanto de provisões (QR) recebidas —, controlando o ciclo completo:

```
Nota de Crédito → Empenho → Recebimento/Provisão
                       ↓
                  Anulação (quando necessário)
```

**Usuário do sistema:** setor de aprovisionamento da 3ª Bda C Mec.

**Autenticação:** Não haverá. Qualquer pessoa com o link de acesso pode
visualizar e editar os dados (decisão explícita do usuário).

---

## 2. Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | HTML, CSS (100% customizado), JavaScript puro (vanilla, sem framework) |
| Backend | Node.js + Express |
| Banco de Dados | SQLite (arquivo único) |
| Servidor | Debian (deploy direto, sem containers previstos) |
| Geração de PDF | A definir na implementação (sugestão: `pdfkit` para geração server-side, ou `puppeteer` se for necessário replicar HTML/CSS no PDF) |
| Gráficos | [Chart.js](https://www.chartjs.org/) via CDN — leve, sem build step, compatível com o stack vanilla JS |

**Bibliotecas Node sugeridas:**
- `express` — servidor HTTP e rotas da API
- `better-sqlite3` — driver SQLite síncrono (mais simples para uma app deste porte)
- `pdfkit` — geração do PDF de extração de empenhos

**Bibliotecas frontend sugeridas:**
- `Chart.js` (via `<script>` CDN, sem necessidade de npm/bundler) — usado no módulo de Gráficos (seção 7.5)

**Comunicação frontend ↔ backend:** REST via `fetch()`, JSON como formato de troca.

---

## 3. Estrutura de Pastas Sugerida

```
sisaprov/
├── server/
│   ├── index.js              # ponto de entrada Express
│   ├── db/
│   │   ├── schema.sql        # criação das tabelas
│   │   └── database.js       # conexão SQLite
│   ├── routes/
│   │   ├── empenhos.js
│   │   ├── recebimentos.js
│   │   ├── notasCredito.js
│   │   ├── anulacoes.js
│   │   ├── comissoes.js
│   │   └── dashboard.js      # endpoints agregados para os gráficos
│   └── services/
│       ├── cnpjLookup.js     # integração com API de CNPJ
│       ├── pdfExport.js      # geração do PDF de extração
│       └── dashboard.js      # agregações SQL para os gráficos
├── public/
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── empenhos.js
│   │   ├── recebimentos.js
│   │   ├── notasCredito.js
│   │   ├── comissoes.js
│   │   └── graficos.js       # renderização dos gráficos (Chart.js)
│   └── assets/
│       ├── simbolo_bda.png
│       ├── simbolo_intendencia.webp
│       └── Caderno_Aprov.pdf   # ⚠️ ainda não enviado — ver seção 9
└── package.json
```

---

## 4. Design e Layout

Layout de referência (Figma) já fornecido pelo usuário:

- **Cabeçalho:** faixa azul institucional. À esquerda, o símbolo da
  intendência (flourish dourado). À direita, o brasão da 3ª Bda C Mec
  (`simbolo_bda.png`), com o texto **"Sistema de Aprovisionamento"** logo
  abaixo do brasão.
- **Menu lateral esquerdo:** fixo (não desaparece ao rolar a página), fundo
  azul, texto branco, organizado em 5 grupos:
  - **Empenhos**: Adicionar Empenhos / Visualizar Empenhos / Adicionar Anulação
  - **Provisões/Recebimentos**: Adicionar Recebimentos / Visualizar Recebimentos
  - **Notas de Crédito**: Adicionar Nota de Crédito / Situação Geral
  - **Comissão de Recebimento**: Adicionar Comissão / Visualizar Comissão
  - **Gráficos**: item único, sem submenu — leva direto ao dashboard (seção 7.5)
- **Área de conteúdo:** ocupa o restante da tela à direita, onde os
  formulários e listagens de cada opção do menu serão renderizados.
- **Responsividade:** obrigatória (o sistema deve funcionar bem em telas
  menores/tablets).

Paleta de cores sugerida (com base no brasão e no flourish): azul
institucional (#1E4FA3 aprox.) e dourado (#C9A227 aprox.), mantendo
identidade visual militar formal.

---

## 5. Modelo de Dados

### 5.1 Empenho
| Campo | Tipo | Observação |
|---|---|---|
| id | PK | |
| numero_empenho | TEXT | formato `202XNE000XXX` |
| favorecido | TEXT | CNPJ (14 díg.) ou CPF (11 díg.); outro tamanho → "Favorecido inválido" |
| nome_credor | TEXT | auto (CNPJ) ou manual (CPF) — ver seção 6 |
| data_emissao | DATE | |
| ug | TEXT | enum: `160364`, `167364` |
| natureza_despesa | TEXT | enum: `339030` (Material de Consumo), `339039` (Serviço), `449052` (Material Permanente) |
| valor_global | DECIMAL | calculado = soma dos `valor_total` dos itens |
| saldo_atual | DECIMAL | decrementado a cada recebimento vinculado |
| modalidade | TEXT | enum: `Global`, `Estimativo`, `Ordinário` |
| nota_credito_id | FK → notas_credito | |
| observacao | TEXT | |

### 5.2 Item do Empenho
| Campo | Tipo | Observação |
|---|---|---|
| id | PK | |
| empenho_id | FK → empenhos | |
| numero | INTEGER | |
| descricao | TEXT | |
| quantidade | INTEGER | |
| valor_unitario | DECIMAL | |
| valor_total | DECIMAL | calculado = quantidade × valor_unitario |

### 5.3 Anulação
| Campo | Tipo | Observação |
|---|---|---|
| id | PK | |
| empenho_id | FK → empenhos | Nota de Empenho selecionada |
| valor_anulado | DECIMAL | formato R$ X.XXX,XX |
| data | DATE | *(não especificado no PDF — sugestão de incluir; ver seção 10)* |

### 5.4 Recebimento/Provisão
| Campo | Tipo | Observação |
|---|---|---|
| id | PK | |
| empenho_id | FK → empenhos | só pode ser selecionado se `saldo_atual > 0` |
| valor_total_ne | DECIMAL | soma dos `valor_total` dos itens recebidos |
| favorecido | TEXT | auto, do empenho |
| nome_credor | TEXT | auto, do empenho |
| plano_interno | TEXT | auto, da nota de crédito do empenho |
| numero_nota_fiscal | TEXT | manual |
| data_nota_fiscal | DATE | manual |
| valor_nf | DECIMAL | manual; vermelho se ≠ valor_total_ne, verde se = |
| data_recebimento | DATE | manual |
| presidente_comissao | TEXT | auto, da comissão atual — ver seção 10 |

### 5.5 Item Recebido
| Campo | Tipo | Observação |
|---|---|---|
| id | PK | |
| recebimento_id | FK → recebimentos | |
| item_empenho_id | FK → itens_empenho | item selecionado por descrição |
| quantidade | INTEGER | decrementa a quantidade disponível do item no empenho |
| valor_unitario | DECIMAL | auto, do item do empenho |
| valor_total | DECIMAL | calculado = quantidade × valor_unitario |

### 5.6 Nota de Crédito
| Campo | Tipo | Observação |
|---|---|---|
| id | PK | |
| data_emissao | DATE | |
| uge | TEXT | manual |
| ug | TEXT | enum: `160364`, `167364` |
| numero_nc | TEXT | formato `202XNCXXXXX` |
| observacao | TEXT | |
| ptres | TEXT | manual |
| fonte | TEXT | manual |
| nd | TEXT | enum: `339030`, `339039`, `449052` |
| plano_interno | TEXT | manual |
| valor_total | DECIMAL | manual, formato R$ X.XXX,XX |

**Campo calculado (não persistido):**
`valor_atual` = `valor_total` − soma(`valor_global` dos empenhos vinculados) + soma(`valor_anulado` das anulações vinculadas a esses empenhos)

### 5.7 Comissão de Recebimento
| Campo | Tipo | Observação |
|---|---|---|
| id | PK | |
| bi_nomeacao | TEXT | apenas números |
| data_nomeacao | DATE | |
| presidente_comissao | TEXT | nome completo + posto/graduação |
| membro_1 | TEXT | nome completo + posto/graduação |
| membro_2 | TEXT | nome completo + posto/graduação |
| fiscal_administrativo | TEXT | nome completo + posto/graduação |
| mes | TEXT | mês de vigência da comissão (textual) |

---

## 6. Regras de Negócio e Cálculos Automáticos

1. **Máscara de Favorecido:** ao digitar o número, aplicar máscara de CNPJ
   (14 dígitos) ou CPF (11 dígitos) automaticamente. Qualquer outra
   quantidade de dígitos exibe "Favorecido inválido".
2. **Busca automática do Nome do Credor:**
   - **CNPJ:** consultar API pública (sugestão: [BrasilAPI](https://brasilapi.com.br/api/cnpj/v1/) ou ReceitaWS), que retorna a razão social gratuitamente e sem autenticação.
   - **CPF:** **não existe API pública legítima no Brasil que retorne nome a partir de CPF** — dados pessoais são protegidos pela LGPD. Recomenda-se que, para CPF, o campo "Nome do Credor" seja preenchido manualmente pelo usuário. *(sinalizado como ponto a confirmar — seção 10)*
3. **Valor Total do Item** = quantidade × valor unitário.
4. **Valor Global do Empenho** = soma dos valores totais de todos os itens.
5. **Saldo Atual do Empenho** = Valor Global − soma dos `valor_total_ne` de todos os recebimentos vinculados. *(tratamento de anulação em aberto — seção 10)*
6. **Dias (na listagem de empenhos)** = diferença em dias entre a data atual do sistema e a data de emissão do empenho — calculado em tempo real, não armazenado.
7. **Quantidade de Provisões Recebidas** = contagem de recebimentos vinculados ao empenho.
8. **Anulação:** ao adicionar, o valor anulado é somado ao `valor_atual` da Nota de Crédito referenciada pelo empenho anulado.
9. **Valor Atual da Nota de Crédito** = Valor Total − soma dos valores globais dos empenhos vinculados + soma dos valores anulados vinculados.
10. **Validação do Valor da NF:** campo fica **vermelho** se `valor_nf ≠ valor_total_ne`, **verde** se forem iguais.
11. **Restrição de seleção no Recebimento:** só é possível selecionar uma Nota de Empenho se `saldo_atual > 0`.

---

## 7. Módulos Funcionais

### 7.1 Empenhos

**Adicionar Empenhos**
- Formulário com todos os campos da seção 5.1, incluindo botão "Adicionar" para itens (sem limite de quantidade).
- Botão "Nota de Crédito": seleção a partir da lista de NCs cadastradas; ao selecionar, exibir Plano Interno e Valor Atual da NC.
- Botão final "Adicionar" grava o empenho.
- Permite edição e exclusão.

**Visualizar Empenhos**
- Lista de todos os empenhos; ao clicar, expande as colunas com os dados completos + `Dias`, `Quantidade de Provisões Recebidas` e `Observação` (ícone de olho).
- Ícone de editar nas duas colunas extras.
- **Extrair Empenhos:** gera PDF com todos os empenhos ativos (`saldo_atual > 0`), incluindo quantidade de provisões recebidas e observações.
- **Filtros:** Plano Interno (via NC), Favorecido, Natureza de Despesa, Período de Emissão (data inicial – final).
- **Ordenação:** crescente/decrescente por Data, Dias, Saldo e Plano Interno.

**Adicionar Anulação**
- Seleção da Nota de Empenho (exibe os dados do empenho selecionado).
- Campo de Valor Anulado (formato R$ X.XXX,XX).
- Botão "Adicionar" grava a anulação e soma o valor à NC referenciada (regra 8, seção 6).

### 7.2 Provisões/Recebimentos

**Adicionar Recebimentos**
- Seleção da Nota de Empenho (só com `saldo_atual > 0`).
- Seleção de itens recebidos (por descrição, botão "Adicionar" para múltiplos itens); quantidade decrementa do item do empenho.
- Campos automáticos: Favorecido, Nome do Credor, Plano Interno, Valor Unitário, Valor Total, Valor Total NE.
- Campos manuais: Número da Nota Fiscal, Data da Nota Fiscal, Valor da NF (com validação de cor), Data de Recebimento.
- Presidente da Comissão: automático, a partir da comissão vigente (ver seção 10).
- Ao adicionar, decrementa `saldo_atual` do empenho.

**Visualizar Recebimentos**
- Lista de todos os recebimentos com as colunas do formulário de cadastro.
- **Filtros:** Data (inicial – final), Favorecido, Nota de Empenho.

### 7.3 Notas de Crédito

**Adicionar Nota de Crédito**
- Formulário com todos os campos da seção 5.6.

**Situação Geral**
- Lista todas as NCs cadastradas + coluna `Valor Atual` (calculado, regra 9).
- Observação: valores de anulação são refletidos automaticamente aqui.

### 7.4 Comissão de Recebimento

**Adicionar Comissão**
- Formulário com os campos da seção 5.7 (BI de nomeação, Data de nomeação, Presidente, 2 Membros, Fiscal Administrativo, Mês).

**Visualizar Comissão**
- Lista todas as comissões cadastradas.
- Permite editar e excluir.

### 7.5 Gráficos

Módulo de dashboard com visão gerencial do sistema. Como não havia
preferência definida, os gráficos abaixo foram escolhidos por serem os mais
úteis para acompanhamento da execução orçamentária de um setor de
aprovisionamento. Todos os dados devem ser agregados **no backend** (queries
SQL) e entregues prontos ao frontend via endpoint(s) em `dashboard.js`, que
os renderiza com Chart.js.

**Cards de resumo (topo do dashboard, antes dos gráficos):**
- Valor total empenhado (soma de `valor_global` de todos os empenhos)
- Valor total recebido (soma de `valor_total_ne` de todos os recebimentos)
- Saldo total disponível (soma de `saldo_atual` de todos os empenhos ativos)
- Valor total anulado (soma de `valor_anulado`)

**Gráficos:**

1. **Pizza — Empenhos por Natureza de Despesa**
   Proporção do valor global empenhado entre Material de Consumo (339030),
   Serviço (339039) e Material Permanente (449052). Mostra onde o
   orçamento está concentrado.

2. **Pizza — Empenhos por Modalidade**
   Proporção entre Global, Estimativo e Ordinário — ajuda a entender o
   perfil de contratação do setor.

3. **Barra — Valor Total × Valor Atual por Nota de Crédito**
   Uma barra para cada NC, comparando valor total recebido da NC com o
   saldo ainda disponível. É o gráfico mais importante para controle
   orçamentário: mostra de forma rápida quais NCs estão perto de esgotar.

4. **Barra — Recebimentos por Mês**
   Quantidade (ou valor) de recebimentos lançados por mês, com base em
   `data_recebimento`. Mostra o ritmo de execução ao longo do tempo.

5. **Pizza — Empenhos por UG**
   Proporção do valor entre as duas UGs (160364 e 167364).

6. **Barra — Top 10 Favorecidos por Valor**
   Ranking dos fornecedores/credores com maior valor total empenhado —
   útil para identificar concentração de fornecedores.

7. **Barra horizontal — Empenhos mais antigos em aberto**
   Lista os empenhos com `saldo_atual > 0` ordenados pelo campo `Dias`
   (do mais antigo para o mais recente), ajudando a identificar empenhos
   parados há mais tempo sem recebimento.

**Observação:** como o usuário não tinha preferência definida, esta lista de
gráficos é uma sugestão inicial — é fácil adicionar, remover ou trocar
qualquer um deles depois, já que a agregação fica isolada no backend
(`dashboard.js`) e cada gráfico é independente no frontend.

---

## 8. Requisitos Não-Funcionais

- Sistema **sem autenticação** — acesso livre por link.
- Layout **responsivo**.
- Botão fixo **"Caderno de Orientações"**, que baixa o arquivo `Caderno_Aprov.pdf` (arquivo estático do projeto).
- Imagens de layout: `simbolo_bda.png` e `simbolo_intendencia.webp` (já fornecidas, ver seção 9).
- Texto **"Sistema de Aprovisionamento"** abaixo do brasão no cabeçalho.

---

## 9. Assets do Projeto

| Arquivo | Status | Uso |
|---|---|---|
| `simbolo_bda.png` | ✅ Fornecido | Brasão da 3ª Bda C Mec, cabeçalho |
| `simbolo_intendencia.webp` | ✅ Fornecido | Flourish dourado, canto superior esquerdo |
| `Caderno_Aprov.pdf` | ⚠️ **Pendente** | Arquivo do botão "Caderno de Orientações" — precisa ser enviado antes do deploy |

---

## 10. Pontos em Aberto / Assunções a Confirmar

Estes pontos não ficaram 100% explícitos no documento de requisitos original.
Assumi uma interpretação razoável em cada um, mas vale confirmar antes de
implementar:

1. **Busca de nome por CPF:** não há API pública legítima para isso no
   Brasil (dados protegidos por LGPD). Assumi que, para CPF, o campo
   "Nome do Credor" será preenchido manualmente. Para CNPJ, a busca
   automática via API (BrasilAPI/ReceitaWS) é viável.
2. **Efeito da Anulação sobre o Saldo do Empenho:** o requisito só diz que
   o valor anulado é somado de volta à Nota de Crédito. Não fica claro se
   o `saldo_atual` do empenho também deve ser reduzido pelo valor anulado
   (fazendo sentido, já que aquele valor não será mais utilizado/recebido).
   Assumi que sim, mas confirme essa regra.
3. **"Comissão atual" para preenchimento automático do Presidente:** não
   está definido o critério para saber qual comissão é a "vigente" no
   momento do recebimento — pelo campo `mes`? Pela comissão mais
   recentemente cadastrada? Sugiro usar o campo `mes` comparado ao mês da
   `data_recebimento`, mas isso precisa ser confirmado.
4. **Campo "Mês" na Comissão:** no PDF original, esse campo aparece
   logo após o cabeçalho "Requisitos Não-Funcionais", o que parece ser
   um artefato de exportação do PDF — nesse documento eu o mantive como
   parte do formulário "Adicionar Comissão" (seção 5.7), por fazer mais
   sentido ali. Confirme se essa é a intenção correta.
5. **Data da Anulação:** não há campo de data explícito no requisito de
   Anulação. Incluí um campo `data` no modelo por padronização (útil para
   auditoria/histórico), mas pode ser removido se não for necessário.
6. **Múltiplos usuários simultâneos:** como não há autenticação, vale
   confirmar se o sistema será usado por uma única pessoa por vez (menor
   risco de conflito de edição) ou por múltiplos operadores simultaneamente
   (o que pode exigir tratamento de concorrência no SQLite).

---

## 11. Referências de Cores e Formatos

- **Moeda:** sempre no formato `R$ X.XXX,XX` (padrão brasileiro).
- **Datas:** formato `DD/MM/AAAA` na interface.
- **Número de Empenho:** `202XNE000XXX`
- **Número de Nota de Crédito:** `202XNCXXXXX`
