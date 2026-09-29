#!/usr/bin/env node
/**
 * Cadastra as Organizações Militares da 3ª Bda C Mec que ainda não estão no
 * banco, para que o administrador possa conceder permissão a elas **antes** de
 * existir qualquer base de dados daquela OM.
 *
 * Por que isso é necessário: a permissão é por OM, e só aparece na tela de
 * cadastro de usuário quem já está em `organizacoes_militares`. Até aqui as
 * únicas OMs cadastradas eram as duas que apareceram nos dados da primeira
 * pesquisa — as outras nove nem existiam para serem marcadas.
 *
 * Uso:
 *   node server/scripts/cadastrar_oms.js              lista o que falta e cadastra
 *   node server/scripts/cadastrar_oms.js --conferir   só lista, não grava nada
 *   npm run cadastrar-oms
 *
 * ATENÇÃO AO NOME (leia antes de rodar)
 * -------------------------------------
 * O nome cadastrado precisa ser IDÊNTICO ao valor que aparece na coluna `om` do
 * CSV exportado do formulário — é essa string que o navegador compara para
 * decidir o que cada usuário pode ver.
 *
 * A lista abaixo vem do formulário impresso (data/formulario.pdf). Só que o
 * formulário ELETRÔNICO usou rótulos diferentes nos dois casos que já temos dado:
 *
 *     formulário impresso        →  valor real no CSV
 *     "QG 3ª Bda C Mec"          →  "Cmdo 3ª Bda C Mec"
 *     "Esqd Cmdo"                →  "Esqd Cmdo 3ª Bda C Mec"
 *
 * Ou seja: os nove nomes abaixo são um ponto de partida, não uma certeza. Se o
 * formulário eletrônico tiver usado outra grafia, a OM criada aqui não vai casar
 * com o dado quando a primeira base daquela unidade for enviada — o upload vai
 * cadastrar a grafia verdadeira como uma OM nova (inativa), e vocês verão as duas
 * lado a lado em Gestão > Organizações Militares. Aí basta renomear a antiga para
 * a grafia certa (a permissão já concedida continua valendo, porque ela aponta
 * para o id da OM, não para o nome) e excluir/ignorar a duplicada.
 *
 * Se você tiver acesso ao formulário eletrônico, confira os rótulos e ajuste a
 * lista abaixo ANTES de rodar — é mais simples que corrigir depois.
 */
'use strict';

require('dotenv').config();

const { consultar, consultarUm, executar, pool } = require('../db');

// As 11 OMs da 3ª Bda C Mec, conforme a questão 1 de data/formulario.pdf.
// As duas que já vieram nos dados da 1ª pesquisa estão comentadas com o valor
// real usado no CSV, para ninguém recadastrá-las com a grafia do papel.
const OMS_DA_BRIGADA = [
  // 'Cmdo 3ª Bda C Mec',        // já cadastrada (no papel: "QG 3ª Bda C Mec")
  // 'Esqd Cmdo 3ª Bda C Mec',   // já cadastrada (no papel: "Esqd Cmdo")
  '25º GAC',
  '3º R C Mec',
  '3º B Log',
  '3º Pel PE',
  '7º R C Mec',
  '2ª Bia AAAe',
  '9º RCB',
  '13ª Cia Com Mec',
  '3ª Cia Eng Cmb Mec',
];

async function cadastrar() {
  const apenasConferir = process.argv.includes('--conferir');

  const existentes = await consultar('SELECT id, nome, ativo FROM organizacoes_militares ORDER BY nome');
  const nomesExistentes = new Set(existentes.map((om) => om.nome));

  console.log(`OMs já cadastradas (${existentes.length}):`);
  existentes.forEach((om) => console.log(`  [${om.id}] ${om.nome}${om.ativo ? '' : '  (inativa)'}`));

  const faltando = OMS_DA_BRIGADA.filter((nome) => !nomesExistentes.has(nome));

  if (faltando.length === 0) {
    console.log('\nNada a cadastrar: todas as OMs da lista já existem.');
    return;
  }

  console.log(`\nOMs a cadastrar (${faltando.length}), todas ATIVAS:`);
  faltando.forEach((nome) => console.log(`  + ${nome}`));

  if (apenasConferir) {
    console.log('\n--conferir: nada foi gravado.');
    return;
  }

  for (const nome of faltando) {
    // Cadastradas como ATIVAS de propósito: são unidades reais, registradas
    // deliberadamente pelo administrador, e precisam estar liberáveis desde já.
    // (Diferente do upload, onde OM desconhecida entra inativa para revisão.)
    await executar('INSERT INTO organizacoes_militares (nome, ativo) VALUES (?, TRUE)', [nome]);
  }

  const total = await consultarUm('SELECT COUNT(*) AS total FROM organizacoes_militares');
  console.log(`\nOK: ${faltando.length} OM(s) cadastrada(s). Total agora: ${total.total}.`);
  console.log('Em Gestão > Usuários já é possível conceder permissão a elas, mesmo sem base de dados.');
  console.log('Confira a grafia contra o formulário eletrônico — ver o comentário no topo deste arquivo.');
}

cadastrar()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((erro) => {
    console.error('\nFalha ao cadastrar as OMs:');
    console.error(`  ${erro.message}\n`);
    pool.end().finally(() => process.exit(1));
  });
