/**
 * Orquestração geral da aplicação: carga de dados, estado de filtros,
 * navegação por abas e a checagem centralizada de anonimato de nível 1
 * (seção 5.4 da especificação — feita uma vez, antes de qualquer aba).
 *
 * MUDANÇAS DA v2 (seção 6 do documento v2_autenticacao_permissoes_datasets.md):
 * - os dados não vêm mais de arquivo estático em /data, e sim da API autenticada
 *   (/api/me, /api/datasets, /api/dados?dataset_id=X, /api/dicionario);
 * - existe um seletor de base de dados (dataset) no painel de filtros;
 * - as linhas são filtradas pelas OMs permitidas ao usuário logado ANTES de
 *   chegarem ao Engine (decisão da seção 2.2: a filtragem por permissão acontece
 *   no navegador, não no servidor);
 * - qualquer 401 manda o usuário para login.html (tratado em js/api.js).
 *
 * O que NÃO mudou: o formato dos dados entregues ao Engine, às abas, aos
 * gráficos e à exportação é exatamente o mesmo da v1 — muda só de onde o CSV vem.
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

    // --- estado novo da v2 ---
    usuario: null,
    // null = sem restrição (administrador vê todas as OMs);
    // array de nomes = usuário comum, vê somente estas OMs.
    omsPermitidas: null,
    datasets: [],
    datasetIdAtual: null,
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

  // ============================== USUÁRIO E PERMISSÕES ==============================

  /**
   * Carrega quem está logado e quais OMs ele pode ver. Um 401 aqui já foi
   * tratado por js/api.js (redireciona para login.html).
   */
  async function carregarUsuario() {
    const usuario = await global.Api.get('/api/me');
    App.usuario = usuario;
    App.omsPermitidas = usuario.isAdmin ? null : usuario.oms.map((om) => om.nome);
  }

  function renderAreaUsuario() {
    const area = document.getElementById('usuario-area');
    const nome = document.getElementById('usuario-nome');
    const botaoGestao = document.getElementById('btn-gestao');

    nome.textContent = App.usuario.isAdmin
      ? `${App.usuario.nome} (administrador)`
      : App.usuario.nome;

    // Esconder o botão é conveniência visual: quem manda é o requireAdmin do
    // servidor, que recusa qualquer rota de gestão para conta comum.
    botaoGestao.style.display = App.usuario.isAdmin ? '' : 'none';
    area.style.display = '';

    document.getElementById('btn-sair').addEventListener('click', async (evento) => {
      const botao = evento.currentTarget;
      botao.disabled = true;
      try {
        await global.Api.post('/api/logout');
      } catch (e) {
        // Mesmo se o logout falhar (sessão já expirada, servidor fora), o
        // destino é o mesmo: a tela de login.
      }
      window.location.replace(global.Api.PAGINA_LOGIN);
    });
  }

  /**
   * Aplica a permissão por OM nas linhas recebidas do servidor, ANTES de
   * qualquer cálculo (seção 2.2 do documento da v2).
   *
   * Consequência desejada: como os valores dos filtros são descobertos a partir
   * das linhas, o dropdown de OM já nasce contendo só as OMs permitidas, e a aba
   * "Por Organização Militar" compara somente essas — sem precisar de nenhuma
   * alteração nas abas nem no Engine.
   */
  function filtrarLinhasPorPermissao(linhas) {
    if (App.omsPermitidas === null) return linhas;
    const permitidas = new Set(App.omsPermitidas);
    return linhas.filter((linha) => permitidas.has(linha.om));
  }

  // ============================== CARGA DE DADOS ==============================

  /** Busca a lista de datasets que o usuário pode abrir (alimenta o seletor). */
  async function carregarListaDatasets() {
    const resposta = await global.Api.get('/api/datasets');
    App.datasets = (resposta && resposta.datasets) || [];
  }

  /**
   * Carrega dicionário + respostas de um dataset e monta a estrutura do
   * instrumento. Mesmas validações da v1 (dicionário vazio, nenhuma resposta,
   * colunas faltando), agora com os textos apontando para a API.
   */
  async function carregarDados(datasetId) {
    const dicText = await global.Api.buscarTexto('/api/dicionario');
    const resText = await global.Api.buscarTexto(`/api/dados?dataset_id=${encodeURIComponent(datasetId)}`);

    const dictItems = global.Dictionary.parseDictionary(dicText);
    if (dictItems.length === 0) throw new Error('O dicionário de variáveis (dicionario.csv) está vazio.');

    const { rows: linhasBrutas, headers: resHeaders } = global.CSVParser.parseCSV(resText);
    if (linhasBrutas.length === 0) throw new Error('A base de dados selecionada não contém nenhuma resposta.');

    const colunasEsperadas = dictItems.map((it) => it.coluna);
    const faltando = colunasEsperadas.filter((c) => !resHeaders.includes(c));
    if (faltando.length > 0) {
      const nomes = faltando.slice(0, 5).join(', ') + (faltando.length > 5 ? '…' : '');
      throw new Error(`A base de dados selecionada está sem ${faltando.length} coluna(s) esperada(s) pelo dicionário: ${nomes}.`);
    }

    App.structure = global.Dictionary.buildStructure(dictItems);
    App.allRows = filtrarLinhasPorPermissao(linhasBrutas);
    App.datasetIdAtual = Number(datasetId);
  }

  // ============================== SELETOR DE DATASET ==============================

  function datasetAtual() {
    return App.datasets.find((d) => d.id === App.datasetIdAtual) || null;
  }

  function popularSeletorDataset() {
    const select = document.getElementById('seletor-dataset');
    select.innerHTML = '';
    App.datasets.forEach((dataset) => {
      const opcao = document.createElement('option');
      opcao.value = String(dataset.id);
      opcao.textContent = dataset.rotulo;
      opcao.selected = dataset.id === App.datasetIdAtual;
      select.appendChild(opcao);
    });

    // Com uma única base cadastrada o seletor não tem função — fica visível,
    // para o usuário saber qual base está vendo, mas desabilitado.
    select.disabled = App.datasets.length <= 1;
    select.addEventListener('change', () => trocarDataset(Number(select.value)));
  }

  function renderInfoDataset() {
    const info = document.getElementById('dataset-info');
    const dataset = datasetAtual();
    if (!dataset) { info.textContent = ''; return; }

    const partes = [];
    if (dataset.totalRespondentes !== null && dataset.totalRespondentes !== undefined) {
      partes.push(`${global.Format.formatInteiro(Number(dataset.totalRespondentes))} respondentes na base`);
    }
    if (App.omsPermitidas !== null) {
      const total = App.omsPermitidas.length;
      partes.push(`${total} ${total === 1 ? 'OM liberada' : 'OMs liberadas'} para seu usuário`);
    }
    info.textContent = partes.join(' · ');
  }

  /** Troca a base de dados exibida. Os filtros são zerados: cada base tem os seus valores. */
  async function trocarDataset(novoId) {
    if (!Number.isInteger(novoId) || novoId === App.datasetIdAtual) return;

    const conteudo = document.getElementById('conteudo');
    conteudo.classList.add('conteudo-carregando');

    try {
      await carregarDados(novoId);

      if (App.allRows.length === 0) {
        atualizarBadgePeriodo();
        renderInfoDataset();
        mostrarAvisoSemDados(mensagemSemLinhas());
        return;
      }

      mostrarConteudo();
      garantirListeners();
      C.FILTROS_ORDEM.forEach((campo) => { App.filtros[campo] = []; });
      popularFiltros();
      atualizarBadgePeriodo();
      renderInfoDataset();
      recalcularTudo();
    } catch (erro) {
      mostrarErro(erro.mensagem || erro.message);
    } finally {
      conteudo.classList.remove('conteudo-carregando');
    }
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

  /**
   * Liga os listeners de filtro e de aba uma única vez.
   *
   * Precisa ser idempotente e ser chamado ANTES de qualquer caminho de aviso:
   * se a primeira base aberta não tiver nenhuma linha permitida, a tela entra no
   * estado de aviso, e o usuário ainda pode trocar de base no seletor — sem isso,
   * os filtros e as abas ficariam inertes depois dessa troca.
   */
  let listenersLigados = false;
  function garantirListeners() {
    if (listenersLigados) return;
    attachFiltroListeners();
    attachAbaListeners();
    listenersLigados = true;
  }

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

  // ============================== PERÍODO DE APURAÇÃO ==============================

  /**
   * Na v1 o período vinha de data/meta.json; na v2 ele é metadado do dataset
   * selecionado e chega junto da lista de datasets (/api/datasets). Base sem
   * período detectado simplesmente não mostra o badge, como antes.
   */
  function atualizarBadgePeriodo() {
    const badge = document.getElementById('badge-periodo');
    const texto = document.getElementById('badge-periodo-texto');
    const dataset = datasetAtual();

    if (!dataset || !dataset.periodoInicio || !dataset.periodoFim) {
      badge.style.display = 'none';
      return;
    }

    const inicio = global.Format.formatDataISO(dataset.periodoInicio);
    const fim = global.Format.formatDataISO(dataset.periodoFim);
    texto.textContent = inicio === fim
      ? `Período de apuração: ${inicio}`
      : `Período de apuração: ${inicio} a ${fim}`;
    badge.style.display = '';
  }

  // ============================== ERRO / AVISO / CARREGANDO ==============================

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

  /**
   * Caso previsto na seção 2.1 do documento da v2: usuário comum sem nenhuma OM
   * liberada (ou com OMs que não aparecem em base nenhuma). "O dashboard carrega
   * normalmente, mas exibe o aviso em vez de dado vazio ou erro genérico" — por
   * isso o cabeçalho continua visível e só o miolo é substituído.
   */
  function mostrarAvisoSemDados(mensagem) {
    mostrarApp();
    document.getElementById('painel-filtros').style.display = 'none';
    document.getElementById('abas-nav').style.display = 'none';
    document.querySelectorAll('.aba-painel').forEach((painel) => { painel.classList.remove('ativa'); });

    let aviso = document.getElementById('aviso-sem-dados');
    if (!aviso) {
      aviso = document.createElement('div');
      aviso.id = 'aviso-sem-dados';
      aviso.className = 'tela-anonimato';
      document.getElementById('conteudo').appendChild(aviso);
    }
    aviso.innerHTML = '';
    const caixa = document.createElement('div');
    caixa.className = 'alerta alerta-aviso';
    caixa.textContent = mensagem;
    aviso.appendChild(caixa);
    aviso.style.display = '';
  }

  /** Desfaz o estado de aviso, quando a troca de base volta a ter dado para mostrar. */
  function mostrarConteudo() {
    const aviso = document.getElementById('aviso-sem-dados');
    if (aviso) aviso.style.display = 'none';
    document.getElementById('painel-filtros').style.display = '';
    document.getElementById('abas-nav').style.display = '';
    document.querySelectorAll('.aba-painel').forEach((painel) => {
      painel.classList.toggle('ativa', painel.id === `aba-${App.abaAtiva}`);
    });
  }

  function mensagemSemLinhas() {
    if (App.omsPermitidas !== null && App.omsPermitidas.length === 0) {
      return 'Sem organizações liberadas para seu usuário. Procure o administrador do sistema para receber acesso às OMs que você precisa acompanhar.';
    }
    return 'Nenhuma resposta das organizações militares liberadas para seu usuário foi encontrada nesta base de dados. Escolha outra base ou procure o administrador.';
  }

  function mensagemSemDatasets() {
    if (App.usuario.isAdmin) {
      return 'Nenhuma base de dados cadastrada ainda. Vá em Gestão > Bases de dados e envie a planilha exportada do formulário.';
    }
    if (App.omsPermitidas.length === 0) {
      return 'Sem organizações liberadas para seu usuário. Procure o administrador do sistema para receber acesso às OMs que você precisa acompanhar.';
    }
    return 'Nenhuma base de dados disponível para as organizações militares liberadas para seu usuário. Procure o administrador do sistema.';
  }

  // ============================== INIT ==============================

  async function init() {
    document.getElementById('app').style.visibility = 'hidden';
    try {
      await carregarUsuario();
      renderAreaUsuario();
      garantirListeners();

      await carregarListaDatasets();
      if (App.datasets.length === 0) {
        mostrarAvisoSemDados(mensagemSemDatasets());
        return;
      }

      // Sem persistência de seleção: abre sempre na base mais recente, que é a
      // primeira da lista devolvida pelo servidor (ordenada por envio, desc).
      await carregarDados(App.datasets[0].id);
      popularSeletorDataset();
      renderInfoDataset();

      if (App.allRows.length === 0) {
        atualizarBadgePeriodo();
        mostrarAvisoSemDados(mensagemSemLinhas());
        return;
      }

      popularFiltros();
      renderChips();
      atualizarBadgePeriodo();
      mostrarApp();
      renderAbaAtiva();
    } catch (err) {
      // Um 401 já redirecionou para login.html — não faz sentido pintar erro.
      if (err && err.status === 401) return;
      mostrarErro(err.mensagem || err.message);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
