# Sistema Atual (v1 / "beta") — Dashboard de Clima Organizacional

> **Para que serve este documento**
> Ele descreve **tudo o que o sistema existente faz e como faz**, de forma autossuficiente,
> para servir de contexto inicial de uma conversa em que quem lê **não conhece nada** do
> projeto e **não vai olhar o código-fonte**. É a linha de base ("o que já existe") sobre a
> qual um segundo documento — o de **novas funcionalidades da v2** — será escrito e
> implementado.
>
> Ao ler: trate as seções 1–13 como *descrição factual do que está implementado hoje*,
> a seção 14 como *estado real dos dados neste momento*, e as seções 15–17 como
> *avaliação crítica, limitações e invariantes* — é aí que estão as decisões que a v2
> precisa confirmar ou romper de propósito.

---

## 1. O que é o sistema

Uma aplicação **web estática de página única** que exibe o resultado de uma **pesquisa de
clima organizacional** aplicada aos militares de uma grande unidade do Exército Brasileiro
(3ª Brigada de Cavalaria Mecanizada — "Braço Forte, Abraço Amigo").

Características definidoras da arquitetura atual:

| Aspecto | Como é hoje |
|---|---|
| Frontend | HTML + CSS + JavaScript puro (ES2017), **sem framework, sem build, sem npm** |
| Backend | **Nenhum.** Não há API, banco de dados, autenticação ou sessão |
| Dados | Dois arquivos CSV lidos por `fetch` direto do disco/servidor |
| Cálculo | **100% no navegador do usuário**, a cada carga de página e a cada mudança de filtro |
| Bibliotecas | Baixadas localmente em `vendor/` → a aplicação funciona **offline**, sem internet |
| Distribuição | Um servidor HTTP estático em Node.js puro (`server.js`) na **rede interna** |
| Idioma | Todo o código, comentários, identificadores e interface em **português** |
| Estado | Apenas em memória (variáveis JS). Nada é persistido, nada é enviado a lugar nenhum |

O propósito funcional: transformar respostas de um formulário (escalas Likert, notas 0–10,
categóricas e textos livres) em **índices de favorabilidade de 0 a 100**, agregá-los
hierarquicamente, classificá-los em faixas coloridas, permitir recortes por filtros
demográficos, gerar uma leitura textual automática e exportar um relatório em PDF/Word.

### 1.1 Mapa de arquivos

```
index.html                     página única — todo o HTML estático (cabeçalho, filtros, abas vazias)
css/styles.css                 identidade visual completa (~15 KB, CSS puro com variáveis)
server.js                      servidor HTTP estático sem dependências

js/  (carregados como <script> na ordem abaixo; padrão IIFE anexando ao objeto window)
  csv-parser.js                parser CSV genérico             → window.CSVParser
  constants.js                 regras fixas e paleta           → window.Constants
  dictionary.js                parsing do dicionário           → window.Dictionary
  format.js                    formatação PT-BR e escape HTML  → window.Format
  engine.js                    motor de cálculo                → window.Engine
  interpretation.js            gerador de texto determinístico → window.Interpretation
  charts.js                    wrappers de ECharts             → window.Charts
  tabs/visao-geral.js          uma aba por arquivo             → window.Tabs.visaoGeral
  tabs/por-secao.js                                            → window.Tabs.porSecao
  tabs/por-subsecao.js                                         → window.Tabs.porSubsecao
  tabs/por-om.js                                               → window.Tabs.porOM
  tabs/qualitativas.js                                         → window.Tabs.qualitativas
  tabs/perfil.js                                               → window.Tabs.perfil
  export.js                    relatório PDF/DOCX              → window.Exportador
  app.js                       orquestração e init              → window.App

vendor/                        echarts.min.js, jspdf.umd.min.js, jspdf.plugin.autotable.min.js,
                               docx.umd.js, filesaver.min.js   (~2,2 MB no total)

scripts/
  preprocessar_resultados.js   CLI Node: formulário bruto → resultados.csv + meta.json

data/
  dicionario.csv               dicionário de variáveis (metadado, NÃO sensível)
  resultados_cta.csv           exportação bruta do formulário — SENSÍVEL E IDENTIFICÁVEL
  resultados.csv               respostas pré-processadas e anonimizadas — SENSÍVEL
  meta.json                    período de apuração + total de respondentes
  formulario.pdf               formulário em branco, oferecido para download no cabeçalho
  formulario_cta.html          cópia HTML do formulário aplicado (referência, não usada pelo app)

assets/
  simbolo_bda.png              brasão da Brigada (opcional — ausência é tolerada)

MIGRACAO_JS.md                 especificação original da v1 (documento histórico, 45 KB)
README.md                      instruções de instalação/operação para o usuário final
```

**Dependência de ordem:** não há módulos ES nem bundler. Cada arquivo publica um objeto em
`window` e consome os anteriores. A ordem das tags `<script>` em `index.html` é significativa:
vendor → motor (csv-parser, constants, dictionary, format, engine, interpretation) →
apresentação (charts, tabs/*, export, app). `app.js` inicializa no evento `DOMContentLoaded`.

---

## 2. Pipeline de dados (ponta a ponta)

```
  Formulário eletrônico (plataforma CTA / Google Forms)
            │  exportação CSV com perguntas por extenso
            ▼
  data/resultados_cta.csv          ← contém "ID do usuário", "Nome de exibição do usuário",
            │                        "Registro de Tempo" → DADO IDENTIFICÁVEL
            │  node scripts/preprocessar_resultados.js
            ▼
  data/resultados.csv  +  data/meta.json
            │  fetch() no navegador (cache: 'no-store')
            ▼
  motor de cálculo em JS  →  abas do dashboard  →  exportação PDF/Word
```

### 2.1 O script de pré-processamento (`scripts/preprocessar_resultados.js`)

Roda em Node.js, sem dependências. Ele reaproveita os próprios módulos do navegador
(`js/csv-parser.js`, `js/constants.js`, `js/dictionary.js`) simulando `global.window = global`,
para não duplicar a lógica de parsing.

O que ele faz, em ordem:

1. Lê `data/dicionario.csv` e monta a lista de colunas de saída (todas as do dicionário, na ordem do dicionário).
2. Lê o CSV bruto (padrão: `data/resultados_cta.csv`, ou o caminho passado como argumento).
3. **Descarta** as três colunas identificáveis: `ID do usuário`, `Nome de exibição do usuário`, `Registro de Tempo`. Se alguma delas não existir no arquivo bruto, aborta com erro.
4. **Valida o alinhamento**: as colunas de pergunta restantes precisam ser exatamente **86**, o tamanho da constante `MAPA_COLUNAS`. Se o número não bate, aborta com a mensagem "o formulário provavelmente mudou — revise o mapeamento". O mapeamento é **posicional**: a N-ésima pergunta do formulário corresponde à N-ésima coluna de `MAPA_COLUNAS`.
5. Gera `respondent_id` **sequencial anônimo** (1..N, ordem de chegada das linhas).
6. **Converte os valores**:
   - natureza `escala` → extrai o inteiro do padrão `"N - Rótulo"` (ex.: `"3 - Concordo"` → `3`). Formato diferente disso → erro.
   - natureza `nota` → converte para número (erro se não for numérico).
   - `categorica` / `texto` → mantém o texto como veio, apenas com espaços aparados.
   - célula vazia → permanece vazia.
7. Preenche em branco as **12 colunas do dicionário sem pergunta correspondente** no formulário atual: as 11 "justificativas" de texto das notas 0–10 (herança de uma versão anterior do formulário) e `s3_fusex_usuario`.
8. Grava `s3_fusex_usuario = "Sim"` para **todas as linhas** (o formulário atual não pergunta mais isso; todos responderam ao bloco FUSEx).
9. Escreve `data/resultados.csv`.
10. Calcula o **período de apuração** a partir do `Registro de Tempo` bruto (ordenação lexicográfica de ISO 8601 de largura fixa, evitando conversão de fuso) e grava `data/meta.json` com `{ totalRespondentes, periodoInicio, periodoFim, processadoEm }`. O timestamp por respondente **não** vai para `resultados.csv` — só o intervalo agregado.

### 2.2 `data/dicionario.csv` — o contrato de metadados

CSV com 5 colunas: `coluna,secao,tipo,escala_dominio,descricao`. **99 linhas de item.**
É o dicionário que define a estrutura do instrumento — o app não tem nenhuma lista de
perguntas codificada; tudo é derivado deste arquivo.

**Regra de divisão Seção/Subseção:** o campo `secao` pode conter o separador `" — "`
(espaço, travessão U+2014, espaço). Se contiver, divide em seção + subseção
(`"Seção 2 — Rancho"` → seção `Seção 2`, subseção `Rancho`). Se **não** contiver, a seção
inteira também é usada como nome da subseção (`"Seção 4"` → seção `Seção 4`, subseção `Seção 4`).

**Mapeamento `tipo` → natureza e domínio numérico:**

| `tipo` no CSV | natureza | domínio |
|---|---|---|
| `Nota` | `nota` | 0 a 10 |
| `Escala` | `escala` | 1 a 4 (ou 1 a 5 se `escala_dominio` começa com "1 a 5") |
| `Escala (condicional)` | `escala` | idem — pode vir vazio (FUSEx) |
| `Frequência` | `escala` | 1 a 5 (Nunca → Todo dia) |
| `Categórica` | `categorica` | — |
| `Texto (obrigatório)` / `Texto (opcional)` / `Texto (aberto)` | `texto` | — |
| qualquer outro (ex.: `Inteiro`) | `outro` | — |

**Distribuição atual das 99 linhas:** 59 `escala`, 17 `texto`, 11 `nota`, 11 `categorica`,
1 `outro` (`respondent_id`).

**Quais itens entram no índice:** natureza `escala` **ou** `nota`, **e** a seção não está em
`SECOES_EXCLUIDAS_DO_INDICE` = {`Metadados`, `Caracterização`, `Seção 6`}. → **69 itens**.

### 2.3 Estrutura hierárquica derivada (Seção → Subseção → Itens)

Construída em memória a partir do dicionário, preservando sempre a **ordem de aparição no
arquivo** (nunca alfabética). Estado atual:

| Seção | Subseções (nº de itens numéricos) |
|---|---|
| Seção 1 — Assuntos Pessoais | Família (3), Rotina (3), Qualidade de vida (4), Espiritualidade (3) |
| Seção 2 — Profissional/Trabalho | Rancho (4), Alojamento (4), Estrutura (3), Liderança (3), Carreira (3) |
| Seção 3 — Saúde Emocional | Estado emocional (7), Enfrentamento (3), FUSEx (3), Apostas (5) |
| Seção 4 — Financeiro | *Seção 4* (8) — seção sem subdivisão, subseção com o mesmo nome |
| Seção 5 — Comunicação Interna | Hierarquia (3), Comunicação (4), Reuniões/Formaturas (2), Escalas (4) |

Total: 69 itens em 17 subseções e 5 seções. **A Seção 6 não aparece nessa estrutura** (é
excluída do índice) — ela existe apenas como o item de fechamento `s6_nota_clima_geral`,
tratado à parte.

A estrutura também expõe: `sectionOrder` (ordem das seções), `itemByColuna` (lookup),
`textItems` (os 17 itens de texto), `closingItem` (`s6_nota_clima_geral`) e `filterFields`
(as colunas categóricas da seção `Caracterização`: `om`, `posto_graduacao`, `vinculo`,
`escolaridade`).

### 2.4 `data/resultados.csv` — o dado de respostas

Uma linha por respondente, uma coluna por item do dicionário, na ordem do dicionário
(99 colunas, começando por `respondent_id`). Valores: inteiros para escalas/notas, texto
para categóricas e abertas, **célula vazia = "não respondeu"** (nunca zero).

O dashboard **valida na carga** que toda coluna esperada pelo dicionário existe no
`resultados.csv`; se faltar alguma, mostra tela de erro nomeando até 5 colunas ausentes.

### 2.5 Parser de CSV próprio (`js/csv-parser.js`)

Implementação manual, caractere a caractere, tolerante a: BOM UTF-8, campos entre aspas com
vírgulas / quebras de linha / aspas escapadas (`""`), CRLF ou LF, linha final sem quebra.
Descarta linhas totalmente vazias. Devolve `{ headers, rows }` onde cada `row` é um objeto
`coluna → string` com os valores já aparados (`trim`). É usado tanto no navegador quanto no
script Node.

### 2.6 Carga e cache

`app.js` faz `fetch` de `data/dicionario.csv` e `data/resultados.csv` com `cache: 'no-store'`,
e o `server.js` envia `Cache-Control: no-store` para tudo sob `/data/`. Consequência
operacional: **atualizar os dados não exige reiniciar o servidor** — basta sobrescrever o CSV
e pedir F5 aos usuários.

`data/meta.json` é carregado **à parte, depois do resto**, e falha em silêncio: se o arquivo
não existir ou estiver inválido, o badge de período fica oculto e o dashboard funciona normalmente.

---

## 3. Motor de cálculo — as regras de negócio

Todo o cálculo é puro (entra estrutura + linhas, sai estrutura de dados; nenhum toque no DOM).
Não há memoização: **cada mudança de filtro recalcula tudo do zero**.

### 3.1 Índice de favorabilidade por item (0 a 100)

Para um item numérico e o valor bruto de uma célula:

```
se a célula é vazia / não numérica  → null   (NUNCA 0)
se o item é de sentido invertido    → v = (min + max) − v
índice = (v − min) / (max − min) × 100
```

Exemplos: escala 1–4, resposta 3 → `(3−1)/(4−1)×100 = 66,7`. Nota 0–10, resposta 8 → `80,0`.
Frequência 1–5, resposta 5 → `100,0`.

### 3.2 Itens de sentido invertido

Concordar com estas afirmações é **ruim**, então o sentido é revertido antes de qualquer
cálculo. A lista é **fixa no código** (`Constants.ITENS_INVERTIDOS`) — não vem marcada no
dicionário:

- Bloco Apostas (5): `s3_apostas_q14_costuma_apostar`, `s3_apostas_q15_aumentou_freq_valor`, `s3_apostas_q16_prejuizo_financeiro`, `s3_apostas_q17_afetou_trabalho`, `s3_apostas_q18_quis_parar_dificuldade`
- Estado emocional negativo (4): `s3_q2_sobrecarregado_freq`, `s3_q3_dificuldade_relaxar_freq`, `s3_q4_dormiu_mal_freq`, `s3_q5_irritado_freq`

Observação registrada no próprio dicionário: `s4_q9_financas_nao_afetam_desempenho` está
redigido de forma já positiva e **não** é invertido.

### 3.3 Agregação hierárquica — sempre média simples, nunca ponderada

```
item      = média dos índices individuais válidos (ignora vazios)
subseção  = média simples dos índices dos itens (sem peso por N)
seção     = média simples das subseções NÃO suprimidas
Índice Geral = média simples das Seções 1 a 5
```

Nenhum nível usa soma, peso por número de respostas ou peso por importância. Níveis sem
nenhum valor válido resultam em `null`, e `null` **nunca** é tratado como 0 na agregação —
é excluído da média.

### 3.4 Seção 6 é deliberadamente separada

`s6_nota_clima_geral` (nota 0–10 de fechamento) é calculada isoladamente e **nunca entra no
Índice Geral**. Aparece como um card próprio na Visão Geral, como linha final da exportação,
e está fora das abas Por Seção / Por Subseção (por estar excluída da estrutura de índice).
Razão: é uma avaliação-resumo subjetiva, não uma dimensão comparável às outras.

### 3.5 Classificação em faixas

Aplicada de forma idêntica a qualquer índice — item, subseção, seção ou geral:

| Faixa | Intervalo | Cor |
|---|---|---|
| Ruim | 0 ≤ i < 50 | `#BF6A5D` (terracota) |
| Bom | 50 ≤ i < 75 | `#79D678` (verde claro) |
| Excelente | 75 ≤ i ≤ 100 | `#4CAF50` (verde) |
| *(sem classificação)* | índice `null` | `#9E9E9E` (cinza neutro) |

### 3.6 Contagem de N

`N` de um grupo de itens = **respondentes distintos com pelo menos uma resposta não-vazia**
entre as colunas do grupo. Nunca é a soma de respostas por item. `N` de um item individual =
número de valores válidos naquela coluna. `N` do recorte = número de linhas que passam pelos filtros.

### 3.7 Filtros

Quatro dimensões, todas **multi-seleção**, aplicadas por interseção (AND entre dimensões,
OR dentro de uma dimensão):

`om` > `posto_graduacao` > `vinculo` > `escolaridade`

(essa ordem é significativa — define a precedência do "eixo de comparação", seção 4.5).
Dimensão sem nenhum valor selecionado = "todos". Sem filtro nenhum = a Brigada inteira.

Os valores de cada dropdown são **descobertos nos dados** (valores distintos presentes em
`resultados.csv`), não no dicionário. Ordenação: `om` e `vinculo` alfabética (pt-BR);
`posto_graduacao` e `escolaridade` por **lista de ordem sugerida** fixa no código (hierarquia
militar do mais alto ao mais baixo; escolaridade do menor ao maior nível), com valores fora
da lista caindo no fim em ordem alfabética.

### 3.8 Regra de anonimato — a mais crítica do sistema (três níveis)

Limiar único: **`LIMIAR_ANONIMATO = 5` respondentes.**

- **Nível 1 — recorte inteiro.** Verificado **uma única vez em `app.js`, antes de renderizar qualquer aba** (nunca delegado aos componentes). Se `N < 5`, o conteúdo inteiro da aba é substituído por um alerta "Seleção sem dados suficientes (N=x)" e nada mais é calculado nem exibido.
- **Nível 2 — subseção.** Se o N da subseção `< 5`, ela é marcada `suprimida`: índice `null`, lista de itens **vazia** (a UI não tem o que mostrar), e ela é excluída da média da seção. Se todas as subseções de uma seção estão suprimidas, a seção inteira fica suprimida.
- **Nível 3 — item.** Dentro de uma subseção visível, um item com `0` respostas recebe status `sem_respostas` e com `1..4` respostas recebe `insuficiente`; em ambos os casos o índice exibido é `—`. **Porém o índice bruto do item continua sendo usado na agregação da subseção** (campo interno `indiceBruto`) — a supressão é de exibição, não de cálculo.

Consequências no resto do sistema: na aba Por OM, OMs com `N < 5` no recorte são excluídas
do ranking/heatmap e listadas num aviso; na aba Qualitativas, um grupo de textos herda a
supressão da subseção numérica correspondente; na exportação, um recorte insuficiente
resulta em alerta e nenhum arquivo gerado.

### 3.9 Regra condicional — FUSEx

Os três itens `s3_fusex_*` são `Escala (condicional)`: só respondidos por usuários do FUSEx,
vazios para os demais. Nenhum tratamento especial é necessário — célula vazia já é
"sem resposta" e o N da subseção FUSEx naturalmente reflete apenas quem respondeu, com a
regra de nível 2 protegendo grupos pequenos.

### 3.10 Distribuição de respostas por item (drill-down)

Percentual das respostas **brutas** (sem reversão de sentido) de um item, para o gráfico de
barras divergentes. Elegíveis: apenas itens de `tipo` exatamente `Escala` com domínio
máximo 4 — isto é, **frequências 1–5, notas 0–10 e escalas condicionais ficam fora do
drill-down**. Retorna `null` se o item tiver `N < 5`.

### 3.11 Bloco de Jogos e Apostas — métrica calculada e não exibida

Existe uma função que calcula a **prevalência bruta** de comportamento de risco: por item do
bloco Apostas, o percentual de respondentes que responderam 3 ou 4 (concordância), mais o
"pior caso" entre eles. **Ela não é exibida em nenhuma tela** — decisão de produto preservada
da versão anterior. É código morto intencional.

### 3.12 Ranking e comparação entre OMs

Para a aba Por OM, o motor é reexecutado **uma vez por OM**, aplicando os demais filtros
ativos mas **substituindo a dimensão OM pela OM em questão** (ou seja: o filtro de OM
selecionado na tela é ignorado nesta aba, que sempre percorre todas as OMs conhecidas).
OMs com recorte insuficiente vão para a lista `excluidas` com seu N.

### 3.13 Composição demográfica

Contagem por valor de uma dimensão categórica, ordenada decrescente. Valores vazios contam
como `(não informado)`. Se houver mais de 7 categorias distintas, mantém as 6 maiores e
agrupa o restante como **"Outros"**.

---

## 4. Leitura Interpretada — gerador de texto determinístico

Um parágrafo-síntese e duas listas, montados **100% por template, sem IA/LLM, sem
aleatoriedade**. A mesma entrada produz sempre a mesma frase. O motor devolve dados
estruturados; quem monta o HTML e aplica cor é a camada de apresentação.

### 4.1 Cabeçalho (nome do recorte)

Construído percorrendo as dimensões na ordem `om > posto > vínculo > escolaridade`,
incluindo apenas as que têm seleção. A dimensão OM entra **sem rótulo** (só os nomes das
OMs); as outras entram como `"rótulo: valores"`. Sem nenhum filtro:
**"Brigada — todos os militares"**.

Exemplos: `"Cmdo 3ª Bda C Mec"` · `"posto: Cabo, Soldado (EP)"` ·
`"Esqd Cmdo 3ª Bda C Mec, vínculo: Temporário"`.

### 4.2 Escolha do melhor e do pior ponto

Percorre todas as subseções não suprimidas **na ordem do instrumento**:
- **melhor** = a de maior índice **entre as classificadas "Excelente"**;
- **pior** = a de menor índice **entre as classificadas "Ruim"**.

Se não houver nenhuma "Excelente", não há melhor; se não houver nenhuma "Ruim", não há pior.
**Desempate:** a primeira na ordem do instrumento vence — nunca sorteio, nunca alfabético.

### 4.3 Parágrafo-síntese (4 variantes + 1 caso de erro)

Base: `"Com os filtros aplicados, o clima apresentou índice geral de {índice} ({classificação})"`,
completada conforme o caso:

| Situação | Complemento |
|---|---|
| melhor **e** pior | `", impulsionado por bons resultados em {melhor}, mas prejudicado por {pior}, que exige atenção."` |
| só melhor | `", impulsionado por bons resultados em {melhor}."` |
| só pior | `", mas prejudicado por {pior}, que exige atenção."` |
| nenhum dos dois | `"."` |
| Índice Geral `null` | `"Índice Geral não pôde ser calculado para este recorte (todas as subseções ficaram abaixo do limiar de anonimato)."` |

### 4.4 Listas de Positivos e Negativos

Agrupadas **por seção**, na ordem do instrumento. Em Positivos entram as subseções
classificadas **Excelente**; em Negativos, as classificadas **Ruim**. Subseções "Bom" não
aparecem em nenhuma das duas listas. Fallbacks quando uma lista fica vazia:
*"Nenhum destaque positivo identificado nesta seleção."* /
*"Nenhum ponto crítico identificado nesta seleção."*

### 4.5 Eixo de comparação (múltiplos valores num filtro)

Regra: percorre as dimensões na ordem `om > posto > vínculo > escolaridade` e a **primeira**
com **mais de um valor selecionado** se torna o *eixo*. Nesse caso são geradas **N leituras
independentes** — uma por valor do eixo, mantendo as outras dimensões fixas — e a Visão Geral
exibe um painel por leitura, com um aviso explicando a comparação. Sem eixo, gera uma
única leitura combinada.

Importante: o eixo afeta **apenas a leitura interpretada**. Gauge, cards de seção e todas as
demais abas continuam mostrando o recorte combinado. E a **exportação sempre usa a leitura
combinada**, mesmo que a tela esteja mostrando várias.

### 4.6 Recorte insuficiente

Se `N < 5` no recorte da leitura, ela retorna
*"Dados insuficientes para leitura interpretada nesta seleção."*, listas vazias e
`suficiente: false`.

---

## 5. Interface — estrutura e ciclo de vida

### 5.1 Cabeçalho (fixo, presente em todas as telas)

- Brasão da Brigada (`onerror` esconde a imagem — ausência do arquivo é tolerada);
- Título "Braço Forte, Abraço Amigo" + subtítulo "Dashboard de Clima Organizacional — 3ª Brigada de Cavalaria Mecanizada";
- **Badge de período de apuração** ("🗓️ Período de apuração: dd/mm/aaaa a dd/mm/aaaa"), oculto por padrão e revelado só se `meta.json` carregar; colapsa para uma única data quando início = fim;
- **Botão "📊 Critérios"** com popover (abre no hover/foco) explicando: índice 0–100, reversão de invertidos, agregação por média simples sem peso, Seção 6 fora da média, e a legenda das três faixas. **O texto das faixas está escrito à mão no HTML**, duplicando os valores de `constants.js`;
- **Botão "📄 Baixar formulário"** → download de `data/formulario.pdf` com nome sugerido `Formulario_Pesquisa_Clima_3BdaCMec.pdf`.

### 5.2 Painel de filtros (sticky, logo abaixo do cabeçalho)

Quatro `<select multiple>` (OM, Posto/Graduação, Vínculo, Escolaridade), populados a partir
dos dados. Comportamento customizado importante: um `mousedown` em `<option>` é interceptado
para **alternar a seleção com clique simples**, sem precisar segurar Ctrl/Cmd (o
comportamento nativo do `<select multiple>` é hostil para esse uso). A altura de cada lista
se adapta ao número de opções (entre 4 e 8 linhas visíveis).

Abaixo, uma linha de **chips** — um por valor selecionado, no formato `Rótulo: valor`, com
botão `×` para remover — e o botão **"Limpar tudo"**. Quando nada está selecionado, aparece
o texto *"Nenhum filtro ativo — exibindo a Brigada inteira."*

Detalhe defensivo registrado no código: o `×` do chip só remove o filtro se o evento de
clique for **`isTrusted`** (clique real do usuário), nunca por recriação automática do chip —
descrito como "armadilha conhecida deste projeto".

### 5.3 Abas e ciclo de renderização

Seis abas: **Visão Geral · Por Seção · Por Subseção · Por Organização Militar · Respostas
Qualitativas · Perfil dos Respondentes**. Cada uma tem um `<div>` painel vazio no HTML,
preenchido por JS. A primária é Visão Geral.

O ciclo, centralizado em `app.js`:

```
qualquer mudança (filtro alterado, chip removido, limpar tudo, troca de aba)
   → sincroniza os selects com o estado
   → redesenha os chips
   → renderAbaAtiva():
        calcula N do recorte
        se N < 5 → substitui a aba por um alerta e para aqui        ← anonimato nível 1
        senão    → chama Tabs[abaAtiva].render(container)
```

Cada aba **recalcula o resultado do motor por conta própria** (`App.getResultadoAtual()`) e
**reconstrói todo o seu DOM do zero** (`container.innerHTML = ''`). Ao trocar de aba, o
método `reset()` da aba anterior é chamado se existir — implementado apenas em Por Seção
(limpa o drill-down aberto) e Por Subseção (limpa a seção selecionada).

### 5.4 Telas de carregamento e erro

Durante o `init`, o app fica com `visibility: hidden` e um spinner "Carregando dados da
pesquisa…" é exibido. Qualquer erro na carga (arquivo ausente, vazio, sem respostas, colunas
faltando) troca tudo por uma tela de erro com mensagem específica e acionável — por exemplo:
*"Arquivo resultados.csv não encontrado — coloque o arquivo em /data."*,
*"resultados.csv está sem 3 coluna(s) esperada(s) pelo dicionário: x, y, z."*

---

## 6. As seis abas, em detalhe

### 6.1 Visão Geral

1. **Linha do topo**: `N = X respondentes no recorte atual` + controle de exportação (um `<select>` PDF/Word e o botão **Exportar**, que mostra "Gerando…" e se desabilita durante a geração; erro vira `alert`).
2. **Coluna esquerda**: legenda das três faixas + **velocímetro (gauge)** do Índice Geral; abaixo, um card "RESULTADO GERAL / Índice Geral" com o número grande, a tag de classificação colorida e o subtítulo *"Média das Seções 1 a 5 (a Seção 6 é nota de fechamento à parte)."*
3. **Coluna direita**: grade de **6 cards de seção** (Seções 1 a 6). Cada card tem ícone emoji, nome curto em maiúsculas, título, subtítulo descritivo, índice grande e tag de classificação; a borda superior e as cores acompanham a classificação. Sem dados suficientes → `—` e tag "N insuficiente".
4. **Leitura interpretada**: um ou vários painéis (ver 4.5), cada um com cabeçalho do recorte, parágrafo-síntese e as listas Positivos/Negativos agrupadas por seção, com a classificação colorida.

Metadados dos cards (ícone, título, subtítulo) são fixos no código:

| Seção | Ícone | Título | Subtítulo |
|---|---|---|---|
| 1 | 🧑‍🤝‍🧑 | Assuntos Pessoais | Situação familiar, rotina, qualidade de vida e vida fora do quartel. |
| 2 | 🛠️ | Profissional / Trabalho | Condições de trabalho, alimentação, ambiente, reconhecimento e carreira. |
| 3 | 🧠 | Saúde Emocional e Bem-estar | Estado emocional, apoio psicológico, FUSEx e jogos/apostas. |
| 4 | 💰 | Financeiro | Situação financeira, soldo, moradia, deslocamento e estabilidade. |
| 5 | 📋 | Comunicação Interna | Hierarquia, disciplina, comunicação, reuniões, formaturas e escalas. |
| 6 | ⭐ | Avaliação Geral | Nota de fechamento para o clima da Organização Militar. |

### 6.2 Por Seção

Instrução no topo: *"Clique numa barra de subseção para ver a distribuição de respostas por item."*

Um card por seção (apenas Seções 1–5), cada um com título `Seção N — índice (classificação)`
e corpo em duas colunas: à esquerda uma **tabela** (Subseção · N · Índice · Classificação);
à direita um **gráfico de barras horizontais** das subseções.

**Drill-down:** clicar numa barra abre, no topo da aba, um painel "Distribuição de respostas
— Seção / Subseção" com um **gráfico de barras divergentes** (uma linha por item elegível,
4 segmentos divergindo do centro) e um botão "Fechar ✕". Se nenhum item da subseção for
elegível ou tiver dados suficientes, mostra um alerta informativo. Ao abrir, a aba faz
scroll suave para o topo. O estado do drill-down é local da aba e limpo ao trocar de aba.

### 6.3 Por Subseção

Um `<select>` de seção (Seções 1–5) no topo; abaixo, o cabeçalho da seção escolhida
(ícone + título + subtítulo) e **um card por subseção** contendo: nome, N, índice colorido,
classificação e uma **tabela por pergunta** (Pergunta · N · Índice · Classificação), usando
a descrição do dicionário como texto da pergunta. Itens sem dados aparecem com `—` e o
rótulo "Sem respostas" ou "N insuficiente" em cinza. Subseção suprimida → o card mostra
apenas o alerta "Seleção sem dados suficientes (N=x)".

### 6.4 Por Organização Militar

Instrução: *"Clique numa barra de OM para aplicá-la como filtro."*

Duas visualizações lado a lado:
- **Ranking por OM — Índice Geral**: barras horizontais, ordenadas do pior para o melhor, coloridas pela classificação. **Clicar numa barra adiciona aquela OM ao filtro de OM** (não substitui — acumula).
- **Heatmap OM × Seção**: linhas = OMs (ordem alfabética), colunas = Seções 1 a 5; célula colorida pela classificação, com o índice escrito dentro e tooltip mostrando OM, seção, descrição da seção, índice e classificação. Células suprimidas ficam cinza com `—`.

Abaixo, quando aplicável: *"N OM(s) sem dados suficientes no recorte atual e não exibidas: …"*.
Se nenhuma OM tiver dados suficientes, um alerta substitui os gráficos.

### 6.5 Respostas Qualitativas

Grade de cards, um por **grupo de itens de texto** (agrupados por Seção+Subseção, na ordem
do instrumento). Cada card: `Nome da subseção (N respostas)` + lista rolável com **todas as
respostas em texto, na íntegra**, uma por item de linha.

Regra de exibição: o grupo é ocultado se a subseção numérica correspondente estiver
suprimida (herança do anonimato nível 2); para grupos de texto "soltos" — sem itens
numéricos na mesma subseção, como os comentários livres de fim de seção — o N próprio do
grupo é calculado e comparado ao limiar. Grupos da Seção 6 herdam a supressão do item de
fechamento. Grupos sem nenhum texto preenchido não geram card. Se nada sobrar:
*"Nenhuma resposta qualitativa disponível para este recorte."*

Os textos são inseridos via `textContent` (sem interpretação de HTML).

### 6.6 Perfil dos Respondentes

`N = X respondentes no recorte atual` + quatro **donuts** de composição demográfica
(Organização Militar, Posto/Graduação, Vínculo, Escolaridade), com rótulo `nome: percentual`
e legenda rolável.

---

## 7. Gráficos (ECharts) — especificações implementadas

Fonte única em todos: Helvetica/Arial. Fundo branco. Cor do texto `#333`. Cada função recebe
um elemento DOM e dados já calculados, descarta a instância anterior do mesmo elemento
(`dispose`) e devolve a nova instância.

| Gráfico | Onde | Especificação |
|---|---|---|
| **Barras horizontais** | Por Seção (subseções), Por OM (ranking) | Ordenadas do menor para o maior índice, com as suprimidas primeiro (cinza `#D9D9D9`, valor 0, rótulo "N insuf."). Eixo X de 0 a 108 (folga para o rótulo). Rótulo com o índice à direita da barra. Cantos direitos arredondados. Altura calculada por nº de itens (42 px cada, mínimo configurável). Clique opcional. |
| **Gauge (velocímetro)** | Visão Geral | Semicircular 180°→0°, 0 a 100. Três faixas de fundo com 40% de opacidade (Ruim até 50, Bom até 75, Excelente até 100) e **nenhuma barra de progresso sólida** — decisão explícita para as faixas nunca ficarem cobertas. Agulha + âncora + número central na cor da classificação. Altura fixa de 260 px. Índice `null` → agulha em 0 e texto `—`. |
| **Barras divergentes** | drill-down de Por Seção | Uma linha por item, 4 segmentos empilhados divergindo do zero central: à esquerda "Discordo totalmente" (`#BF6A5D`) e "Discordo" (`#E8C4BC`), à direita "Concordo" (`#C7E3C8`) e "Concordo totalmente" (`#4CAF50`). Eixo X de −100 a 100 sem rótulos; linha de referência no zero; percentuais escritos dentro dos segmentos **apenas quando > 3%**. |
| **Heatmap** | Por OM | OM × Seção, célula colorida pela classificação com borda clara, índice escrito em branco no centro, tooltip detalhado. Suprimida → `#E8E8E8` e `—`. |
| **Donut** | Perfil | Anel 55%–75%, paleta categórica de 8 cores, rótulo `{nome}: {percentual}%`, legenda rolável na base, título centralizado. |

---

## 8. Formatação PT-BR (centralizada em `js/format.js`)

Regra do projeto: nenhuma tela formata número por conta própria — tudo passa por aqui, para
nunca haver inconsistência.

| Função | Comportamento | `null`/`NaN` |
|---|---|---|
| índice | 1 casa decimal, **vírgula** decimal (`66.666` → `"66,7"`) | `"—"` |
| percentual | 1 casa decimal + `%` (`12.34` → `"12,3%"`) | `"—"` |
| inteiro | separador de milhar pt-BR (`1234` → `"1.234"`) | `"—"` |
| data | `dd/mm/aaaa`, opcionalmente `dd/mm/aaaa hh:mm` | — |
| data ISO | `"2026-08-07"` → `"07/08/2026"` | `"—"` |
| data de hoje ISO | `aaaa-mm-dd`, usado em nome de arquivo | — |
| escape HTML | escapa `& < > " '` — aplicado a **todo** texto vindo dos CSVs antes de entrar em `innerHTML` | `""` |

---

## 9. Exportação de relatório (PDF e Word)

Disparada pelo botão na Visão Geral. **Recalcula o recorte do zero** a partir dos filtros
ativos no momento do clique e sempre usa a **leitura interpretada combinada** (nunca a versão
com eixo de comparação). Se o recorte for insuficiente: `alert("Dados insuficientes para
exportar este recorte.")` e nenhum arquivo é gerado.

Conteúdo, idêntico nos dois formatos:

1. Brasão (se `assets/simbolo_bda.png` existir — carregado como data URL no PDF e como bytes no DOCX; falha é ignorada em silêncio);
2. Título "Braço Forte, Abraço Amigo" + subtítulo institucional;
3. `Recorte: {cabeçalho da leitura}`;
4. `Gerado em {dd/mm/aaaa hh:mm} — N = {n} respondentes`;
5. `Índice Geral: {índice} — {classificação}`, em negrito e **na cor da classificação**;
6. **Leitura Interpretada**: parágrafo-síntese + listas Positivos e Negativos (agrupadas por seção, com a classificação em negrito colorido, e os fallbacks em itálico cinza quando vazias);
7. **Tabela "Índices por Seção e Subseção"**: cabeçalho verde `#2E4B2E` com texto branco; linhas de seção em negrito com fundo `#F2F5F2`; linhas de subseção indentadas com N, índice e classificação colorida;
8. Se aplicável, a linha final `Seção 6 — Avaliação Geral (nota de fechamento): {índice} ({classificação})`.

Detalhes técnicos: PDF via **jsPDF** A4 em pontos, margem 40, com controle manual de quebra
de página (nova página quando `y + altura > 800`) e tabela via **jspdf-autotable**; DOCX via
**docx.js** + **FileSaver**. Nome do arquivo: `relatorio_clima_AAAA-MM-DD.pdf` / `.docx`.

**Os gráficos não são exportados** — o relatório é texto e tabela.

---

## 10. Servidor estático (`server.js`)

Node.js puro, **zero dependências**, ~70 linhas. `node server.js [porta]`, porta padrão 8080
(ou `PORT`). Escuta em `0.0.0.0` e imprime as URLs local e de rede no console.

- Serve qualquer arquivo do diretório do projeto; `/` → `index.html`.
- Tabela de MIME types para `.html .js .css .csv .pdf .png .jpg .jpeg .svg .ico .json`; o resto vai como `application/octet-stream`.
- **Proteção contra path traversal**: o caminho resolvido precisa começar pela raiz do projeto, senão responde 400.
- Envia `Cache-Control: no-store` para qualquer arquivo dentro de `data/`.
- 404 com texto simples para arquivo inexistente ou diretório.
- Não há HTTPS, autenticação, autorização, log de acesso ou rate limiting.

Operação documentada no README: copiar a pasta para uma máquina da rede, rodar o servidor,
descobrir o IP local e acessar `http://<IP>:8080/` dos outros computadores; liberar a porta
no firewall se necessário; `nohup`/`systemd`/Agendador de Tarefas para manter rodando.

---

## 11. Segurança e privacidade — como está hoje

O dado é sensível: respostas individuais sobre saúde emocional, jogos/apostas, situação
financeira e vida familiar de militares identificáveis por OM + posto.

O que **já é feito**:
- O pré-processamento remove ID, nome e timestamp do respondente antes de gerar `resultados.csv`;
- Nenhuma tela exibe a tabela bruta de respostas individuais — só agregados;
- O limiar de anonimato de 5 respondentes é aplicado em três níveis e verificado antes de qualquer render;
- Nada é enviado para fora do navegador (sem telemetria, sem API, sem CDN — bibliotecas locais);
- O README instrui a não versionar nem expor os CSVs e a usar somente a rede interna.

O que **não** é feito (relevante para a v2 decidir):
- **`data/resultados.csv` é servido como arquivo estático.** Qualquer pessoa com acesso à URL do dashboard pode baixar o CSV completo de respostas individuais digitando `/data/resultados.csv` — todas as proteções de anonimato existem apenas na camada de exibição. `resultados_cta.csv` e `formulario_cta.html`, se presentes na pasta, também ficam acessíveis.
- Não há autenticação, nem distinção entre perfis de usuário (todo mundo que abre a página vê tudo).
- A aba Respostas Qualitativas exibe textos livres integrais, que podem conter conteúdo auto-identificável, sem qualquer revisão ou redação.

---

## 12. Constantes de referência rápida

```
LIMIAR_ANONIMATO = 5

Paleta:    verde primário #2E4B2E   verde escuro #1C331E
           ruim #BF6A5D   bom #79D678   excelente #4CAF50
           cinza claro #F4F4F2   texto #333333   neutro #9E9E9E   borda #E4E4E0

Divergente (ordem DT, D, C, CT):  #BF6A5D  #E8C4BC  #C7E3C8  #4CAF50
Categórica (8): #2E4B2E #B8860B #4A6FA5 #C0392B #7A6C5D #8FA88F #9E9E9E #5B3A29

Faixas:    Ruim 0–49 · Bom 50–74 · Excelente 75–100
Índice Geral = média das Seções 1 a 5 (Seção 6 fora)
Seções excluídas do índice: Metadados, Caracterização, Seção 6
Ordem dos filtros / precedência do eixo: om > posto_graduacao > vinculo > escolaridade

Postos (7 faixas, na ordem hierárquica usada nos dropdowns):
  Oficial Superior (Cel / Ten Cel / Maj)
  Oficial Intermediário / Subalterno (Cap / 1º Ten / 2º Ten)
  Praça Estabilizada (Subtenente / Sargento de Carreira)
  Sargento Temporário
  Cabo
  Soldado (Efetivo Profissional – EP)
  Soldado Recruta (Efetivo Variável – EV)

Escolaridade (9 níveis, do menor ao maior):
  Fundamental Incompleto · Fundamental Completo · Médio Incompleto ·
  Médio Completo/Técnico · Superior Incompleto · Superior Completo ·
  Pós-Graduação/Especialização · Mestrado · Doutorado
```

Layout responsivo: o CSS quebra as grades de duas colunas em uma abaixo de ~850–950 px
(4 media queries). Não há tema escuro e não há suporte a Internet Explorer.

---

## 13. Comportamentos-limite (o que acontece quando os dados falham)

| Situação | Comportamento atual |
|---|---|
| `dicionario.csv` ou `resultados.csv` ausente/vazio | Tela de erro com mensagem específica; dashboard não abre |
| `resultados.csv` sem colunas do dicionário | Tela de erro nomeando até 5 colunas faltantes |
| `meta.json` ausente/inválido | Badge de período fica oculto; resto funciona normalmente |
| `assets/simbolo_bda.png` ausente | Logo oculto no cabeçalho e omitido na exportação |
| Recorte com `N < 5` | Aba inteira substituída por alerta; exportação bloqueada com `alert` |
| Subseção com `N < 5` | Suprimida: `—`, cinza, fora da média da seção; textos correspondentes ocultos |
| Item com 0 respostas / 1–4 respostas | `—` com rótulo "Sem respostas" / "N insuficiente", mas **continua entrando na média da subseção** |
| Todas as OMs insuficientes | Alerta substitui ranking e heatmap |
| Índice Geral `null` | Gauge em 0, cards com `—`, parágrafo explicando que o índice não pôde ser calculado |

---

## 14. Estado real dos dados neste momento

- **131 respondentes**, período de apuração **29/07/2026 a 07/08/2026** (`meta.json`);
- `resultados.csv` com 99 colunas, conforme o dicionário;
- **Apenas 2 OMs presentes nos dados**: `Esqd Cmdo 3ª Bda C Mec` (120) e `Cmdo 3ª Bda C Mec` (11) — embora o dicionário descreva "11 OM da 3ª Bda C Mec". O ranking e o heatmap da aba Por OM, portanto, comparam só duas unidades hoje;
- Posto/graduação: Soldado Recruta (EV) 41 · Sargento Temporário 28 · Praça Estabilizada 22 · Soldado (EP) 18 · Cabo 12 · Oficial Intermediário/Subalterno 8 · Oficial Superior 2 (**abaixo do limiar de 5** — recortes só desse grupo são suprimidos);
- Vínculo: Temporário 103 · Militar de Carreira 28;
- Escolaridade: Médio Completo/Técnico 64 · Superior Incompleto 25 · Superior Completo 16 · Pós-Graduação 10 · Médio Incompleto 10 · Fundamental Completo 3 · Mestrado 2 · Fundamental Incompleto 1 (os quatro últimos abaixo do limiar);
- As **11 colunas de "justificativa"** de notas estão **vazias em todas as linhas** (o formulário atual não faz essas perguntas). Na prática, a aba Respostas Qualitativas mostra apenas os comentários de fim de seção, o texto sobre equipamentos, o ponto a melhorar e a sugestão de comunicação;
- `s3_fusex_usuario` = `"Sim"` em todas as linhas (preenchido artificialmente pelo script).

---

## 15. Inconsistências e dívidas conhecidas do "beta"

Registradas aqui porque a v2 vai precisar decidir o que fazer com cada uma.

**Dados e dicionário**
1. O `escala_dominio` do dicionário está **desatualizado** em pontos visíveis: diz "11 OM" (há 2 nos dados) e "14 postos/graduações específicos, do General ao Soldado" (o código usa 7 faixas agrupadas). O campo é descritivo e não afeta o cálculo, mas engana quem lê.
2. **11 colunas de texto órfãs** (as justificativas) continuam no dicionário só para manter o alinhamento histórico, sempre vazias.
3. `s3_fusex_usuario` virou constante `"Sim"` — a condicionalidade do bloco FUSEx existe na estrutura mas não é mais informada pelo formulário.
4. O `MAPA_COLUNAS` do script de pré-processamento é **posicional** e frágil: qualquer pergunta adicionada, removida ou reordenada no formulário exige editar essa lista à mão. O script detecta o desalinhamento e aborta, mas não sabe corrigi-lo.
5. A lista de itens invertidos está **codificada no JS**, não marcada no dicionário — uma pergunta nova de sentido invertido é silenciosamente calculada ao contrário se alguém esquecer de incluí-la lá.

**Motor e regras**
6. Supressão de item (nível 3) é **só de exibição**: o índice de um item com 1–4 respostas continua entrando na média da subseção. É defensável, mas não está explicitado na interface.
7. O N de um item suprimido **é exibido** na tabela (ex.: `N = 2`), o que revela o tamanho de um grupo minúsculo — uma pequena fuga em relação ao espírito do limiar.
8. Drill-down de distribuição cobre apenas escalas 1–4: **itens de frequência 1–5 e notas 0–10 não têm visualização de distribuição** em nenhuma tela.
9. A métrica de prevalência de apostas é calculada e nunca exibida (código morto intencional).
10. Sem memoização: cada mudança de filtro recalcula todo o motor, e a aba Por OM executa o motor inteiro uma vez por OM. Hoje é imperceptível com 131 linhas; com milhares de respostas e dezenas de OMs, não será.
11. A Seção 6 fica fora das abas Por Seção e Por Subseção — quem quiser ver o detalhe dela só tem o card da Visão Geral.
12. A Seção 4 não tem subdivisão, então sua "subseção" se chama literalmente "Seção 4" na tabela e no gráfico — feio e confuso.

**Interface**
13. **Filtros e aba ativa não são persistidos** — nem na URL, nem em `localStorage`. Recarregar a página ou compartilhar um link perde o recorte; não existe "link para este recorte".
14. Toda aba reconstrói seu DOM inteiro a cada mudança, e as instâncias de ECharts **não são descartadas ao trocar de aba** (só ao redesenhar o mesmo container). Não há listener de `resize`, então **os gráficos não se ajustam quando a janela muda de tamanho**.
15. `reset()` existe apenas em duas abas; o padrão de estado local por aba é informal.
16. O clique numa barra da aba Por OM **acumula** filtros de OM em vez de trocar, o que surpreende (e não há como desfazer ali mesmo — só pelo chip).
17. Barras suprimidas são desenhadas com valor 0, o que pode ser lido como "índice zero" apesar do rótulo "N insuf.".
18. O texto das faixas de classificação está duplicado à mão no `index.html` (popover de Critérios) e em `constants.js`.
19. Erros de exportação e recorte insuficiente usam `window.alert` — sem tratamento de erro na interface.
20. Não há estado de "nenhum resultado" desenhado com cuidado, nem acessibilidade revisada (foco, ARIA, navegação por teclado nos `select multiple` customizados, contraste das faixas).
21. A exportação não inclui nenhum gráfico, e o PDF faz controle de página com uma constante mágica (`y + altura > 800`).
22. `meta.json` traz `totalRespondentes`, que **não é usado em nenhum lugar** da interface (o N exibido vem sempre da contagem de linhas do recorte).

**Engenharia**
23. Nenhum teste automatizado — em nenhuma camada. Nenhum linter, nenhum CI.
24. Tudo em `window`, com ordem de `<script>` significativa e sem módulos; o mesmo código é reaproveitado no Node por meio do truque `global.window = global`.
25. `vendor/` traz ~2,2 MB de bibliotecas versionadas junto com o projeto, sem registro de versão nem procedimento de atualização.
26. Sem `package.json`, sem manifesto de versão da aplicação, sem changelog.
27. O CSV cru de respostas individuais é publicamente baixável de quem alcança o servidor (ver seção 11).

---

## 16. Invariantes — o que a v2 não deve quebrar sem decisão explícita

Estes pontos são **regra de negócio acordada**, não detalhe de implementação. Mudá-los é
legítimo, mas precisa ser uma decisão consciente e registrada:

1. **Limiar de anonimato de 5 respondentes**, aplicado em três níveis, verificado **antes** de qualquer renderização.
2. **Índice de 0 a 100**, com reversão dos itens de sentido invertido feita **antes** de qualquer cálculo.
3. **Agregação por média simples, sem peso**, em todos os níveis; célula vazia é `null`, nunca 0.
4. **Índice Geral = média das Seções 1 a 5**; a **Seção 6 nunca entra** nessa média.
5. **Faixas 0–49 / 50–74 / 75–100** com as três cores fixas, iguais em tela e em relatório.
6. **Ordem do instrumento** (ordem do dicionário) manda em toda listagem e em todo desempate — nunca alfabética, nunca aleatória.
7. **A leitura interpretada é determinística** — template, sem IA e sem sorteio.
8. **Nenhuma tela expõe respostas individuais numéricas** nem dado identificável do respondente.
9. **Formatação PT-BR centralizada** (vírgula decimal, 1 casa nos índices, `—` para ausência) e escape de HTML em todo texto vindo dos CSVs.
10. **A estrutura do instrumento vem do dicionário**, não é codificada na aplicação.
11. **Funciona offline e sem backend obrigatório** — hoje isso é uma exigência operacional (rede interna, máquina do quartel, sem internet).

---

## 17. Glossário

| Termo | Significado neste sistema |
|---|---|
| **OM** | Organização Militar — a unidade a que o respondente pertence; a principal dimensão de comparação |
| **Bda / 3ª Bda C Mec** | Brigada / 3ª Brigada de Cavalaria Mecanizada — a grande unidade pesquisada |
| **Índice** | Valor de 0 a 100 derivado das respostas; 0 = pior, 100 = melhor |
| **Índice Geral** | Média simples das Seções 1 a 5 |
| **Item** | Uma pergunta do formulário (uma coluna do dicionário/resultados) |
| **Subseção** | Agrupamento de itens dentro de uma seção (ex.: "Rancho" na Seção 2) |
| **Item invertido** | Pergunta em que concordar é ruim; o valor é revertido antes do cálculo |
| **Recorte** | O conjunto de respondentes resultante dos filtros ativos |
| **Suprimido** | Oculto por não atingir o limiar de anonimato (N < 5) |
| **Eixo de comparação** | Dimensão com mais de um valor selecionado, que gera uma leitura interpretada por valor |
| **Leitura interpretada** | Parágrafo + listas de positivos/negativos gerados por template |
| **Nota de fechamento** | `s6_nota_clima_geral` — nota 0–10 de avaliação geral, calculada à parte |
| **FUSEx** | Fundo de Saúde do Exército — bloco de perguntas condicionais |
| **CTA** | Plataforma em que o formulário eletrônico foi aplicado |
