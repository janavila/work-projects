(() => {
  const { api, toast, formatDataBR, digitsOnly, optionsHtml, POSTOS_PRESIDENTE, POSTOS_MEMBRO, POSTOS_FISCAL, dataValida } = SisAprov;

  function apenasTexto(valor) {
    return String(valor || '').replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' -]/g, '');
  }

  async function renderAdicionar(container, comissaoId) {
    const editando = Boolean(comissaoId);
    let comissao = null;
    if (editando) comissao = await api.get('/api/comissoes').then((lista) => lista.find((c) => String(c.id) === String(comissaoId)));

    container.innerHTML = `
      <div class="painel">
        <form id="formComissao">
          <div class="form-grid">
            <div class="campo">
              <label>BI de Nomeação</label>
              <input type="text" id="biNomeacao" inputmode="numeric" placeholder="Somente números" value="${comissao?.bi_nomeacao || ''}" required>
            </div>
            <div class="campo">
              <label>Data de Nomeação</label>
              <input type="date" id="dataNomeacao" value="${comissao?.data_nomeacao || ''}" required>
              <small class="erro" id="erroDataNomeacao" style="display:none">Data inválida (não pode ser anterior a 2024).</small>
            </div>
            <div class="campo">
              <label>Mês de Vigência</label>
              <input type="text" id="mes" placeholder="Ex.: Julho/2026" value="${comissao?.mes || ''}" required>
            </div>
          </div>

          <h3 style="margin:22px 0 6px;color:var(--azul-escuro)">Presidente da Comissão</h3>
          <div class="form-grid">
            <div class="campo"><label>Nome Completo</label><input type="text" id="presidenteNome" value="${comissao?.presidente_nome || ''}" required></div>
            <div class="campo"><label>Posto/Graduação</label><select id="presidentePosto" required>${optionsHtml(POSTOS_PRESIDENTE, comissao?.presidente_posto)}</select></div>
          </div>

          <h3 style="margin:22px 0 6px;color:var(--azul-escuro)">Membro 1</h3>
          <div class="form-grid">
            <div class="campo"><label>Nome Completo</label><input type="text" id="membro1Nome" value="${comissao?.membro1_nome || ''}" required></div>
            <div class="campo"><label>Posto/Graduação</label><select id="membro1Posto" required>${optionsHtml(POSTOS_MEMBRO, comissao?.membro1_posto)}</select></div>
          </div>

          <h3 style="margin:22px 0 6px;color:var(--azul-escuro)">Membro 2</h3>
          <div class="form-grid">
            <div class="campo"><label>Nome Completo</label><input type="text" id="membro2Nome" value="${comissao?.membro2_nome || ''}" required></div>
            <div class="campo"><label>Posto/Graduação</label><select id="membro2Posto" required>${optionsHtml(POSTOS_MEMBRO, comissao?.membro2_posto)}</select></div>
          </div>

          <h3 style="margin:22px 0 6px;color:var(--azul-escuro)">Fiscal Administrativo</h3>
          <div class="form-grid">
            <div class="campo"><label>Nome Completo</label><input type="text" id="fiscalNome" value="${comissao?.fiscal_nome || ''}" required></div>
            <div class="campo"><label>Posto/Graduação</label><select id="fiscalPosto" required>${optionsHtml(POSTOS_FISCAL, comissao?.fiscal_posto)}</select></div>
          </div>

          <div class="acoes-form">
            <button type="submit" class="btn btn-primario">${editando ? 'Salvar Alterações' : 'Adicionar'}</button>
            ${editando ? '<button type="button" class="btn btn-secundario" id="btnVoltar">Voltar</button>' : ''}
          </div>
        </form>
      </div>
    `;

    if (editando) {
      container.querySelector('#btnVoltar').addEventListener('click', () => {
        SisAprov.irPara('comissao-visualizar');
      });
    }

    container.querySelector('#biNomeacao').addEventListener('input', (evento) => {
      evento.target.value = digitsOnly(evento.target.value);
    });

    ['#presidenteNome', '#membro1Nome', '#membro2Nome', '#fiscalNome'].forEach((seletor) => {
      const campo = container.querySelector(seletor);
      campo.addEventListener('input', () => {
        campo.value = apenasTexto(campo.value);
      });
    });

    const dataNomeacaoInput = container.querySelector('#dataNomeacao');
    const erroDataNomeacao = container.querySelector('#erroDataNomeacao');
    dataNomeacaoInput.addEventListener('input', () => {
      erroDataNomeacao.style.display = (dataNomeacaoInput.value && !dataValida(dataNomeacaoInput.value)) ? 'block' : 'none';
    });

    container.querySelector('#formComissao').addEventListener('submit', async (evento) => {
      evento.preventDefault();

      if (!dataValida(dataNomeacaoInput.value)) {
        erroDataNomeacao.style.display = 'block';
        toast('Data de nomeação inválida (não pode ser anterior a 2024)', 'erro');
        return;
      }

      const payload = {
        bi_nomeacao: container.querySelector('#biNomeacao').value.trim(),
        data_nomeacao: container.querySelector('#dataNomeacao').value,
        mes: container.querySelector('#mes').value.trim(),
        presidente_nome: container.querySelector('#presidenteNome').value.trim(),
        presidente_posto: container.querySelector('#presidentePosto').value,
        membro1_nome: container.querySelector('#membro1Nome').value.trim(),
        membro1_posto: container.querySelector('#membro1Posto').value,
        membro2_nome: container.querySelector('#membro2Nome').value.trim(),
        membro2_posto: container.querySelector('#membro2Posto').value,
        fiscal_nome: container.querySelector('#fiscalNome').value.trim(),
        fiscal_posto: container.querySelector('#fiscalPosto').value,
      };
      try {
        if (editando) {
          await api.put(`/api/comissoes/${comissaoId}`, payload);
          toast('Comissão atualizada com sucesso.', 'sucesso');
        } else {
          await api.post('/api/comissoes', payload);
          toast('Comissão adicionada com sucesso.', 'sucesso');
        }
        SisAprov.irPara('comissao-visualizar');
      } catch (erro) {
        toast(erro.message, 'erro');
      }
    });
  }

  async function renderVisualizar(container) {
    container.innerHTML = `
      <div class="painel">
        <div class="tabela-wrap">
          <table class="tabela">
            <thead>
              <tr>
                <th>BI Nomeação</th><th>Data Nomeação</th><th>Mês</th>
                <th>Presidente</th><th>Membro 1</th><th>Membro 2</th><th>Fiscal Adm.</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody id="corpoTabelaComissoes"><tr><td colspan="8"><div class="vazio">Carregando…</div></td></tr></tbody>
          </table>
        </div>
      </div>
    `;

    const comissoes = await api.get('/api/comissoes');
    const corpo = container.querySelector('#corpoTabelaComissoes');

    if (!comissoes.length) {
      corpo.innerHTML = '<tr><td colspan="8"><div class="vazio">Nenhuma comissão cadastrada.</div></td></tr>';
      return;
    }

    corpo.innerHTML = comissoes.map((c) => `
      <tr>
        <td>${c.bi_nomeacao}</td>
        <td>${formatDataBR(c.data_nomeacao)}</td>
        <td>${c.mes}</td>
        <td>${c.presidenteCompleto}</td>
        <td>${c.membro1Completo}</td>
        <td>${c.membro2Completo}</td>
        <td>${c.fiscalCompleto}</td>
        <td>
          <button class="btn-icone" data-editar="${c.id}" title="Editar">✎</button>
          <button class="btn-icone" data-excluir="${c.id}" title="Excluir">🗑</button>
        </td>
      </tr>
    `).join('');

    corpo.querySelectorAll('[data-editar]').forEach((btn) => {
      btn.addEventListener('click', () => SisAprov.irPara('comissao-adicionar', btn.dataset.editar));
    });
    corpo.querySelectorAll('[data-excluir]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Confirma a exclusão desta comissão?')) return;
        try {
          await api.del(`/api/comissoes/${btn.dataset.excluir}`);
          toast('Comissão excluída.', 'sucesso');
          renderVisualizar(container);
        } catch (erro) {
          toast(erro.message, 'erro');
        }
      });
    });
  }

  SisAprov.registrarView('comissao-adicionar', renderAdicionar);
  SisAprov.registrarView('comissao-visualizar', renderVisualizar);
})();
