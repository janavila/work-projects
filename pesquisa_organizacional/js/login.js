/**
 * Tela de login — seção 2.1 do documento da v2 ("login em página separada,
 * visualmente consistente com o dashboard; após autenticar, redireciona direto
 * para o dashboard").
 *
 * Nada de regra de negócio aqui: quem valida credencial, conta bloqueada e
 * conta desativada é o servidor (POST /api/login). Esta tela só mostra a
 * mensagem que vier de lá.
 */
(function (global) {
  'use strict';

  /** Destino após o login: ?retorno=admin.html, quando houver; senão o dashboard. */
  function destinoPosLogin() {
    const parametros = new URLSearchParams(window.location.search);
    const retorno = parametros.get('retorno');
    // Só aceita nome de página local — nunca uma URL completa vinda da query
    // string (evita servir de trampolim para redirecionamento externo).
    if (retorno && /^[a-z0-9_-]+\.html$/i.test(retorno)) return retorno;
    return 'index.html';
  }

  function mostrarErro(mensagem) {
    const caixa = document.getElementById('login-erro');
    caixa.textContent = mensagem;
    caixa.style.display = '';
  }

  function limparErro() {
    const caixa = document.getElementById('login-erro');
    caixa.textContent = '';
    caixa.style.display = 'none';
  }

  async function aoEnviar(evento) {
    evento.preventDefault();
    limparErro();

    const botao = document.getElementById('btn-entrar');
    const nomeCadastro = document.getElementById('campo-nome-cadastro').value.trim();
    const senha = document.getElementById('campo-senha').value;

    if (nomeCadastro === '' || senha === '') {
      mostrarErro('Informe o nome de cadastro e a senha.');
      return;
    }

    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Entrando…';

    try {
      // semRedirecionar: nesta tela um 401 é "senha errada", não "sessão
      // expirada" — redirecionar para o próprio login seria um laço.
      await global.Api.post('/api/login', { nomeCadastro, senha }, { semRedirecionar: true });
      window.location.replace(destinoPosLogin());
    } catch (erro) {
      mostrarErro(erro.mensagem || 'Não foi possível entrar. Tente novamente.');
      botao.disabled = false;
      botao.textContent = textoOriginal;
      document.getElementById('campo-senha').value = '';
      document.getElementById('campo-senha').focus();
    }
  }

  /**
   * Se já existe sessão válida, não faz sentido mostrar o formulário — vai
   * direto para o destino. Um 401 aqui é o caso normal (ninguém logado).
   */
  async function verificarSessaoExistente() {
    try {
      await global.Api.get('/api/me', { semRedirecionar: true });
      window.location.replace(destinoPosLogin());
    } catch (erro) {
      // Sem sessão: segue mostrando o formulário de login.
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('form-login').addEventListener('submit', aoEnviar);
    verificarSessaoExistente();
  });
})(window);
