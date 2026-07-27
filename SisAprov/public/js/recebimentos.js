(() => {
  const { api, query, toast, formatMoeda, formatDataBR, anexarMascaraMoeda, valorMoedaInput,
    optionsHtml, digitsOnly, dataValida, hojeISO } = SisAprov;

  function linhaItemRecebidoHtml(itensDisponiveis) {
    const opcoesItens = itensDisponiveis
      .filter((it) => it.quantidade_disponivel > 0)
      .map((it) => `<option value="${it.id}" data-disponivel="${it.quantidade_disponivel}" data-valor="${it.valor_unitario}">${it.descricao} (disp.: ${it.quantidade_disponivel})</option>`)
      .join('');

    return `
      <div class="item-linha" data-recebido="1">
        <div class="campo campo--full" style="grid-column:1 / span 2">
          <label>Item (por descrição)</label>
          <select data-campo="item_empenho_id"><option value="">Selecione…</option>${opcoesItens}</select>
        </div>
        <div class="campo">
          <label>Quantidade</label>
          <input type="number" min="1" step="1" data-campo="quantidade">
          <small class="erro" data-campo="erroQuantidade" style="display:none"></small>
        </div>
        <div class="campo"><label>Valor Unitário</label><input type="text" data-campo="valor_unitario" readonly value="R$ 0,00"></div>
        <div class="campo"><label>Valor Total</label><input type="text" data-campo="valor_total" readonly value="R$ 0,00"></div>
        <button type="button" class="item-remover" title="Remover item">✕</button>
      </div>
    `;
  }

  function conectarLinhaRecebida(linha, aoAlterar) {
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

  async function renderAdicionar(container, recebimentoId) {
    const editando = Boolean(recebimentoId);
    let recebimentoExistente = null;
    let empenhoFixo = null;
    let empenhos = [];
    let comissaoAtual = null;

    if (editando) {
      recebimentoExistente = await api.get(`/api/recebimentos/${recebimentoId}`);
      empenhoFixo = await api.get(`/api/empenhos/${recebimentoExistente.empenho_id}`);
    } else {
      const todosAtivos = await api.get('/api/empenhos' + query({ apenasAtivos: 'true' }));
      // Empenhos na modalidade Ordinário admitem apenas um único recebimento.
      empenhos = todosAtivos.filter((e) => !(e.modalidade === 'Ordinário' && e.quantidade_provisoes >= 1));
      comissaoAtual = await api.get('/api/comissoes/atual');
    }

    const opcoesEmpenhoHtml = editando
      ? `<option value="${empenhoFixo.id}" selected>${empenhoFixo.numero_empenho} — ${SisAprov.formatFavorecido(empenhoFixo.favorecido)}</option>`
      : optionsHtml(empenhos.map(e => e.id), '', Object.fromEntries(empenhos.map(e => [e.id, `${e.numero_empenho} — ${SisAprov.formatFavorecido(e.favorecido)} — Saldo: ${formatMoeda(e.saldo_atual)}`])));

    container.innerHTML = `
      <div class="painel">
        <form id="formRecebimento">
          <div class="form-grid">
            <div class="campo campo--full">
              <label>Nota de Empenho</label>
              <select id="empenhoSelect" required ${editando ? 'disabled' : ''}>
                ${opcoesEmpenhoHtml}
              </select>
            </div>
          </div>

          <div id="dadosAuto" style="display:none">
            <div class="form-grid" style="margin-top:14px">
              <div class="campo"><label>Favorecido</label><input type="text" id="autoFavorecido" readonly></div>
              <div class="campo"><label>Nome do Credor</label><input type="text" id="autoNomeCredor" readonly></div>
              <div class="campo"><label>Plano Interno</label><input type="text" id="autoPlanoInterno" readonly></div>
            </div>

            <h3 style="margin:22px 0 6px;color:var(--azul-escuro)">Itens Recebidos</h3>
            <div class="itens-lista" id="listaItensRecebidos"></div>
            <button type="button" class="btn btn-secundario" id="btnAddItemRecebido">+ Adicionar item</button>

            <div class="form-grid" style="margin-top:20px">
              <div class="campo"><label>Valor Total NE</label><input type="text" id="valorTotalNe" readonly value="R$ 0,00"></div>
              <div class="campo"><label>Número da Nota Fiscal</label><input type="text" id="numeroNf" required></div>
              <div class="campo">
                <label>Data da Nota Fiscal</label>
                <input type="date" id="dataNf" required>
                <small class="erro" id="erroDataNf" style="display:none"></small>
              </div>
              <div class="campo">
                <label>Valor da NF</label>
                <input type="text" id="valorNf" placeholder="0,00" required>
                <small class="erro" id="erroValorNf" style="display:none">O valor da NF deve ser exatamente igual ao Valor Total da NE.</small>
              </div>
              <div class="campo">
                <label>Data de Recebimento</label>
                <input type="date" id="dataRecebimento" required>
                <small class="dica">Não pode ser anterior à data da Nota Fiscal nem à data do empenho.</small>
                <small class="erro" id="erroDataRecebimento" style="display:none"></small>
              </div>
              <div class="campo">
                <label>Presidente da Comissão</label>
                <div style="display:flex;gap:6px;align-items:center">
                  <input type="text" id="presidenteComissao" readonly style="flex:1" value="${editando ? (recebimentoExistente.presidente_comissao || '-') : (comissaoAtual ? comissaoAtual.presidenteCompleto : 'Nenhuma comissão cadastrada')}">
                  <button type="button" class="btn-icone" id="btnEditarComissao" title="Selecionar outra comissão">✎</button>
                </div>
                <select id="selectComissao" style="display:none;margin-top:6px"></select>
              </div>
            </div>

            <div class="acoes-form">
              <button type="submit" class="btn btn-primario">${editando ? 'Salvar Alterações' : 'Adicionar'}</button>
              ${editando ? '<button type="button" class="btn btn-secundario" id="btnVoltar">Voltar</button>' : ''}
              ${editando ? '<button type="button" class="btn btn-perigo" id="btnExcluirRecebimento">Excluir Recebimento</button>' : ''}
            </div>
          </div>
        </form>
      </div>
    `;

    const listaItensRecebidos = container.querySelector('#listaItensRecebidos');
    const empenhoSelect = container.querySelector('#empenhoSelect');
    const dadosAuto = container.querySelector('#dadosAuto');
    const valorNfInput = container.querySelector('#valorNf');
    anexarMascaraMoeda(valorNfInput, editando ? recebimentoExistente.valor_nf : 0);

    let itensDisponiveis = [];
    let empenhoSelecionado = null;
    const erroValorNf = container.querySelector('#erroValorNf');
    const dataNfInput = container.querySelector('#dataNf');
    const dataRecebimentoInput = container.querySelector('#dataRecebimento');
    const erroDataNf = container.querySelector('#erroDataNf');
    const erroDataRecebimento = container.querySelector('#erroDataRecebimento');

    function atualizarValorTotalNe() {
      const total = [...listaItensRecebidos.querySelectorAll('.item-linha')].reduce((soma, linha) => {
        const select = linha.querySelector('[data-campo="item_empenho_id"]');
        const opcao = select.selectedOptions[0];
        if (!opcao || !opcao.value) return soma;
        const qtd = Number(linha.querySelector('[data-campo="quantidade"]').value) || 0;
        return soma + qtd * Number(opcao.dataset.valor || 0);
      }, 0);
      container.querySelector('#valorTotalNe').value = formatMoeda(total);
      compararValorNf();
    }

    function validarQuantidadesItens() {
      return [...listaItensRecebidos.querySelectorAll('.item-linha')].every((linha) => {
        const select = linha.querySelector('[data-campo="item_empenho_id"]');
        const opcao = select.selectedOptions[0];
        if (!opcao || !opcao.value) return true;
        const disponivel = Number(opcao.dataset.disponivel || 0);
        const qtd = Number(linha.querySelector('[data-campo="quantidade"]').value) || 0;
        return qtd <= disponivel;
      });
    }

    function totalNeAtual() {
      const totalNeTexto = container.querySelector('#valorTotalNe').value;
      return Number(totalNeTexto.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
    }

    function compararValorNf() {
      const totalNe = totalNeAtual();
      const valorNf = valorMoedaInput(valorNfInput);
      valorNfInput.classList.remove('valor-ok', 'valor-divergente');
      // Cor: só fica verde quando o valor da NF for exatamente igual ao Valor Total da NE.
      const divergente = Math.abs(valorNf - totalNe) > 0.005;
      if (valorNfInput.dataset.valor !== undefined) {
        valorNfInput.classList.add(divergente ? 'valor-divergente' : 'valor-ok');
      }
      // Envio: exige igualdade exata entre o valor da NF e o Valor Total da NE.
      erroValorNf.style.display = (valorNfInput.dataset.valor !== undefined && divergente) ? 'block' : 'none';
    }
    valorNfInput.addEventListener('input', compararValorNf);

    function validarDatasRecebimento() {
      let valido = true;

      if (!dataNfInput.value) {
        erroDataNf.style.display = 'none';
        valido = false;
      } else if (!dataValida(dataNfInput.value)) {
        erroDataNf.textContent = 'Data inválida (não pode ser anterior a 2024).';
        erroDataNf.style.display = 'block';
        valido = false;
      } else if (empenhoSelecionado && dataNfInput.value < empenhoSelecionado.data_emissao) {
        erroDataNf.textContent = 'A data da NF não pode ser anterior à data de emissão do empenho.';
        erroDataNf.style.display = 'block';
        valido = false;
      } else if (dataNfInput.value > hojeISO()) {
        erroDataNf.textContent = 'A data da NF não pode ser posterior ao dia de hoje.';
        erroDataNf.style.display = 'block';
        valido = false;
      } else {
        erroDataNf.style.display = 'none';
      }

      if (!dataRecebimentoInput.value) {
        erroDataRecebimento.style.display = 'none';
        valido = false;
      } else if (!dataValida(dataRecebimentoInput.value)) {
        erroDataRecebimento.textContent = 'Data inválida (não pode ser anterior a 2024).';
        erroDataRecebimento.style.display = 'block';
        valido = false;
      } else if (empenhoSelecionado && dataRecebimentoInput.value < empenhoSelecionado.data_emissao) {
        erroDataRecebimento.textContent = 'A data de Recebimento não pode ser anterior à data de emissão do empenho.';
        erroDataRecebimento.style.display = 'block';
        valido = false;
      } else if (dataNfInput.value && dataRecebimentoInput.value < dataNfInput.value) {
        erroDataRecebimento.textContent = 'A data de Recebimento não pode ser anterior à data da Nota Fiscal.';
        erroDataRecebimento.style.display = 'block';
        valido = false;
      } else if (dataRecebimentoInput.value > hojeISO()) {
        erroDataRecebimento.textContent = 'A data de Recebimento não pode ser posterior ao dia de hoje.';
        erroDataRecebimento.style.display = 'block';
        valido = false;
      } else {
        erroDataRecebimento.style.display = 'none';
      }

      return valido;
    }
    dataNfInput.addEventListener('input', validarDatasRecebimento);
    dataRecebimentoInput.addEventListener('input', validarDatasRecebimento);

    let comissaoIdEscolhida = editando ? recebimentoExistente.comissao_id : (comissaoAtual ? comissaoAtual.id : null);
    let listaComissoes = null;
    const presidenteInput = container.querySelector('#presidenteComissao');
    const selectComissao = container.querySelector('#selectComissao');

    container.querySelector('#btnEditarComissao').addEventListener('click', async () => {
      if (!listaComissoes) listaComissoes = await api.get('/api/comissoes');
      if (!listaComissoes.length) return toast('Nenhuma comissão cadastrada.', 'erro');
      selectComissao.innerHTML = listaComissoes.map((c) => `<option value="${c.id}" ${String(c.id) === String(comissaoIdEscolhida) ? 'selected' : ''}>${c.mes} — ${c.presidenteCompleto}</option>`).join('');
      selectComissao.style.display = 'block';
      presidenteInput.style.display = 'none';
      selectComissao.focus();
    });

    selectComissao.addEventListener('change', () => {
      const c = listaComissoes.find((x) => String(x.id) === selectComissao.value);
      if (!c) return;
      comissaoIdEscolhida = c.id;
      presidenteInput.value = c.presidenteCompleto;
      presidenteInput.style.display = 'block';
      selectComissao.style.display = 'none';
    });

    function adicionarLinhaRecebida(itemPrefill) {
      listaItensRecebidos.insertAdjacentHTML('beforeend', linhaItemRecebidoHtml(itensDisponiveis));
      const linha = listaItensRecebidos.lastElementChild;
      conectarLinhaRecebida(linha, () => { atualizarValorTotalNe(); compararValorNf(); });
      if (itemPrefill) {
        const select = linha.querySelector('[data-campo="item_empenho_id"]');
        select.value = String(itemPrefill.item_empenho_id);
        linha.querySelector('[data-campo="quantidade"]').value = itemPrefill.quantidade;
        select.dispatchEvent(new Event('change'));
      }
    }
    container.querySelector('#btnAddItemRecebido').addEventListener('click', () => adicionarLinhaRecebida());

    async function carregarDadosEmpenho(empenhoId, opcoesQuery) {
      const [empenho, disponiveis] = await Promise.all([
        api.get(`/api/empenhos/${empenhoId}`),
        api.get(`/api/empenhos/${empenhoId}/itens-disponiveis` + query(opcoesQuery || {})),
      ]);
      itensDisponiveis = disponiveis;
      empenhoSelecionado = empenho;
      validarDatasRecebimento();

      container.querySelector('#autoFavorecido').value = SisAprov.formatFavorecido(empenho.favorecido);
      container.querySelector('#autoNomeCredor').value = empenho.nome_credor || '-';
      container.querySelector('#autoPlanoInterno').value = empenho.plano_interno || '-';
      dadosAuto.style.display = 'block';
    }

    empenhoSelect.addEventListener('change', async () => {
      const empenhoId = empenhoSelect.value;
      if (!empenhoId) { dadosAuto.style.display = 'none'; return; }
      await carregarDadosEmpenho(empenhoId);
      listaItensRecebidos.innerHTML = '';
      adicionarLinhaRecebida();
      atualizarValorTotalNe();
    });

    if (editando) {
      carregarDadosEmpenho(empenhoFixo.id, { excluirRecebimentoId: recebimentoId }).then(() => {
        listaItensRecebidos.innerHTML = '';
        recebimentoExistente.itens.forEach((it) => adicionarLinhaRecebida(it));
        container.querySelector('#numeroNf').value = recebimentoExistente.numero_nota_fiscal;
        dataNfInput.value = recebimentoExistente.data_nota_fiscal;
        dataRecebimentoInput.value = recebimentoExistente.data_recebimento;
        atualizarValorTotalNe();
      });

      container.querySelector('#btnVoltar').addEventListener('click', () => {
        SisAprov.irPara('recebimentos-visualizar');
      });
      container.querySelector('#btnExcluirRecebimento').addEventListener('click', async () => {
        if (!confirm('Confirma a exclusão deste recebimento? O saldo do empenho será restaurado.')) return;
        try {
          await api.del(`/api/recebimentos/${recebimentoId}`);
          toast('Recebimento excluído com sucesso.', 'sucesso');
          SisAprov.irPara('recebimentos-visualizar');
        } catch (erro) {
          toast(erro.message, 'erro');
        }
      });
    }

    container.querySelector('#formRecebimento').addEventListener('submit', async (evento) => {
      evento.preventDefault();
      if (!empenhoSelect.value) return toast('Selecione a Nota de Empenho', 'erro');

      const itens = [...listaItensRecebidos.querySelectorAll('.item-linha')].map((linha) => {
        const select = linha.querySelector('[data-campo="item_empenho_id"]');
        return {
          item_empenho_id: Number(select.value),
          quantidade: Number(linha.querySelector('[data-campo="quantidade"]').value),
        };
      }).filter((it) => it.item_empenho_id && it.quantidade > 0);

      if (!itens.length) return toast('Selecione ao menos um item recebido', 'erro');

      if (!validarQuantidadesItens()) {
        toast('Corrija as quantidades que excedem o disponível antes de continuar.', 'erro');
        return;
      }

      compararValorNf();
      if (erroValorNf.style.display !== 'none') {
        toast('O valor da NF deve ser exatamente igual ao Valor Total da NE.', 'erro');
        return;
      }

      if (!validarDatasRecebimento()) {
        toast('Corrija as datas da Nota Fiscal e do Recebimento antes de continuar.', 'erro');
        return;
      }

      const payload = {
        empenho_id: empenhoSelect.value,
        itens,
        numero_nota_fiscal: container.querySelector('#numeroNf').value.trim(),
        data_nota_fiscal: container.querySelector('#dataNf').value,
        valor_nf: valorMoedaInput(valorNfInput),
        data_recebimento: container.querySelector('#dataRecebimento').value,
        comissao_id: comissaoIdEscolhida,
      };

      try {
        if (editando) {
          await api.put(`/api/recebimentos/${recebimentoId}`, payload);
          toast('Recebimento atualizado com sucesso.', 'sucesso');
        } else {
          await api.post('/api/recebimentos', payload);
          toast('Recebimento adicionado com sucesso.', 'sucesso');
        }
        SisAprov.irPara('recebimentos-visualizar');
      } catch (erro) {
        toast(erro.message, 'erro');
      }
    });
  }

  const ORDEM_COLUNAS_RECEBIMENTO = { data: 'Data de Recebimento', numeroEmpenho: 'Número de Empenho' };

  async function renderVisualizar(container) {
    const empenhos = await api.get('/api/empenhos');
    let ordemAtual = { orderBy: 'data', orderDir: 'desc' };

    container.innerHTML = `
      <div class="painel">
        <div class="filtros">
          <div class="campo"><label>Data de</label><input type="date" id="filtroDataInicio"></div>
          <div class="campo"><label>Data até</label><input type="date" id="filtroDataFim"></div>
          <div class="campo"><label>Favorecido</label><input type="text" id="filtroFavorecido" placeholder="Somente números (CNPJ/CPF)" inputmode="numeric" maxlength="14"></div>
          <div class="campo">
            <label>Nota de Empenho</label>
            <select id="filtroEmpenho">${optionsHtml(empenhos.map(e => e.id), '', Object.fromEntries(empenhos.map(e => [e.id, e.numero_empenho])))}</select>
          </div>
          <div class="campo"><label>Nota Fiscal</label><input type="text" id="filtroNotaFiscal" placeholder="Número da NF"></div>
          <div class="campo">
            <label>Relatório</label>
            <select id="filtroRelatorio">
              <option value="">Todos</option>
              <option value="true">Marcados</option>
              <option value="false">Não marcados</option>
            </select>
          </div>
          <div class="campo">
            <label>Ordenar por</label>
            <select id="ordenarPor">${optionsHtml(Object.keys(ORDEM_COLUNAS_RECEBIMENTO), 'data', ORDEM_COLUNAS_RECEBIMENTO)}</select>
          </div>
          <button type="button" class="btn btn-secundario" id="btnInverterOrdem" title="Inverter ordem">⇅ Desc.</button>
          <button class="btn btn-primario" id="btnFiltrar">Filtrar</button>
          <button type="button" class="btn btn-secundario" id="btnLimparFiltros">Limpar Filtros</button>
        </div>

        <div class="tabela-wrap">
          <table class="tabela">
            <thead>
              <tr>
                <th>Empenho</th><th>Favorecido</th><th>Credor</th><th>Plano Interno</th>
                <th>Vlr. Total NE</th><th>Nº NF</th><th>Data NF</th><th>Vlr. NF</th>
                <th>Data Receb.</th><th>Presidente Comissão</th><th>Provisão</th><th>Relatório</th><th>Ações</th>
              </tr>
            </thead>
            <tbody id="corpoTabelaRecebimentos"><tr><td colspan="13"><div class="vazio">Carregando…</div></td></tr></tbody>
          </table>
        </div>
      </div>
    `;

    const filtroFavorecidoInput = container.querySelector('#filtroFavorecido');
    filtroFavorecidoInput.addEventListener('input', () => {
      filtroFavorecidoInput.value = digitsOnly(filtroFavorecidoInput.value).slice(0, 14);
    });

    const btnInverter = container.querySelector('#btnInverterOrdem');
    function atualizarTextoOrdem() {
      btnInverter.textContent = ordemAtual.orderDir === 'desc' ? '⇅ Desc.' : '⇅ Asc.';
    }

    async function carregar() {
      const favorecidoDigitado = filtroFavorecidoInput.value;
      if (favorecidoDigitado && favorecidoDigitado.length < 11) {
        toast('Informe ao menos 11 dígitos (CPF) para pesquisar por favorecido.', 'erro');
        return;
      }
      const filtros = {
        dataInicio: container.querySelector('#filtroDataInicio').value,
        dataFim: container.querySelector('#filtroDataFim').value,
        favorecido: favorecidoDigitado,
        empenhoId: container.querySelector('#filtroEmpenho').value,
        numeroNotaFiscal: container.querySelector('#filtroNotaFiscal').value,
        relatorio: container.querySelector('#filtroRelatorio').value,
        ...ordemAtual,
      };
      const recebimentos = await api.get('/api/recebimentos' + query(filtros));
      const corpo = container.querySelector('#corpoTabelaRecebimentos');

      if (!recebimentos.length) {
        corpo.innerHTML = '<tr><td colspan="13"><div class="vazio">Nenhum recebimento encontrado.</div></td></tr>';
        return;
      }

      corpo.innerHTML = recebimentos.map((r) => {
        const divergente = r.valor_nf > r.valor_total_ne + 0.005;
        return `
        <tr>
          <td>${r.numero_empenho}</td>
          <td>${SisAprov.formatFavorecido(r.favorecido)}</td>
          <td>${r.nome_credor || '-'}</td>
          <td>${r.plano_interno || '-'}</td>
          <td>${formatMoeda(r.valor_total_ne)}</td>
          <td>${r.numero_nota_fiscal}</td>
          <td>${formatDataBR(r.data_nota_fiscal)}</td>
          <td><span class="badge ${divergente ? 'badge-vermelho' : 'badge-verde'}">${formatMoeda(r.valor_nf)}</span></td>
          <td>${formatDataBR(r.data_recebimento)}</td>
          <td>${r.presidente_comissao || '-'}</td>
          <td>${r.numero_provisao}ª provisão</td>
          <td style="text-align:center"><input type="checkbox" class="chk-relatorio" data-id="${r.id}" ${r.relatorio ? 'checked' : ''}></td>
          <td>
            <button class="btn-icone" data-editar="${r.id}" title="Editar">✎</button>
            <button class="btn-icone" data-excluir="${r.id}" title="Excluir">🗑</button>
          </td>
        </tr>
      `;
      }).join('');

      corpo.querySelectorAll('.chk-relatorio').forEach((chk) => {
        chk.addEventListener('change', async () => {
          try {
            await api.patch(`/api/recebimentos/${chk.dataset.id}/relatorio`, { relatorio: chk.checked });
          } catch (erro) {
            chk.checked = !chk.checked;
            toast(erro.message, 'erro');
          }
        });
      });

      corpo.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => SisAprov.irPara('recebimentos-adicionar', btn.dataset.editar));
      });
      corpo.querySelectorAll('[data-excluir]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Confirma a exclusão deste recebimento? O saldo do empenho será restaurado.')) return;
          try {
            await api.del(`/api/recebimentos/${btn.dataset.excluir}`);
            toast('Recebimento excluído com sucesso.', 'sucesso');
            carregar();
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        });
      });
    }

    container.querySelector('#btnFiltrar').addEventListener('click', carregar);
    container.querySelector('#btnLimparFiltros').addEventListener('click', () => {
      container.querySelector('#filtroDataInicio').value = '';
      container.querySelector('#filtroDataFim').value = '';
      filtroFavorecidoInput.value = '';
      container.querySelector('#filtroEmpenho').value = '';
      container.querySelector('#filtroNotaFiscal').value = '';
      container.querySelector('#filtroRelatorio').value = '';
      carregar();
    });
    container.querySelector('#ordenarPor').addEventListener('change', (evento) => {
      ordemAtual.orderBy = evento.target.value;
      carregar();
    });
    btnInverter.addEventListener('click', () => {
      ordemAtual.orderDir = ordemAtual.orderDir === 'desc' ? 'asc' : 'desc';
      atualizarTextoOrdem();
      carregar();
    });
    await carregar();
  }

  SisAprov.registrarView('recebimentos-adicionar', renderAdicionar);
  SisAprov.registrarView('recebimentos-visualizar', renderVisualizar);
})();
