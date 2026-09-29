/**
 * Middlewares de autorização.
 *
 * Seção 4.2 do documento da v2: "Autorização checada no servidor em toda rota,
 * nunca só escondendo botão na interface". `requireAuth` protege toda rota de
 * dados; `requireAdmin` protege toda rota de gestão. Esconder o botão no
 * frontend é conveniência visual, não controle de acesso.
 */
'use strict';

const { consultarUm } = require('../db');

/**
 * Exige sessão válida. Recarrega o usuário do banco a CADA requisição (em vez
 * de confiar no que foi gravado na sessão no login) para que desativar uma
 * conta, torná-la admin ou mudar suas permissões tenha efeito imediato, sem
 * esperar o usuário sair e entrar de novo.
 */
async function requireAuth(req, res, next) {
  if (!req.session || !req.session.usuarioId) {
    return res.status(401).json({ erro: 'nao_autenticado', mensagem: 'Sessão expirada ou inexistente. Faça login novamente.' });
  }

  try {
    const usuario = await consultarUm(
      'SELECT id, nome, nome_cadastro, email, is_admin, ativo FROM usuarios WHERE id = ?',
      [req.session.usuarioId]
    );

    if (!usuario || !usuario.ativo) {
      // Conta excluída ou desativada durante a sessão — encerra na hora.
      return req.session.destroy(() => {
        res.status(401).json({ erro: 'nao_autenticado', mensagem: 'Sua conta não está mais ativa. Procure o administrador.' });
      });
    }

    req.usuario = {
      id: usuario.id,
      nome: usuario.nome,
      nomeCadastro: usuario.nome_cadastro,
      email: usuario.email,
      isAdmin: Boolean(usuario.is_admin),
    };
    return next();
  } catch (erro) {
    return next(erro);
  }
}

/** Exige que o usuário autenticado seja administrador. Sempre usado DEPOIS de requireAuth. */
function requireAdmin(req, res, next) {
  if (!req.usuario || !req.usuario.isAdmin) {
    return res.status(403).json({ erro: 'sem_permissao', mensagem: 'Esta ação é restrita a administradores.' });
  }
  return next();
}

/**
 * IDs das OMs que o usuário pode ver. Admin devolve `null`, que significa
 * "todas" — quem consome precisa tratar null como ausência de restrição, nunca
 * como lista vazia (lista vazia = usuário comum sem nenhuma OM liberada).
 */
async function omsPermitidasIds(usuario) {
  if (usuario.isAdmin) return null;
  const linhas = await require('../db').consultar(
    'SELECT om_id FROM usuario_om_permissao WHERE usuario_id = ?',
    [usuario.id]
  );
  return linhas.map((l) => l.om_id);
}

module.exports = { requireAuth, requireAdmin, omsPermitidasIds };
