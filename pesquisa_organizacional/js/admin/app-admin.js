/**
 * Orquestração da área de gestão: verifica quem está logado, monta o cabeçalho,
 * liga a navegação por abas e inicializa as três telas.
 *
 * O controle de acesso de verdade é do servidor (requireAdmin em toda rota
 * /api/admin/*). O que esta tela faz é evitar mostrar uma página inútil a quem
 * não é administrador — e mandar de volta ao dashboard com explicação.
 */
(function (global) {
  'use strict';

  const ABAS = {
    usuarios: () => global.AdminUsuarios,
    oms: () => global.AdminOms,
    datasets: () => global.AdminDatasets,
  };

  const estado = { abaAtiva: 'usuarios', iniciadas: {} };

  function mostrarErro(mensagem) {
    document.getElementById('tela-carregando').style.display = 'none';
    document.getElementById('app-admin').style.visibility = 'hidden';
    const tela = document.getElementById('tela-erro');
    tela.style.display = 'flex';
    document.getElementById('tela-erro-mensagem').textContent = mensagem;
  }

  function renderAreaUsuario(usuario) {
    document.getElementById('usuario-nome').textContent = `${usuario.nome} (administrador)`;
    document.getElementById('usuario-area').style.display = '';

    document.getElementById('btn-sair').addEventListener('click', async (evento) => {
      evento.currentTarget.disabled = true;
      try {
        await global.Api.post('/api/logout');
      } catch (e) {
        // Destino é o mesmo de qualquer forma: a tela de login.
      }
      window.location.replace(global.Api.PAGINA_LOGIN);
    });
  }

  async function trocarAba(nome) {
    if (!ABAS[nome] || nome === estado.abaAtiva) return;
    estado.abaAtiva = nome;

    document.querySelectorAll('#abas-nav-admin .aba-btn').forEach((botao) => {
      botao.classList.toggle('ativa', botao.dataset.aba === nome);
    });
    document.querySelectorAll('.aba-painel').forEach((painel) => {
      painel.classList.toggle('ativa', painel.id === `aba-${nome}`);
    });

    global.AdminComum.limparMensagem();
    await garantirAbaIniciada(nome);
  }

  /** Cada aba busca seus dados na primeira vez que é aberta, não na carga da página. */
  async function garantirAbaIniciada(nome) {
    if (estado.iniciadas[nome]) return;
    try {
      await ABAS[nome]().iniciar();
      estado.iniciadas[nome] = true;
    } catch (erro) {
      if (erro && erro.status === 401) return;
      global.AdminComum.mensagem(erro.mensagem || 'Não foi possível carregar esta aba.', 'erro');
    }
  }

  async function init() {
    try {
      const usuario = await global.Api.get('/api/me');

      if (!usuario.isAdmin) {
        mostrarErro('Esta área é restrita a administradores. Você será levado de volta ao dashboard.');
        window.setTimeout(() => window.location.replace('index.html'), 2500);
        return;
      }

      renderAreaUsuario(usuario);

      document.querySelectorAll('#abas-nav-admin .aba-btn').forEach((botao) => {
        botao.addEventListener('click', () => trocarAba(botao.dataset.aba));
      });

      await garantirAbaIniciada('usuarios');

      document.getElementById('tela-carregando').style.display = 'none';
      document.getElementById('app-admin').style.visibility = 'visible';
    } catch (erro) {
      if (erro && erro.status === 401) return; // js/api.js já redirecionou
      mostrarErro(erro.mensagem || erro.message);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
