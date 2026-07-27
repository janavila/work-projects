const SisAprov = (() => {
  const views = {};
  const conteudo = () => document.getElementById('conteudo');

  const TITULOS = {
    'empenhos-adicionar': 'Adicionar Empenhos',
    'empenhos-visualizar': 'Visualizar Empenhos',
    'empenhos-anulacao': 'Adicionar Anulação',
    'empenhos-acompanhamento': 'Acompanhamento',
    'recebimentos-adicionar': 'Adicionar Recebimentos',
    'recebimentos-visualizar': 'Visualizar Recebimentos',
    'nc-adicionar': 'Adicionar Nota de Crédito',
    'nc-situacao': 'Situação Geral das Notas de Crédito',
    'comissao-adicionar': 'Adicionar Comissão',
    'comissao-visualizar': 'Visualizar Comissão',
    'graficos': 'Gráficos — Visão Gerencial',
  };

  const NATUREZA_LABEL = {
    '339030': '339030 — Material de Consumo',
    '339039': '339039 — Serviço',
    '449052': '449052 — Material Permanente',
  };

  const NATUREZA_LABEL_NC = {
    '339000': '339000 — Consumo',
    '339030': '339030 — Material de Consumo',
    '339039': '339039 — Serviço',
    '449052': '449052 — Material Permanente',
  };

  const UG_OPCOES = ['160364', '167364'];
  const MODALIDADE_OPCOES = ['Global', 'Estimativo', 'Ordinário'];

  const POSTOS_PRESIDENTE = ['1º Ten', '2º Ten'];
  const POSTOS_MEMBRO = ['3º Sgt', '2º Sgt', '1º Sgt'];
  const POSTOS_FISCAL = ['Cel', 'TC', 'Maj'];

  // ---------- API ----------

  async function apiRequest(metodo, caminho, corpo) {
    const opcoes = { method: metodo, headers: {} };
    if (corpo !== undefined) {
      opcoes.headers['Content-Type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo);
    }
    const resposta = await fetch(caminho, opcoes);
    let dados = null;
    const texto = await resposta.text();
    if (texto) {
      try { dados = JSON.parse(texto); } catch (e) { dados = null; }
    }
    if (!resposta.ok) {
      const mensagem = (dados && dados.erro) || `Erro na requisição (${resposta.status})`;
      throw new Error(mensagem);
    }
    return dados;
  }

  const api = {
    get: (caminho) => apiRequest('GET', caminho),
    post: (caminho, corpo) => apiRequest('POST', caminho, corpo),
    put: (caminho, corpo) => apiRequest('PUT', caminho, corpo),
    patch: (caminho, corpo) => apiRequest('PATCH', caminho, corpo),
    del: (caminho) => apiRequest('DELETE', caminho),
  };

  function query(params) {
    const usp = new URLSearchParams();
    Object.entries(params || {}).forEach(([chave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') usp.set(chave, valor);
    });
    const texto = usp.toString();
    return texto ? `?${texto}` : '';
  }

  // ---------- Toast ----------

  function toast(mensagem, tipo = 'info') {
    const wrap = document.getElementById('toastWrap');
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.textContent = mensagem;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  // ---------- Formatação ----------

  function formatMoeda(valor) {
    const numero = Number(valor || 0);
    return 'R$ ' + numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDataBR(iso) {
    if (!iso) return '-';
    const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
    if (!ano || !mes || !dia) return iso;
    return `${dia}/${mes}/${ano}`;
  }

  function digitsOnly(valor) {
    return String(valor || '').replace(/\D/g, '');
  }

  const ANO_MINIMO = 2024;

  function dataValida(valor) {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
    const [ano, mes, dia] = valor.split('-').map(Number);
    if (ano < ANO_MINIMO) return false;
    if (mes < 1 || mes > 12) return false;
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  }

  function hojeISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatFavorecido(valorDigitado) {
    const d = digitsOnly(valorDigitado);
    if (d.length <= 11) {
      // CPF: 000.000.000-00
      return d
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    // CNPJ: 00.000.000/0000-00
    return d
      .slice(0, 14)
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }

  function favorecidoValido(valorDigitado) {
    const d = digitsOnly(valorDigitado);
    return d.length === 11 || d.length === 14;
  }

  function tipoFavorecido(valorDigitado) {
    const d = digitsOnly(valorDigitado);
    if (d.length === 11) return 'CPF';
    if (d.length === 14) return 'CNPJ';
    return null;
  }

  function anexarMascaraFavorecido(input, aoMudarValidade) {
    input.addEventListener('input', () => {
      const cursorNoFim = input.selectionStart === input.value.length;
      input.value = formatFavorecido(input.value);
      if (cursorNoFim) input.setSelectionRange(input.value.length, input.value.length);
      if (aoMudarValidade) aoMudarValidade(favorecidoValido(input.value), tipoFavorecido(input.value));
    });
  }

  function anexarMascaraMoeda(input, valorInicial) {
    function aplicar(digitsStr) {
      const digitos = digitsStr.replace(/\D/g, '') || '0';
      const numero = Number(digitos) / 100;
      input.value = numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      input.dataset.valor = String(numero);
    }
    if (valorInicial !== undefined) aplicar(String(Math.round(Number(valorInicial) * 100)));
    input.addEventListener('input', () => aplicar(input.value));
  }

  function valorMoedaInput(input) {
    return Number(input.dataset.valor || 0);
  }

  function el(tag, atributos = {}, filhos = []) {
    const node = document.createElement(tag);
    Object.entries(atributos).forEach(([chave, valor]) => {
      if (chave === 'class') node.className = valor;
      else if (chave === 'html') node.innerHTML = valor;
      else if (chave.startsWith('on') && typeof valor === 'function') node.addEventListener(chave.slice(2), valor);
      else node.setAttribute(chave, valor);
    });
    (Array.isArray(filhos) ? filhos : [filhos]).forEach((filho) => {
      if (filho === null || filho === undefined) return;
      node.appendChild(typeof filho === 'string' ? document.createTextNode(filho) : filho);
    });
    return node;
  }

  function optionsHtml(valores, atualSelecionado, labels) {
    return '<option value="">Selecione…</option>' + valores.map((v) => {
      const texto = labels && labels[v] ? labels[v] : v;
      const sel = String(v) === String(atualSelecionado) ? 'selected' : '';
      return `<option value="${v}" ${sel}>${texto}</option>`;
    }).join('');
  }

  // ---------- Router ----------

  function registrarView(chave, render) {
    views[chave] = render;
  }

  async function irPara(chave, param) {
    if (!views[chave]) return;

    document.querySelectorAll('.sidebar__link').forEach((btn) => {
      btn.classList.toggle('ativo', btn.dataset.view === chave);
    });

    fecharMenuMobile();

    const container = conteudo();
    container.innerHTML = `
      <div class="conteudo__cabecalho">
        <h2 class="conteudo__titulo">${TITULOS[chave] || ''}</h2>
      </div>
      <div id="viewBody"><div class="vazio">Carregando…</div></div>
    `;

    if (location.hash.slice(1) !== chave) {
      history.replaceState(null, '', `#${chave}`);
    }

    try {
      await views[chave](document.getElementById('viewBody'), param);
    } catch (erro) {
      console.error(erro);
      document.getElementById('viewBody').innerHTML = `<div class="vazio">Erro ao carregar: ${erro.message}</div>`;
    }
  }

  function fecharMenuMobile() {
    document.getElementById('sidebar').classList.remove('aberta');
    document.getElementById('sidebarOverlay').classList.remove('ativo');
  }

  function iniciar() {
    document.querySelectorAll('.sidebar__link').forEach((btn) => {
      btn.addEventListener('click', () => irPara(btn.dataset.view));
    });

    document.getElementById('btnMenuToggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('aberta');
      document.getElementById('sidebarOverlay').classList.toggle('ativo');
    });
    document.getElementById('sidebarOverlay').addEventListener('click', fecharMenuMobile);

    window.addEventListener('hashchange', () => {
      const chave = location.hash.slice(1);
      if (views[chave]) irPara(chave);
    });

    const inicial = location.hash.slice(1);
    irPara(views[inicial] ? inicial : 'graficos');
  }

  return {
    api,
    query,
    toast,
    formatMoeda,
    formatDataBR,
    digitsOnly,
    formatFavorecido,
    favorecidoValido,
    tipoFavorecido,
    anexarMascaraFavorecido,
    anexarMascaraMoeda,
    valorMoedaInput,
    el,
    optionsHtml,
    registrarView,
    irPara,
    dataValida,
    hojeISO,
    ANO_MINIMO,
    NATUREZA_LABEL,
    NATUREZA_LABEL_NC,
    UG_OPCOES,
    MODALIDADE_OPCOES,
    POSTOS_PRESIDENTE,
    POSTOS_MEMBRO,
    POSTOS_FISCAL,
    iniciar,
  };
})();
