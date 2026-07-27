# SisAprov — Sistema de Aprovisionamento

Sistema web para controle de gestão orçamentária do setor de aprovisionamento do
Comando da 3ª Brigada de Cavalaria Mecanizada (Cmdo 3ª Bda C Mec).

Centraliza todo o ciclo orçamentário do setor: **Nota de Crédito → Empenho →
Recebimento/Provisão ou Anulação**, aplicando automaticamente as regras de
cálculo e validação do setor (saldo disponível, prazos, duplicidade de
empenhos, etc.).

## Módulos

- **Empenhos** — cadastro, consulta (com filtros e extração em PDF), anulação
  e acompanhamento de empenhos de entrega única (modalidade Ordinário).
- **Provisões / Recebimentos** — lançamento e histórico dos recebimentos
  vinculados a cada empenho.
- **Notas de Crédito** — cadastro e situação geral (saldo disponível de cada
  NC).
- **Comissão de Recebimento** — cadastro das comissões responsáveis pelos
  recebimentos.
- **Gráficos** — painel gerencial com indicadores agregados de todo o sistema.

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + Express |
| Banco de dados | SQLite (`better-sqlite3`), arquivo único |
| Frontend | HTML, CSS e JavaScript puro (sem framework/bundler) |
| Gráficos | [Chart.js](https://www.chartjs.org/) via CDN |
| Geração de PDF | `pdfkit` |

## Estrutura de pastas

```
SisAprov/
├── server/
│   ├── index.js              # ponto de entrada Express
│   ├── db/
│   │   ├── schema.sql        # criação/migração das tabelas
│   │   └── database.js       # conexão SQLite
│   ├── routes/                # endpoints da API (um arquivo por módulo)
│   ├── services/              # regras de negócio e cálculos compartilhados
│   └── utils/                 # utilitários (validação de datas, etc.)
├── public/
│   ├── index.html
│   ├── css/style.css
│   ├── js/                    # um arquivo por módulo do front-end
│   └── assets/                # imagens institucionais e PDFs de apoio
├── context/                    # documentos originais de especificação
├── CONTEXTO_SISAPROV.md        # documento de contexto do sistema
└── package.json
```

## Pré-requisitos

- Node.js 18 ou superior
- npm

## Instalação

```bash
npm install
```

O `better-sqlite3` compila um módulo nativo durante a instalação — se o
ambiente não tiver um binário pré-compilado disponível para o seu
sistema/arquitetura, é necessário ter as ferramentas de build (`python3`,
`make`, `g++`) instaladas.

## Executando

```bash
npm start        # produção
npm run dev      # desenvolvimento (reinicia sozinho a cada alteração)
```

Por padrão o sistema fica disponível em **http://localhost:3000**. A porta
pode ser alterada pela variável de ambiente `PORT`.

## Banco de dados

O SQLite é criado automaticamente em `server/db/sisaprov.db` na primeira
execução (a partir de `server/db/schema.sql`) — não é necessário nenhum
servidor de banco de dados separado. Esse arquivo **não é versionado** (veja
`.gitignore`): cada ambiente novo (inclusive o de produção) começa com o
banco vazio.

## Implantação em produção

Este sistema **não é um site estático** — o `public/` só funciona porque o
próprio processo Node/Express o serve. Isso significa que não basta copiar a
pasta para dentro de um diretório servido pelo Apache/Nginx como arquivo
estático; é preciso manter o processo Node em execução:

```bash
npm install --omit=dev
pm2 start server/index.js --name sisaprov   # ou um serviço systemd equivalente
```

Por padrão o sistema fica acessível diretamente por `http://SEU_SERVIDOR:3000/`.
Para expor em uma URL sem porta (ex.: atrás de um domínio ou caminho
específico), configure um *reverse proxy* no Apache/Nginx apontando para
`http://127.0.0.1:3000/`.

## Documentação

- **`CONTEXTO_SISAPROV.md`** — especificação funcional do sistema.
- **`context/`** — documentos originais de especificação (PDF) que deram
  origem ao sistema.
- **`public/assets/Caderno_Aprov.pdf`** — Caderno de Orientações do setor,
  disponível também pelo próprio sistema (rodapé do menu lateral).
- **`public/assets/Tutorial_SisAprov.pdf`** — tutorial ilustrado de uso do
  sistema, módulo a módulo, também disponível pelo menu lateral.

## Segurança

O sistema **não possui autenticação** — decisão deliberada de projeto para
facilitar o uso por toda a equipe do setor. Qualquer pessoa com acesso à URL
pode visualizar e editar todos os dados; recomenda-se restringir o acesso à
rede interna e nunca expor o endereço publicamente.

---

Desenvolvimento pelo Setor de Informática da 3ª Brigada de Cavalaria Mecanizada.
