# Dashboard de Clima Organizacional — 3ª Brigada de Cavalaria Mecanizada

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
data/
  dicionario.csv        dicionário de variáveis (não sensível)
  resultados.csv          respostas brutas — DADO SENSÍVEL, nunca commitar/expor
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

Basta substituir `data/resultados.csv` (e/ou `data/dicionario.csv`) pelo
arquivo novo, mantendo o mesmo nome. Não é preciso reiniciar o servidor — cada
navegador recarrega os dados direto do disco a cada vez que a página é aberta
(o servidor envia `Cache-Control: no-store` para os arquivos de `data/`,
então basta atualizar o arquivo no disco e pedir para os usuários darem F5).

## Segurança do dado sensível

`resultados.csv` contém respostas individuais sobre saúde emocional, apostas e
situação financeira. O dashboard nunca expõe essa tabela bruta em nenhuma
tela — apenas os índices já agregados, respeitando sempre o limiar de
anonimato de 5 respondentes (seção 3.7 de `MIGRACAO_JS.md`). Mesmo assim:

- Não hospede esta pasta em um servidor exposto à internet — é para uso
  **somente na rede interna**.
- Não versione `data/resultados.csv` em nenhum sistema de controle de versão
  público.

## Logo da Brigada (opcional)

Se você tiver o arquivo `simbolo BDA.png`, coloque-o em `assets/simbolo_bda.png`
que ele passa a aparecer automaticamente no cabeçalho e na exportação PDF/Word.
Sem o arquivo, a aplicação funciona normalmente, só sem o brasão.

## Navegadores suportados

Qualquer navegador moderno (Chrome, Edge, Firefox, Safari) dos últimos anos.
Não há suporte a Internet Explorer.
