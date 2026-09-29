/**
 * Rotas de autenticação — seção 2.4 do documento da v2.
 *
 *   POST /api/login    público
 *   POST /api/logout   autenticado
 *   GET  /api/me       autenticado
 */
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');

const { consultar, consultarUm, executar } = require('../db');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

const MAX_TENTATIVAS = 5;
const MINUTOS_BLOQUEIO = 15;

// Hash descartável usado para gastar o mesmo tempo de bcrypt quando o nome de
// cadastro não existe. Sem isso, "conta inexistente" responderia muito mais
// rápido que "senha errada", e essa diferença de tempo permitiria descobrir quais
// nomes de cadastro existem no sistema.
const HASH_FALSO = bcrypt.hashSync('senha-que-nunca-sera-usada', 12);

/** Mensagem única para credencial inválida — nunca revela se a conta existe. */
const MENSAGEM_CREDENCIAL = 'Nome de cadastro ou senha inválidos.';

function minutosRestantes(bloqueadoAte) {
  const restanteMs = new Date(bloqueadoAte.replace(' ', 'T')).getTime() - Date.now();
  return Math.max(1, Math.ceil(restanteMs / 60000));
}

router.post('/login', async (req, res, next) => {
  try {
    // A entrada é por NOME DE CADASTRO (não por e-mail): sempre comparado em
    // minúsculas, para quem digitou com maiúscula conseguir entrar.
    const nomeCadastro = String((req.body && req.body.nomeCadastro) || '').trim().toLowerCase();
    const senha = String((req.body && req.body.senha) || '');

    if (nomeCadastro === '' || senha === '') {
      return res.status(400).json({ erro: 'dados_invalidos', mensagem: 'Informe o nome de cadastro e a senha.' });
    }

    const usuario = await consultarUm(
      `SELECT id, nome, nome_cadastro, email, senha_hash, is_admin, ativo, tentativas_falhas, bloqueado_ate
         FROM usuarios WHERE nome_cadastro = ?`,
      [nomeCadastro]
    );

    if (!usuario) {
      await bcrypt.compare(senha, HASH_FALSO);
      return res.status(401).json({ erro: 'credencial_invalida', mensagem: MENSAGEM_CREDENCIAL });
    }

    if (!usuario.ativo) {
      return res.status(403).json({ erro: 'conta_desativada', mensagem: 'Esta conta está desativada. Procure o administrador.' });
    }

    // Bloqueio por tentativas (seção 4.2): 5 falhas → 15 minutos travado.
    if (usuario.bloqueado_ate && new Date(usuario.bloqueado_ate.replace(' ', 'T')).getTime() > Date.now()) {
      return res.status(429).json({
        erro: 'conta_bloqueada',
        mensagem: `Conta temporariamente bloqueada por tentativas de acesso malsucedidas. Tente novamente em ${minutosRestantes(usuario.bloqueado_ate)} minuto(s).`,
      });
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash);

    if (!senhaCorreta) {
      const tentativas = usuario.tentativas_falhas + 1;
      if (tentativas >= MAX_TENTATIVAS) {
        await executar(
          'UPDATE usuarios SET tentativas_falhas = ?, bloqueado_ate = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?',
          [tentativas, MINUTOS_BLOQUEIO, usuario.id]
        );
        return res.status(429).json({
          erro: 'conta_bloqueada',
          mensagem: `Conta bloqueada por ${MINUTOS_BLOQUEIO} minutos após ${MAX_TENTATIVAS} tentativas malsucedidas.`,
        });
      }
      await executar('UPDATE usuarios SET tentativas_falhas = ? WHERE id = ?', [tentativas, usuario.id]);
      return res.status(401).json({ erro: 'credencial_invalida', mensagem: MENSAGEM_CREDENCIAL });
    }

    // Sucesso: zera o contador de falhas e libera qualquer bloqueio pendente.
    await executar('UPDATE usuarios SET tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = ?', [usuario.id]);

    // Regenera o ID de sessão no login (evita session fixation — seção 4.2).
    req.session.regenerate((erroRegenerar) => {
      if (erroRegenerar) return next(erroRegenerar);
      req.session.usuarioId = usuario.id;
      req.session.save((erroSalvar) => {
        if (erroSalvar) return next(erroSalvar);
        // Nunca devolve senha_hash em resposta nenhuma (seção 4.2).
        return res.json({
          usuario: {
            id: usuario.id,
            nome: usuario.nome,
            nomeCadastro: usuario.nome_cadastro,
            email: usuario.email,
            isAdmin: Boolean(usuario.is_admin),
          },
        });
      });
    });
  } catch (erro) {
    return next(erro);
  }
});

router.post('/logout', requireAuth, (req, res, next) => {
  req.session.destroy((erro) => {
    if (erro) return next(erro);
    res.clearCookie('clima.sid');
    return res.json({ ok: true });
  });
});

/**
 * Dados do usuário logado + as OMs que ele pode ver.
 *
 * Admin vem com `isAdmin: true` e `oms: []` — significa "todas as OMs", e é
 * assim que o frontend interpreta (seção 2.1). Usuário comum vem com a lista
 * nominal das OMs liberadas; lista vazia é o caso do aviso "sem organizações
 * liberadas para seu usuário".
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    let oms = [];
    if (!req.usuario.isAdmin) {
      const linhas = await consultar(
        `SELECT om.id, om.nome
           FROM usuario_om_permissao p
           JOIN organizacoes_militares om ON om.id = p.om_id
          WHERE p.usuario_id = ? AND om.ativo = TRUE
          ORDER BY om.nome`,
        [req.usuario.id]
      );
      oms = linhas.map((l) => ({ id: l.id, nome: l.nome }));
    }

    return res.json({
      id: req.usuario.id,
      nome: req.usuario.nome,
      nomeCadastro: req.usuario.nomeCadastro,
      email: req.usuario.email,
      isAdmin: req.usuario.isAdmin,
      oms,
    });
  } catch (erro) {
    return next(erro);
  }
});

module.exports = router;
