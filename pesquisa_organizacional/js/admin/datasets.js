/**
 * Gestão de bases de dados (datasets) — seções 3.1, 3.3 e 3.4 da v2.
 *
 * O que o administrador envia aqui é a PLANILHA BRUTA exportada da plataforma
 * (com ID, nome e registro de tempo do respondente). Todo o pré-processamento —
 * descarte das colunas identificáveis, validação das 86 colunas, conversão dos
 * valores, respondent_id anônimo, período de apuração e detecção das OMs — roda
 * no servidor, com a mesma lógica que antes era o comando de linha da v1.
 *
 * Nada do arquivo bruto é guardado: o servidor grava apenas o CSV já processado
 * e anonimizado.
 */
(function (global) {
  'use strict';

  const F = global.Format;
  const AC = global.AdminComum;

  const estado = { datasets: [], formularioAberto: false };

  async function carregar() {
    const resposta = await global.Api.get('/api/admin/datasets');
    estado.datasets = resposta.datasets || [];
  }

  // ============================== FORMULÁRIO DE UPLOAD ==============================

  function montarFormulario() {
    const card = AC.elemento('div', 'card admin-form');
    card.appendChild(AC.elemento('h3', null, 'Enviar nova base de dados'));
    card.appendChild(AC.elemento(
      'p',
      'admin-ajuda',
      'Envie o CSV exportado do formulário, sem editar nada — inclusive as colunas de ID, nome e registro de tempo, que o servidor descarta no processamento. Limite de 10 MB.'
    ));

    const grade = AC.elemento('div', 'admin-form-grade');

    const campoArquivo = AC.elemento('div', 'admin-campo');
    const labelArquivo = AC.elemento('label', null, 'Planilha exportada do formulário (.csv)');
    labelArquivo.setAttribute('for', 'form-dataset-arquivo');
    const inputArquivo = document.createElement('input');
    inputArquivo.type = 'file';
    inputArquivo.id = 'form-dataset-arquivo';
    inputArquivo.accept = '.csv,text/csv';
    campoArquivo.appendChild(labelArquivo);
    campoArquivo.appendChild(inputArquivo);
    grade.appendChild(campoArquivo);

    const campoRotulo = AC.elemento('div', 'admin-campo');
    const labelRotulo = AC.elemento('label', null, 'Rótulo (opcional)');
    labelRotulo.setAttribute('for', 'form-dataset-rotulo');
    const inputRotulo = document.createElement('input');
    inputRotulo.type = 'text';
    inputRotulo.id = 'form-dataset-rotulo';
    inputRotulo.placeholder = 'Ex.: Pesquisa de Clima — 2º semestre de 2026';
    campoRotulo.appendChild(labelRotulo);
    campoRotulo.appendChild(inputRotulo);
    campoRotulo.appendChild(AC.elemento('p', 'admin-ajuda', 'É o nome que aparece no seletor do dashboard. Em branco, usa "nome do arquivo — período detectado".'));
    grade.appendChild(campoRotulo);

    card.appendChild(grade);

    const acoes = AC.elemento('div', 'admin-form-acoes');
    acoes.appendChild(AC.botao('Enviar e processar', 'botao-admin botao-admin-primario', (ev) => enviar(ev.currentTarget)));
    acoes.appendChild(AC.botao('Cancelar', 'botao-admin', () => { estado.formularioAberto = false; render(); }));
    card.appendChild(acoes);

    return card;
  }

  async function enviar(botao) {
    const inputArquivo = document.getElementById('form-dataset-arquivo');
    const rotulo = document.getElementById('form-dataset-rotulo').value.trim();

    if (!inputArquivo.files || inputArquivo.files.length === 0) {
      AC.mensagem('Escolha o arquivo .csv exportado do formulário.', 'erro');
      return;
    }

    const formulario = new FormData();
    formulario.append('arquivo', inputArquivo.files[0]);
    if (rotulo !== '') formulario.append('rotulo', rotulo);

    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Processando…';

    try {
      const resposta = await global.Api.enviarArquivo('/api/admin/datasets', formulario);
      const detalhe = `${F.formatInteiro(resposta.totalRespondentes)} respondentes · OMs: ${resposta.oms.map((o) => `${o.nome} (${o.total})`).join(', ')}`;
      AC.mensagem(`${resposta.mensagem} ${detalhe}`, resposta.omsCriadasInativas && resposta.omsCriadasInativas.length > 0 ? 'erro' : 'info');
      await carregar();
      estado.formularioAberto = false;
      render();
      // OM nova cadastrada como inativa: a aba de OMs precisa refletir isso na hora.
      if (global.AdminOms) { await global.AdminOms.carregar(); global.AdminOms.render(); }
    } catch (erro) {
      if (!erro || erro.status !== 401) {
        AC.mensagem(erro.mensagem || 'Falha ao enviar a base de dados.', 'erro');
        await carregar();
        render();
      }
    } finally {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
  }

  // ============================== EXCLUSÃO ==============================

  async function excluir(dataset, botao) {
    const descricao = `Excluir a base "${dataset.rotuloExibicao}"?\n\nO arquivo processado e o registro no banco serão apagados.`;
    if (!AC.confirmarExclusao(descricao)) return;

    await AC.executarAcao(
      botao,
      () => global.Api.remover(`/api/admin/datasets/${dataset.id}`),
      async (resposta) => {
        if (!resposta) return;
        await carregar();
        render();
      }
    );
  }

  // ============================== TABELA ==============================

  function periodoTexto(dataset) {
    const inicio = F.formatDataISO(dataset.periodoInicio);
    const fim = F.formatDataISO(dataset.periodoFim);
    if (inicio === '—' && fim === '—') return '—';
    return inicio === fim ? inicio : `${inicio} a ${fim}`;
  }

  function montarTabela() {
    const card = AC.elemento('div', 'card');
    const tabela = AC.elemento('table', 'tabela-dados tabela-admin');
    tabela.innerHTML = '<thead><tr>'
      + '<th>Base de dados</th><th>Situação</th><th>Período</th>'
      + '<th class="col-numero">Respondentes</th><th>OMs detectadas</th>'
      + '<th>Enviada em / por</th><th>Ações</th>'
      + '</tr></thead>';

    const corpo = document.createElement('tbody');

    estado.datasets.forEach((dataset) => {
      const linha = document.createElement('tr');
      const comErro = dataset.status === 'erro';
      if (comErro) linha.className = 'linha-inativa';

      const oms = dataset.oms.length === 0
        ? '—'
        : dataset.oms.map((om) => `${om.nome} (${om.totalRespondentes})${om.ativo ? '' : ' [inativa]'}`).join(', ');

      const situacao = comErro
        ? `<strong>Falhou</strong><br><span class="texto-erro-dataset">${F.escapeHtml(dataset.mensagemErro || 'Erro não registrado.')}</span>`
        : 'Processada';

      linha.innerHTML = `
        <td>${F.escapeHtml(dataset.rotuloExibicao)}<br><span class="admin-ajuda">arquivo: ${F.escapeHtml(dataset.nomeArquivoOriginal)}</span></td>
        <td>${situacao}</td>
        <td>${F.escapeHtml(periodoTexto(dataset))}</td>
        <td class="col-numero">${dataset.totalRespondentes === null ? '—' : F.formatInteiro(dataset.totalRespondentes)}</td>
        <td class="celula-oms">${F.escapeHtml(oms)}</td>
        <td>${F.escapeHtml(AC.dataHoraBR(dataset.enviadoEm))}<br><span class="admin-ajuda">${F.escapeHtml(dataset.enviadoPor)}</span></td>
      `;

      const celulaAcoes = document.createElement('td');
      celulaAcoes.className = 'celula-acoes';
      celulaAcoes.appendChild(AC.botao('Excluir', 'botao-admin botao-admin-pequeno botao-admin-perigo', (ev) => excluir(dataset, ev.currentTarget)));
      linha.appendChild(celulaAcoes);

      corpo.appendChild(linha);
    });

    tabela.appendChild(corpo);
    card.appendChild(tabela);

    if (estado.datasets.length === 0) {
      card.appendChild(AC.elemento('p', 'admin-ajuda', 'Nenhuma base de dados enviada ainda.'));
    }

    return card;
  }

  function render() {
    const container = document.getElementById('aba-datasets');
    container.innerHTML = '';

    container.appendChild(AC.cabecalhoSecao(
      'Bases de dados',
      'Cada base é uma aplicação da pesquisa. Qualquer usuário autenticado escolhe qual base ver no dashboard; enviar e excluir é só do administrador. A exclusão é definitiva: apaga o arquivo processado e o registro.',
      estado.formularioAberto ? null : AC.botao('+ Enviar base de dados', 'botao-admin botao-admin-primario', () => { estado.formularioAberto = true; render(); })
    ));

    if (estado.formularioAberto) container.appendChild(montarFormulario());
    container.appendChild(montarTabela());
  }

  async function iniciar() {
    await carregar();
    render();
  }

  global.AdminDatasets = { iniciar, render, carregar };
})(window);
