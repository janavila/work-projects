# Dashboard de Clima Organizacional — 3ª Brigada de Cavalaria Mecanizada

> **Este README descreve a v1 (aplicação estática, sem login).**
> A partir da v2 o sistema tem servidor Express + MySQL, login obrigatório,
> permissão por Organização Militar e upload de bases de dados pela interface.
> Para instalar e operar a versão atual, use **[README_V2.md](README_V2.md)**.
> As instruções de `node server.js` e de atualização manual de CSV abaixo
> valem apenas como registro histórico — o `server.js` está travado na v2.

Aplicação estática (HTML/CSS/JavaScript puro, sem framework, sem build) que lê
`data/dicionario.csv` e `data/resultados.csv`, calcula os índices de favorabilidade
e exibe o dashboard interativo descrito em `MIGRACAO_JS.md`.

Não há backend/banco de dados: todo o cálculo acontece no navegador de quem acessa
a página. O `server.js` incluído serve apenas os arquivos estáticos para que
outros computadores da rede consigam acessar pelo navegador.

## Estrutura do projeto

```
index.html          página única do dashboard
css/styles.css       identidade visual (paleta, cards, gráficos)
js/
  csv-parser.js       parser de CSV genérico
  constants.js         cores, limiares, metadados de seção (regras fixas)
  dictionary.js         parsing de dicionario.csv → estrutura Seção/Subseção/Item
  format.js              formatação PT-BR (números, datas, escape de HTML)
  engine.js                motor de cálculo (índices, agregação, anonimato)
  interpretation.js         motor de leitura interpretada (texto determinístico)
  charts.js                  wrappers ECharts (gauge, barras, heatmap, donut)
  export.js                   exportação de relatório PDF/Word
  app.js                       orquestração: filtros, abas, carga de dados
  tabs/*.js                     uma aba por arquivo
vendor/               bibliotecas de terceiros baixadas localmente (ECharts,
                        jsPDF, docx.js, FileSaver) — a aplicação funciona 100%
                        offline, sem precisar de internet depois de instalada
scripts/
  preprocessar_resultados.js   converte a exportação bruta do formulário
                                 (Google Forms/CTA) em data/resultados.csv
data/
  dicionario.csv        dicionário de variáveis (não sensível)
  resultados_cta.csv      exportação bruta do formulário — DADO SENSÍVEL
                            (tem ID/nome/timestamp), nunca commitar/expor
  resultados.csv          respostas já pré-processadas (o dashboard lê este
                            arquivo) — DADO SENSÍVEL, nunca commitar/expor
  meta.json                gerado junto com resultados.csv: período de
                             apuração (data da 1ª e da última resposta) e
                             total de respondentes — exibido no cabeçalho
  formulario.pdf            formulário em branco, disponível para download
assets/
  simbolo_bda.png          (opcional) brasão da Brigada — se ausente, o
                             cabeçalho e a exportação simplesmente omitem o logo
server.js            servidor HTTP estático, sem dependências, para hospedar na rede
```

## Como rodar localmente

Requer apenas o [Node.js](https://nodejs.org) instalado (qualquer versão
recente) — não precisa de `npm install`, o servidor não usa nenhuma dependência
externa.

```bash
node server.js
```

Isso sobe o servidor em `http://localhost:8080/`. Para usar outra porta:

```bash
node server.js 3000
# ou
PORT=3000 node server.js
```

## Como disponibilizar para os outros computadores da rede

1. Copie a pasta inteira do projeto para um computador que ficará ligado
   (o "servidor") e que esteja na mesma rede local dos demais.
2. Nesse computador, rode `node server.js` (ou `node server.js 8080`).
3. Descubra o IP local dessa máquina:
   - Windows: `ipconfig` (campo "Endereço IPv4")
   - Linux/Mac: `ifconfig` ou `ip addr` (algo como `192.168.x.x`)
4. Nos demais computadores da rede, basta abrir o navegador e acessar:

   ```
   http://<IP-do-servidor>:8080/
   ```

   Não é preciso instalar nada nos computadores que só vão *acessar* o
   dashboard — só o computador que vai *hospedar* precisa do Node.js.

5. Para manter o servidor rodando de forma permanente (mesmo após fechar o
   terminal), no Windows use o Agendador de Tarefas ou rode como serviço; no
   Linux/Mac, use `nohup node server.js &`, `screen`/`tmux`, ou configure um
   serviço `systemd`/`launchd`. Isso é opcional — para uso esporádico, deixar o
   terminal aberto com `node server.js` já é suficiente.

### Firewall

Se outros computadores não conseguirem acessar, confira se o firewall do
computador-servidor está bloqueando a porta escolhida (8080 por padrão) — pode
ser necessário liberar conexões de entrada nessa porta para a rede local.

## Atualizando os dados da pesquisa

O dashboard lê `data/resultados.csv`, mas esse arquivo **não** é a exportação
bruta do formulário — é o resultado de um pré-processamento. Para atualizar
com uma nova rodada de respostas:

1. Exporte as respostas do formulário (Google Forms/CTA) como CSV e salve em
   `data/resultados_cta.csv` (mantendo esse nome, sobrescrevendo o anterior).
2. Rode o script de pré-processamento:

   ```bash
   node scripts/preprocessar_resultados.js
   ```

   Ele lê `data/resultados_cta.csv`, descarta as colunas identificáveis ("ID
   do usuário", "Nome de exibição do usuário", "Registro de Tempo"), converte
   cada resposta para o formato codificado do dicionário (ex.: "3 - Concordo"
   → `3`) e grava o resultado em `data/resultados.csv` — que é o arquivo que
   o dashboard efetivamente carrega.
3. Não é preciso reiniciar o servidor — cada navegador recarrega os dados
   direto do disco a cada vez que a página é aberta (o servidor envia
   `Cache-Control: no-store` para os arquivos de `data/`), então basta pedir
   para os usuários darem F5.

Se o formulário mudar (pergunta nova, removida ou reordenada), o script para
com um erro explicando o que não bateu — nesse caso o mapeamento de colunas
dentro de `scripts/preprocessar_resultados.js` (constante `MAPA_COLUNAS`)
precisa ser revisado antes de rodar de novo.

Se preferir, `data/dicionario.csv` também pode ser substituído diretamente
(sem passar pelo script) — ele já vem no formato que o dashboard espera.

## Segurança do dado sensível

`resultados.csv` contém respostas individuais sobre saúde emocional, apostas e
situação financeira. O dashboard nunca expõe essa tabela bruta em nenhuma
tela — apenas os índices já agregados, respeitando sempre o limiar de
anonimato de 5 respondentes (seção 3.7 de `MIGRACAO_JS.md`). Mesmo assim:

- `resultados_cta.csv` (exportação bruta do formulário) é ainda mais sensível
  que `resultados.csv`, pois inclui "ID do usuário", "Nome de exibição do
  usuário" e "Registro de Tempo" — dados identificáveis que o script de
  pré-processamento remove ao gerar `resultados.csv`. Trate os dois arquivos
  com o mesmo cuidado.
- Não hospede esta pasta em um servidor exposto à internet — é para uso
  **somente na rede interna**.
- Não versione `data/resultados.csv` nem `data/resultados_cta.csv` em nenhum
  sistema de controle de versão
  público.

## Logo da Brigada (opcional)

Se você tiver o arquivo `simbolo BDA.png`, coloque-o em `assets/simbolo_bda.png`
que ele passa a aparecer automaticamente no cabeçalho e na exportação PDF/Word.
Sem o arquivo, a aplicação funciona normalmente, só sem o brasão.

## Navegadores suportados

Qualquer navegador moderno (Chrome, Edge, Firefox, Safari) dos últimos anos.
Não há suporte a Internet Explorer.
