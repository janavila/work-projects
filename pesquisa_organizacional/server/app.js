#!/usr/bin/env node
/**
 * Entrada do servidor da v2 — Express + MySQL.
 *
 * Substitui o server.js da v1 (que era um servidor estático puro, sem login).
 * Continua servindo o frontend estático — index.html, login.html, admin.html,
 * css/, js/, vendor/, assets/ — mas a pasta data/ deixou de ser pública: os
 * arquivos de dados agora só saem pelas rotas autenticadas de /api.
 *
 * Decisões de segurança do documento da v2 aplicadas aqui:
 *   - HTTP simples, sem HTTPS (seção 4.1) — rede interna fechada, decisão
 *     consciente, ciente de que senha e cookie trafegam em texto puro na LAN.
 *     É por isso que o cookie de sessão NÃO usa `secure: true`: com HTTPS
 *     ausente, o navegador simplesmente não enviaria o cookie e ninguém
 *     conseguiria logar.
 *   - Cookie httpOnly + sameSite strict, sessão regenerada no login e expiração
 *     por inatividade de 8 horas (seção 4.2).
 *   - Nenhuma tabela de auditoria (seção 4.1) — decisão consciente deste pacote.
 *
 * Uso:
 *   node server/app.js
 *   npm start
 */
'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

const { pool, verificarConexao } = require('./db');
const { RAIZ_PROJETO } = require('./services/caminhos');
const { garantirAdminInicial } = require('./scripts/criar_admin');

const rotasAuth = require('./routes/auth');
const rotasAdminUsuarios = require('./routes/admin-usuarios');
const rotasAdminOms = require('./routes/admin-oms');
const rotasAdminDatasets = require('./routes/admin-datasets');
const { router: rotasDados } = require('./routes/dados');

const PORTA = Number(process.argv[2] || process.env.PORT || 8080);
const OITO_HORAS_MS = 8 * 60 * 60 * 1000;

const app = express();

// O servidor fica atrás de nada (acesso direto na LAN), então não há proxy para
// confiar. Se um dia entrar um proxy reverso na frente, habilitar trust proxy aqui.
app.disable('x-powered-by');

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// ============================== SESSÃO ==============================

/**
 * A tabela `sessions` é criada e mantida pelo próprio express-mysql-session —
 * por isso ela não aparece na migration 001.
 */
const sessionStore = new MySQLStore({
  createDatabaseTable: true,
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: OITO_HORAS_MS,
}, pool);

app.use(session({
  name: 'clima.sid',
  secret: process.env.SESSION_SECRET || '',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  // rolling renova o prazo a cada requisição: a sessão morre por INATIVIDADE de
  // 8 horas, não 8 horas depois do login (seção 4.2).
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: false, // ver comentário no topo: ambiente é HTTP interno, por decisão
    maxAge: OITO_HORAS_MS,
  },
}));

// ============================== ROTAS DA API ==============================

app.use('/api', rotasAuth);
app.use('/api', rotasDados);
app.use('/api/admin/usuarios', rotasAdminUsuarios);
app.use('/api/admin/oms', rotasAdminOms);
app.use('/api/admin/datasets', rotasAdminDatasets);

// Qualquer /api desconhecida responde JSON, nunca HTML de página não encontrada.
app.use('/api', (req, res) => {
  res.status(404).json({ erro: 'rota_inexistente', mensagem: 'Rota de API inexistente.' });
});

// ============================== FRONTEND ESTÁTICO ==============================

/**
 * Bloqueio da pasta data/ (decisão desta implementação, registrada no README).
 *
 * Na v1, data/resultados.csv era baixável por qualquer pessoa que alcançasse o
 * servidor — a dívida nº 27 do SISTEMA_ATUAL.md. Com autenticação no lugar,
 * deixar a pasta estática anularia o login: bastaria pedir o CSV direto. Então
 * nada em /data é servido; dicionário, formulário e datasets saem apenas por
 * /api/dicionario, /api/formulario e /api/dados, todos atrás de requireAuth.
 */
app.use((req, res, next) => {
  const caminho = decodeURIComponent(req.path);
  if (caminho === '/data' || caminho.startsWith('/data/')) {
    return res.status(404).type('text/plain; charset=utf-8').send('Arquivo não encontrado.');
  }
  return next();
});

app.use(express.static(RAIZ_PROJETO, {
  index: ['index.html'],
  extensions: false,
  dotfiles: 'deny',
  setHeaders: (res, caminhoArquivo) => {
    // HTML e JS da aplicação sem cache, para uma atualização do servidor chegar
    // aos navegadores com um F5 (mesmo espírito do no-store da v1).
    if (/\.(html|js)$/i.test(caminhoArquivo)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

app.use((req, res) => {
  res.status(404).type('text/plain; charset=utf-8').send('Arquivo não encontrado.');
});

// ============================== TRATAMENTO DE ERRO ==============================

/**
 * Handler final: registra o erro completo no console do servidor e devolve ao
 * cliente apenas uma mensagem genérica — detalhe interno (SQL, caminho de
 * arquivo, stack) nunca vai para a resposta.
 */
// eslint-disable-next-line no-unused-vars
app.use((erro, req, res, next) => {
  console.error(`[erro] ${req.method} ${req.originalUrl}:`, erro);
  if (res.headersSent) return;
  res.status(500).json({
    erro: 'erro_interno',
    mensagem: 'Erro interno no servidor. Se persistir, avise o administrador.',
  });
});

// ============================== SUBIDA ==============================

function validarAmbiente() {
  const faltando = ['DB_USER', 'DB_NAME', 'SESSION_SECRET'].filter((v) => !process.env[v]);
  if (faltando.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias ausentes: ${faltando.join(', ')}. ` +
      'Copie .env.example para .env e preencha os valores (ver README_V2.md).'
    );
  }
  if (String(process.env.SESSION_SECRET).length < 32) {
    throw new Error('SESSION_SECRET curto demais — use ao menos 32 caracteres aleatórios (ver README_V2.md).');
  }
}

async function iniciar() {
  validarAmbiente();

  try {
    await verificarConexao();
  } catch (erro) {
    throw new Error(
      `Não foi possível conectar ao MySQL em ${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 3306} ` +
      `(banco "${process.env.DB_NAME}"): ${erro.message}`
    );
  }

  // Bootstrap do admin (seção 2.1): se não houver nenhum admin no banco, cria o
  // primeiro a partir de ADMIN_EMAIL / ADMIN_SENHA_INICIAL.
  await garantirAdminInicial({ silencioso: false });

  app.listen(PORTA, '0.0.0.0', () => {
    console.log('Dashboard de Clima Organizacional (v2) rodando em:');
    console.log(`  Local:  http://localhost:${PORTA}/`);
    console.log(`  Rede:   http://<IP-desta-máquina>:${PORTA}/`);
    console.log('  Login:  /login.html   ·   Gestão: /admin.html');
    console.log('Pressione Ctrl+C para parar o servidor.');
  });
}

if (require.main === module) {
  iniciar().catch((erro) => {
    console.error('\nFalha ao subir o servidor:');
    console.error(`  ${erro.message}\n`);
    process.exit(1);
  });
}

module.exports = { app, iniciar };
