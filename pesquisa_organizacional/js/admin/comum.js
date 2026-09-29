/**
 * Utilidades compartilhadas pelas três telas de gestão.
 *
 * Mesmo padrão do resto do projeto: IIFE que publica um objeto em `window`,
 * sem módulos ES e sem build. Todo texto vindo do banco passa por
 * Format.escapeHtml antes de entrar em innerHTML (invariante 9 da v1).
 */
(function (global) {
  'use strict';

  const F = global.Format;

  /** Mensagem de sucesso/erro no topo da área de conteúdo. */
  function mensagem(texto, tipo) {
    const caixa = document.getElementById('mensagem-global');
    caixa.className = `mensagem-global ${tipo === 'erro' ? 'alerta alerta-erro' : 'alerta alerta-info'}`;
    caixa.textContent = texto;
    caixa.style.display = '';
    if (tipo !== 'erro') {
      window.clearTimeout(mensagem._temporizador);
      mensagem._temporizador = window.setTimeout(limparMensagem, 6000);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function limparMensagem() {
    const caixa = document.getElementById('mensagem-global');
    caixa.style.display = 'none';
    caixa.textContent = '';
  }

  /** Envolve uma ação de API: desabilita o botão, mostra a mensagem e recarrega a lista. */
  async function executarAcao(botao, acao, aoTerminar) {
    const textoOriginal = botao ? botao.textContent : null;
    if (botao) {
      botao.disabled = true;
      botao.textContent = 'Aguarde…';
    }
    try {
      const resposta = await acao();
      if (resposta && resposta.mensagem) mensagem(resposta.mensagem, 'info');
      if (resposta && resposta.aviso) mensagem(`${resposta.mensagem || ''} ${resposta.aviso}`.trim(), 'erro');
      if (typeof aoTerminar === 'function') await aoTerminar(resposta);
      return resposta;
    } catch (erro) {
      if (erro && erro.status === 401) return null;
      mensagem(erro.mensagem || 'Falha na operação.', 'erro');
      return null;
    } finally {
      if (botao) {
        botao.disabled = false;
        botao.textContent = textoOriginal;
      }
    }
  }

  /** "AAAA-MM-DD hh:mm:ss" (como o MySQL devolve) → "dd/mm/aaaa hh:mm". */
  function dataHoraBR(valor) {
    if (!valor) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(valor));
    if (!m) return F.formatDataISO(valor);
    return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  }

  /** Cria um elemento com classe e conteúdo de texto/HTML já definidos. */
  function elemento(tag, classe, conteudo, comoHtml) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (conteudo !== undefined && conteudo !== null) {
      if (comoHtml) el.innerHTML = conteudo;
      else el.textContent = conteudo;
    }
    return el;
  }

  /** Cabeçalho de seção com título, texto explicativo e um botão de ação opcional. */
  function cabecalhoSecao(titulo, explicacao, botao) {
    const bloco = elemento('div', 'admin-secao-cabecalho');
    const textos = elemento('div');
    textos.appendChild(elemento('h2', null, titulo));
    if (explicacao) textos.appendChild(elemento('p', 'admin-secao-explicacao', explicacao));
    bloco.appendChild(textos);
    if (botao) bloco.appendChild(botao);
    return bloco;
  }

  function botao(texto, classe, aoClicar) {
    const el = elemento('button', classe || 'botao-admin', texto);
    el.type = 'button';
    if (aoClicar) el.addEventListener('click', aoClicar);
    return el;
  }

  /** Confirmação de ação destrutiva. Exige digitar a palavra EXCLUIR. */
  function confirmarExclusao(descricao) {
    const digitado = window.prompt(
      `${descricao}\n\nEsta ação é DEFINITIVA e não pode ser desfeita.\nPara confirmar, digite EXCLUIR:`
    );
    return digitado !== null && digitado.trim().toUpperCase() === 'EXCLUIR';
  }

  global.AdminComum = {
    mensagem,
    limparMensagem,
    executarAcao,
    dataHoraBR,
    elemento,
    cabecalhoSecao,
    botao,
    confirmarExclusao,
  };
})(window);
