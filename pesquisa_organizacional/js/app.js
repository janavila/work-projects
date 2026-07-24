/**
 * Orquestração geral da aplicação: carga de dados, estado de filtros,
 * navegação por abas e a checagem centralizada de anonimato de nível 1
 * (seção 5.4 da especificação — feita uma vez, antes de qualquer aba).
 */
(function (global) {
  'use strict';

  const C = global.Constants;

  const ABA_TAB_MAP = {
    'visao-geral': 'visaoGeral',
    'por-secao': 'porSecao',
    'por-subsecao': 'porSubsecao',
    'por-om': 'porOM',
    qualitativas: 'qualitativas',
    perfil: 'perfil',
  };

  const CHIP_ROTULOS = {
    om: 'OM',
    posto_graduacao: 'Posto/Graduação',
    vinculo: 'Vínculo',
    escolaridade: 'Escolaridade',
  };

  const App = {
    structure: null,
    allRows: null,
    filtros: { om: [], posto_graduacao: [], vinculo: [], escolaridade: [] },
    domainValues: {},
    abaAtiva: 'visao-geral',
  };

  function novoResultadoAtual() {
    return global.Engine.computeResult(App.structure, App.allRows, App.filtros);
  }

  function adicionarValorFiltro(campo, valor) {
    if (!App.filtros[campo].includes(valor)) {
      App.filtros[campo] = App.filtros[campo].concat([valor]);
      recalcularTudo();
    }
  }

  function removerValorFiltro(campo, valor) {
    App.filtros[campo] = App.filtros[campo].filter((v) => v !== valor);
    recalcularTudo();
  }

  function limparFiltros() {
    C.FILTROS_ORDEM.forEach((c) => { App.filtros[c] = []; });
    recalcularTudo();
  }

  Object.assign(App, {
    getResultadoAtual: novoResultadoAtual,
    adicionarValorFiltro,
    removerValorFiltro,
    limparFiltros,
  });

  global.App = App;

  // ============================== CARGA DE DADOS ==============================

  async function carregarArquivoTexto(nomeArquivo, caminho) {
    let resp;
    try {
      resp = await fetch(caminho, { cache: 'no-store' });
    } catch (e) {
      throw new Error(`Arquivo ${nomeArquivo} não encontrado — coloque o arquivo em /data.`);
    }
    if (!resp.ok) {
      throw new Error(`Arquivo ${nomeArquivo} não encontrado — coloque o arquivo em /data.`);
    }
    const text = await resp.text();
    if (!text || text.trim().length === 0) {
      throw new Error(`O arquivo ${nomeArquivo} está vazio.`);
    }
    return text;
  }

  async function carregarDados() {
    const dicText = await carregarArquivoTexto('dicionario.csv', 'data/dicionario.csv');
    const resText = await carregarArquivoTexto('resultados.csv', 'data/resultados.csv');

    const dictItems = global.Dictionary.parseDictionary(dicText);
    if (dictItems.length === 0) throw new Error('O arquivo dicionario.csv está vazio.');

    const { rows: allRows, headers: resHeaders } = global.CSVParser.parseCSV(resText);
    if (allRows.length === 0) throw new Error('O arquivo resultados.csv não contém nenhuma resposta.');

    const colunasEsperadas = dictItems.map((it) => it.coluna);
    const faltando = colunasEsperadas.filter((c) => !resHeaders.includes(c));
    if (faltando.length > 0) {
      const nomes = faltando.slice(0, 5).join(', ') + (faltando.length > 5 ? '…' : '');
      throw new Error(`resultados.csv está sem ${faltando.length} coluna(s) esperada(s) pelo dicionário: ${nomes}.`);
    }

    App.structure = global.Dictionary.buildStructure(dictItems);
    App.allRows = allRows;
  }

  // ============================== FILTROS — UI ==============================

  const SELECT_IDS = {
    om: 'filtro-om',
    posto_graduacao: 'filtro-posto',
    vinculo: 'filtro-vinculo',
    escolaridade: 'filtro-escolaridade',
  };

  function valoresUnicos(campo) {
    const set = new Set();
    App.allRows.forEach((r) => { if (r[campo]) set.add(r[campo]); });
    return Array.from(set);
  }

  function popularFiltros() {
    App.domainValues.om = valoresUnicos('om').sort((a, b) => a.localeCompare(b, 'pt-BR'));
    App.domainValues.posto_graduacao = C.ordenarPorListaSugerida(valoresUnicos('posto_graduacao'), C.ORDEM_POSTO);
    App.domainValues.vinculo = valoresUnicos('vinculo').sort((a, b) => a.localeCompare(b, 'pt-BR'));
    App.domainValues.escolaridade = C.ordenarPorListaSugerida(valoresUnicos('escolaridade'), C.ORDEM_ESCOLARIDADE);

    C.FILTROS_ORDEM.forEach((campo) => {
      const select = document.getElementById(SELECT_IDS[campo]);
      select.innerHTML = '';
      App.domainValues[campo].forEach((valor) => {
        const opt = document.createElement('option');
        opt.value = valor;
        opt.textContent = valor;
        select.appendChild(opt);
      });
      select.size = Math.min(8, Math.max(4, App.domainValues[campo].length));
    });
  }

  function sincronizarSelects() {
    C.FILTROS_ORDEM.forEach((campo) => {
      const select = document.getElementById(SELECT_IDS[campo]);
      const ativos = new Set(App.filtros[campo]);
      Array.from(select.options).forEach((opt) => { opt.selected = ativos.has(opt.value); });
    });
  }

  function onSelectChange(campo, selectEl) {
    App.filtros[campo] = Array.from(selectEl.selectedOptions).map((o) => o.value);
    recalcularTudo();
  }

  function attachFiltroListeners() {
    C.FILTROS_ORDEM.forEach((campo) => {
      const select = document.getElementById(SELECT_IDS[campo]);

      // Permite alternar seleção com clique simples (sem precisar segurar Ctrl/Cmd),
      // mais amigável que o comportamento nativo de <select multiple>.
      select.addEventListener('mousedown', (e) => {
        if (e.target.tagName !== 'OPTION') return;
        e.preventDefault();
        e.target.selected = !e.target.selected;
        select.dispatchEvent(new Event('change'));
        select.focus();
      });

      select.addEventListener('change', () => onSelectChange(campo, select));
    });

    document.getElementById('btn-limpar-filtros').addEventListener('click', limparFiltros);
  }

  function renderChips() {
    const container = document.getElementById('chips-container');
    const vazio = document.getElementById('chips-vazio');
    container.querySelectorAll('.chip').forEach((el) => el.remove());

    let total = 0;
    C.FILTROS_ORDEM.forEach((campo) => {
      App.filtros[campo].forEach((valor) => {
        total++;
        const chip = document.createElement('span');
        chip.className = 'chip';
        const label = document.createElement('span');
        label.textContent = `${CHIP_ROTULOS[campo]}: ${valor}`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '×';
        btn.setAttribute('aria-label', `Remover filtro ${CHIP_ROTULOS[campo]}: ${valor}`);
        // Só remove em resposta a um clique real do usuário (evento com isTrusted),
        // nunca por recriação automática do chip — armadilha conhecida deste projeto.
        btn.addEventListener('click', (ev) => {
          if (!ev.isTrusted) return;
          removerValorFiltro(campo, valor);
        });
        chip.appendChild(label);
        chip.appendChild(btn);
        container.appendChild(chip);
      });
    });

    vazio.style.display = total === 0 ? '' : 'none';
  }

  // ============================== NAVEGAÇÃO POR ABAS ==============================

  function attachAbaListeners() {
    document.querySelectorAll('.aba-btn').forEach((btn) => {
      btn.addEventListener('click', () => trocarAba(btn.dataset.aba));
    });
  }

  function trocarAba(nome) {
    if (nome === App.abaAtiva) return;

    const chaveAnterior = ABA_TAB_MAP[App.abaAtiva];
    const tabAnterior = global.Tabs && global.Tabs[chaveAnterior];
    if (tabAnterior && typeof tabAnterior.reset === 'function') tabAnterior.reset();

    App.abaAtiva = nome;

    document.querySelectorAll('.aba-btn').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === nome));
    document.querySelectorAll('.aba-painel').forEach((p) => p.classList.toggle('ativa', p.id === `aba-${nome}`));

    renderAbaAtiva();
  }

  /**
   * Checagem centralizada de anonimato de nível 1 (5.4): antes de renderizar
   * qualquer aba, verifica N do recorte. Se < 5, substitui o conteúdo inteiro
   * da aba por um único estado de alerta — nunca delega isso a cada componente.
   */
  function renderAbaAtiva() {
    const container = document.getElementById(`aba-${App.abaAtiva}`);
    const n = global.Engine.filterRows(App.allRows, App.filtros).length;

    if (n < C.LIMIAR_ANONIMATO) {
      container.innerHTML = `<div class="tela-anonimato"><div class="alerta alerta-aviso">Seleção sem dados suficientes (N=${n})</div></div>`;
      return;
    }

    const chave = ABA_TAB_MAP[App.abaAtiva];
    global.Tabs[chave].render(container);
  }

  function recalcularTudo() {
    sincronizarSelects();
    renderChips();
    renderAbaAtiva();
  }

  // ============================== ERRO / CARREGANDO ==============================

  function mostrarErro(mensagem) {
    document.getElementById('tela-carregando').style.display = 'none';
    document.getElementById('app').style.visibility = 'hidden';
    const tela = document.getElementById('tela-erro');
    tela.style.display = 'flex';
    document.getElementById('tela-erro-mensagem').textContent = mensagem;
  }

  function mostrarApp() {
    document.getElementById('tela-carregando').style.display = 'none';
    document.getElementById('app').style.visibility = 'visible';
  }

  // ============================== INIT ==============================

  async function init() {
    document.getElementById('app').style.visibility = 'hidden';
    try {
      await carregarDados();
      popularFiltros();
      attachFiltroListeners();
      attachAbaListeners();
      renderChips();
      mostrarApp();
      renderAbaAtiva();
    } catch (err) {
      mostrarErro(err.message);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
