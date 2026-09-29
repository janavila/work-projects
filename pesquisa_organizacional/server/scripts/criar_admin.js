#!/usr/bin/env node
/**
 * Bootstrap da primeira conta de administrador — seção 2.1 do documento da v2.
 *
 * "Se não existir nenhum admin no banco na subida do servidor, ele é criado
 * automaticamente com esses valores (ADMIN_USUARIO, ADMIN_SENHA_INICIAL)."
 *
 * A entrada no sistema é por NOME DE CADASTRO, então a variável que importa é
 * ADMIN_USUARIO. ADMIN_EMAIL é opcional e serve só como contato; se ele existir
 * e ADMIN_USUARIO não, o nome de cadastro é derivado da parte antes do @, para
 * não quebrar instalações que foram configuradas antes dessa mudança.
 *
 * Este arquivo serve aos dois usos:
 *   - como módulo: `garantirAdminInicial()` é chamado por server/app.js na subida;
 *   - como comando: `node server/scripts/criar_admin.js` (ou `npm run criar-admin`),
 *     útil para conferir o estado ou criar o admin antes da primeira subida.
 *
 * Comportamento deliberado: se JÁ EXISTE algum admin (ativo ou não), o script não
 * faz nada e não toca em senha nenhuma. Ele nunca sobrescreve a senha de um admin
 * existente — senão qualquer reinício do servidor desfaria a troca de senha feita
 * pelo administrador e o valor do .env voltaria a valer como senha real.
 */
'use strict';

const bcrypt = require('bcryptjs');

const CUSTO_BCRYPT = 12;
const TAMANHO_MINIMO_SENHA = 8;

/**
 * Cria a primeira conta admin se ainda não houver nenhuma.
 *
 * @param {Object} [opcoes]
 * @param {boolean} [opcoes.silencioso] quando true, não escreve no console
 * @returns {Promise<{criado: boolean, motivo?: string, email?: string}>}
 */
async function garantirAdminInicial(opcoes) {
  const { consultarUm, executar } = require('../db');
  const silencioso = Boolean(opcoes && opcoes.silencioso);
  const log = (mensagem) => { if (!silencioso) console.log(mensagem); };

  const jaExiste = await consultarUm('SELECT id, nome_cadastro FROM usuarios WHERE is_admin = TRUE LIMIT 1');
  if (jaExiste) {
    log(`[admin] Já existe conta de administrador (${jaExiste.nome_cadastro}) — nada a fazer.`);
    return { criado: false, motivo: 'admin_existente', nomeCadastro: jaExiste.nome_cadastro };
  }

  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase() || null;
  // ADMIN_USUARIO é a credencial de entrada. Sem ela, deriva do e-mail (parte
  // antes do @) aplicando as mesmas regras de caractere do cadastro normal.
  const nomeCadastroBruto = String(process.env.ADMIN_USUARIO || '').trim().toLowerCase()
    || (email ? email.split('@')[0] : '');
  const nomeCadastro = nomeCadastroBruto.replace(/[^a-z0-9._-]/g, '');
  const senha = String(process.env.ADMIN_SENHA_INICIAL || '');
  const nome = String(process.env.ADMIN_NOME || 'Administrador do Sistema').trim();

  if (nomeCadastro === '' || senha === '') {
    throw new Error(
      'Não existe nenhum administrador no banco e ADMIN_USUARIO / ADMIN_SENHA_INICIAL não estão definidos no .env — ' +
      'sem eles não há como criar a primeira conta. Preencha as duas variáveis e suba o servidor de novo.'
    );
  }
  if (nomeCadastro.length < 3) {
    throw new Error('ADMIN_USUARIO precisa ter ao menos 3 caracteres (letras sem acento, números, ponto, hífen ou sublinhado).');
  }
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    throw new Error(`ADMIN_SENHA_INICIAL precisa ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
  }

  // Caso de borda: existe uma conta comum com esse nome de cadastro (por
  // exemplo, criada antes de alguém decidir que ela seria a admin). Promover é
  // melhor que estourar erro de duplicidade e deixar o sistema sem nenhum admin.
  const contaComum = await consultarUm('SELECT id FROM usuarios WHERE nome_cadastro = ?', [nomeCadastro]);
  if (contaComum) {
    await executar('UPDATE usuarios SET is_admin = TRUE, ativo = TRUE WHERE id = ?', [contaComum.id]);
    log(`[admin] A conta existente "${nomeCadastro}" foi promovida a administrador (a senha dela NÃO foi alterada).`);
    return { criado: false, motivo: 'conta_promovida', nomeCadastro };
  }

  const senhaHash = await bcrypt.hash(senha, CUSTO_BCRYPT);
  await executar(
    'INSERT INTO usuarios (nome, nome_cadastro, email, senha_hash, is_admin, ativo) VALUES (?, ?, ?, ?, TRUE, TRUE)',
    [nome, nomeCadastro, email, senhaHash]
  );

  log(`[admin] Primeira conta de administrador criada. Nome de cadastro: ${nomeCadastro}`);
  log('[admin] ATENÇÃO: troque esta senha no primeiro acesso (Gestão > Usuários > Redefinir senha).');
  return { criado: true, nomeCadastro, email };
}

if (require.main === module) {
  require('dotenv').config();
  garantirAdminInicial({ silencioso: false })
    .then(() => require('../db').pool.end())
    .then(() => process.exit(0))
    .catch((erro) => {
      console.error('\nFalha ao criar o administrador inicial:');
      console.error(`  ${erro.message}\n`);
      process.exit(1);
    });
}

module.exports = { garantirAdminInicial };
