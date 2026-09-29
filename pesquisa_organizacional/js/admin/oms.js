/**
 * Gestão de Organizações Militares (seção 2.5 da v2).
 *
 * Ponto sensível desta tela: o nome cadastrado precisa ser IDÊNTICO ao valor da
 * coluna `om` dentro do CSV processado — é essa string que o navegador compara
 * para decidir o que cada usuário pode ver. Por isso a tela avisa disso na
 * explicação e o servidor devolve um alerta quando se renomeia uma OM já usada
 * em bases processadas.
 *
 * OMs detectadas automaticamente num upload entram como INATIVAS: elas aparecem
 * aqui em destaque para o administrador revisar (conferir grafia) e ativar antes
 * de liberar acesso a alguém.
 */
(function (global) {
  'use strict';

  const F = global.Format;
  const AC = global.AdminComum;

  const estado = { oms: [], formularioAberto: false };

  async function carregar() {
    const resposta = await global.Api.get('/api/admin/oms');
    estado.oms = resposta.oms || [];
  }

  // ============================== FORMULÁRIO DE CADASTRO ==============================

  function montarFormulario() {
    const card = AC.elemento('div', 'card admin-form');
    card.appendChild(AC.elemento('h3', null, 'Nova Organização Militar'));

    const campo = AC.elemento('div', 'admin-campo');
    const label = AC.elemento('label', null, 'Nome da OM (exatamente como aparece na coluna "om" da planilha)');
    label.setAttribute('for', 'form-om-nome');
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'form-om-nome';
    input.placeholder = 'Ex.: Esqd Cmdo 3ª Bda C Mec';
    campo.appendChild(label);
    campo.appendChild(input);
    card.appendChild(campo);

    const acoes = AC.elemento('div', 'admin-form-acoes');
    acoes.appendChild(AC.botao('Cadastrar', 'botao-admin botao-admin-primario', (ev) => cadastrar(ev.currentTarget)));
    acoes.appendChild(AC.botao('Cancelar', 'botao-admin', () => { estado.formularioAberto = false; render(); }));
    card.appendChild(acoes);

    return card;
  }

  async function cadastrar(botao) {
    const nome = document.getElementById('form-om-nome').value.trim();
    await AC.executarAcao(
      botao,
      () => global.Api.post('/api/admin/oms', { nome, ativo: true }),
      async (resposta) => {
        if (!resposta) return;
        await carregar();
        estado.formularioAberto = false;
        render();
      }
    );
  }

  // ============================== AÇÕES DE LINHA ==============================

  async function renomear(om, botao) {
    const nome = window.prompt(
      'Novo nome da OM.\n\nATENÇÃO: o nome precisa continuar idêntico ao valor da coluna "om" dentro das bases de dados, senão as permissões deixam de casar com o dado.',
      om.nome
    );
    if (nome === null) return;

    await AC.executarAcao(
      botao,
      () => global.Api.put(`/api/admin/oms/${om.id}`, { nome: nome.trim(), ativo: om.ativo }),
      async (resposta) => {
        if (!resposta) return;
        await carregar();
        render();
      }
    );
  }

  async function alternarAtivo(om, botao) {
    if (om.ativo && om.totalUsuarios > 0) {
      const confirmar = window.confirm(
        `Desativar "${om.nome}"?\n\n${om.totalUsuarios} conta(s) têm permissão nesta OM e deixarão de ver os dados dela.`
      );
      if (!confirmar) return;
    }

    await AC.executarAcao(
      botao,
      () => global.Api.put(`/api/admin/oms/${om.id}`, { nome: om.nome, ativo: !om.ativo }),
      async (resposta) => {
        if (!resposta) return;
        await carregar();
        render();
      }
    );
  }

  // ============================== TABELA ==============================

  function montarTabela() {
    const card = AC.elemento('div', 'card');
    const tabela = AC.elemento('table', 'tabela-dados tabela-admin');
    tabela.innerHTML = '<thead><tr>'
      + '<th>Organização Militar</th><th>Situação</th>'
      + '<th class="col-numero">Contas com acesso</th><th class="col-numero">Bases de dados</th><th>Ações</th>'
      + '</tr></thead>';

    const corpo = document.createElement('tbody');

    estado.oms.forEach((om) => {
      const linha = document.createElement('tr');
      if (!om.ativo) linha.className = 'linha-inativa';

      linha.innerHTML = `
        <td>${F.escapeHtml(om.nome)}</td>
        <td>${om.ativo ? 'Ativa' : '<strong>Inativa — revisar e ativar</strong>'}</td>
        <td class="col-numero">${F.formatInteiro(om.totalUsuarios)}</td>
        <td class="col-numero">${F.formatInteiro(om.totalDatasets)}</td>
      `;

      const celulaAcoes = document.createElement('td');
      celulaAcoes.className = 'celula-acoes';
      celulaAcoes.appendChild(AC.botao('Renomear', 'botao-admin botao-admin-pequeno', (ev) => renomear(om, ev.currentTarget)));
      celulaAcoes.appendChild(AC.botao(om.ativo ? 'Desativar' : 'Ativar', 'botao-admin botao-admin-pequeno', (ev) => alternarAtivo(om, ev.currentTarget)));
      linha.appendChild(celulaAcoes);

      corpo.appendChild(linha);
    });

    tabela.appendChild(corpo);
    card.appendChild(tabela);

    if (estado.oms.length === 0) {
      card.appendChild(AC.elemento('p', 'admin-ajuda', 'Nenhuma OM cadastrada. Cadastre aqui ou envie uma base de dados — as OMs presentes nela são detectadas e cadastradas automaticamente como inativas.'));
    }

    return card;
  }

  function render() {
    const container = document.getElementById('aba-oms');
    container.innerHTML = '';

    const inativas = estado.oms.filter((om) => !om.ativo).length;

    container.appendChild(AC.cabecalhoSecao(
      'Organizações Militares',
      'O nome cadastrado aqui precisa ser idêntico ao valor da coluna "om" dentro das bases de dados. OMs novas detectadas em um upload entram como inativas e só podem ser liberadas a usuários depois de ativadas.',
      estado.formularioAberto ? null : AC.botao('+ Nova OM', 'botao-admin botao-admin-primario', () => { estado.formularioAberto = true; render(); })
    ));

    if (inativas > 0) {
      const aviso = AC.elemento('div', 'alerta alerta-aviso',
        `${inativas} OM(s) aguardando revisão: foram detectadas em uma base de dados e cadastradas como inativas. Confira a grafia e ative para poder liberá-las a usuários.`);
      container.appendChild(aviso);
    }

    if (estado.formularioAberto) container.appendChild(montarFormulario());
    container.appendChild(montarTabela());
  }

  async function iniciar() {
    await carregar();
    render();
  }

  global.AdminOms = { iniciar, render, carregar };
})(window);
