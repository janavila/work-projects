# Especificação para migração — Dashboard de Clima Organizacional

## 0. Propósito deste documento

Este documento descreve **o sistema como ele existe hoje** (implementado em Python/Dash), com todas as regras de negócio, telas e comportamentos, para servir de especificação completa para reescrever a aplicação em **JavaScript, HTML e CSS**. Não é o documento de requisitos original do projeto — é a fotografia exata do que foi construído e refinado ao longo do desenvolvimento, incluindo decisões e ajustes feitos depois do spec inicial.

Cada fórmula, limiar e regra abaixo foi transcrito diretamente do código-fonte atual (`engine/`, `ui/`, `relatorio/`). Onde o comportamento não é óbvio ou é fruto de uma decisão específica, isso está anotado.

---

## 1. Visão geral

Dashboard interno (sem autenticação) para o Comando da 3ª Brigada de Cavalaria Mecanizada visualizar os resultados de uma Pesquisa de Clima Organizacional aplicada às 11 Organizações Militares subordinadas. Lê respostas de um CSV, calcula índices de favorabilidade (0–100) por pergunta/subseção/seção, classifica em três faixas (Ruim/Bom/Excelente), permite filtrar por OM/posto/vínculo/escolaridade, e gera uma leitura textual interpretada automaticamente — tudo isso preservando o anonimato dos respondentes em qualquer combinação de filtros.

**Dado sensível.** As respostas incluem blocos sobre saúde emocional, jogos/apostas e situação financeira. O arquivo de respostas brutas nunca deve ser exposto por nenhuma rota/endpoint — só dados já agregados pelas regras abaixo.

---

## 2. Dados de entrada

### 2.1 `dicionario.csv`

Dicionário de variáveis — mapeia cada coluna de `resultados.csv` para seção/subseção, tipo e domínio. Colunas do arquivo:

| Coluna | Conteúdo |
|---|---|
| `coluna` | nome da coluna correspondente em `resultados.csv` |
| `secao` | texto livre — ver regra de parsing abaixo |
| `tipo` | um dos: `Inteiro`, `Data (AAAA-MM-DD)`, `Categórica`, `Escala`, `Escala (condicional)`, `Frequência`, `Nota`, `Texto (obrigatório)`, `Texto (opcional)`, `Texto (aberto)` |
| `escala_dominio` | descrição do domínio de valores (ex.: `"1 a 4 (Discordo totalmente → Concordo totalmente)"`, `"0 a 10"`) |
| `descricao` | texto da pergunta/campo, usado como rótulo em várias telas |

**Parsing do campo `secao`** — é o único lugar onde a subseção é definida (o arquivo não tem uma coluna separada para isso):
- Se contém `" — "` (espaço, travessão, espaço): `"Seção 1 — Família"` → seção = `"Seção 1"`, subseção = `"Família"`.
- Se não contém: a seção inteira vira também o nome da subseção (ex.: `"Seção 4"` → seção = subseção = `"Seção 4"` — essa seção não tem subdivisão nesta versão do instrumento).

**Determinação de "natureza" e domínio numérico**, a partir de `tipo` + `escala_dominio`:

| `tipo` | natureza | domínio |
|---|---|---|
| `Nota` | `nota` | 0 a 10 |
| `Escala`, `Escala (condicional)`, `Frequência` | `escala` | 1 a 4 **ou** 1 a 5, dependendo do que `escala_dominio` começa (`"1 a 4"` ou `"1 a 5"`) |
| `Texto (obrigatório)`, `Texto (opcional)`, `Texto (aberto)` | `texto` | — |
| `Categórica` | `categorica` | — |
| outros (`Inteiro`, `Data...`) | `outro` | — |

Só itens de natureza `escala` ou `nota` entram no cálculo de índice ("numéricos").

**Itens de sentido invertido** — **não vêm marcados no CSV**, são uma lista fixa no código (regra de negócio, não dado), porque concordar com essas afirmações é *ruim*:
```
s3_apostas_q14_costuma_apostar
s3_apostas_q15_aumentou_freq_valor
s3_apostas_q16_prejuizo_financeiro
s3_apostas_q17_afetou_trabalho
s3_apostas_q18_quis_parar_dificuldade
s3_q2_sobrecarregado_freq
s3_q3_dificuldade_relaxar_freq
s3_q4_dormiu_mal_freq
s3_q5_irritado_freq
```

**Itens excluídos do cálculo de índice**: qualquer item cuja seção seja `"Metadados"`, `"Caracterização"` ou `"Seção 6"` (mesmo que numérico) — ver seção 4.3 sobre por quê a Seção 6 é separada.

**Item de fechamento da Seção 6**: o único item com `secao == "Seção 6"` e `natureza == "nota"` (hoje: `s6_nota_clima_geral`) é tratado à parte, como "nota de fechamento".

**Itens de texto** (natureza `texto`): usados na aba "Respostas Qualitativas", nunca entram em cálculo numérico.

### 2.2 Estrutura atual do instrumento (referência exata, 100 itens no dicionário)

| Seção | Subseções (nesta ordem) |
|---|---|
| Metadados | `respondent_id` (Inteiro), `data_resposta` (Data) |
| Caracterização | `om`, `posto_graduacao`, `vinculo`, `escolaridade` (todas Categóricas — são os 4 filtros) |
| **Seção 1** | Seção 1 (itens soltos: estado civil, mesma cidade, freq. ativ. física, comentário-texto) → Família (3 itens escala 1-4) → Rotina (3 itens escala 1-4) → Qualidade de vida (4 notas 0-10 + 4 justificativas texto) → Espiritualidade (3 itens escala 1-4) |
| **Seção 2** | Rancho (4 notas 0-10 + 4 justificativas) → Alojamento (4 itens escala 1-4) → Estrutura (3 itens escala 1-4) → Seção 2 (2 textos soltos) → Liderança (3 itens escala 1-4) → Carreira (2 escala 1-4 + 1 nota 0-10 + 1 justificativa) |
| **Seção 3** | Estado emocional (7 itens "Frequência" 1-5, sendo 4 invertidos) → Enfrentamento (3 itens escala 1-4) → FUSEx (1 categórica "é usuário?" + 3 itens "Escala (condicional)" 1-4, respondidos só por quem usa) → Apostas (5 itens escala 1-4, **todos invertidos**) → Seção 3 (1 texto solto) |
| **Seção 4** | Seção 4 — sem subdivisão: 2 categóricas + 7 itens escala 1-4 + 1 nota 0-10 + 1 justificativa + 1 categórica + 1 texto |
| **Seção 5** | Hierarquia (3 itens escala 1-4) → Comunicação (4 itens escala 1-4) → Reuniões/Formaturas (2 itens escala 1-4) → Escalas (4 itens escala 1-4) → Seção 5 (1 texto solto) |
| **Seção 6** | Seção 6 — 1 nota 0-10 (fechamento) + 1 justificativa texto |

### 2.3 `resultados.csv`

Uma linha por respondente, uma coluna por item do dicionário (formato largo). Hoje: 200 linhas, 100 colunas. Encoding UTF-8 (com ou sem BOM). Valores em branco significam "não respondeu" — **nunca tratar como zero**.

Valores de referência atuais dos 4 campos de filtro:
- `om` (11 valores): `13ª Cia Com Mec`, `25º GAC`, `2ª Bia AAAe`, `3ª Cia Eng Cmb Mec`, `3º B Log`, `3º Pel PE`, `3º R C Mec`, `7º R C Mec`, `9º RCB`, `Esqd Cmdo`, `QG 3ª Bda C Mec`
- `posto_graduacao` (14 valores, ordem hierárquica sugerida abaixo)
- `vinculo` (2 valores): `De Carreira`, `Temporário`
- `escolaridade` (8 valores, ordem crescente sugerida abaixo)

Ordem de exibição sugerida para os dropdowns de posto e escolaridade (valores fora dessa lista entram ordenados alfabeticamente no final):
```
Posto/Graduação: General, Coronel, Tenente-Coronel, Major, Capitão, 1º Tenente,
2º Tenente, Subtenente, 1º Sargento, 2º Sargento, 3º Sargento, Cabo,
Soldado (Efetivo Profissional – EP), Soldado (Efetivo Variável – EV / Recruta)

Escolaridade: Ensino Fundamental Completo, Ensino Médio Incompleto,
Ensino Médio Completo / Técnico, Ensino Superior Incompleto (faculdade em andamento),
Ensino Superior Completo (Graduação), Pós-Graduação / Especialização, Mestrado, Doutorado
```

### 2.4 `formulario.pdf` e `simbolo BDA.png`

- `formulario.pdf`: o formulário em branco, disponível para download via botão no cabeçalho (ver seção 7).
- `simbolo BDA.png`: brasão da Brigada, usado como logo no cabeçalho.

### 2.5 Carga e cache de dados

- Os dois CSVs são lidos do disco e mantidos em memória.
- A cada requisição, comparar o timestamp de modificação (`mtime`) dos dois arquivos com o valor em cache; só reler do disco se algum mudou. Isso evita reprocessar o CSV a cada interação do usuário, mas também evita precisar reiniciar o servidor quando alguém substitui `resultados.csv`.
- **Tratamento de erro obrigatório**, com mensagem amigável (nunca stack trace pro usuário):
  - Arquivo não encontrado → `"Arquivo {nome} não encontrado — coloque o arquivo em /data."`
  - Arquivo vazio (tamanho 0 ou sem linhas de dado) → `"O arquivo {nome} está vazio."` (ou, se for especificamente `resultados.csv` sem nenhuma resposta: `"O arquivo resultados.csv não contém nenhuma resposta."`)
  - Coluna esperada pelo dicionário ausente em `resultados.csv` → `"resultados.csv está sem N coluna(s) esperada(s) pelo dicionário: col1, col2, ... (até 5 nomes, com "…" se houver mais)."`
  - Qualquer um desses erros deve substituir a tela inteira por um estado de erro claro, nunca deixar a aplicação quebrar.

---

## 3. Motor de cálculo — regras de negócio

Esta é a parte mais crítica do sistema. Qualquer erro aqui compromete a confiança no relatório.

### 3.1 Reversão de itens de sentido invertido

Antes de qualquer cálculo, se o item está na lista de invertidos (seção 2.1):
- Domínio 1–4: `valor_revertido = 5 − valor`
- Domínio 1–5: `valor_revertido = 6 − valor`
- Nota 0–10: não há itens invertidos nesta escala atualmente.

### 3.2 Índice de favorabilidade por item (0–100)

Aplicado sobre o valor já revertido (quando aplicável):
- Escala 1–4: `índice = (valor − 1) / 3 × 100`
- Escala 1–5: `índice = (valor − 1) / 4 × 100`
- Nota 0–10: `índice = valor × 10`

O índice de um item é a **média** desses valores individuais entre todos os respondentes que responderam (branco excluído, nunca conta como 0). Se nenhum respondente do recorte respondeu a esse item, o item não entra em nenhuma agregação (é omitido, não vira zero).

### 3.3 Agregação hierárquica — sempre média simples, nunca soma, nunca ponderada

- **Índice da subseção** = média aritmética simples dos índices dos itens que a compõem (cada item pesa igual, não importa a escala/domínio original).
- **Índice da seção** = média aritmética simples dos índices das subseções que a compõem (uma subseção com mais perguntas não pesa mais que uma com menos).
- **Índice Geral** = média aritmética simples dos índices das **Seções 1 a 5** apenas.
- **A Seção 6 nunca entra nessa média.** É uma "nota de fechamento" à parte, calculada e exibida isoladamente (ver 3.6 sobre por quê).

### 3.4 Classificação (aplicada a qualquer índice — item, subseção, seção ou geral)

```
índice < 50        → "Ruim"
50 ≤ índice < 75    → "Bom"
índice ≥ 75         → "Excelente"
```

### 3.5 Filtros

Quatro dimensões, todas opcionais e combináveis livremente por **E lógico** (AND): `om`, `posto_graduacao`, `vinculo`, `escolaridade`. Cada uma aceita múltiplos valores selecionados simultaneamente (dentro da mesma dimensão, os valores se combinam por **OU lógico** — ex.: `om IN ["3º R C Mec", "9º RCB"]`). Sem nenhum filtro ativo, considera toda a base.

Todo recálculo é feito **sob demanda**, filtrando o dataset completo em memória e recalculando do zero — nunca usar um valor pré-calculado de um recorte fixo.

### 3.6 Seção 6 — por que é separada

A Seção 6 tem uma única pergunta numérica (`s6_nota_clima_geral`, nota 0–10, "de fechamento": "que nota você dá para o clima geral da sua OM hoje?"). Ela é: (a) excluída da lista de itens que entram no Índice Geral (seções 1-5), (b) calculada isoladamente como um "índice de item" simples (a média das notas, convertida para 0–100 via `valor × 10`), (c) sujeita à mesma regra de anonimato (3.7): se N < 5, não é exibida.

### 3.7 Regra de anonimato (a mais crítica do sistema) — três níveis

**Nível 1 — recorte completo.** Se o número de respondentes do recorte filtrado inteiro for `< 5`, a tela inteira (não um componente por vez) deve virar um único estado: `"Seleção sem dados suficientes (N=X)"`. Essa checagem acontece **antes** de qualquer outro cálculo/renderização, de forma centralizada — nunca delegada a cada componente individualmente. `LIMIAR_ANONIMATO = 5` está definido uma vez, reaproveitado em todos os pontos abaixo.

**Nível 2 — subseção.** Dentro de um recorte válido (N≥5 no total), se uma subseção específica tiver menos de 5 respondentes que responderam a **qualquer um** dos itens dela (`N = count(respondentes com pelo menos 1 resposta não-branca entre os itens da subseção)`), essa subseção:
- não mostra índice nem classificação (mostra "N insuficiente" no lugar);
- não entra na agregação da seção (a seção agrega só as subseções não-suprimidas; se **todas** as subseções de uma seção estiverem suprimidas, a seção inteira fica sem índice também);
- não pode ser citada na Leitura Interpretada (nem no parágrafo-síntese, nem nas listas de positivos/negativos);
- os textos qualitativos daquela subseção (seção 3.10) também ficam ocultos.

**Nível 3 — item individual** (refinamento aplicado na tela "Por Subseção", mais granular que a subseção): mesmo que a subseção como um todo tenha N≥5, uma pergunta específica dentro dela pode ter menos de 5 respostas (acontece sobretudo no bloco FUSEx, condicional). Nesse caso, aquela linha da tabela mostra "N insuficiente" (se `N` do item > 0) ou "Sem respostas" (se `N == 0`), mesmo que as outras perguntas da mesma subseção apareçam normalmente.

**Cálculo de N de uma subseção/bloco de itens:** não é a soma das respostas de cada item — é a contagem de respondentes distintos que responderam a **pelo menos um** dos itens do grupo (`df[colunas].notna().any(axis=1).sum()`).

### 3.8 Regra condicional — FUSEx

As 3 perguntas do bloco FUSEx só têm valor para quem é usuário/contribuinte; quem não usa deixa em branco. Como respostas em branco já são sempre excluídas do denominador (regra 3.2) e o N do bloco já conta só quem respondeu a pelo menos uma delas, essa regra é satisfeita automaticamente pelo mecanismo geral — não precisa de tratamento especial além disso.

### 3.9 Bloco de Jogos e Apostas — métrica de risco (calculada, atualmente não exibida na UI)

Além de entrar no índice da Seção 3 normalmente (já revertido, como qualquer item), o motor também calcula uma **prevalência bruta** por item do bloco: `% de respondentes que marcaram "Concordo" (3) ou "Concordo totalmente" (4) na escala 1-4, sem nenhuma reversão`. É calculada por item; a UI usaria o maior valor entre os 5 itens como "pior caso". Essa métrica:
- só é calculada se o bloco tiver N ≥ 5 (mesmo limiar de anonimato);
- é conceitualmente separada dos índices de satisfação — não deve ser misturada/mostrada com a mesma cor/escala de Ruim-Bom-Excelente, porque é uma taxa de prevalência de comportamento de risco, não uma nota.
- **Nota para quem for migrar**: essa métrica existia na interface (alerta amarelo "Indicador de risco") em versões anteriores e foi removida a pedido do usuário por decisão de produto — mas o cálculo ainda existe no motor. Decida no novo sistema se ela deve voltar a aparecer em algum lugar ou pode ser descartada.

### 3.10 Distribuição de respostas por item (drill-down)

Para itens de escala 1–4 (não se aplica a Nota, Frequência 1-5 nem Escala condicional), calcular a distribuição percentual das respostas **brutas** (sem reversão) nas 4 categorias, usadas no gráfico de barras divergentes (drill-down por clique — seção 6):
```
1 = "Discordo totalmente", 2 = "Discordo", 3 = "Concordo", 4 = "Concordo totalmente"
percentual[categoria] = count(valor == categoria) / total_respondido × 100
```
Só calculado se o total de respostas ao item for ≥ 5 (anonimato); caso contrário, o item simplesmente não aparece no drill-down.

### 3.11 Respostas qualitativas (textos)

Textos abertos e justificativas nunca entram em cálculo numérico. Agrupados por subseção, listados como lista simples (não nuvem de palavras). Respeitam a regra de anonimato: um texto só aparece se a subseção associada não estiver suprimida (nível 2 da regra 3.7); textos vazios/em branco são descartados antes de agrupar.

### 3.12 Ranking e comparação entre OMs

Para a tela "Por Organização Militar": recalcular o motor inteiro **uma vez por OM**, aplicando os demais filtros ativos (posto/vínculo/escolaridade) primeiro e depois restringindo a cada OM individualmente. Cada OM é avaliada de forma independente e sujeita à mesma regra de anonimato — uma OM com poucos respondentes no recorte simplesmente não aparece no ranking/heatmap, com um aviso informando quantas ficaram de fora e quais.

---

## 4. Leitura Interpretada — motor de texto determinístico

**Princípio fundamental: 100% gerado por template, zero IA/LLM.** Isso é proposital — o texto nunca pode dizer algo que os números não sustentem, e precisa ser auditável/determinístico.

### 4.1 Estrutura de saída

Para cada "leitura" (pode haver mais de uma por tela — ver 4.6):
```
{
  cabecalho: string,       // nome do recorte
  paragrafo: string,       // 1 parágrafo síntese
  positivos: [             // lista de grupos, cada um por Seção
    { secao: "Seção 2", pontos: [ { subsecao: "Carreira", classificacao: "Excelente" }, ... ] },
    ...
  ],
  negativos: [ ... mesma estrutura, mas classificacao sempre "Ruim" ],
  suficiente: bool,        // false = recorte com N<5, sem dados pra mostrar
  n_total: number,
}
```
**Importante:** os grupos de positivos/negativos são dados estruturados, não texto pronto — a interface é quem monta a frase e aplica cor a cada classificação (ver 6.4 sobre por quê).

### 4.2 Cabeçalho / nome do escopo

```
sem nenhum filtro ativo → "Brigada — todos os militares"
com filtros → junta as partes ativas, separadas por vírgula, nesta ordem:
  1. valores de OM selecionados (sem rótulo), ex.: "7º R C Mec" ou "3º R C Mec, 9º RCB"
  2. "posto: " + valores de posto selecionados
  3. "vínculo: " + valores de vínculo selecionados
  4. "escolaridade: " + valores de escolaridade selecionados
```
Exemplo: filtros om=["7º R C Mec"], posto=["Sargento"] → `"7º R C Mec, posto: Sargento"`.

### 4.3 Parágrafo-síntese

Template fixo, com 4 variações dependendo de haver ou não um destaque positivo (melhor subseção Excelente) e/ou negativo (pior subseção Ruim) no recorte:

```
Base: "Com os filtros aplicados, o clima apresentou índice geral de {indice} ({classificacao})"

+ com melhor E pior:  base + ", impulsionado por bons resultados em {melhor}, mas prejudicado por {pior}, que exige atenção."
+ só com melhor:      base + ", impulsionado por bons resultados em {melhor}."
+ só com pior:        base + ", mas prejudicado por {pior}, que exige atenção."
+ nenhum dos dois:     base + "."
```

**"Melhor"** = entre todas as subseções não-suprimidas classificadas Excelente, a de maior índice. **"Pior"** = entre as classificadas Ruim, a de menor índice.

**Critério de desempate** (para melhor E para pior): se dois ou mais estão empatados no valor extremo, vence o que aparece primeiro na ordem do instrumento (a mesma ordem de `dicionario.csv`, seção 1→6, topo a baixo). Regra simples, 100% determinística — nunca sorteio nem ordem alfabética.

### 4.4 Listas de Positivos e Negativos

- **Negativos**: todas as subseções não-suprimidas classificadas "Ruim" (não há corte de quantidade — mostra todas), agrupadas por Seção pai, ordenadas dentro do grupo e entre grupos pela ordem do instrumento.
- **Positivos**: mesma lógica, para "Excelente".
- **Fallback quando a lista está vazia**: mostrar o texto `"Nenhum ponto crítico identificado nesta seleção."` (negativos) ou `"Nenhum destaque positivo identificado nesta seleção."` (positivos) — apenas quando **não há nenhum grupo**, não por seção individual.
- Subseções suprimidas (regra 3.7 nível 2) nunca aparecem em nenhuma lista, nem no parágrafo-síntese.

> Nota histórica: numa versão anterior essas listas eram limitadas a 3 itens com um resumo "+N outros pontos críticos". Isso foi removido a pedido do usuário — a versão atual sempre mostra a lista completa, sem corte.

### 4.5 Recorte com dados insuficientes

Se o N do recorte (ou do recorte individual, ver 4.6) for < 5: `suficiente = false`, `paragrafo = "Dados insuficientes para leitura interpretada nesta seleção."`, `positivos = []`, `negativos = []`. O cabeçalho ainda é calculado normalmente (mostra qual seria o escopo).

### 4.6 Comparação individual quando um filtro tem múltiplos valores ("eixo de comparação")

Comportamento importante e não-óbvio: quando o usuário seleciona **mais de um valor na mesma dimensão de filtro** (ex.: duas OMs ao mesmo tempo), a Leitura Interpretada **não gera uma única leitura combinada misturando as duas**. Em vez disso:

1. Percorra as 4 dimensões de filtro nesta ordem de prioridade: `om`, `posto_graduacao`, `vinculo`, `escolaridade`.
2. A primeira dimensão que tiver **mais de 1 valor selecionado** vira o "eixo de comparação".
3. Se nenhuma dimensão tiver mais de 1 valor selecionado (0 ou 1 valor em cada), gera **uma única leitura combinada**, exatamente como se não houvesse eixo (comportamento padrão).
4. Se houver um eixo, gera **uma leitura por valor daquele eixo**, mantendo as outras dimensões de filtro fixas nos valores atuais. Ex.: om=["3º R C Mec", "9º RCB"], vinculo=["De Carreira"] → gera 2 leituras: uma com `om=["3º R C Mec"], vinculo=["De Carreira"]`, outra com `om=["9º RCB"], vinculo=["De Carreira"]`. Cada uma é 100% independente (inclusive quanto à regra de anonimato — uma pode ter N suficiente e a outra não).
5. Só a **primeira** dimensão com múltiplos valores vira eixo (se OM e posto tiverem múltiplos valores ao mesmo tempo, só OM vira eixo de comparação; os múltiplos postos ficam combinados por OU dentro de cada leitura, normalmente).

Na interface, quando há mais de uma leitura, mostrar um aviso explicando a comparação e renderizar os painéis lado a lado (ou empilhados), um por valor do eixo.

### 4.7 Erro de português evitado deliberadamente

Uma versão anterior usava frases tipo `"A {nome_do_recorte} precisa de atenção para {subseção}."` — isso quebrava quando o recorte era o nome de uma OM cujo substantivo é masculino (ex.: "7º R C Mec" = Regimento, masculino, mas a frase usava sempre "A"). A solução atual evita esse problema: as frases/grupos sempre usam **"Seção"** como sujeito gramatical (sempre feminino, sempre correto), nunca o nome do recorte/OM como sujeito de uma frase que exige artigo definido. **Ao reimplementar, não reintroduza frases com artigo (o/a) concordando com o nome de uma OM — é uma fonte real de erro gramatical porque os substantivos das OMs têm gêneros variados** (Regimento/Batalhão/Grupo/Esquadrão/Pelotão são masculinos; Companhia/Bateria são femininos).

---

## 5. Estrutura da interface

### 5.1 Cabeçalho (fixo, visível em toda tela)

- Logo (`simbolo BDA.png`, ~64px de altura) à esquerda.
- Título "Braço Forte, Abraço Amigo" + subtítulo "Dashboard de Clima Organizacional — 3ª Brigada de Cavalaria Mecanizada".
- À direita: botão/elemento **"📊 Critérios"** — ao passar o mouse (hover, não clique), mostra um popover explicando:
  - que cada resposta vira um índice de 0 a 100 (0 = pior, 100 = melhor), com itens invertidos revertidos antes;
  - que a agregação é por média simples sem peso (item → subseção → seção → Índice Geral, seções 1-5; Seção 6 é nota de fechamento à parte);
  - as 3 faixas de classificação com um marcador de cor cada: Ruim (0 a 49), Bom (50 a 74), Excelente (75 a 100) — usando as cores reais do app (seção 8).
- Também à direita, ao lado do anterior: botão **"📄 Baixar formulário"** — download direto do `formulario.pdf`, com nome de arquivo amigável (`Formulario_Pesquisa_Clima_3BdaCMec.pdf`). Deve ser um link real (fazer o browser navegar/baixar de verdade), não uma ação só client-side.
- Fundo verde escuro institucional (ver paleta, seção 8).

### 5.2 Painel de filtros (persistente, sticky no topo, abaixo do cabeçalho)

- 4 seletores múltipla-escolha lado a lado: Organização Militar, Posto/Graduação, Vínculo, Escolaridade. Todos opcionais, combináveis (regra 3.5).
- Abaixo dos seletores: uma linha de **chips** — um por valor de filtro ativo (ex.: "OM: 7º R C Mec ×"), cada um com um "×" que remove só aquele valor específico. Se nenhum filtro ativo, mostra texto "Nenhum filtro ativo — exibindo a Brigada inteira."
- Botão **"Limpar tudo"** ao lado dos chips, sempre visível, zera os 4 filtros de uma vez.
- **Cross-filtering**: qualquer mudança em qualquer filtro recalcula instantaneamente tudo o que está na tela, sem botão "aplicar" separado.

**Cuidado de implementação (armadilha real que já ocorreu neste projeto):** se os chips forem componentes recriados do zero a cada mudança de filtro, tome cuidado para que o evento de "remover chip" não dispare acidentalmente ao simples fato de o componente ser recriado (sem clique real do usuário) — isso fazia o filtro se autozerar assim que era selecionado. Sempre confirme que a remoção só acontece em resposta a um clique de verdade (ex.: checando se o evento carrega um valor verdadeiro/incremento de clique, não apenas "o elemento existe/mudou").

### 5.3 Navegação por abas

Seis abas, nesta ordem: **Visão Geral · Por Seção · Por Subseção · Por Organização Militar · Respostas Qualitativas · Perfil dos Respondentes**.

### 5.4 Regra de anonimato de nível 1 se aplica a qualquer aba

Antes de renderizar o conteúdo de **qualquer** aba, checar o N do recorte filtrado atual. Se < 5, substituir todo o conteúdo da aba por: `"Seleção sem dados suficientes (N=X)"` (alerta, cor de aviso). Essa checagem é feita uma vez, de forma centralizada, antes de qualquer lógica específica de aba.

---

## 6. Especificação de cada aba

### 6.1 Visão Geral

Layout, de cima para baixo:
1. Linha com "N = {n_total} respondentes no recorte atual" à esquerda, e à direita os controles de exportação: seletor PDF/Word + botão "Exportar" (ver seção 9).
2. Linha com duas colunas:
   - **Coluna esquerda**: o gráfico velocímetro (gauge) do Índice Geral (ver 8.1), e logo abaixo um card "🎯 Resultado Geral" no mesmo estilo visual dos cards de seção — mostrando o **mesmo valor e classificação** que estão no gauge, só que no formato número + tag colorida (ver 6.1.1).
   - **Coluna direita**: um card por Seção (1 a 5, mais a Seção 6 no mesmo grupo/linha — não separada) — ver 6.1.1.
3. Um ou mais painéis de "Leitura Interpretada" (seção 4) — um só se não houver eixo de comparação ativo, ou vários lado a lado se houver (seção 4.6), com um aviso explicando a comparação.

#### 6.1.1 Card de seção (usado 5-6 vezes na Visão Geral)

Conteúdo, de cima a baixo, centralizado:
- Ícone da seção (emoji — ver tabela de metadados abaixo)
- Nome curto da seção em maiúsculas pequenas (ex.: "SEÇÃO 1")
- Título por extenso, em negrito (ex.: "Assuntos Pessoais")
- Subtítulo/descrição curta do que a seção cobre, em cinza pequeno (altura mínima reservada para não desalinhar os cards entre si)
- Número do índice, grande, colorido pela classificação
- Tag/badge com o texto da classificação ("Ruim"/"Bom"/"Excelente"/"N insuficiente"), com **fundo preenchido** na cor da classificação e texto branco (essa é a única tela onde a tag tem fundo colorido — nas outras telas é só texto colorido, ver 8.2)
- Uma borda superior de 4px na cor da classificação
- Efeito visual ao passar o mouse: leve elevação (deslocamento vertical) + sombra mais forte (ver seção 8.5)

**Metadados por seção** (usados aqui e em outras telas — título/subtítulo extraídos literalmente do formulário):

| Seção | Ícone | Título | Subtítulo |
|---|---|---|---|
| Seção 1 | 🧑‍🤝‍🧑 | Assuntos Pessoais | Situação familiar, rotina, qualidade de vida e vida fora do quartel. |
| Seção 2 | 🛠️ | Profissional / Trabalho | Condições de trabalho, alimentação, ambiente, reconhecimento e carreira. |
| Seção 3 | 🧠 | Saúde Emocional e Bem-estar | Estado emocional, apoio psicológico, FUSEx e jogos/apostas. |
| Seção 4 | 💰 | Financeiro | Situação financeira, soldo, moradia, deslocamento e estabilidade. |
| Seção 5 | 📋 | Comunicação Interna | Hierarquia, disciplina, comunicação, reuniões, formaturas e escalas. |
| Seção 6 | ⭐ | Avaliação Geral | Nota de fechamento para o clima da Organização Militar. |

Se uma seção não tiver índice (todas subseções suprimidas), mostrar "N insuficiente" no lugar do número/tag.

### 6.2 Por Seção

Um card por Seção (1 a 5 — a Seção 6 não aparece aqui, ela só tem 1 pergunta e já é coberta na Visão Geral), cada um com:
- Título: `"{nome da seção} — {índice formatado} ({classificação ou 'N insuficiente'})"`.
- **Tabela de subseções** (colunas: Subseção | N | Índice | Classificação) à esquerda.
- **Gráfico de barras horizontais** por subseção à direita (ver 8.2), ordenado do pior para o melhor índice, colorido por classificação.
- Efeito de hover no card inteiro.

**Drill-down por clique**: clicar numa barra de subseção no gráfico abre, no topo da aba (acima de todos os cards), um painel "Distribuição de respostas — {seção} / {subseção}" com um gráfico de barras divergentes (seção 8.4) para cada item de escala 1-4 daquela subseção que tiver dados suficientes (itens de Nota/Frequência/Escala-condicional não entram nesse drill-down — só escala 1-4 simples). Um texto de instrução ("Clique numa barra de subseção para ver a distribuição de respostas por item.") fica sempre visível no topo da aba. Trocar de aba deve limpar essa seleção.

### 6.3 Por Subseção

1. Um seletor (dropdown, sempre visível nesta aba, único valor selecionado por vez) com as 5 seções (rótulo: `"{Seção N} — {Título}"`), pré-selecionado na primeira.
2. Cabeçalho da seção escolhida: ícone + nome + título, e o subtítulo/descrição.
3. Um card por subseção daquela seção, cada um com:
   - Cabeçalho: nome da subseção, `N=X`, e (se não suprimida) `Índice X` + tag de classificação.
   - Se a subseção estiver suprimida (N<5): um alerta `"Seleção sem dados suficientes (N=X)"` no lugar da tabela.
   - Senão: **uma tabela por pergunta** daquela subseção (colunas: Pergunta | N | Índice | Classificação), usando a descrição da pergunta (campo `descricao` do dicionário) como rótulo. Cada linha individual também obedece a regra de anonimato de nível 3 (3.7): pergunta com N<5 mostra "N insuficiente" (se teve alguma resposta) ou "Sem respostas" (se zero), mesmo que a subseção como um todo tenha passado no limiar.

Trocar a seção no seletor (ou mudar qualquer filtro global) recalcula essa tela inteira instantaneamente.

### 6.4 Por Organização Militar

1. Texto de instrução: "Clique numa barra de OM para aplicá-la como filtro."
2. Duas colunas lado a lado, cada uma num card com efeito de hover:
   - **Ranking por OM — Índice Geral**: gráfico de barras horizontais, uma barra por OM, ordenado do pior para o melhor Índice Geral daquela OM (considerando os outros filtros ativos, exceto OM). OMs sem dados suficientes (N<5) simplesmente não aparecem no gráfico.
   - **Heatmap OM × Seção**: linhas = OMs, colunas = Seções 1-5 (rótulo da coluna = `"{Seção N} — {Título}"`), cor de cada célula = classificação daquela seção para aquela OM (não um degradê contínuo — 3 cores discretas, uma por classificação). Ao passar o mouse numa célula, mostrar OM, seção, descrição da seção, índice e classificação.
3. Se alguma OM ficou de fora por N<5, um aviso pequeno abaixo listando quantas e quais (ex.: "2 OM(s) sem dados suficientes no recorte atual e não exibidas: 25º GAC, 3º Pel PE.").

**Drill-down por clique**: clicar numa barra do ranking adiciona aquela OM ao filtro global de OM (soma-se às já selecionadas, não substitui).

### 6.5 Respostas Qualitativas

Um card por subseção que tenha pelo menos um texto não-vazio no recorte atual (respeitando a regra de anonimato de nível 2 — subseções suprimidas não aparecem aqui). Cada card:
- Título: `"{subseção} ({N} respostas)"`.
- Lista simples (bullets), uma por resposta de texto — **não** nuvem de palavras, **não** agrupado por pergunta individual dentro da subseção (agrupa todas as perguntas de texto daquela subseção juntas).

Se não houver nenhum texto disponível no recorte: alerta "Nenhuma resposta qualitativa disponível para este recorte."

### 6.6 Perfil dos Respondentes

Composição demográfica do recorte atual: 4 gráficos de rosca (donut), um por dimensão de filtro (Organização Militar, Posto/Graduação, Vínculo, Escolaridade), lado a lado (2 colunas × 2 linhas). Ver 8.6 sobre a especificação do donut. Mostra também "N = {n_total} respondentes no recorte atual" no topo.

---

## 7. Interações e navegação (resumo)

| Ação | Efeito |
|---|---|
| Mudar qualquer filtro | Recalcula tudo na aba atual instantaneamente (sem botão aplicar) |
| Clicar "×" num chip | Remove só aquele valor daquele filtro |
| Clicar "Limpar tudo" | Zera os 4 filtros |
| Clicar numa barra de subseção (aba Por Seção) | Abre drill-down de distribuição por item, no topo da aba |
| Clicar numa barra de OM (aba Por OM) | Adiciona aquela OM ao filtro global de OM |
| Trocar de seção no seletor (aba Por Subseção) | Recarrega as tabelas de perguntas daquela seção |
| Trocar de aba | Fecha qualquer drill-down aberto |
| Passar o mouse em "Critérios" (cabeçalho) | Mostra popover explicando o cálculo |
| Passar o mouse num card de seção / card com gráfico | Leve elevação + sombra (feedback visual, sem mudar dados) |
| Clicar "Baixar formulário" | Baixa o PDF em branco |
| Escolher PDF/Word + "Exportar" (Visão Geral) | Baixa relatório com o recorte de filtros exato daquele momento |

---

## 8. Identidade visual e especificação dos gráficos

### 8.1 Paleta de cores

```css
--verde-primario: #2E4B2E;   /* institucional, cabeçalho/chips */
--verde-escuro:   #1C331E;   /* cabeçalho, títulos de seção nos relatórios */
--ruim:           #BF6A5D;   /* vermelho suave — não o vermelho vivo original */
--bom:            #79D678;   /* verde claro/suave — deliberadamente mais claro que o do Excelente */
--excelente:      #4CAF50;   /* verde pleno */
--cinza-claro:    #F4F4F2;   /* fundo geral da página */
--cinza-texto:    #333333;   /* texto padrão dos gráficos */
--cinza-neutro:   #9E9E9E;   /* usado quando classificação é null/"N insuficiente" */
```

Regra de cor: **qualquer** número de índice ou tag/texto de classificação em qualquer tela usa a cor correspondente da classificação (`cor_classificacao(classificacao)`), com `#9E9E9E` (cinza) quando a classificação é `null`/"N insuficiente". As únicas exceções à "só cor, sem contorno/borda extra" são: (a) a borda superior de 4px nos cards de seção e "Resultado Geral", e (b) o fundo preenchido nas tags de classificação **só** na Visão Geral (seção 6.1.1) — nas demais telas (Por Seção, Por Subseção, Leitura Interpretada) as classificações aparecem como **texto colorido puro**, sem fundo nem contorno.

**Paleta categórica** (só para os donuts de perfil demográfico, identidade sóbria — não é "arco-íris"):
```
#2E4B2E, #B8860B, #4A6FA5, #C0392B, #7A6C5D, #8FA88F, #9E9E9E, #5B3A29
```
Se uma dimensão tiver mais de 7 categorias, agrupar as menores como "Outros" (mantendo as 6 maiores nominalmente + "Outros" como 7ª fatia).

**Escala divergente** (barras de distribuição, seção 8.4), 4 cores fixas nesta ordem (Discordo totalmente → Concordo totalmente):
```
#BF6A5D (mesma cor de Ruim), #E8C4BC (tom claro/dessaturado), #C7E3C8 (tom claro/dessaturado), #4CAF50 (mesma cor de Excelente)
```

Fonte: `Helvetica, Arial, sans-serif` em todos os gráficos. Fundo dos gráficos: branco.

### 8.2 Barras horizontais (Por Seção — subseções; Por OM — ranking)

- Orientação horizontal, uma barra por subseção/OM.
- Ordenadas do menor para o maior índice (pior no topo ou embaixo, dependendo da lib — o importante é a ordem crescente por valor).
- Cor de cada barra = cor da classificação (subseções suprimidas em cinza `#D9D9D9`, com rótulo "N insuf." em vez do valor).
- Rótulo de valor fora da ponta da barra (formatado PT-BR, seção 10).
- Eixo X fixo de 0 a ~108 (dá espaço para o rótulo não cortar no 100).
- Sem borda nas barras, gap entre barras (`bargap` ≈ 0.3–0.35).
- Grade do eixo em cinza bem claro (`#EDEDED`).
- Altura da figura proporcional à quantidade de barras (mínimo ~220-280px).

### 8.3 Velocímetro (gauge) do Índice Geral

- Semicírculo, faixa 0 a 100.
- Agulha/barra do valor atual colorida pela classificação do índice geral.
- 3 faixas de fundo (steps), nas mesmas cores de Ruim/Bom/Excelente só que com opacidade ~0.4 (mais claras que a barra, para não competir visualmente): 0-50, 50-75, 75-100.
- Linha de "threshold" na cor da classificação, marcando o valor exato.
- Número grande no centro/topo com o valor do índice.
- **Legenda das 3 faixas no topo da figura** (acima do mostrador, não embaixo): "Ruim (0–49)", "Bom (50–74)", "Excelente (75–100)", cada uma na cor correspondente. Isso exige "encolher" o desenho do próprio gauge para a parte de baixo da figura (deixar ~18% do topo livre para a legenda) — se a lib de gráficos escolhida não suportar bem legendas dentro do SVG do gauge, uma alternativa aceitável é uma legenda HTML/CSS separada logo acima do gráfico.
- Altura da figura ≈ 290px.

### 8.4 Barras divergentes (drill-down de distribuição de um item, escala 1-4)

- Uma "barra" horizontal única, dividida em segmentos: da esquerda para o centro (valores negativos no eixo X, empilhados) = "Discordo totalmente" (mais externo) + "Discordo"; do centro para a direita = "Concordo" + "Concordo totalmente".
- Cores fixas na ordem da escala divergente (8.1).
- Rótulo de percentual dentro de cada segmento, só se o segmento for grande o suficiente (> 3%) pra não poluir.
- Eixo X sem números visíveis (só uma linha de zero no centro) — os percentuais já aparecem dentro dos segmentos.
- Legenda horizontal acima do gráfico, com os 4 nomes de categoria.
- Um gráfico desses por item da subseção clicada (pode haver vários empilhados verticalmente).

### 8.5 Heatmap OM × Seção

- Linhas = OMs (ordem alfabética), colunas = Seções 1-5.
- Célula = cor discreta por classificação (não gradiente contínuo — mapear Ruim/Bom/Excelente para 3 pontos de uma escala de cor categórica, ex. 0/0.5/1).
- Célula sem dados suficientes = vazia/cinza, texto "—".
- Texto dentro de cada célula = índice formatado (ou "—").
- Rótulos do eixo X = `"{Seção N} — {Título}"` completo (pode precisar de rotação, ex. -20°, para caber).
- Tooltip ao passar o mouse: OM, nome+título da seção, descrição da seção, índice, classificação.
- Gap de 2px entre células (linhas de grade finas, cor de fundo aparecendo entre elas).

### 8.6 Donut / pizza (Perfil dos Respondentes)

- Um por dimensão categórica (OM, posto, vínculo, escolaridade).
- "Buraco" central grande (~55% do raio).
- Paleta categórica (8.1), agrupando o excedente além de 7 categorias como "Outros".
- Rótulo de percentual fora de cada fatia.
- Borda branca de 2px entre fatias.
- Legenda visível.
- Título do gráfico = nome da dimensão.

### 8.7 Efeito de hover (cards)

Em cards de seção (Visão Geral) e cards que envolvem gráficos (Por Seção, ranking/heatmap de Por OM): ao passar o mouse, uma leve elevação (deslocar ~4px para cima) + sombra mais pronunciada, com transição suave (~0.18s). Efeito puramente decorativo via CSS (`:hover`), não deve alterar nenhum dado nem estado.

---

## 9. Exportação de relatório (PDF/Word)

Botão "Exportar" na Visão Geral, com um seletor PDF/Word ao lado. Gera o arquivo **exatamente a partir do recorte de filtros ativo no momento do clique** (recalcula do zero, não reaproveita nada da tela) — usa a leitura interpretada **combinada** (não a versão com eixo de comparação de múltiplas leituras, mesmo que a tela esteja mostrando várias). Conteúdo do documento, nesta ordem:

1. Brasão (se o arquivo de imagem existir) + título "Braço Forte, Abraço Amigo" + subtítulo do dashboard.
2. "Recorte: {cabeçalho da leitura interpretada}".
3. "Gerado em {data/hora atual, formato dd/mm/aaaa hh:mm} — N = {n_total} respondentes".
4. "Índice Geral: {valor} — {classificação}", em destaque, colorido pela classificação.
5. Seção "Leitura Interpretada": parágrafo-síntese, depois "Positivos" e "Negativos" — cada um, se tiver grupos, mostrando `"{Seção} — {Título}"` em negrito seguido de uma lista com marcadores `"{subseção} — {classificação em negrito e colorida}"`; se vazio, o texto de fallback (seção 4.4).
6. Tabela "Índices por Seção e Subseção": uma linha em destaque (fundo diferenciado, negrito) por Seção, seguida das linhas de suas subseções (indentadas), colunas N/Índice/Classificação — classificação colorida (cinza se suprimida).
7. Se houver Seção 6 calculável: linha final "Seção 6 — Avaliação Geral (nota de fechamento): {valor} ({classificação})".

Nome do arquivo sugerido: `relatorio_clima_{data-de-hoje-ISO}.pdf` ou `.docx`.

---

## 10. Formatação numérica e de data (PT-BR)

Centralizar numa única função reaproveitada em toda a aplicação, para nunca haver inconsistência entre telas:
- **Separador decimal**: vírgula. Ex.: índice `52.3` → exibir `"52,3"`.
- **Separador de milhar**: ponto, quando aplicável.
- **Índice**: sempre 1 casa decimal; `null`/indisponível → exibir `"—"` (travessão).
- **Percentual**: mesma regra + sufixo `%`.
- **Datas**: `dd/mm/aaaa`.

---

## 11. Requisitos não funcionais

1. **Desempenho**: recálculo de filtro deve responder em menos de ~500ms mesmo com a base inteira carregada (centenas de linhas — não é um requisito pesado, só não fazer nada absurdamente ineficiente tipo reler o CSV do zero a cada clique).
2. **Segurança de dados sensíveis, mesmo sem autenticação**: o arquivo de respostas brutas nunca deve ser versionado em controle de código-fonte nem exposto por nenhuma rota estática/endpoint — só os dados já agregados pelas regras da seção 3.
3. **Sem infraestrutura pesada**: idealmente continua rodando como um site estático ou um servidor simples, sem exigir banco de dados.
4. **Separação entre motor de cálculo e fonte de dados**: a lógica de negócio (seção 3-4) deveria ser isolável do "como os dados chegam" (hoje, um CSV lido inteiro na inicialização) — facilita trocar por outra fonte no futuro sem reescrever as regras.
5. **Idioma**: toda a interface, mensagens de erro e formatação numérica em português do Brasil.
6. **Fora de escopo, deliberadamente**: autenticação/login, múltiplos usuários simultâneos com permissões diferentes, upload de planilha pela própria interface (hoje é substituição manual do arquivo), gráfico de tendência histórica (não há múltiplas edições da pesquisa ainda), gráfico radar/aranha, internacionalização.

---

## 12. Sugestão de organização para a versão JS/HTML/CSS

Não é uma exigência rígida, mas uma sugestão de como preservar a mesma separação de responsabilidades que existe hoje (`engine/` vs. `ui/`):

- **Camada de dados/motor** (equivalente a `engine/`): módulo(s) JS puro(s), sem DOM, testável isoladamente — parsing do dicionário, cálculo de índices/agregação/classificação, motor de leitura interpretada. Ideal: funções puras que recebem dados e devolvem estruturas (não manipulam a tela diretamente), do jeito que `engine/compute.py` e `engine/interpretacao.py` fazem hoje.
- **Camada de apresentação**: renderização HTML/CSS + gráficos (alguma lib de gráficos client-side equivalente ao Plotly, ex. Chart.js/D3/ECharts — os tipos de gráfico necessários estão todos na seção 8), tratando cliques/hover/filtros.
- **Parsing de CSV no navegador**: ler `resultados.csv`/`dicionario.csv` (via fetch + parser CSV) uma vez no carregamento, manter em memória (equivalente ao cache por mtime — no navegador pode ser simplesmente "carrega uma vez por sessão", ou reler via um botão de atualizar caso o arquivo mude no servidor).
- Considerar testes automatizados (equivalente aos 46 testes Pytest atuais) cobrindo pelo menos: cálculo de índice com reversão, agregação hierárquica sem peso, as 3 regras de anonimato, e o motor de leitura interpretada (parágrafo-síntese com as 4 variações, desempate, comparação por eixo de filtro).

---

## 13. Referência rápida de constantes

```
LIMIAR_ANONIMATO = 5
Faixas de classificação: Ruim [0,50) · Bom [50,75) · Excelente [75,100]
Cores: Ruim #BF6A5D · Bom #79D678 · Excelente #4CAF50 · neutro/N-insuficiente #9E9E9E
Verde institucional: #2E4B2E (primário) / #1C331E (escuro)
```
