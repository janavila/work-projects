/**
 * Camada única de acesso à API do servidor.
 *
 * Existe por dois motivos:
 *   1. centralizar o tratamento de 401 — qualquer resposta "não autenticado"
 *      manda o navegador para login.html, em vez de cada tela descobrir isso por
 *      conta própria (requisito da seção 6 do documento da v2);
 *   2. garantir que TODA requisição vá com o cookie de sessão
 *      (`credentials: 'same-origin'`) e sem cache.
 *
 * Padrão de erro: toda função rejeita com um Error cuja `.mensagem` é o texto em
 * português que o servidor mandou (pronto para exibir ao usuário) e cujo
 * `.status` é o código HTTP, para quem precisar distinguir os casos.
 */
(function (global) {
  'use strict';

  const PAGINA_LOGIN = 'login.html';

  /** Erro de API já com mensagem em português pronta para a tela. */
  function ErroApi(mensagem, status, codigo) {
    const erro = new Error(mensagem);
    erro.mensagem = mensagem;
    erro.status = status;
    erro.codigo = codigo;
    return erro;
  }

  function estaNaTelaDeLogin() {
    return window.location.pathname.endsWith(PAGINA_LOGIN);
  }

  /**
   * Redireciona para o login preservando a página atual, para o usuário voltar
   * para onde estava depois de autenticar.
   */
  function irParaLogin() {
    if (estaNaTelaDeLogin()) return;
    const destino = window.location.pathname.split('/').pop() || 'index.html';
    const query = destino === 'index.html' ? '' : `?retorno=${encodeURIComponent(destino)}`;
    window.location.replace(PAGINA_LOGIN + query);
  }

  async function lerCorpo(resposta) {
    const tipo = resposta.headers.get('Content-Type') || '';
    if (tipo.includes('application/json')) {
      try { return await resposta.json(); } catch (e) { return null; }
    }
    return null;
  }

  /**
   * Requisição JSON genérica.
   * @param {string} metodo GET, POST, PUT ou DELETE
   * @param {string} caminho caminho da API (ex.: '/api/me')
   * @param {Object} [corpo] objeto que vai como JSON no corpo
   * @param {Object} [opcoes] { semRedirecionar: true } para tratar 401 na própria tela
   */
  async function requisitar(metodo, caminho, corpo, opcoes) {
    const configuracao = {
      method: metodo,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    };
    if (corpo !== undefined && corpo !== null) {
      configuracao.headers['Content-Type'] = 'application/json';
      configuracao.body = JSON.stringify(corpo);
    }

    let resposta;
    try {
      resposta = await fetch(caminho, configuracao);
    } catch (e) {
      throw ErroApi('Não foi possível falar com o servidor. Verifique se ele está no ar e tente de novo.', 0, 'sem_rede');
    }

    if (resposta.status === 401 && !(opcoes && opcoes.semRedirecionar)) {
      irParaLogin();
      throw ErroApi('Sessão expirada. Faça login novamente.', 401, 'nao_autenticado');
    }

    const dados = await lerCorpo(resposta);

    if (!resposta.ok) {
      const mensagem = (dados && dados.mensagem) || `Falha na requisição (HTTP ${resposta.status}).`;
      throw ErroApi(mensagem, resposta.status, dados && dados.erro);
    }

    return dados;
  }

  /** Busca um arquivo de texto da API (CSV do dicionário e dos dados). */
  async function buscarTexto(caminho) {
    let resposta;
    try {
      resposta = await fetch(caminho, { credentials: 'same-origin', cache: 'no-store' });
    } catch (e) {
      throw ErroApi('Não foi possível falar com o servidor. Verifique se ele está no ar e tente de novo.', 0, 'sem_rede');
    }

    if (resposta.status === 401) {
      irParaLogin();
      throw ErroApi('Sessão expirada. Faça login novamente.', 401, 'nao_autenticado');
    }

    if (!resposta.ok) {
      const dados = await lerCorpo(resposta);
      const mensagem = (dados && dados.mensagem) || `Não foi possível carregar os dados (HTTP ${resposta.status}).`;
      throw ErroApi(mensagem, resposta.status, dados && dados.erro);
    }

    const texto = await resposta.text();
    if (!texto || texto.trim() === '') {
      throw ErroApi('O servidor devolveu um arquivo de dados vazio.', resposta.status, 'arquivo_vazio');
    }
    return texto;
  }

  /**
   * Envio de arquivo (upload de dataset). Não define Content-Type à mão — o
   * navegador precisa gerar o boundary do multipart.
   */
  async function enviarArquivo(caminho, formData) {
    let resposta;
    try {
      resposta = await fetch(caminho, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        body: formData,
      });
    } catch (e) {
      throw ErroApi('Não foi possível enviar o arquivo ao servidor.', 0, 'sem_rede');
    }

    if (resposta.status === 401) {
      irParaLogin();
      throw ErroApi('Sessão expirada. Faça login novamente.', 401, 'nao_autenticado');
    }

    const dados = await lerCorpo(resposta);
    if (!resposta.ok) {
      const mensagem = (dados && dados.mensagem) || `Falha no envio (HTTP ${resposta.status}).`;
      throw ErroApi(mensagem, resposta.status, dados && dados.erro);
    }
    return dados;
  }

  global.Api = {
    get: (caminho, opcoes) => requisitar('GET', caminho, null, opcoes),
    post: (caminho, corpo, opcoes) => requisitar('POST', caminho, corpo, opcoes),
    put: (caminho, corpo, opcoes) => requisitar('PUT', caminho, corpo, opcoes),
    remover: (caminho, opcoes) => requisitar('DELETE', caminho, null, opcoes),
    buscarTexto,
    enviarArquivo,
    irParaLogin,
    PAGINA_LOGIN,
  };
})(window);
