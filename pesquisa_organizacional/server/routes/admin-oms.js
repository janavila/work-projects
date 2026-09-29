/**
 * CRUD de Organizações Militares — seção 2.5 do documento da v2.
 * Restrito a administradores.
 *
 *   GET  /api/admin/oms        lista todas, inclusive as inativas
 *   POST /api/admin/oms        cadastra
 *   PUT  /api/admin/oms/:id    renomeia / ativa / desativa
 *
 * Atenção ao significado de `nome`: ele precisa bater EXATAMENTE com o valor da
 * coluna `om` dos dados processados, porque é essa string que o navegador
 * compara para decidir quais linhas o usuário pode ver. Renomear uma OM aqui
 * sem que o dado mude junto faz a permissão parar de casar — por isso a rota de
 * edição avisa quantos datasets usam aquela OM.
 */
'use strict';

const express = require('express');

const { consultar, consultarUm, executar } = require('../db');
const { requireAuth, requireAdmin } = require('../middlewares/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

function validarNome(nome) {
  const limpo = String(nome || '').trim();
  if (limpo.length < 2) return { erro: 'O nome da OM precisa ter ao menos 2 caracteres.' };
  if (limpo.length > 150) return { erro: 'O nome da OM não pode passar de 150 caracteres.' };
  return { nome: limpo };
}

router.get('/', async (req, res, next) => {
  try {
    const oms = await consultar(
      `SELECT om.id, om.nome, om.ativo, om.criado_em,
              (SELECT COUNT(*) FROM usuario_om_permissao p WHERE p.om_id = om.id)   AS total_usuarios,
              (SELECT COUNT(*) FROM dataset_om d WHERE d.om_id = om.id)             AS total_datasets
         FROM organizacoes_militares om
        ORDER BY om.ativo DESC, om.nome`
    );

    return res.json({
      oms: oms.map((om) => ({
        id: om.id,
        nome: om.nome,
        ativo: Boolean(om.ativo),
        criadoEm: om.criado_em,
        totalUsuarios: Number(om.total_usuarios),
        totalDatasets: Number(om.total_datasets),
      })),
    });
  } catch (erro) {
    return next(erro);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { nome, erro } = validarNome((req.body || {}).nome);
    if (erro) return res.status(400).json({ erro: 'dados_invalidos', mensagem: erro });

    const jaExiste = await consultarUm('SELECT id FROM organizacoes_militares WHERE nome = ?', [nome]);
    if (jaExiste) {
      return res.status(409).json({ erro: 'nome_duplicado', mensagem: 'Já existe uma OM cadastrada com este nome.' });
    }

    const ativo = (req.body || {}).ativo === undefined ? true : Boolean((req.body || {}).ativo);
    const resultado = await executar('INSERT INTO organizacoes_militares (nome, ativo) VALUES (?, ?)', [nome, ativo]);

    return res.status(201).json({ id: resultado.insertId, mensagem: 'OM cadastrada.' });
  } catch (erro) {
    return next(erro);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ erro: 'id_invalido', mensagem: 'Identificador de OM inválido.' });
    }

    const alvo = await consultarUm('SELECT id, nome, ativo FROM organizacoes_militares WHERE id = ?', [id]);
    if (!alvo) return res.status(404).json({ erro: 'nao_encontrado', mensagem: 'OM não encontrada.' });

    const corpo = req.body || {};
    const { nome, erro } = validarNome(corpo.nome === undefined ? alvo.nome : corpo.nome);
    if (erro) return res.status(400).json({ erro: 'dados_invalidos', mensagem: erro });

    const ativo = corpo.ativo === undefined ? Boolean(alvo.ativo) : Boolean(corpo.ativo);

    const nomeDeOutra = await consultarUm('SELECT id FROM organizacoes_militares WHERE nome = ? AND id <> ?', [nome, id]);
    if (nomeDeOutra) {
      return res.status(409).json({ erro: 'nome_duplicado', mensagem: 'Já existe outra OM com este nome.' });
    }

    await executar('UPDATE organizacoes_militares SET nome = ?, ativo = ? WHERE id = ?', [nome, ativo, id]);

    // Aviso (não impedimento): renomear uma OM já usada em dados processados faz
    // o nome cadastrado deixar de casar com a coluna `om` do CSV daqueles datasets.
    let aviso = null;
    if (nome !== alvo.nome) {
      const uso = await consultarUm('SELECT COUNT(*) AS total FROM dataset_om WHERE om_id = ?', [id]);
      if (Number(uso.total) > 0) {
        aviso = `Esta OM aparece em ${uso.total} dataset(s) já processado(s). O nome cadastrado precisa ser idêntico ao valor da coluna "om" dentro do CSV, senão as permissões deixam de casar com os dados.`;
      }
    }

    return res.json({ mensagem: 'OM atualizada.', aviso });
  } catch (erro) {
    return next(erro);
  }
});

module.exports = router;
