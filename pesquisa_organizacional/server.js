#!/usr/bin/env node
/**
 * Servidor estático simples, sem dependências externas (só módulos nativos
 * do Node.js), para hospedar o dashboard na rede interna. Não requer
 * `npm install` — basta ter o Node.js instalado.
 *
 * Uso:
 *   node server.js [porta]
 *   PORT=8080 node server.js
 *
 * Acesso de outros computadores da rede: http://<IP-desta-máquina>:<porta>/
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const PORTA = Number(process.argv[2] || process.env.PORT || 8080);

const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function resolverCaminho(urlPath) {
  const semQuery = urlPath.split('?')[0];
  const decodificado = decodeURIComponent(semQuery === '/' ? '/index.html' : semQuery);
  const alvo = path.normalize(path.join(RAIZ, decodificado));
  // impede path traversal (../) para fora da raiz do projeto
  if (!alvo.startsWith(RAIZ)) return null;
  return alvo;
}

const servidor = http.createServer((req, res) => {
  const caminho = resolverCaminho(req.url);

  if (!caminho) {
    res.writeHead(400);
    res.end('Requisição inválida.');
    return;
  }

  fs.stat(caminho, (erroStat, stats) => {
    if (erroStat || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Arquivo não encontrado.');
      return;
    }

    const ext = path.extname(caminho).toLowerCase();
    const tipo = TIPOS_MIME[ext] || 'application/octet-stream';
    const cabecalhos = { 'Content-Type': tipo };

    // dados/CSV nunca devem ficar em cache — cada cliente precisa sempre da
    // versão mais recente de resultados.csv/dicionario.csv (ver seção 2.5).
    if (caminho.includes(`${path.sep}data${path.sep}`)) {
      cabecalhos['Cache-Control'] = 'no-store';
    }

    res.writeHead(200, cabecalhos);
    fs.createReadStream(caminho).pipe(res);
  });
});

servidor.listen(PORTA, '0.0.0.0', () => {
  console.log(`Dashboard de Clima Organizacional rodando em:`);
  console.log(`  Local:  http://localhost:${PORTA}/`);
  console.log(`  Rede:   http://<IP-desta-máquina>:${PORTA}/  (descubra o IP com "ipconfig" no Windows ou "ifconfig"/"ip addr" no Linux/Mac)`);
  console.log('Pressione Ctrl+C para parar o servidor.');
});
