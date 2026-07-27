(() => {
  const { api, query, toast, formatMoeda, formatDataBR, anexarMascaraFavorecido, anexarMascaraMoeda,
    valorMoedaInput, favorecidoValido, tipoFavorecido, digitsOnly, optionsHtml, NATUREZA_LABEL,
    UG_OPCOES, MODALIDADE_OPCOES, dataValida, hojeISO } = SisAprov;

  let contadorItem = 0;

  function linhaItemHtml(item) {
    contadorItem += 1;
    const idLinha = `item-${contadorItem}`;
    const numero = item && item.numero !== undefined ? item.numero : '';
    const descricao = (item && item.descricao) || '';
    const quantidade = item && item.quantidade !== undefined ? item.quantidade : '';
    return `
      <div class="item-linha" data-linha="${idLinha}">
        <div class="campo"><label>Nº</label><input type="text" value="${numero}" data-campo="numero" readonly></div>
        <div class="campo"><label>Descrição</label><input type="text" data-campo="descricao" value="${descricao}" placeholder="Descrição do item"></div>
        <div class="campo"><label>Quantidade</label><input type="number" min="1" step="1" data-campo="quantidade" value="${quantidade}"></div>
        <div class="campo"><label>Valor Unitário</label><input type="text" inputmode="decimal" data-campo="valor_unitario" placeholder="0,00"></div>
        <div class="campo"><label>Valor Total</label><input type="text" data-campo="valor_total" readonly value="R$ 0,00"></div>
        <button type="button" class="item-remover" title="Remover item">✕</button>
      </div>
    `;
  }

  function conectarLinha(linha, item, aoAlterar) {
    const qtdInput = linha.querySelector('[data-campo="quantidade"]');
    const valorInput = linha.querySelector('[data-campo="valor_unitario"]');
    const totalInput = linha.querySelector('[data-campo="valor_total"]');

    anexarMascaraMoeda(valorInput, (item && item.valor_unitario) || 0);

    function recalcular() {
      qtdInput.value = digitsOnly(qtdInput.value);
      const qtd = Number(qtdInput.value) || 0;
      const vu = valorMoedaInput(valorInput);
      totalInput.value = formatMoeda(qtd * vu);
      aoAlterar();
    }

    qtdInput.addEventListener('input', recalcular);
    valorInput.addEventListener('input', recalcular);
    linha.querySelector('.item-remover').addEventListener('click', () => {
      linha.remove();
      aoAlterar();
    });

    recalcular();
  }

  function lerItens(listaEl) {
    return [...listaEl.querySelectorAll('.item-linha')].map((linha, idx) => ({
      numero: idx + 1,
      descricao: linha.querySelector('[data-campo="descricao"]').value.trim(),
      quantidade: Number(linha.querySelector('[data-campo="quantidade"]').value),
      valor_unitario: valorMoedaInput(linha.querySelector('[data-campo="valor_unitario"]')),
    }));
  }

  async function renderAdicionar(container, empenhoId) {
    const notasCredito = await api.get('/api/notas-credito');
    const editando = Boolean(empenhoId);
    let empenho = null;
    if (editando) {
      empenho = await api.get(`/api/empenhos/${empenhoId}`);
    }

    // Notas de Crédito sem saldo não podem ser selecionadas — exceto a que já
    // está vinculada ao empenho em edição (para não sumir do formulário).
    const opcoesNc = notasCredito.filter((n) => n.valor_atual > 0
      || (editando && String(n.id) === String(empenho.nota_credito_id)));

    container.innerHTML = `
      <div class="painel">
        <form id="formEmpenho">
          <div class="form-grid">
            <div class="campo">
              <label>Nº do Empenho</label>
              <input type="text" id="numeroEmpenho" placeholder="202XNE000XXX" required>
            </div>
            <div class="campo">
              <label>Favorecido (CNPJ/CPF)</label>
              <input type="text" id="favorecido" placeholder="Digite os números" required>
              <small class="erro" id="favorecidoErro" style="display:none">Favorecido inválido</small>
            </div>
            <div class="campo">
              <label>Nome do Credor</label>
              <input type="text" id="nomeCredor" placeholder="Preenchido automaticamente (CNPJ) ou manual (CPF)">
            </div>
            <div class="campo">
              <label>Data de Emissão</label>
              <input type="date" id="dataEmissao" required>
              <small class="erro" id="erroDataInvalida" style="display:none">Data inválida (não pode ser anterior a 2024).</small>
              <small class="erro" id="avisoDataEmissao" style="display:none">A data não pode ser anterior à emissão da Nota de Crédito.</small>
            </div>
            <div class="campo">
              <label>UG</label>
              <select id="ug" required>${optionsHtml(UG_OPCOES, empenho?.ug)}</select>
              <small class="erro" id="avisoUgDivergente" style="display:none">A UG deve ser igual à UG da Nota de Crédito selecionada.</small>
            </div>
            <div class="campo">
              <label>Natureza de Despesa</label>
              <select id="naturezaDespesa" required>${optionsHtml(Object.keys(NATUREZA_LABEL), empenho?.natureza_despesa, NATUREZA_LABEL)}</select>
            </div>
            <div class="campo">
              <label>Modalidade</label>
              <select id="modalidade" required>${optionsHtml(MODALIDADE_OPCOES, empenho?.modalidade)}</select>
            </div>
            <div class="campo">
              <label>Nota de Crédito</label>
              <select id="notaCredito">${optionsHtml(opcoesNc.map(n => n.id), empenho?.nota_credito_id, Object.fromEntries(opcoesNc.map(n => [n.id, n.numero_nc])))}</select>
            </div>
            <div class="campo">
              <label>Plano Interno da NC</label>
              <input type="text" id="ncPlanoInterno" readonly>
            </div>
            <div class="campo">
              <label>Valor Atual da NC</label>
              <input type="text" id="ncValorAtual" readonly>
              <small class="erro" id="avisoNcSaldo" style="display:none">O valor global deste empenho excede o saldo disponível da NC.</small>
              <small class="dica" id="avisoNcNatureza" style="display:none;color:var(--dourado-escuro);font-weight:600">Atenção: a Natureza de Despesa difere da ND cadastrada nesta Nota de Crédito.</small>
            </div>
          </div>

          <h3 style="margin:24px 0 6px;color:var(--azul-escuro)">Itens do Empenho</h3>
          <div class="itens-lista" id="listaItens"></div>
          <button type="button" class="btn btn-secundario" id="btnAddItem">+ Adicionar item</button>

          <div class="form-grid" style="margin-top:20px">
            <div class="campo">
              <label>Valor Global</label>
              <input type="text" id="valorGlobal" readonly value="R$ 0,00">
            </div>
            <div class="campo">
              <label>Saldo Atual</label>
              <input type="text" id="saldoAtual" readonly value="R$ 0,00">
            </div>
            <div class="campo campo--full">
              <label>Descrição</label>
              <textarea id="descricao" rows="2" placeholder="Exemplo: Aquisição de QR para provisão até AGO/26." required>${empenho?.descricao || ''}</textarea>
            </div>
          </div>

          <div class="acoes-form">
            <button type="submit" class="btn btn-primario">${editando ? 'Salvar Alterações' : 'Adicionar'}</button>
            ${editando ? '<button type="button" class="btn btn-secundario" id="btnVoltar">Voltar</button>' : ''}
            ${editando ? '<button type="button" class="btn btn-perigo" id="btnExcluir">Excluir Empenho</button>' : ''}
          </div>
        </form>
      </div>
    `;

    const listaItens = container.querySelector('#listaItens');
    const favorecidoInput = container.querySelector('#favorecido');
    const nomeCredorInput = container.querySelector('#nomeCredor');
    const favorecidoErro = container.querySelector('#favorecidoErro');
    const notaCreditoSelect = container.querySelector('#notaCredito');
    const ncPlanoInternoInput = container.querySelector('#ncPlanoInterno');
    const ncValorAtualInput = container.querySelector('#ncValorAtual');
    const avisoNcSaldo = container.querySelector('#avisoNcSaldo');
    const avisoNcNatureza = container.querySelector('#avisoNcNatureza');
    const naturezaSelect = container.querySelector('#naturezaDespesa');
    const dataEmissaoInput = container.querySelector('#dataEmissao');
    const avisoDataEmissao = container.querySelector('#avisoDataEmissao');
    const erroDataInvalida = container.querySelector('#erroDataInvalida');
    const ugSelect = container.querySelector('#ug');
    const avisoUgDivergente = container.querySelector('#avisoUgDivergente');
    let itensBloqueados = false;

    function validarDataEmissao() {
      if (!dataEmissaoInput.value) { erroDataInvalida.style.display = 'none'; return false; }
      if (!dataValida(dataEmissaoInput.value)) {
        erroDataInvalida.textContent = 'Data inválida (não pode ser anterior a 2024).';
        erroDataInvalida.style.display = 'block';
        return false;
      }
      if (dataEmissaoInput.value > hojeISO()) {
        erroDataInvalida.textContent = 'A data de emissão não pode ser posterior ao dia de hoje.';
        erroDataInvalida.style.display = 'block';
        return false;
      }
      erroDataInvalida.style.display = 'none';
      return true;
    }

    function ncSelecionada() {
      return notasCredito.find((n) => String(n.id) === notaCreditoSelect.value);
    }

    function atualizarAvisos() {
      const nc = ncSelecionada();
      if (!nc) {
        avisoNcSaldo.style.display = 'none';
        avisoNcNatureza.style.display = 'none';
        avisoDataEmissao.style.display = 'none';
        avisoUgDivergente.style.display = 'none';
        return;
      }

      const itens = lerItens(listaItens);
      const valorGlobal = itens.reduce((soma, it) => soma + (it.quantidade || 0) * (it.valor_unitario || 0), 0);
      const jaUsadoNestaNc = (editando && String(empenho.nota_credito_id) === String(nc.id)) ? empenho.valor_global : 0;
      const saldoDisponivelParaEste = nc.valor_atual + jaUsadoNestaNc;
      avisoNcSaldo.style.display = valorGlobal > saldoDisponivelParaEste + 0.005 ? 'block' : 'none';

      avisoNcNatureza.style.display = (nc.nd && naturezaSelect.value && nc.nd !== naturezaSelect.value) ? 'block' : 'none';

      avisoDataEmissao.style.display = (dataEmissaoInput.value && nc.data_emissao && dataEmissaoInput.value < nc.data_emissao) ? 'block' : 'none';

      avisoUgDivergente.style.display = (nc.ug && ugSelect.value && nc.ug !== ugSelect.value) ? 'block' : 'none';
    }

    function atualizarTotais() {
      const itens = lerItens(listaItens);
      const valorGlobalCalculado = itens.reduce((soma, it) => soma + (it.quantidade || 0) * (it.valor_unitario || 0), 0);
      // Quando os itens estão bloqueados (há recebimentos), eles já refletem as
      // quantidades recebidas mas o Valor Global do empenho não é afetado por
      // recebimento (só por anulação) — por isso usamos o valor já salvo.
      const valorGlobal = itensBloqueados ? empenho.valor_global : valorGlobalCalculado;
      container.querySelector('#valorGlobal').value = formatMoeda(valorGlobal);
      const jaRecebidoOuAnulado = editando ? (empenho.valor_global - empenho.saldo_atual) : 0;
      container.querySelector('#saldoAtual').value = formatMoeda(valorGlobal - jaRecebidoOuAnulado);
      atualizarAvisos();
    }

    function adicionarLinha(item) {
      listaItens.insertAdjacentHTML('beforeend', linhaItemHtml(item || { numero: listaItens.children.length + 1 }));
      const linha = listaItens.lastElementChild;
      conectarLinha(linha, item, atualizarTotais);
    }

    container.querySelector('#btnAddItem').addEventListener('click', () => adicionarLinha());

    function atualizarInfoNc() {
      const nc = ncSelecionada();
      ncPlanoInternoInput.value = nc ? (nc.plano_interno || '-') : '';
      ncValorAtualInput.value = nc ? formatMoeda(nc.valor_atual) : '';
      atualizarAvisos();
    }
    notaCreditoSelect.addEventListener('change', atualizarInfoNc);
    naturezaSelect.addEventListener('change', atualizarAvisos);
    ugSelect.addEventListener('change', atualizarAvisos);
    dataEmissaoInput.addEventListener('change', () => { validarDataEmissao(); atualizarAvisos(); });
    dataEmissaoInput.addEventListener('input', validarDataEmissao);

    anexarMascaraFavorecido(favorecidoInput, (valido, tipo) => {
      favorecidoErro.style.display = valido ? 'none' : (favorecidoInput.value ? 'block' : 'none');
      if (valido && tipo === 'CNPJ') {
        const digitos = digitsOnly(favorecidoInput.value);
        nomeCredorInput.placeholder = 'Consultando…';
        api.get(`/api/cnpj/${digitos}`).then((r) => {
          if (r && r.nomeCredor) nomeCredorInput.value = r.nomeCredor;
        }).catch(() => {
          toast('Não foi possível localizar a razão social automaticamente. Preencha manualmente.', 'info');
        });
      }
    });

    if (editando) {
      container.querySelector('#numeroEmpenho').value = empenho.numero_empenho;
      favorecidoInput.value = SisAprov.formatFavorecido(empenho.favorecido);
      nomeCredorInput.value = empenho.nome_credor || '';
      container.querySelector('#dataEmissao').value = empenho.data_emissao;
      (empenho.itens.length ? empenho.itens : [null]).forEach((it) => adicionarLinha(it));
      atualizarInfoNc();

      itensBloqueados = empenho.quantidade_provisoes > 0 || empenho.quantidade_anulacoes > 0;
      if (itensBloqueados) {
        listaItens.querySelectorAll('input, button').forEach((elx) => { elx.disabled = true; });
        container.querySelector('#btnAddItem').disabled = true;
        toast('Este empenho já possui recebimentos ou anulações: os itens não podem ser alterados.', 'info');
      }
    } else {
      adicionarLinha();
    }
    atualizarTotais();

    if (editando) {
      container.querySelector('#btnVoltar').addEventListener('click', () => {
        SisAprov.irPara('empenhos-visualizar', { preservar: true });
      });

      container.querySelector('#btnExcluir').addEventListener('click', async () => {
        if (!confirm('Confirma a exclusão deste empenho? Esta ação não pode ser desfeita.')) return;
        try {
          await api.del(`/api/empenhos/${empenhoId}`);
          toast('Empenho excluído com sucesso.', 'sucesso');
          SisAprov.irPara('empenhos-visualizar', { preservar: true });
        } catch (erro) {
          toast(erro.message, 'erro');
        }
      });
    }

    container.querySelector('#formEmpenho').addEventListener('submit', async (evento) => {
      evento.preventDefault();

      if (!favorecidoValido(favorecidoInput.value)) {
        favorecidoErro.style.display = 'block';
        toast('Favorecido inválido', 'erro');
        return;
      }

      const itens = lerItens(listaItens);
      if (!itens.length || itens.some((it) => !it.descricao || !it.quantidade || !it.valor_unitario)) {
        toast('Preencha corretamente todos os itens do empenho', 'erro');
        return;
      }

      const descricaoValor = container.querySelector('#descricao').value.trim();
      if (!descricaoValor) {
        toast('A descrição do empenho é obrigatória', 'erro');
        return;
      }

      if (!validarDataEmissao()) {
        toast('Data de emissão inválida (não pode ser anterior a 2024)', 'erro');
        return;
      }

      atualizarAvisos();
      if (avisoDataEmissao.style.display !== 'none') {
        toast('A data de emissão não pode ser anterior à emissão da Nota de Crédito.', 'erro');
        return;
      }
      if (avisoNcSaldo.style.display !== 'none') {
        toast('A Nota de Crédito selecionada não possui saldo suficiente para este empenho.', 'erro');
        return;
      }
      if (avisoUgDivergente.style.display !== 'none') {
        toast('A UG do empenho deve ser igual à UG da Nota de Crédito selecionada.', 'erro');
        return;
      }

      const payload = {
        numero_empenho: container.querySelector('#numeroEmpenho').value.trim(),
        favorecido: digitsOnly(favorecidoInput.value),
        nome_credor: nomeCredorInput.value.trim() || null,
        data_emissao: container.querySelector('#dataEmissao').value,
        ug: container.querySelector('#ug').value,
        natureza_despesa: container.querySelector('#naturezaDespesa').value,
        modalidade: container.querySelector('#modalidade').value,
        nota_credito_id: notaCreditoSelect.value || null,
        descricao: descricaoValor,
        itens,
      };

      try {
        if (editando) {
          if (itensBloqueados) delete payload.itens;
          await api.put(`/api/empenhos/${empenhoId}`, payload);
          toast('Empenho atualizado com sucesso.', 'sucesso');
        } else {
          await api.post('/api/empenhos', payload);
          toast('Empenho adicionado com sucesso.', 'sucesso');
        }
        SisAprov.irPara('empenhos-visualizar', { preservar: editando });
      } catch (erro) {
        toast(erro.message, 'erro');
      }
    });
  }

  const ORDEM_COLUNAS = { data: 'Data', dias: 'Dias', saldo: 'Saldo', planoInterno: 'Plano Interno' };
  let filtroAtual = {};
  let ordemAtual = { orderBy: 'data', orderDir: 'desc' };

  function celulaObsHtml(emp) {
    return emp.observacao
      ? `<span title="${emp.observacao}">${emp.observacao.length > 24 ? emp.observacao.slice(0, 24) + '…' : emp.observacao}</span> <button class="btn-icone btn-obs" title="Editar observação">✎</button>`
      : `<button class="btn btn-secundario btn-obs">+ Adicionar</button>`;
  }

  function ativarEdicaoObs(celula, emp) {
    celula.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:6px;min-width:170px">
        <textarea class="obs-textarea" rows="2">${emp.observacao || ''}</textarea>
        <div style="display:flex;gap:6px">
          <button type="button" class="btn btn-primario btn-salvar-obs">Salvar</button>
          <button type="button" class="btn btn-secundario btn-cancelar-obs">Cancelar</button>
        </div>
      </div>
    `;
    celula.querySelector('.btn-salvar-obs').addEventListener('click', async (evento) => {
      evento.stopPropagation();
      const novoValor = celula.querySelector('.obs-textarea').value.trim();
      try {
        await api.patch(`/api/empenhos/${emp.id}/observacao`, { observacao: novoValor });
        emp.observacao = novoValor;
        bindCelulaObs(celula, emp);
        toast('Observação salva.', 'sucesso');
      } catch (erro) {
        toast(erro.message, 'erro');
      }
    });
    celula.querySelector('.btn-cancelar-obs').addEventListener('click', (evento) => {
      evento.stopPropagation();
      bindCelulaObs(celula, emp);
    });
  }

  function bindCelulaObs(celula, emp) {
    celula.innerHTML = celulaObsHtml(emp);
    celula.querySelector('.btn-obs').addEventListener('click', (evento) => {
      evento.stopPropagation();
      ativarEdicaoObs(celula, emp);
    });
  }

  function classeDias(dias) {
    if (dias > 60) return 'badge-dias-vermelho';
    if (dias > 30) return 'badge-dias-amarelo';
    return 'badge-dias-verde';
  }

  async function carregarTabelaEmpenhos(corpoTabela) {
    const empenhos = await api.get('/api/empenhos' + query({ ...filtroAtual, ...ordemAtual }));
    if (!empenhos.length) {
      corpoTabela.innerHTML = '<tr><td colspan="11"><div class="vazio">Nenhum empenho encontrado.</div></td></tr>';
      return;
    }

    corpoTabela.innerHTML = empenhos.map((emp) => `
      <tr class="linha-clicavel" data-id="${emp.id}">
        <td><button class="btn-icone btn-expandir-prov" data-expandir-prov="${emp.id}" title="Ver provisões e anulações">▾</button></td>
        <td>${emp.numero_empenho}</td>
        <td>${SisAprov.formatFavorecido(emp.favorecido)}</td>
        <td>${emp.nome_credor || '-'}</td>
        <td>${formatDataBR(emp.data_emissao)}</td>
        <td><span class="badge ${classeDias(emp.dias)}">${emp.dias}</span></td>
        <td>${NATUREZA_LABEL[emp.natureza_despesa] || emp.natureza_despesa}</td>
        <td>${formatMoeda(emp.valor_global)}</td>
        <td>${formatMoeda(emp.saldo_atual)}</td>
        <td><span class="badge ${emp.saldo_atual > 0 ? 'badge-verde' : 'badge-dourado'}">${emp.saldo_atual > 0 ? 'Ativo' : 'Liquidado'}</span></td>
        <td id="obsCell-${emp.id}"></td>
      </tr>
      <tr class="linha-provisoes" data-provisoes="${emp.id}" style="display:none">
        <td colspan="11"><div class="vazio">Carregando…</div></td>
      </tr>
      <tr class="linha-detalhe" data-detalhe="${emp.id}" style="display:none">
        <td colspan="11">
          <strong>UG:</strong> ${emp.ug} &nbsp;•&nbsp;
          <strong>Modalidade:</strong> ${emp.modalidade} &nbsp;•&nbsp;
          <strong>Plano Interno:</strong> ${emp.plano_interno || '-'} &nbsp;•&nbsp;
          <strong>Qtd. Provisões Recebidas:</strong> ${emp.quantidade_provisoes} &nbsp;•&nbsp;
          <strong>Descrição:</strong> ${emp.descricao || '-'}
          <div style="margin-top:10px">
            <button class="btn btn-secundario btn-editar" data-editar="${emp.id}">✎ Editar</button>
          </div>
        </td>
      </tr>
    `).join('');

    empenhos.forEach((emp) => {
      bindCelulaObs(corpoTabela.querySelector(`#obsCell-${emp.id}`), emp);
    });

    corpoTabela.querySelectorAll('.btn-expandir-prov').forEach((btn) => {
      btn.addEventListener('click', async (evento) => {
        evento.stopPropagation();
        const linhaProv = corpoTabela.querySelector(`tr[data-provisoes="${btn.dataset.expandirProv}"]`);
        const abrindo = linhaProv.style.display === 'none';
        linhaProv.style.display = abrindo ? 'table-row' : 'none';
        btn.textContent = abrindo ? '▴' : '▾';
        if (!abrindo) return;

        const [recebimentos, anulacoes] = await Promise.all([
          api.get(`/api/recebimentos?empenhoId=${btn.dataset.expandirProv}`),
          api.get(`/api/anulacoes?empenho_id=${btn.dataset.expandirProv}`),
        ]);

        const tabelaProvisoes = !recebimentos.length
          ? '<div class="vazio">Nenhuma provisão recebida para este empenho.</div>'
          : `
            <div class="tabela-wrap">
              <table class="tabela">
                <thead><tr><th>Nº NF</th><th>Data NF</th><th>Valor NF</th><th>Data Receb.</th><th>Presidente Comissão</th></tr></thead>
                <tbody>
                  ${recebimentos.map((r) => `
                    <tr>
                      <td>${r.numero_nota_fiscal}</td>
                      <td>${formatDataBR(r.data_nota_fiscal)}</td>
                      <td>${formatMoeda(r.valor_nf)}</td>
                      <td>${formatDataBR(r.data_recebimento)}</td>
                      <td>${r.presidente_comissao || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;

        const tabelaAnulacoes = !anulacoes.length
          ? '<div class="vazio">Nenhuma anulação registrada para este empenho.</div>'
          : `
            <div class="tabela-wrap">
              <table class="tabela">
                <thead><tr><th>Data</th><th>Valor Anulado</th></tr></thead>
                <tbody>
                  ${anulacoes.map((a) => `
                    <tr>
                      <td>${formatDataBR(a.data)}</td>
                      <td>${formatMoeda(a.valor_anulado)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;

        linhaProv.querySelector('td').innerHTML = `
          <strong style="color:var(--azul-escuro)">Provisões Recebidas</strong>
          <div style="margin:8px 0 18px">${tabelaProvisoes}</div>
          <strong style="color:var(--azul-escuro)">Anulações</strong>
          <div style="margin-top:8px">${tabelaAnulacoes}</div>
        `;
      });
    });

    corpoTabela.querySelectorAll('tr.linha-clicavel').forEach((linha) => {
      linha.addEventListener('click', () => {
        const detalhe = corpoTabela.querySelector(`tr[data-detalhe="${linha.dataset.id}"]`);
        detalhe.style.display = detalhe.style.display === 'none' ? 'table-row' : 'none';
      });
    });
    corpoTabela.querySelectorAll('.btn-editar').forEach((btn) => {
      btn.addEventListener('click', (evento) => {
        evento.stopPropagation();
        SisAprov.irPara('empenhos-adicionar', btn.dataset.editar);
      });
    });
  }

  async function renderVisualizar(container, opcoes) {
    if (!opcoes || !opcoes.preservar) {
      filtroAtual = {};
      ordemAtual = { orderBy: 'data', orderDir: 'desc' };
    }
    const notasCredito = await api.get('/api/notas-credito');

    container.innerHTML = `
      <div class="painel">
        <div class="filtros">
          <div class="campo">
            <label>Plano Interno</label>
            <select id="filtroPlano">${optionsHtml([...new Set(notasCredito.map(n => n.plano_interno).filter(Boolean))], filtroAtual.planoInterno)}</select>
          </div>
          <div class="campo">
            <label>Favorecido</label>
            <input type="text" id="filtroFavorecido" placeholder="Somente números (CNPJ/CPF)" inputmode="numeric" maxlength="14" value="${filtroAtual.favorecido || ''}">
          </div>
          <div class="campo">
            <label>Natureza de Despesa</label>
            <select id="filtroNatureza">${optionsHtml(Object.keys(NATUREZA_LABEL), filtroAtual.naturezaDespesa, NATUREZA_LABEL)}</select>
          </div>
          <div class="campo"><label>Emissão de</label><input type="date" id="filtroDataInicio" value="${filtroAtual.dataInicio || ''}"></div>
          <div class="campo"><label>Emissão até</label><input type="date" id="filtroDataFim" value="${filtroAtual.dataFim || ''}"></div>
          <div class="campo">
            <label>Situação</label>
            <select id="filtroSituacao">
              <option value="">Todos</option>
              <option value="ativo" ${filtroAtual.situacao === 'ativo' ? 'selected' : ''}>Ativo</option>
              <option value="liquidado" ${filtroAtual.situacao === 'liquidado' ? 'selected' : ''}>Liquidado</option>
            </select>
          </div>
          <div class="campo">
            <label>Ordenar por</label>
            <select id="ordenarPor">${optionsHtml(Object.keys(ORDEM_COLUNAS), ordemAtual.orderBy, ORDEM_COLUNAS)}</select>
          </div>
          <button type="button" class="btn btn-secundario" id="btnInverterOrdem" title="Inverter ordem">⇅ ${ordemAtual.orderDir === 'desc' ? 'Desc.' : 'Asc.'}</button>
          <button class="btn btn-primario" id="btnFiltrar">Filtrar</button>
          <button type="button" class="btn btn-secundario" id="btnLimparFiltros">Limpar Filtros</button>
          <button class="btn btn-secundario" id="btnExtrairPdf">⭳ Extrair Empenhos (PDF)</button>
        </div>
        <small class="dica" style="display:block;margin:-8px 0 16px">⚠ Ajustar hora/data do relógio do computador antes de fazer a extração.</small>

        <div class="tabela-wrap">
          <table class="tabela">
            <thead>
              <tr>
                <th></th>
                <th>Empenho</th><th>Favorecido</th><th>Credor</th>
                <th>Data</th>
                <th>Dias</th>
                <th>Natureza</th><th>Vlr. Global</th>
                <th>Saldo</th>
                <th>Situação</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody id="corpoTabelaEmpenhos"><tr><td colspan="11"><div class="vazio">Carregando…</div></td></tr></tbody>
          </table>
        </div>
      </div>
    `;

    const corpoTabela = container.querySelector('#corpoTabelaEmpenhos');
    await carregarTabelaEmpenhos(corpoTabela);

    const filtroFavorecidoInput = container.querySelector('#filtroFavorecido');
    filtroFavorecidoInput.addEventListener('input', () => {
      filtroFavorecidoInput.value = digitsOnly(filtroFavorecidoInput.value).slice(0, 14);
    });

    const btnInverter = container.querySelector('#btnInverterOrdem');
    function atualizarTextoOrdem() {
      btnInverter.textContent = ordemAtual.orderDir === 'desc' ? '⇅ Desc.' : '⇅ Asc.';
    }

    container.querySelector('#btnFiltrar').addEventListener('click', async () => {
      const favorecidoDigitado = filtroFavorecidoInput.value;
      if (favorecidoDigitado && favorecidoDigitado.length < 11) {
        toast('Informe ao menos 11 dígitos (CPF) para pesquisar por favorecido.', 'erro');
        return;
      }
      filtroAtual = {
        planoInterno: container.querySelector('#filtroPlano').value,
        favorecido: favorecidoDigitado,
        naturezaDespesa: container.querySelector('#filtroNatureza').value,
        dataInicio: container.querySelector('#filtroDataInicio').value,
        dataFim: container.querySelector('#filtroDataFim').value,
        situacao: container.querySelector('#filtroSituacao').value,
      };
      await carregarTabelaEmpenhos(corpoTabela);
    });

    container.querySelector('#btnLimparFiltros').addEventListener('click', async () => {
      container.querySelector('#filtroPlano').value = '';
      filtroFavorecidoInput.value = '';
      container.querySelector('#filtroNatureza').value = '';
      container.querySelector('#filtroDataInicio').value = '';
      container.querySelector('#filtroDataFim').value = '';
      container.querySelector('#filtroSituacao').value = '';
      filtroAtual = {};
      await carregarTabelaEmpenhos(corpoTabela);
    });

    container.querySelector('#ordenarPor').addEventListener('change', async (evento) => {
      ordemAtual.orderBy = evento.target.value;
      await carregarTabelaEmpenhos(corpoTabela);
    });

    btnInverter.addEventListener('click', async () => {
      ordemAtual.orderDir = ordemAtual.orderDir === 'desc' ? 'asc' : 'desc';
      atualizarTextoOrdem();
      await carregarTabelaEmpenhos(corpoTabela);
    });

    container.querySelector('#btnExtrairPdf').addEventListener('click', () => {
      window.open('/api/empenhos/extrair/pdf' + query(filtroAtual), '_blank');
    });
  }

  function linhaItemAnuladoHtml(itensDisponiveis) {
    const opcoesItens = itensDisponiveis
      .filter((it) => it.quantidade_disponivel > 0)
      .map((it) => `<option value="${it.id}" data-disponivel="${it.quantidade_disponivel}" data-valor="${it.valor_unitario}">${it.descricao} (disp.: ${it.quantidade_disponivel})</option>`)
      .join('');

    return `
      <div class="item-linha" data-anulado="1">
        <div class="campo campo--full" style="grid-column:1 / span 2">
          <label>Item (por descrição)</label>
          <select data-campo="item_empenho_id"><option value="">Selecione…</option>${opcoesItens}</select>
        </div>
        <div class="campo">
          <label>Quantidade a Anular</label>
          <input type="number" min="1" step="1" data-campo="quantidade">
          <small class="erro" data-campo="erroQuantidade" style="display:none"></small>
        </div>
        <div class="campo"><label>Valor Unitário</label><input type="text" data-campo="valor_unitario" readonly value="R$ 0,00"></div>
        <div class="campo"><label>Valor Total</label><input type="text" data-campo="valor_total" readonly value="R$ 0,00"></div>
        <button type="button" class="item-remover" title="Remover item">✕</button>
      </div>
    `;
  }

  function conectarLinhaAnulada(linha, aoAlterar) {
    const select = linha.querySelector('[data-campo="item_empenho_id"]');
    const qtdInput = linha.querySelector('[data-campo="quantidade"]');
    const valorUnitInput = linha.querySelector('[data-campo="valor_unitario"]');
    const valorTotalInput = linha.querySelector('[data-campo="valor_total"]');
    const erroQtd = linha.querySelector('[data-campo="erroQuantidade"]');

    function recalcular() {
      qtdInput.value = digitsOnly(qtdInput.value);
      const opcaoSelecionada = select.selectedOptions[0];
      const disponivel = opcaoSelecionada ? Number(opcaoSelecionada.dataset.disponivel || 0) : 0;
      const valorUnitario = opcaoSelecionada ? Number(opcaoSelecionada.dataset.valor || 0) : 0;
      qtdInput.max = disponivel || '';
      valorUnitInput.value = formatMoeda(valorUnitario);
      const qtdDigitada = Number(qtdInput.value) || 0;
      valorTotalInput.value = formatMoeda(qtdDigitada * valorUnitario);

      if (opcaoSelecionada && opcaoSelecionada.value && qtdDigitada > disponivel) {
        erroQtd.textContent = `Quantidade maior que a disponível (${disponivel}).`;
        erroQtd.style.display = 'block';
      } else {
        erroQtd.style.display = 'none';
      }
      aoAlterar();
    }

    select.addEventListener('change', recalcular);
    qtdInput.addEventListener('input', recalcular);
    linha.querySelector('.item-remover').addEventListener('click', () => {
      linha.remove();
      aoAlterar();
    });
  }

  async function renderAnulacao(container, anulacaoId) {
    const editando = Boolean(anulacaoId);
    let anulacaoExistente = null;
    let empenhoFixo = null;
    let empenhos = [];

    if (editando) {
      anulacaoExistente = await api.get(`/api/anulacoes/${anulacaoId}`);
      empenhoFixo = await api.get(`/api/empenhos/${anulacaoExistente.empenho_id}`);
    } else {
      empenhos = await api.get('/api/empenhos' + query({ apenasAtivos: 'true' }));
    }

    const opcoesEmpenhoHtml = editando
      ? `<option value="${empenhoFixo.id}" selected>${empenhoFixo.numero_empenho} — ${SisAprov.formatFavorecido(empenhoFixo.favorecido)}</option>`
      : optionsHtml(empenhos.map(e => e.id), '', Object.fromEntries(empenhos.map(e => [e.id, `${e.numero_empenho} — ${SisAprov.formatFavorecido(e.favorecido)} — Saldo: ${formatMoeda(e.saldo_atual)}`])));

    container.innerHTML = `
      <div class="painel">
        <form id="formAnulacao">
          <div class="form-grid">
            <div class="campo campo--full">
              <label>Nota de Empenho</label>
              <select id="empenhoSelect" required ${editando ? 'disabled' : ''}>${opcoesEmpenhoHtml}</select>
            </div>
          </div>

          <div id="dadosAuto" style="display:none">
            <h3 style="margin:22px 0 6px;color:var(--azul-escuro)">Itens a Anular</h3>
            <div class="itens-lista" id="listaItensAnulados"></div>
            <button type="button" class="btn btn-secundario" id="btnAddItemAnulado">+ Adicionar item</button>

            <div class="form-grid" style="margin-top:20px">
              <div class="campo"><label>Valor Total Anulado</label><input type="text" id="valorTotalAnulado" readonly value="R$ 0,00"></div>
              <div class="campo">
                <label>Data</label>
                <input type="date" id="dataAnulacao" required>
                <small class="erro" id="erroDataAnulacao" style="display:none">Data inválida (não pode ser anterior a 2024).</small>
              </div>
            </div>

            <div class="acoes-form">
              <button type="submit" class="btn btn-primario">${editando ? 'Salvar Alterações' : 'Adicionar'}</button>
              ${editando ? '<button type="button" class="btn btn-secundario" id="btnVoltarAnulacao">Voltar</button>' : ''}
              ${editando ? '<button type="button" class="btn btn-perigo" id="btnExcluirAnulacao">Excluir Anulação</button>' : ''}
            </div>
          </div>
        </form>
      </div>

      <div class="painel">
        <h3 style="margin:0 0 14px;color:var(--azul-escuro)">Anulações Registradas</h3>
        <div class="tabela-wrap">
          <table class="tabela">
            <thead>
              <tr><th>Empenho</th><th>Favorecido</th><th>Credor</th><th>Itens Anulados</th><th>Data</th><th>Valor Anulado</th><th>Ações</th></tr>
            </thead>
            <tbody id="corpoTabelaAnulacoes"><tr><td colspan="7"><div class="vazio">Carregando…</div></td></tr></tbody>
          </table>
        </div>
      </div>
    `;

    const empenhoSelect = container.querySelector('#empenhoSelect');
    const dadosAuto = container.querySelector('#dadosAuto');
    const listaItensAnulados = container.querySelector('#listaItensAnulados');
    const dataAnulacaoInput = container.querySelector('#dataAnulacao');
    const erroDataAnulacao = container.querySelector('#erroDataAnulacao');

    let itensDisponiveis = [];

    function empenhoSelecionadoAtual() {
      return editando ? empenhoFixo : empenhos.find((e) => String(e.id) === empenhoSelect.value);
    }

    function validarDataAnulacao() {
      if (!dataAnulacaoInput.value) { erroDataAnulacao.style.display = 'none'; return false; }
      if (!dataValida(dataAnulacaoInput.value)) {
        erroDataAnulacao.textContent = 'Data inválida (não pode ser anterior a 2024).';
        erroDataAnulacao.style.display = 'block';
        return false;
      }
      const emp = empenhoSelecionadoAtual();
      if (emp && dataAnulacaoInput.value < emp.data_emissao) {
        erroDataAnulacao.textContent = 'A data da anulação não pode ser anterior à data de emissão do empenho.';
        erroDataAnulacao.style.display = 'block';
        return false;
      }
      if (dataAnulacaoInput.value > hojeISO()) {
        erroDataAnulacao.textContent = 'A data não pode ser posterior ao dia de hoje.';
        erroDataAnulacao.style.display = 'block';
        return false;
      }
      erroDataAnulacao.style.display = 'none';
      return true;
    }
    dataAnulacaoInput.addEventListener('input', validarDataAnulacao);

    function atualizarValorTotalAnulado() {
      const total = [...listaItensAnulados.querySelectorAll('.item-linha')].reduce((soma, linha) => {
        const select = linha.querySelector('[data-campo="item_empenho_id"]');
        const opcao = select.selectedOptions[0];
        if (!opcao || !opcao.value) return soma;
        const qtd = Number(linha.querySelector('[data-campo="quantidade"]').value) || 0;
        return soma + qtd * Number(opcao.dataset.valor || 0);
      }, 0);
      container.querySelector('#valorTotalAnulado').value = formatMoeda(total);
    }

    function validarQuantidadesItens() {
      return [...listaItensAnulados.querySelectorAll('.item-linha')].every((linha) => {
        const select = linha.querySelector('[data-campo="item_empenho_id"]');
        const opcao = select.selectedOptions[0];
        if (!opcao || !opcao.value) return true;
        const disponivel = Number(opcao.dataset.disponivel || 0);
        const qtd = Number(linha.querySelector('[data-campo="quantidade"]').value) || 0;
        return qtd <= disponivel;
      });
    }

    function adicionarLinhaAnulada(itemPrefill) {
      listaItensAnulados.insertAdjacentHTML('beforeend', linhaItemAnuladoHtml(itensDisponiveis));
      const linha = listaItensAnulados.lastElementChild;
      conectarLinhaAnulada(linha, atualizarValorTotalAnulado);
      if (itemPrefill) {
        const select = linha.querySelector('[data-campo="item_empenho_id"]');
        select.value = String(itemPrefill.item_empenho_id);
        linha.querySelector('[data-campo="quantidade"]').value = itemPrefill.quantidade;
        select.dispatchEvent(new Event('change'));
      }
    }
    container.querySelector('#btnAddItemAnulado').addEventListener('click', () => adicionarLinhaAnulada());

    async function carregarItensDoEmpenho(empenhoId, opcoesQuery) {
      itensDisponiveis = await api.get(`/api/empenhos/${empenhoId}/itens-disponiveis` + query(opcoesQuery || {}));
      dadosAuto.style.display = 'block';
    }

    empenhoSelect.addEventListener('change', async () => {
      const empenhoId = empenhoSelect.value;
      if (!empenhoId) { dadosAuto.style.display = 'none'; return; }
      await carregarItensDoEmpenho(empenhoId);
      listaItensAnulados.innerHTML = '';
      adicionarLinhaAnulada();
      atualizarValorTotalAnulado();
      validarDataAnulacao();
    });

    async function carregarListaAnulacoes() {
      const corpo = container.querySelector('#corpoTabelaAnulacoes');
      const anulacoes = await api.get('/api/anulacoes');
      if (!anulacoes.length) {
        corpo.innerHTML = '<tr><td colspan="7"><div class="vazio">Nenhuma anulação registrada.</div></td></tr>';
        return;
      }
      corpo.innerHTML = anulacoes.map((a) => `
        <tr>
          <td>${a.numero_empenho}</td>
          <td>${SisAprov.formatFavorecido(a.favorecido)}</td>
          <td>${a.nome_credor || '-'}</td>
          <td>${a.itens.map((it) => `${it.descricao} (x${it.quantidade})`).join(', ')}</td>
          <td>${formatDataBR(a.data)}</td>
          <td>${formatMoeda(a.valor_anulado)}</td>
          <td>
            <button class="btn-icone" data-editar="${a.id}" title="Editar">✎</button>
            <button class="btn-icone" data-excluir="${a.id}" title="Excluir">🗑</button>
          </td>
        </tr>
      `).join('');

      corpo.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => SisAprov.irPara('empenhos-anulacao', btn.dataset.editar));
      });
      corpo.querySelectorAll('[data-excluir]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Confirma a exclusão desta anulação? O saldo do empenho será ajustado.')) return;
          try {
            await api.del(`/api/anulacoes/${btn.dataset.excluir}`);
            toast('Anulação excluída com sucesso.', 'sucesso');
            carregarListaAnulacoes();
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        });
      });
    }
    carregarListaAnulacoes();

    if (editando) {
      carregarItensDoEmpenho(empenhoFixo.id, { excluirAnulacaoId: anulacaoId }).then(() => {
        listaItensAnulados.innerHTML = '';
        anulacaoExistente.itens.forEach((it) => adicionarLinhaAnulada(it));
        dataAnulacaoInput.value = anulacaoExistente.data;
        atualizarValorTotalAnulado();
      });

      container.querySelector('#btnVoltarAnulacao').addEventListener('click', () => {
        SisAprov.irPara('empenhos-anulacao');
      });
      container.querySelector('#btnExcluirAnulacao').addEventListener('click', async () => {
        if (!confirm('Confirma a exclusão desta anulação? O saldo do empenho será ajustado.')) return;
        try {
          await api.del(`/api/anulacoes/${anulacaoId}`);
          toast('Anulação excluída com sucesso.', 'sucesso');
          SisAprov.irPara('empenhos-anulacao');
        } catch (erro) {
          toast(erro.message, 'erro');
        }
      });
    }

    container.querySelector('#formAnulacao').addEventListener('submit', async (evento) => {
      evento.preventDefault();
      if (!empenhoSelect.value) return toast('Selecione a Nota de Empenho', 'erro');

      const itens = [...listaItensAnulados.querySelectorAll('.item-linha')].map((linha) => {
        const select = linha.querySelector('[data-campo="item_empenho_id"]');
        return {
          item_empenho_id: Number(select.value),
          quantidade: Number(linha.querySelector('[data-campo="quantidade"]').value),
        };
      }).filter((it) => it.item_empenho_id && it.quantidade > 0);

      if (!itens.length) return toast('Selecione ao menos um item para anular', 'erro');

      if (!validarQuantidadesItens()) {
        toast('Corrija as quantidades que excedem o disponível antes de continuar.', 'erro');
        return;
      }

      if (!validarDataAnulacao()) {
        toast('Informe uma data válida para a anulação.', 'erro');
        return;
      }

      const payload = {
        empenho_id: empenhoSelect.value,
        data: dataAnulacaoInput.value,
        itens,
      };

      try {
        if (editando) {
          await api.put(`/api/anulacoes/${anulacaoId}`, payload);
          toast('Anulação atualizada com sucesso.', 'sucesso');
        } else {
          await api.post('/api/anulacoes', payload);
          toast('Anulação registrada com sucesso.', 'sucesso');
        }
        SisAprov.irPara('empenhos-anulacao');
      } catch (erro) {
        toast(erro.message, 'erro');
      }
    });
  }

  const CAMPOS_ACOMPANHAMENTO = [
    { campo: 'enviado', label: 'Enviado', faixas: 3 },
    { campo: 'recebido_empresa', label: 'Recebido pela Empresa', faixas: 3 },
    { campo: 'recebido_om', label: 'Recebido na OM', faixas: 3 },
    { campo: 'notificado', label: 'Notificado', faixas: 2 },
    { campo: 'processo_administrativo', label: 'Processo Administrativo', faixas: 2 },
  ];

  function classeChk3Faixas(dias) {
    if (dias > 60) return 'chk-vermelho';
    if (dias > 30) return 'chk-amarelo';
    return 'chk-verde';
  }

  function classeChk2Faixas(dias) {
    return dias > 60 ? 'chk-vermelho' : 'chk-verde';
  }

  function celulaAcompanhamentoHtml(emp, definicao) {
    const marcado = Boolean(emp[`acompanhamento_${definicao.campo}`]);
    // Uma vez que "Recebido na OM" é marcado, o processo está finalizado: as
    // demais caixas deixam de exibir a cor de alerta (mas mantêm seu estado).
    const finalizado = Boolean(emp.acompanhamento_recebido_om) && definicao.campo !== 'recebido_om';
    const classe = finalizado ? '' : (definicao.faixas === 3 ? classeChk3Faixas(emp.dias) : classeChk2Faixas(emp.dias));
    return `<td class="chk-cel ${classe}"><input type="checkbox" class="chk-acomp" data-id="${emp.id}" data-campo="${definicao.campo}" ${marcado ? 'checked' : ''}></td>`;
  }

  async function renderAcompanhamento(container) {
    container.innerHTML = `
      <div class="painel">
        <p class="modulo-texto">Esta seção é para acompanhamento de empenhos mais específicos em que é necessário maior controle, pois a entrega é única (obras, serviços e materiais do PASA e etc.).</p>
        <p class="modulo-texto modulo-texto--aviso">⚠ Observação: assim que o objeto do empenho for concluído, ainda é necessário fazer a inclusão em "Adicionar Recebimentos".</p>

        <div class="tabela-wrap">
          <table class="tabela">
            <thead>
              <tr>
                <th>NE</th><th>Favorecido</th><th>Credor</th><th>Valor Total</th><th>Dias</th>
                ${CAMPOS_ACOMPANHAMENTO.map((c) => `<th>${c.label}</th>`).join('')}
              </tr>
            </thead>
            <tbody id="corpoTabelaAcompanhamento"><tr><td colspan="10"><div class="vazio">Carregando…</div></td></tr></tbody>
          </table>
        </div>
      </div>
    `;

    const corpoTabela = container.querySelector('#corpoTabelaAcompanhamento');

    async function carregar() {
      const empenhos = await api.get('/api/empenhos/acompanhamento');
      if (!empenhos.length) {
        corpoTabela.innerHTML = '<tr><td colspan="10"><div class="vazio">Nenhum empenho na modalidade Ordinário com saldo disponível para acompanhamento.</div></td></tr>';
        return;
      }

      corpoTabela.innerHTML = empenhos.map((emp) => `
        <tr>
          <td>${emp.numero_empenho}</td>
          <td>${SisAprov.formatFavorecido(emp.favorecido)}</td>
          <td>${emp.nome_credor || '-'}</td>
          <td>${formatMoeda(emp.valor_global)}</td>
          <td><span class="badge ${classeDias(emp.dias)}">${emp.dias}</span></td>
          ${CAMPOS_ACOMPANHAMENTO.map((c) => celulaAcompanhamentoHtml(emp, c)).join('')}
        </tr>
      `).join('');

      corpoTabela.querySelectorAll('.chk-acomp').forEach((chk) => {
        chk.addEventListener('change', async () => {
          try {
            await api.patch(`/api/empenhos/${chk.dataset.id}/acompanhamento`, {
              campo: chk.dataset.campo,
              valor: chk.checked,
            });
            await carregar();
          } catch (erro) {
            chk.checked = !chk.checked;
            toast(erro.message, 'erro');
          }
        });
      });
    }

    await carregar();
  }

  SisAprov.registrarView('empenhos-adicionar', renderAdicionar);
  SisAprov.registrarView('empenhos-visualizar', renderVisualizar);
  SisAprov.registrarView('empenhos-anulacao', renderAnulacao);
  SisAprov.registrarView('empenhos-acompanhamento', renderAcompanhamento);
})();
