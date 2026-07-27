(() => {
  const { api, toast, formatMoeda, formatDataBR, anexarMascaraMoeda, valorMoedaInput, optionsHtml,
    UG_OPCOES, NATUREZA_LABEL_NC, dataValida, hojeISO } = SisAprov;

  async function renderAdicionar(container, ncId) {
    const editando = Boolean(ncId);
    let nc = null;
    if (editando) {
      nc = await api.get('/api/notas-credito').then((lista) => lista.find((n) => String(n.id) === String(ncId)));
    }

    container.innerHTML = `
      <div class="painel">
        <form id="formNc">
          <div class="form-grid">
            <div class="campo">
              <label>Data de Emissão</label>
              <input type="date" id="dataEmissao" max="${hojeISO()}" value="${nc?.data_emissao || ''}" required>
              <small class="erro" id="erroDataEmissao" style="display:none"></small>
            </div>
            <div class="campo"><label>UGE</label><input type="text" id="uge" value="${nc?.uge || ''}" required></div>
            <div class="campo"><label>UG</label><select id="ug" required>${optionsHtml(UG_OPCOES, nc?.ug)}</select></div>
            <div class="campo"><label>Número da NC</label><input type="text" id="numeroNc" placeholder="202XNCXXXXX" value="${nc?.numero_nc || ''}" required></div>
            <div class="campo"><label>PTRES</label><input type="text" id="ptres" value="${nc?.ptres || ''}"></div>
            <div class="campo"><label>Fonte</label><input type="text" id="fonte" value="${nc?.fonte || ''}"></div>
            <div class="campo"><label>ND</label><select id="nd" required>${optionsHtml(Object.keys(NATUREZA_LABEL_NC), nc?.nd, NATUREZA_LABEL_NC)}</select></div>
            <div class="campo"><label>Plano Interno</label><input type="text" id="planoInterno" value="${nc?.plano_interno || ''}"></div>
            <div class="campo">
              <label>Valor Total</label>
              <input type="text" id="valorTotal" placeholder="0,00" required>
              <small class="erro" id="erroValorTotal" style="display:none">O valor total deve ser maior que zero.</small>
            </div>
            <div class="campo">
              <label>Prazo</label>
              <input type="date" id="prazo" value="${nc?.prazo || ''}" required>
              <small class="erro" id="erroPrazo" style="display:none">Prazo inválido (não pode ser anterior a 2024).</small>
            </div>
            <div class="campo campo--full">
              <label>Observação</label>
              <textarea id="observacao" rows="2" required>${nc?.observacao || ''}</textarea>
            </div>
          </div>
          <div class="acoes-form">
            <button type="submit" class="btn btn-primario">${editando ? 'Salvar Alterações' : 'Adicionar'}</button>
            ${editando ? '<button type="button" class="btn btn-secundario" id="btnVoltar">Voltar</button>' : ''}
            ${editando ? '<button type="button" class="btn btn-perigo" id="btnExcluirNc">Excluir Nota de Crédito</button>' : ''}
          </div>
        </form>
      </div>
    `;

    const valorTotalInput = container.querySelector('#valorTotal');
    anexarMascaraMoeda(valorTotalInput, nc?.valor_total || 0);

    const dataEmissaoInput = container.querySelector('#dataEmissao');
    const erroDataEmissao = container.querySelector('#erroDataEmissao');
    function validarData() {
      if (!dataEmissaoInput.value) { erroDataEmissao.style.display = 'none'; return false; }
      if (!dataValida(dataEmissaoInput.value)) {
        erroDataEmissao.textContent = 'Data inválida (não pode ser anterior a 2024).';
        erroDataEmissao.style.display = 'block';
        return false;
      }
      if (dataEmissaoInput.value > hojeISO()) {
        erroDataEmissao.textContent = 'A data não pode ser posterior ao dia de hoje.';
        erroDataEmissao.style.display = 'block';
        return false;
      }
      erroDataEmissao.style.display = 'none';
      return true;
    }
    dataEmissaoInput.addEventListener('input', validarData);

    const erroValorTotal = container.querySelector('#erroValorTotal');
    valorTotalInput.addEventListener('input', () => {
      erroValorTotal.style.display = valorMoedaInput(valorTotalInput) > 0 ? 'none' : 'block';
    });

    const prazoInput = container.querySelector('#prazo');
    const erroPrazo = container.querySelector('#erroPrazo');
    function validarPrazo() {
      if (!prazoInput.value) { erroPrazo.style.display = 'none'; return false; }
      if (!dataValida(prazoInput.value)) {
        erroPrazo.textContent = 'Prazo inválido (não pode ser anterior a 2024).';
        erroPrazo.style.display = 'block';
        return false;
      }
      if (dataEmissaoInput.value && prazoInput.value < dataEmissaoInput.value) {
        erroPrazo.textContent = 'O Prazo não pode ser anterior à Data de Emissão.';
        erroPrazo.style.display = 'block';
        return false;
      }
      erroPrazo.style.display = 'none';
      return true;
    }
    prazoInput.addEventListener('input', validarPrazo);
    dataEmissaoInput.addEventListener('input', validarPrazo);

    if (editando) {
      container.querySelector('#btnVoltar').addEventListener('click', () => {
        SisAprov.irPara('nc-situacao');
      });
      container.querySelector('#btnExcluirNc').addEventListener('click', async () => {
        if (!confirm('Confirma a exclusão desta Nota de Crédito? Esta ação não pode ser desfeita.')) return;
        try {
          await api.del(`/api/notas-credito/${ncId}`);
          toast('Nota de Crédito excluída com sucesso.', 'sucesso');
          SisAprov.irPara('nc-situacao');
        } catch (erro) {
          toast(erro.message, 'erro');
        }
      });
    }

    container.querySelector('#formNc').addEventListener('submit', async (evento) => {
      evento.preventDefault();

      if (!validarData()) {
        toast('Corrija a data de emissão antes de continuar.', 'erro');
        return;
      }
      const valorTotal = valorMoedaInput(valorTotalInput);
      if (!(valorTotal > 0)) {
        erroValorTotal.style.display = 'block';
        toast('O valor total deve ser maior que zero.', 'erro');
        return;
      }
      if (!validarPrazo()) {
        toast('Corrija o campo Prazo antes de continuar.', 'erro');
        return;
      }
      const observacaoValor = container.querySelector('#observacao').value.trim();
      if (!observacaoValor) {
        toast('A observação é obrigatória.', 'erro');
        return;
      }

      const payload = {
        data_emissao: dataEmissaoInput.value,
        uge: container.querySelector('#uge').value.trim(),
        ug: container.querySelector('#ug').value,
        numero_nc: container.querySelector('#numeroNc').value.trim(),
        ptres: container.querySelector('#ptres').value.trim() || null,
        fonte: container.querySelector('#fonte').value.trim() || null,
        nd: container.querySelector('#nd').value,
        plano_interno: container.querySelector('#planoInterno').value.trim() || null,
        valor_total: valorTotal,
        prazo: prazoInput.value,
        observacao: observacaoValor,
      };

      try {
        if (editando) {
          await api.put(`/api/notas-credito/${ncId}`, payload);
          toast('Nota de Crédito atualizada com sucesso.', 'sucesso');
        } else {
          await api.post('/api/notas-credito', payload);
          toast('Nota de Crédito adicionada com sucesso.', 'sucesso');
        }
        SisAprov.irPara('nc-situacao');
      } catch (erro) {
        toast(erro.message, 'erro');
      }
    });
  }

  function classePrazo(dias) {
    if (dias === null || dias === undefined) return '';
    if (dias <= 0) return 'badge-prazo-preto';
    if (dias < 5) return 'badge-prazo-vermelho';
    if (dias < 10) return 'badge-prazo-amarelo';
    return 'badge-prazo-verde';
  }

  async function renderSituacaoGeral(container) {
    container.innerHTML = `
      <div class="painel">
        <div class="tabela-wrap">
          <table class="tabela">
            <thead>
              <tr>
                <th></th><th>Nº NC</th><th>Emissão</th><th>UG</th><th>UGE</th><th>ND</th>
                <th>Plano Interno</th><th>PTRES</th><th>Fonte</th>
                <th>Valor Total</th><th>Valor Atual</th><th>Prazo</th><th>Observação</th><th>Ações</th>
              </tr>
            </thead>
            <tbody id="corpoTabelaNc"><tr><td colspan="14"><div class="vazio">Carregando…</div></td></tr></tbody>
          </table>
        </div>
      </div>
    `;

    const notas = await api.get('/api/notas-credito');
    const corpo = container.querySelector('#corpoTabelaNc');

    if (!notas.length) {
      corpo.innerHTML = '<tr><td colspan="14"><div class="vazio">Nenhuma Nota de Crédito cadastrada.</div></td></tr>';
      return;
    }

    corpo.innerHTML = notas.map((nc) => `
      <tr data-nc="${nc.id}">
        <td><button class="btn-icone btn-expandir-nc" data-expandir="${nc.id}" title="Ver empenhos vinculados">▾</button></td>
        <td>${nc.numero_nc}</td>
        <td>${formatDataBR(nc.data_emissao)}</td>
        <td>${nc.ug}</td>
        <td>${nc.uge}</td>
        <td>${NATUREZA_LABEL_NC[nc.nd] || nc.nd}</td>
        <td>${nc.plano_interno || '-'}</td>
        <td>${nc.ptres || '-'}</td>
        <td>${nc.fonte || '-'}</td>
        <td>${formatMoeda(nc.valor_total)}</td>
        <td><span class="badge ${nc.valor_atual > 0 ? 'badge-verde' : 'badge-dourado'}">${formatMoeda(nc.valor_atual)}</span></td>
        <td>${nc.prazo ? `<span class="badge ${classePrazo(nc.dias_prazo)}">${formatDataBR(nc.prazo)} (${nc.dias_prazo}d)</span>` : '-'}</td>
        <td>${nc.observacao || '-'}</td>
        <td><button class="btn-icone btn-editar-nc" data-editar="${nc.id}" title="Editar">✎</button></td>
      </tr>
      <tr class="linha-detalhe" data-detalhe-nc="${nc.id}" style="display:none">
        <td colspan="14"><div class="vazio">Carregando empenhos…</div></td>
      </tr>
    `).join('');

    corpo.querySelectorAll('.btn-editar-nc').forEach((btn) => {
      btn.addEventListener('click', () => SisAprov.irPara('nc-adicionar', btn.dataset.editar));
    });

    corpo.querySelectorAll('.btn-expandir-nc').forEach((btn) => {
      btn.addEventListener('click', async (evento) => {
        evento.stopPropagation();
        const linhaDetalhe = corpo.querySelector(`tr[data-detalhe-nc="${btn.dataset.expandir}"]`);
        const abrindo = linhaDetalhe.style.display === 'none';
        linhaDetalhe.style.display = abrindo ? 'table-row' : 'none';
        btn.textContent = abrindo ? '▴' : '▾';
        if (!abrindo) return;

        const empenhos = await api.get(`/api/empenhos?notaCreditoId=${btn.dataset.expandir}`);
        if (!empenhos.length) {
          linhaDetalhe.querySelector('td').innerHTML = '<div class="vazio">Nenhum empenho vinculado a esta Nota de Crédito.</div>';
          return;
        }

        linhaDetalhe.querySelector('td').innerHTML = `
          <div class="tabela-wrap">
            <table class="tabela">
              <thead>
                <tr><th>Empenho</th><th>Favorecido</th><th>Credor</th><th>Data</th><th>Vlr. Global</th><th>Saldo Atual</th></tr>
              </thead>
              <tbody>
                ${empenhos.map((e) => `
                  <tr>
                    <td>${e.numero_empenho}</td>
                    <td>${SisAprov.formatFavorecido(e.favorecido)}</td>
                    <td>${e.nome_credor || '-'}</td>
                    <td>${formatDataBR(e.data_emissao)}</td>
                    <td>${formatMoeda(e.valor_global)}</td>
                    <td>${formatMoeda(e.saldo_atual)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      });
    });
  }

  SisAprov.registrarView('nc-adicionar', renderAdicionar);
  SisAprov.registrarView('nc-situacao', renderSituacaoGeral);
})();
