const db = require('../db/database');

// Ajusta permanentemente a quantidade (e o valor_total) de um item do
// empenho. delta negativo = consumindo (recebimento ou anulação); delta
// positivo = desfazendo uma operação anterior (devolve).
function ajustarQuantidadeItem(itemEmpenhoId, delta) {
  const item = db.prepare('SELECT * FROM itens_empenho WHERE id = ?').get(itemEmpenhoId);
  const novaQuantidade = item.quantidade + delta;
  const novoValorTotal = novaQuantidade * item.valor_unitario;
  db.prepare('UPDATE itens_empenho SET quantidade = ?, valor_total = ? WHERE id = ?')
    .run(novaQuantidade, novoValorTotal, itemEmpenhoId);
}

// Quantidade ainda disponível de um item do empenho = quantidade atual, já
// líquida de recebimentos e anulações anteriores (ambos reduzem
// itens_empenho.quantidade permanentemente).
//
// Ao editar um recebimento/anulação existente, a quantidade que ELA MESMA já
// retirou precisa ser devolvida temporariamente à conta, já que
// itens_empenho.quantidade já foi reduzido por essa operação — usado apenas
// para exibição (dropdown) ao abrir o formulário de edição; a persistência
// em si (PUT) restaura e reaplica os valores diretamente no banco.
function quantidadeDisponivel(itemEmpenhoId, opcoes = {}) {
  const { excluirRecebimentoId, excluirAnulacaoId } = opcoes;

  const item = db.prepare('SELECT * FROM itens_empenho WHERE id = ?').get(itemEmpenhoId);
  if (!item) return null;

  const recebidoPelaPropria = excluirRecebimentoId
    ? db.prepare(`
        SELECT COALESCE(SUM(quantidade), 0) AS total FROM itens_recebidos
        WHERE item_empenho_id = ? AND recebimento_id = ?
      `).get(itemEmpenhoId, excluirRecebimentoId).total
    : 0;

  const anuladoPelaPropria = excluirAnulacaoId
    ? db.prepare(`
        SELECT COALESCE(SUM(quantidade), 0) AS total FROM itens_anulados
        WHERE item_empenho_id = ? AND anulacao_id = ?
      `).get(itemEmpenhoId, excluirAnulacaoId).total
    : 0;

  return { ...item, quantidade_disponivel: item.quantidade + recebidoPelaPropria + anuladoPelaPropria };
}

function itensDisponiveisDoEmpenho(empenhoId, opcoes = {}) {
  const itens = db.prepare('SELECT id FROM itens_empenho WHERE empenho_id = ? ORDER BY numero').all(empenhoId);
  return itens.map((it) => quantidadeDisponivel(it.id, opcoes));
}

module.exports = { ajustarQuantidadeItem, quantidadeDisponivel, itensDisponiveisDoEmpenho };
