/**
 * CRUD de contas e permissões de OM — seção 2.5 do documento da v2.
 * Todas as rotas deste arquivo são restritas a administradores.
 *
 *   GET    /api/admin/usuarios
 *   POST   /api/admin/usuarios
 *   PUT    /api/admin/usuarios/:id
 *   DELETE /api/admin/usuarios/:id
 *   PUT    /api/admin/usuarios/:id/senha
 */
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');

const { consultar, consultarUm, executar, placeholders, comTransacao } = require('../db');
const { requireAuth, requireAdmin } = require('../middlewares/auth');

const router = express.Router();

// Custo de bcrypt fixado em 12 para toda senha do sistema (seção 4.2).
const CUSTO_BCRYPT = 12;
const TAMANHO_MINIMO_SENHA = 8;

router.use(requireAuth, requireAdmin);

// ============================== VALIDAÇÃO ==============================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Nome de cadastro: é a credencial de entrada, então o conjunto de caracteres é
// restrito de propósito — letras sem acento, dígitos, ponto, hífen e sublinhado.
// Fica sempre em minúsculas (no banco e na comparação do login), para ninguém
// ser barrado por ter digitado com maiúscula.
const NOME_CADASTRO_RE = /^[a-z0-9._-]+$/;
const NOME_CADASTRO_MIN = 3;
const NOME_CADASTRO_MAX = 60;

/** Normaliza o nome de cadastro: sem espaços nas pontas e sempre em minúsculas. */
function normalizarNomeCadastro(valor) {
  return String(valor || '').trim().toLowerCase();
}

/** E-mail é opcional: string vazia vira null, para não colidir no índice único. */
function normalizarEmail(valor) {
  const limpo = String(valor || '').trim().toLowerCase();
  return limpo === '' ? null : limpo;
}

/** Valida nome, nome de cadastro, e-mail e senha; devolve a lista de problemas. */
function validarCadastro({ nome, nomeCadastro, email, senha, exigirSenha }) {
  const problemas = [];

  if (!nome || String(nome).trim().length < 3) {
    problemas.push('O nome precisa ter ao menos 3 caracteres.');
  } else if (String(nome).trim().length > 150) {
    problemas.push('O nome não pode passar de 150 caracteres.');
  }

  if (!nomeCadastro || nomeCadastro.length < NOME_CADASTRO_MIN) {
    problemas.push(`O nome de cadastro precisa ter ao menos ${NOME_CADASTRO_MIN} caracteres.`);
  } else if (nomeCadastro.length > NOME_CADASTRO_MAX) {
    problemas.push(`O nome de cadastro não pode passar de ${NOME_CADASTRO_MAX} caracteres.`);
  } else if (!NOME_CADASTRO_RE.test(nomeCadastro)) {
    problemas.push('O nome de cadastro aceita apenas letras sem acento, números, ponto, hífen e sublinhado — sem espaços.');
  }

  // E-mail é opcional (informação de contato). Só é validado quando preenchido.
  if (email !== null && email !== undefined) {
    if (!EMAIL_RE.test(email)) {
      problemas.push('O e-mail informado não é válido. Deixe o campo em branco se não quiser informar.');
    } else if (email.length > 150) {
      problemas.push('O e-mail não pode passar de 150 caracteres.');
    }
  }

  if (exigirSenha || (senha !== undefined && senha !== null && senha !== '')) {
    if (String(senha || '').length < TAMANHO_MINIMO_SENHA) {
      problemas.push(`A senha precisa ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
    }
  }

  return problemas;
}

/**
 * Normaliza a lista de OMs recebida do frontend para um array de inteiros
 * válidos e existentes no banco. Rejeita id inexistente em vez de ignorar em
 * silêncio, para o admin perceber que a tela está dessincronizada do banco.
 */
async function normalizarOms(omsRecebidas) {
  if (omsRecebidas === undefined || omsRecebidas === null) return [];
  if (!Array.isArray(omsRecebidas)) {
    throw Object.assign(new Error('A lista de OMs deve ser um array de identificadores.'), { statusHttp: 400 });
  }

  const ids = Array.from(new Set(omsRecebidas.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0)));
  if (ids.length === 0) return [];

  const existentes = await consultar(
    `SELECT id FROM organizacoes_militares WHERE id IN (${placeholders(ids.length)})`,
    ids
  );
  if (existentes.length !== ids.length) {
    throw Object.assign(new Error('Uma ou mais OMs informadas não existem mais. Recarregue a página e tente de novo.'), { statusHttp: 400 });
  }
  return ids;
}

/** Sobrescreve as permissões de OM de um usuário dentro de uma transação. */
async function gravarPermissoes(conexao, usuarioId, omIds, concedidoPor) {
  await conexao.execute('DELETE FROM usuario_om_permissao WHERE usuario_id = ?', [usuarioId]);
  for (const omId of omIds) {
    await conexao.execute(
      'INSERT INTO usuario_om_permissao (usuario_id, om_id, concedido_por) VALUES (?, ?, ?)',
      [usuarioId, omId, concedidoPor]
    );
  }
}

function idDaRota(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ============================== LISTAR ==============================

router.get('/', async (req, res, next) => {
  try {
    const usuarios = await consultar(
      `SELECT id, nome, nome_cadastro, email, is_admin, ativo, bloqueado_ate, criado_em, atualizado_em
         FROM usuarios
        ORDER BY is_admin DESC, nome`
    );

    const permissoes = await consultar(
      `SELECT p.usuario_id, om.id AS om_id, om.nome AS om_nome, om.ativo AS om_ativo
         FROM usuario_om_permissao p
         JOIN organizacoes_militares om ON om.id = p.om_id
        ORDER BY om.nome`
    );

    const porUsuario = new Map();
    permissoes.forEach((p) => {
      if (!porUsuario.has(p.usuario_id)) porUsuario.set(p.usuario_id, []);
      porUsuario.get(p.usuario_id).push({ id: p.om_id, nome: p.om_nome, ativo: Boolean(p.om_ativo) });
    });

    // senha_hash nunca sai daqui (seção 4.2) — a consulta acima não a seleciona.
    return res.json({
      usuarios: usuarios.map((u) => ({
        id: u.id,
        nome: u.nome,
        nomeCadastro: u.nome_cadastro,
        email: u.email,
        isAdmin: Boolean(u.is_admin),
        ativo: Boolean(u.ativo),
        bloqueadoAte: u.bloqueado_ate,
        criadoEm: u.criado_em,
        atualizadoEm: u.atualizado_em,
        oms: porUsuario.get(u.id) || [],
      })),
    });
  } catch (erro) {
    return next(erro);
  }
});

// ============================== CRIAR ==============================

router.post('/', async (req, res, next) => {
  try {
    const corpo = req.body || {};
    const nome = String(corpo.nome || '').trim();
    const nomeCadastro = normalizarNomeCadastro(corpo.nomeCadastro);
    const email = normalizarEmail(corpo.email);
    const senha = String(corpo.senha || '');
    const isAdmin = corpo.isAdmin === true || corpo.isAdmin === 'true';

    const problemas = validarCadastro({ nome, nomeCadastro, email, senha, exigirSenha: true });
    if (problemas.length > 0) {
      return res.status(400).json({ erro: 'dados_invalidos', mensagem: problemas.join(' ') });
    }

    const cadastroExistente = await consultarUm('SELECT id FROM usuarios WHERE nome_cadastro = ?', [nomeCadastro]);
    if (cadastroExistente) {
      return res.status(409).json({ erro: 'nome_cadastro_duplicado', mensagem: 'Já existe uma conta com este nome de cadastro.' });
    }

    if (email !== null) {
      const emailExistente = await consultarUm('SELECT id FROM usuarios WHERE email = ?', [email]);
      if (emailExistente) {
        return res.status(409).json({ erro: 'email_duplicado', mensagem: 'Já existe uma conta com este e-mail.' });
      }
    }

    const omIds = isAdmin ? [] : await normalizarOms(corpo.oms);
    const senhaHash = await bcrypt.hash(senha, CUSTO_BCRYPT);

    const novoId = await comTransacao(async (conexao) => {
      const [resultado] = await conexao.execute(
        'INSERT INTO usuarios (nome, nome_cadastro, email, senha_hash, is_admin, criado_por) VALUES (?, ?, ?, ?, ?, ?)',
        [nome, nomeCadastro, email, senhaHash, isAdmin, req.usuario.id]
      );
      if (omIds.length > 0) {
        await gravarPermissoes(conexao, resultado.insertId, omIds, req.usuario.id);
      }
      return resultado.insertId;
    });

    return res.status(201).json({ id: novoId, mensagem: 'Conta criada.' });
  } catch (erro) {
    if (erro.statusHttp) return res.status(erro.statusHttp).json({ erro: 'dados_invalidos', mensagem: erro.message });
    return next(erro);
  }
});

// ============================== EDITAR ==============================

router.put('/:id', async (req, res, next) => {
  try {
    const id = idDaRota(req);
    if (!id) return res.status(400).json({ erro: 'id_invalido', mensagem: 'Identificador de conta inválido.' });

    const alvo = await consultarUm('SELECT id, is_admin, ativo FROM usuarios WHERE id = ?', [id]);
    if (!alvo) return res.status(404).json({ erro: 'nao_encontrado', mensagem: 'Conta não encontrada.' });

    const corpo = req.body || {};
    const nome = String(corpo.nome || '').trim();
    const nomeCadastro = normalizarNomeCadastro(corpo.nomeCadastro);
    const email = normalizarEmail(corpo.email);
    const isAdmin = corpo.isAdmin === true || corpo.isAdmin === 'true';
    const ativo = corpo.ativo === undefined ? Boolean(alvo.ativo) : (corpo.ativo === true || corpo.ativo === 'true');

    const problemas = validarCadastro({ nome, nomeCadastro, email, exigirSenha: false });
    if (problemas.length > 0) {
      return res.status(400).json({ erro: 'dados_invalidos', mensagem: problemas.join(' ') });
    }

    // Trava de segurança operacional: o admin logado não pode se rebaixar nem se
    // desativar. Sem isso, um descuido tranca o sistema inteiro — ninguém mais
    // consegue entrar na área de gestão para desfazer.
    if (id === req.usuario.id && (!isAdmin || !ativo)) {
      return res.status(400).json({
        erro: 'autoexclusao',
        mensagem: 'Você não pode remover seu próprio acesso de administrador nem desativar sua própria conta. Peça a outro administrador.',
      });
    }

    const cadastroDeOutro = await consultarUm('SELECT id FROM usuarios WHERE nome_cadastro = ? AND id <> ?', [nomeCadastro, id]);
    if (cadastroDeOutro) {
      return res.status(409).json({ erro: 'nome_cadastro_duplicado', mensagem: 'Já existe outra conta com este nome de cadastro.' });
    }

    if (email !== null) {
      const emailDeOutro = await consultarUm('SELECT id FROM usuarios WHERE email = ? AND id <> ?', [email, id]);
      if (emailDeOutro) {
        return res.status(409).json({ erro: 'email_duplicado', mensagem: 'Já existe outra conta com este e-mail.' });
      }
    }

    const omIds = isAdmin ? [] : await normalizarOms(corpo.oms);

    await comTransacao(async (conexao) => {
      await conexao.execute(
        'UPDATE usuarios SET nome = ?, nome_cadastro = ?, email = ?, is_admin = ?, ativo = ? WHERE id = ?',
        [nome, nomeCadastro, email, isAdmin, ativo, id]
      );
      // Admin não usa linhas de permissão ("todas as OMs" vem do is_admin), então
      // promover alguém a admin limpa as permissões que ele tinha como usuário comum.
      await gravarPermissoes(conexao, id, omIds, req.usuario.id);
    });

    return res.json({ mensagem: 'Conta atualizada.' });
  } catch (erro) {
    if (erro.statusHttp) return res.status(erro.statusHttp).json({ erro: 'dados_invalidos', mensagem: erro.message });
    return next(erro);
  }
});

// ============================== REDEFINIR SENHA ==============================

router.put('/:id/senha', async (req, res, next) => {
  try {
    const id = idDaRota(req);
    if (!id) return res.status(400).json({ erro: 'id_invalido', mensagem: 'Identificador de conta inválido.' });

    const alvo = await consultarUm('SELECT id FROM usuarios WHERE id = ?', [id]);
    if (!alvo) return res.status(404).json({ erro: 'nao_encontrado', mensagem: 'Conta não encontrada.' });

    const senha = String((req.body && req.body.senha) || '');
    if (senha.length < TAMANHO_MINIMO_SENHA) {
      return res.status(400).json({
        erro: 'dados_invalidos',
        mensagem: `A senha precisa ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres.`,
      });
    }

    const senhaHash = await bcrypt.hash(senha, CUSTO_BCRYPT);
    // Redefinir a senha também libera qualquer bloqueio por tentativas falhas —
    // é o caminho do admin para destravar quem errou a senha 5 vezes.
    await executar(
      'UPDATE usuarios SET senha_hash = ?, tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = ?',
      [senhaHash, id]
    );

    return res.json({ mensagem: 'Senha redefinida.' });
  } catch (erro) {
    return next(erro);
  }
});

// ============================== EXCLUIR ==============================

router.delete('/:id', async (req, res, next) => {
  try {
    const id = idDaRota(req);
    if (!id) return res.status(400).json({ erro: 'id_invalido', mensagem: 'Identificador de conta inválido.' });

    if (id === req.usuario.id) {
      return res.status(400).json({ erro: 'autoexclusao', mensagem: 'Você não pode excluir sua própria conta.' });
    }

    const alvo = await consultarUm('SELECT id, is_admin, nome_cadastro FROM usuarios WHERE id = ?', [id]);
    if (!alvo) return res.status(404).json({ erro: 'nao_encontrado', mensagem: 'Conta não encontrada.' });

    if (alvo.is_admin) {
      const totalAdmins = await consultarUm('SELECT COUNT(*) AS total FROM usuarios WHERE is_admin = TRUE AND ativo = TRUE');
      if (Number(totalAdmins.total) <= 1) {
        return res.status(400).json({
          erro: 'ultimo_admin',
          mensagem: 'Esta é a única conta de administrador ativa — crie outra antes de excluí-la.',
        });
      }
    }

    // datasets.enviado_por é NOT NULL: excluir quem enviou datasets apagaria a
    // rastreabilidade de quem subiu cada base. A exclusão é barrada com
    // explicação, em vez de estourar erro de chave estrangeira na cara do admin.
    const datasets = await consultarUm('SELECT COUNT(*) AS total FROM datasets WHERE enviado_por = ?', [id]);
    if (Number(datasets.total) > 0) {
      return res.status(409).json({
        erro: 'possui_datasets',
        mensagem: `Esta conta enviou ${datasets.total} dataset(s) e não pode ser excluída — desative-a em vez de excluir, para preservar o registro de quem enviou cada base.`,
      });
    }

    // usuario_om_permissao cai em cascata (ON DELETE CASCADE na migration).
    await executar('DELETE FROM usuarios WHERE id = ?', [id]);
    return res.json({ mensagem: 'Conta excluída.' });
  } catch (erro) {
    return next(erro);
  }
});

module.exports = router;
