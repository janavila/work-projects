/**
 * Gestão de contas — CRUD de usuários e permissões de OM (seção 2.5 da v2).
 *
 * O servidor é quem valida tudo (formato de e-mail, tamanho de senha, duplicidade,
 * autoexclusão de admin); esta tela só monta o formulário e mostra a resposta.
 */
(function (global) {
  'use strict';

  const F = global.Format;
  const AC = global.AdminComum;

  const estado = {
    usuarios: [],
    oms: [],
    editando: null,   // id do usuário em edição, ou null quando é cadastro novo
    formularioAberto: false,
  };

  // ============================== CARGA ==============================

  async function carregar() {
    const [respostaUsuarios, respostaOms] = await Promise.all([
      global.Api.get('/api/admin/usuarios'),
      global.Api.get('/api/admin/oms'),
    ]);
    estado.usuarios = respostaUsuarios.usuarios || [];
    estado.oms = respostaOms.oms || [];
  }

  // ============================== FORMULÁRIO ==============================

  function usuarioEmEdicao() {
    return estado.usuarios.find((u) => u.id === estado.editando) || null;
  }

  function abrirFormulario(id) {
    estado.editando = id || null;
    estado.formularioAberto = true;
    render();
    const primeiroCampo = document.getElementById('form-usuario-nome');
    if (primeiroCampo) primeiroCampo.focus();
  }

  function fecharFormulario() {
    estado.editando = null;
    estado.formularioAberto = false;
    render();
  }

  function montarFormulario() {
    const usuario = usuarioEmEdicao();
    const ehEdicao = Boolean(usuario);

    const card = AC.elemento('div', 'card admin-form');
    card.appendChild(AC.elemento('h3', null, ehEdicao ? `Editar conta — ${usuario.nome}` : 'Nova conta'));

    const grade = AC.elemento('div', 'admin-form-grade');

    grade.appendChild(campoTexto('form-usuario-nome', 'Nome completo', ehEdicao ? usuario.nome : '', 'text'));

    // O nome de cadastro é a credencial de entrada (a senha é a outra metade).
    const campoCadastro = campoTexto(
      'form-usuario-nome-cadastro',
      'Nome de cadastro (usado para entrar)',
      ehEdicao ? usuario.nomeCadastro : '',
      'text'
    );
    campoCadastro.querySelector('input').setAttribute('autocapitalize', 'none');
    campoCadastro.querySelector('input').setAttribute('spellcheck', 'false');
    campoCadastro.querySelector('input').placeholder = 'ex.: jansen.avila';
    campoCadastro.appendChild(AC.elemento(
      'p',
      'admin-ajuda',
      'É com isto que a pessoa entra no sistema, junto da senha. Letras sem acento, números, ponto, hífen e sublinhado — sem espaços e sem diferenciar maiúsculas.'
    ));
    grade.appendChild(campoCadastro);

    const campoEmail = campoTexto('form-usuario-email', 'E-mail (opcional)', ehEdicao ? (usuario.email || '') : '', 'email');
    campoEmail.appendChild(AC.elemento('p', 'admin-ajuda', 'Apenas contato — não é usado para entrar no sistema e pode ficar em branco.'));
    grade.appendChild(campoEmail);

    if (!ehEdicao) {
      grade.appendChild(campoTexto('form-usuario-senha', 'Senha inicial (mínimo 8 caracteres)', '', 'password'));
    }

    // Perfil
    const campoPerfil = AC.elemento('div', 'admin-campo');
    campoPerfil.appendChild(AC.elemento('label', null, 'Perfil de acesso'));
    const selectPerfil = document.createElement('select');
    selectPerfil.id = 'form-usuario-perfil';
    [
      { valor: 'comum', texto: 'Usuário comum — vê apenas as OMs marcadas abaixo' },
      { valor: 'admin', texto: 'Administrador — vê todas as OMs e a área de gestão' },
    ].forEach((opcao) => {
      const el = document.createElement('option');
      el.value = opcao.valor;
      el.textContent = opcao.texto;
      el.selected = ehEdicao ? (opcao.valor === 'admin') === usuario.isAdmin : opcao.valor === 'comum';
      selectPerfil.appendChild(el);
    });
    campoPerfil.appendChild(selectPerfil);
    grade.appendChild(campoPerfil);

    if (ehEdicao) {
      const campoAtivo = AC.elemento('div', 'admin-campo');
      campoAtivo.appendChild(AC.elemento('label', null, 'Situação'));
      const selectAtivo = document.createElement('select');
      selectAtivo.id = 'form-usuario-ativo';
      [
        { valor: 'true', texto: 'Ativa — pode entrar no sistema' },
        { valor: 'false', texto: 'Desativada — login bloqueado' },
      ].forEach((opcao) => {
        const el = document.createElement('option');
        el.value = opcao.valor;
        el.textContent = opcao.texto;
        el.selected = String(usuario.ativo) === opcao.valor;
        selectAtivo.appendChild(el);
      });
      campoAtivo.appendChild(selectAtivo);
      grade.appendChild(campoAtivo);
    }

    card.appendChild(grade);

    // Permissões de OM
    const blocoOms = AC.elemento('div', 'admin-campo admin-campo-oms');
    blocoOms.id = 'form-usuario-bloco-oms';
    blocoOms.appendChild(AC.elemento('label', null, 'Organizações Militares que esta conta pode ver'));
    blocoOms.appendChild(AC.elemento(
      'p',
      'admin-ajuda',
      'Marque uma ou mais OMs. A permissão pode ser dada a qualquer OM ativa, inclusive às que ainda não têm base de dados nenhuma — quando a primeira pesquisa daquela OM for enviada, a pessoa já a verá sem precisar de novo cadastro. Conta sem nenhuma OM marcada entra no dashboard, mas vê o aviso "sem organizações liberadas para seu usuário". OMs inativas aparecem em cinza e não podem ser liberadas: ative-as antes, na aba Organizações Militares.'
    ));

    const listaOms = AC.elemento('div', 'lista-checkboxes');
    const permitidas = new Set(ehEdicao ? usuario.oms.map((om) => om.id) : []);

    if (estado.oms.length === 0) {
      listaOms.appendChild(AC.elemento('p', 'admin-ajuda', 'Nenhuma OM cadastrada ainda — cadastre na aba Organizações Militares.'));
    }

    estado.oms.forEach((om) => {
      const linha = AC.elemento('label', om.ativo ? 'item-checkbox' : 'item-checkbox item-checkbox-inativo');
      const caixa = document.createElement('input');
      caixa.type = 'checkbox';
      caixa.value = String(om.id);
      caixa.className = 'form-usuario-om';
      caixa.checked = permitidas.has(om.id);
      caixa.disabled = !om.ativo;
      linha.appendChild(caixa);

      // Sinaliza a OM que ainda não aparece em base nenhuma: a permissão vale e
      // fica guardada, mas hoje não há dado para mostrar. Evita a leitura errada
      // de "marquei e não funcionou".
      let rotulo = om.nome;
      if (!om.ativo) rotulo += ' (inativa)';
      else if (om.totalDatasets === 0) rotulo += ' — sem dados ainda';
      linha.appendChild(AC.elemento('span', null, rotulo));
      listaOms.appendChild(linha);
    });

    blocoOms.appendChild(listaOms);
    card.appendChild(blocoOms);

    // O bloco de OMs não se aplica a administrador (is_admin já significa "todas").
    const alternarBlocoOms = () => {
      const ehAdmin = selectPerfil.value === 'admin';
      blocoOms.style.display = ehAdmin ? 'none' : '';
    };
    selectPerfil.addEventListener('change', alternarBlocoOms);
    alternarBlocoOms();

    const acoes = AC.elemento('div', 'admin-form-acoes');
    acoes.appendChild(AC.botao(ehEdicao ? 'Salvar alterações' : 'Criar conta', 'botao-admin botao-admin-primario', (ev) => salvar(ev.currentTarget)));
    acoes.appendChild(AC.botao('Cancelar', 'botao-admin', fecharFormulario));
    card.appendChild(acoes);

    return card;
  }

  function campoTexto(id, rotulo, valor, tipo) {
    const campo = AC.elemento('div', 'admin-campo');
    const label = AC.elemento('label', null, rotulo);
    label.setAttribute('for', id);
    const input = document.createElement('input');
    input.type = tipo || 'text';
    input.id = id;
    input.value = valor || '';
    if (tipo === 'password') input.autocomplete = 'new-password';
    campo.appendChild(label);
    campo.appendChild(input);
    return campo;
  }

  function lerFormulario() {
    const ehAdmin = document.getElementById('form-usuario-perfil').value === 'admin';
    const dados = {
      nome: document.getElementById('form-usuario-nome').value.trim(),
      nomeCadastro: document.getElementById('form-usuario-nome-cadastro').value.trim().toLowerCase(),
      email: document.getElementById('form-usuario-email').value.trim(),
      isAdmin: ehAdmin,
      oms: ehAdmin ? [] : Array.from(document.querySelectorAll('.form-usuario-om:checked')).map((c) => Number(c.value)),
    };

    const campoSenha = document.getElementById('form-usuario-senha');
    if (campoSenha) dados.senha = campoSenha.value;

    const campoAtivo = document.getElementById('form-usuario-ativo');
    if (campoAtivo) dados.ativo = campoAtivo.value === 'true';

    return dados;
  }

  async function salvar(botao) {
    const dados = lerFormulario();
    const id = estado.editando;

    await AC.executarAcao(
      botao,
      () => (id ? global.Api.put(`/api/admin/usuarios/${id}`, dados) : global.Api.post('/api/admin/usuarios', dados)),
      async (resposta) => {
        if (!resposta) return;
        await carregar();
        fecharFormulario();
      }
    );
  }

  // ============================== AÇÕES DE LINHA ==============================

  async function redefinirSenha(usuario, botao) {
    const senha = window.prompt(`Nova senha para ${usuario.nome} (mínimo 8 caracteres):`);
    if (senha === null) return;

    await AC.executarAcao(
      botao,
      () => global.Api.put(`/api/admin/usuarios/${usuario.id}/senha`, { senha }),
      async (resposta) => {
        if (!resposta) return;
        AC.mensagem(`Senha de ${usuario.nome} redefinida. Informe a nova senha pessoalmente — o sistema não envia e-mail.`, 'info');
        await carregar();
        render();
      }
    );
  }

  async function excluir(usuario, botao) {
    if (!AC.confirmarExclusao(`Excluir a conta de ${usuario.nome} (nome de cadastro: ${usuario.nomeCadastro})?`)) return;

    await AC.executarAcao(
      botao,
      () => global.Api.remover(`/api/admin/usuarios/${usuario.id}`),
      async (resposta) => {
        if (!resposta) return;
        await carregar();
        render();
      }
    );
  }

  // ============================== TABELA ==============================

  function descricaoPermissoes(usuario) {
    if (usuario.isAdmin) return 'Todas as OMs (administrador)';
    if (usuario.oms.length === 0) return 'Nenhuma OM liberada';
    return usuario.oms.map((om) => om.nome).join(', ');
  }

  function montarTabela() {
    const card = AC.elemento('div', 'card');
    const tabela = AC.elemento('table', 'tabela-dados tabela-admin');
    tabela.innerHTML = '<thead><tr>'
      + '<th>Nome</th><th>Nome de cadastro</th><th>E-mail</th><th>Perfil</th><th>Situação</th>'
      + '<th>OMs liberadas</th><th>Ações</th>'
      + '</tr></thead>';

    const corpo = document.createElement('tbody');

    estado.usuarios.forEach((usuario) => {
      const linha = document.createElement('tr');
      if (!usuario.ativo) linha.className = 'linha-inativa';

      const bloqueado = usuario.bloqueadoAte && new Date(String(usuario.bloqueadoAte).replace(' ', 'T')).getTime() > Date.now();
      const situacao = !usuario.ativo
        ? 'Desativada'
        : (bloqueado ? `Bloqueada até ${AC.dataHoraBR(usuario.bloqueadoAte)}` : 'Ativa');

      linha.innerHTML = `
        <td>${F.escapeHtml(usuario.nome)}</td>
        <td><strong>${F.escapeHtml(usuario.nomeCadastro)}</strong></td>
        <td>${usuario.email ? F.escapeHtml(usuario.email) : '—'}</td>
        <td>${usuario.isAdmin ? '<strong>Administrador</strong>' : 'Usuário comum'}</td>
        <td>${F.escapeHtml(situacao)}</td>
        <td class="celula-oms">${F.escapeHtml(descricaoPermissoes(usuario))}</td>
      `;

      const celulaAcoes = document.createElement('td');
      celulaAcoes.className = 'celula-acoes';
      celulaAcoes.appendChild(AC.botao('Editar', 'botao-admin botao-admin-pequeno', () => abrirFormulario(usuario.id)));
      celulaAcoes.appendChild(AC.botao('Redefinir senha', 'botao-admin botao-admin-pequeno', (ev) => redefinirSenha(usuario, ev.currentTarget)));
      celulaAcoes.appendChild(AC.botao('Excluir', 'botao-admin botao-admin-pequeno botao-admin-perigo', (ev) => excluir(usuario, ev.currentTarget)));
      linha.appendChild(celulaAcoes);

      corpo.appendChild(linha);
    });

    tabela.appendChild(corpo);
    card.appendChild(tabela);

    if (estado.usuarios.length === 0) {
      card.appendChild(AC.elemento('p', 'admin-ajuda', 'Nenhuma conta cadastrada.'));
    }

    return card;
  }

  // ============================== RENDER ==============================

  function render() {
    const container = document.getElementById('aba-usuarios');
    container.innerHTML = '';

    container.appendChild(AC.cabecalhoSecao(
      'Contas de acesso',
      'A entrada no sistema é por nome de cadastro e senha; o e-mail é opcional e serve só como contato. Cada conta comum vê somente as Organizações Militares liberadas para ela. Não há recuperação automática de senha: quem redefine é o administrador, aqui nesta tela.',
      estado.formularioAberto ? null : AC.botao('+ Nova conta', 'botao-admin botao-admin-primario', () => abrirFormulario(null))
    ));

    if (estado.formularioAberto) container.appendChild(montarFormulario());
    container.appendChild(montarTabela());
  }

  async function iniciar() {
    await carregar();
    render();
  }

  global.AdminUsuarios = { iniciar, render, carregar };
})(window);
