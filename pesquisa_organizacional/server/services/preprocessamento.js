/**
 * Serviço de pré-processamento da planilha bruta do formulário (CTA).
 *
 * Esta é a MESMA lógica que rodava em scripts/preprocessar_resultados.js desde
 * a v1 — ela foi movida para cá (não reescrita) para poder ser chamada de dois
 * lugares sem duplicação:
 *   1. pela rota de upload POST /api/admin/datasets (v2);
 *   2. pela linha de comando `node scripts/preprocessar_resultados.js`, que
 *      continua funcionando igual e agora é só uma casca fina em volta daqui.
 *
 * As regras de validação e conversão (colunas descartadas, alinhamento de 86
 * colunas, mapeamento posicional, conversão "N - Rótulo" → N, respondent_id
 * sequencial, período de apuração) estão preservadas caractere a caractere,
 * inclusive as mensagens de erro. A única diferença é que o serviço recebe e
 * devolve TEXTO em vez de ler e escrever arquivos: quem grava em disco é o
 * chamador, que sabe onde o arquivo deve ficar.
 *
 * O que este serviço acrescentou em relação à v1:
 *   - detecção das OMs presentes na coluna `om` processada, com o N de cada uma
 *     (seção 3.1 do documento da v2: "o sistema detecta automaticamente quais
 *     OMs aparecem nos dados processados");
 *   - validação do conteúdo real do arquivo enviado, para não confiar só na
 *     extensão .csv (seção 4.2);
 *   - erros de validação viram `ErroValidacaoPlanilha`, para a rota de upload
 *     distinguir "planilha errada" (status = 'erro', resposta 400) de "defeito
 *     do servidor" (resposta 500).
 */
'use strict';

const { CSVParser, Dictionary } = require('./modulos-navegador');

/**
 * Erro de planilha/entrada — culpa do arquivo enviado, não do servidor.
 * A mensagem é mostrada ao admin e gravada em datasets.mensagem_erro.
 */
class ErroValidacaoPlanilha extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroValidacaoPlanilha';
    this.validacao = true;
  }
}

// Colunas de identificação da exportação bruta do formulário — removidas
// porque não interessam ao dashboard (dado pessoal/identificável).
const COLUNAS_DESCARTADAS = ['ID do usuário', 'Nome de exibição do usuário', 'Registro de Tempo'];

// O "Registro de Tempo" bruto (ex.: "2026-07-29T13:58:11-03:00") não vai para
// resultados.csv (é dado por respondente, não interessa ao dashboard), mas o
// PERÍODO agregado (menor/maior data) é útil para o cabeçalho saber quando a
// pesquisa foi aplicada — vira meta.json, não uma coluna por linha.
const COLUNA_TIMESTAMP = 'Registro de Tempo';

// Colunas do dicionário sem pergunta correspondente no formulário atual.
// Ficam em branco em todas as linhas, exceto s3_fusex_usuario (ver abaixo).
const SEM_CORRESPONDENCIA_NO_FORMULARIO = new Set([
  's1_nota_qualidade_vida_justificativa',
  's1_nota_equilibrio_trabalho_vida_justificativa',
  's1_nota_bemestar_fisico_justificativa',
  's1_nota_bemestar_emocional_justificativa',
  's2_nota_sabor_rancho_justificativa',
  's2_nota_variedade_cardapio_justificativa',
  's2_nota_quantidade_comida_justificativa',
  's2_nota_limpeza_rancho_justificativa',
  's2_nota_orgulho_om_justificativa',
  's4_nota_situacao_financeira_justificativa',
  's6_nota_clima_geral_justificativa',
  's3_fusex_usuario',
]);

// Mapeamento posicional: a N-ésima pergunta do formulário (após descartar as
// 3 colunas de identificação) corresponde à N-ésima coluna desta lista.
// A ordem foi conferida contra data/dicionario.csv e data/resultados_cta.csv
// (98 colunas do dicionário − 12 sem correspondência = 86, igual ao total de
// perguntas do formulário bruto).
const MAPA_COLUNAS = [
  'om', 'posto_graduacao', 'vinculo', 'escolaridade', 's1_estado_civil', 's1_familia_mesma_cidade',
  's1_q3_concilia_trabalho_familia', 's1_q4_familia_apoia', 's1_q5_cidade_boas_condicoes',
  's1_ativ_fisica_freq_semana', 's1_q7_tempo_descanso', 's1_q8_dorme_bem',
  's1_q9_rotina_ativ_fisica_satisfatoria', 's1_nota_qualidade_vida', 's1_nota_equilibrio_trabalho_vida',
  's1_nota_bemestar_fisico', 's1_nota_bemestar_emocional', 's1_q14_fe_forca_equilibrio',
  's1_q15_vive_religiao_sem_constrangimento', 's1_q16_om_respeita_liberdade_religiosa', 's1_comentario',
  's2_nota_sabor_rancho', 's2_nota_variedade_cardapio', 's2_nota_quantidade_comida', 's2_nota_limpeza_rancho',
  's2_q5_local_boas_condicoes', 's2_q6_alojamento_limpo', 's2_q7_alojamento_boas_condicoes',
  's2_q8_banheiros_boas_condicoes', 's2_q9_materiais_equipamentos', 's2_q10_carga_trabalho_adequada',
  's2_q11_funcoes_claras', 's2_equipamentos_texto', 's2_q13_superiores_reconhecem',
  's2_q14_bom_relacionamento_colegas', 's2_q15_superiores_orientam_apoiam', 's2_q16_oportunidades_cursos',
  's2_q17_chances_crescer_carreira', 's2_nota_orgulho_om', 's2_melhoria_texto', 's3_q1_energia_disposicao_freq',
  's3_q2_sobrecarregado_freq', 's3_q3_dificuldade_relaxar_freq', 's3_q4_dormiu_mal_freq', 's3_q5_irritado_freq',
  's3_q6_lidou_bem_dificuldades_freq', 's3_q7_apoiado_colegas_chefes_freq', 's3_q8_sabe_recorrer_apoio',
  's3_q9_seguro_buscar_apoio_sem_discriminacao', 's3_q10_equilibrio_emocional_bom',
  's3_fusex_q11_atendimento_qualidade', 's3_fusex_q12_atende_necessidades', 's3_fusex_q13_facilidade_uso',
  's3_apostas_q14_costuma_apostar', 's3_apostas_q15_aumentou_freq_valor', 's3_apostas_q16_prejuizo_financeiro',
  's3_apostas_q17_afetou_trabalho', 's3_apostas_q18_quis_parar_dificuldade', 's3_comentario', 's4_moradia',
  's4_deslocamento_tempo', 's4_q3_soldo_compativel', 's4_q4_renda_suficiente', 's4_q5_consegue_guardar_dinheiro',
  's4_q6_moradia_adequada', 's4_q7_deslocamento_razoavel', 's4_q8_seguranca_financeira_futuro',
  's4_q9_financas_nao_afetam_desempenho', 's4_nota_situacao_financeira', 's4_avaliacao_geral_financeira',
  's4_comentario', 's5_q1_hierarquia_com_respeito', 's5_q2_tratamento_igualdade', 's5_q3_regras_iguais_para_todos',
  's5_q4_info_clara_a_tempo', 's5_q5_avontade_falar_chefia', 's5_q6_decisoes_explicadas_clareza',
  's5_q7_recebe_feedback', 's5_q8_reunioes_objetivas', 's5_q9_tempo_reunioes_formaturas_ok',
  's5_q10_planejamento_com_antecedencia', 's5_q11_escalas_justas', 's5_q12_avisado_mudancas_antecedencia',
  's5_q13_rotina_previsivel', 's5_sugestao_texto', 's6_nota_clima_geral',
];

const LIKERT_RE = /^\s*(\d+)\s*-/;

function csvEscape(value) {
  const v = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

/** Converte o valor bruto de uma célula do formulário para o formato esperado por resultados.csv. */
function converterValor(natureza, valorBruto, coluna) {
  const v = (valorBruto || '').trim();
  if (v === '') return '';

  if (natureza === 'escala') {
    const m = LIKERT_RE.exec(v);
    if (!m) {
      throw new ErroValidacaoPlanilha(`Coluna ${coluna}: valor "${v}" não está no formato esperado "N - Rótulo".`);
    }
    return m[1];
  }

  if (natureza === 'nota') {
    const n = Number(v);
    if (Number.isNaN(n)) {
      throw new ErroValidacaoPlanilha(`Coluna ${coluna}: valor "${v}" não é numérico (esperado nota).`);
    }
    return String(n);
  }

  // categórica / texto / outro — mantém como veio (já aparado).
  return v;
}

/**
 * Valida o CONTEÚDO REAL do arquivo enviado, não a extensão (seção 4.2).
 *
 * Rejeita, nesta ordem: arquivo vazio; assinatura binária conhecida de formato
 * que não é CSV (xlsx/zip, PDF, xls antigo, gzip); byte nulo em qualquer lugar
 * (sinal seguro de binário ou de texto UTF-16, que este parser não lê); e texto
 * que não tem cara de CSV (nenhuma vírgula na primeira linha).
 *
 * @param {Buffer} buffer conteúdo bruto recebido no upload
 * @returns {string} o texto decodificado como UTF-8, pronto para o parser
 */
function validarConteudoCsv(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new ErroValidacaoPlanilha('O arquivo enviado está vazio.');
  }

  const ASSINATURAS = [
    { bytes: [0x50, 0x4b, 0x03, 0x04], formato: 'uma planilha do Excel (.xlsx) ou um arquivo .zip' },
    { bytes: [0x25, 0x50, 0x44, 0x46], formato: 'um PDF' },
    { bytes: [0xd0, 0xcf, 0x11, 0xe0], formato: 'uma planilha antiga do Excel (.xls)' },
    { bytes: [0x1f, 0x8b], formato: 'um arquivo compactado (.gz)' },
  ];
  for (const assinatura of ASSINATURAS) {
    const bate = assinatura.bytes.every((b, i) => buffer[i] === b);
    if (bate) {
      throw new ErroValidacaoPlanilha(
        `O arquivo enviado é ${assinatura.formato}, não um CSV. Exporte as respostas do formulário como CSV e envie novamente.`
      );
    }
  }

  if (buffer.includes(0x00)) {
    throw new ErroValidacaoPlanilha('O arquivo enviado não é um CSV de texto legível (contém bytes nulos). Exporte novamente como CSV UTF-8.');
  }

  const texto = buffer.toString('utf8');
  const primeiraLinha = texto.split(/\r?\n/, 1)[0] || '';
  if (!primeiraLinha.includes(',')) {
    throw new ErroValidacaoPlanilha('O arquivo enviado não parece ser um CSV separado por vírgula — a primeira linha não tem nenhuma vírgula.');
  }

  return texto;
}

/**
 * Processa a planilha bruta e devolve o CSV pronto, o meta.json e as OMs
 * detectadas. Não toca em disco e não depende de caminho nenhum.
 *
 * @param {Object} entrada
 * @param {string} entrada.textoBruto        conteúdo do CSV exportado do formulário
 * @param {string} entrada.textoDicionario   conteúdo de data/dicionario.csv
 * @returns {{csv: string, meta: Object, omsDetectadas: Array<{nome: string, total: number}>}}
 */
function processarPlanilhaBruta({ textoBruto, textoDicionario }) {
  const dictItems = Dictionary.parseDictionary(textoDicionario);
  if (dictItems.length === 0) {
    throw new ErroValidacaoPlanilha('O arquivo dicionario.csv está vazio — não é possível processar nenhuma planilha sem ele.');
  }
  const naturezaPorColuna = new Map(dictItems.map((it) => [it.coluna, it.natureza]));

  // colunas de saída = todas as do dicionário, na ordem do dicionário
  // (respondent_id primeiro, sem data_resposta — já removida do dicionário).
  const colunasSaida = dictItems.map((it) => it.coluna);

  const faltandoNoDicionario = MAPA_COLUNAS.filter((c) => !naturezaPorColuna.has(c));
  if (faltandoNoDicionario.length > 0) {
    throw new ErroValidacaoPlanilha(`MAPA_COLUNAS referencia coluna(s) que não existem em dicionario.csv: ${faltandoNoDicionario.join(', ')}`);
  }

  const { headers: rawHeaders, rows: rawRows } = CSVParser.parseCSV(textoBruto);

  COLUNAS_DESCARTADAS.forEach((nome) => {
    if (!rawHeaders.includes(nome)) {
      throw new ErroValidacaoPlanilha(`Coluna esperada "${nome}" não encontrada na planilha enviada.`);
    }
  });

  if (rawRows.length === 0) {
    throw new ErroValidacaoPlanilha('A planilha enviada não contém nenhuma resposta (só o cabeçalho).');
  }

  const perguntaHeaders = rawHeaders.filter((h) => !COLUNAS_DESCARTADAS.includes(h));
  if (perguntaHeaders.length !== MAPA_COLUNAS.length) {
    throw new ErroValidacaoPlanilha(
      `A planilha enviada tem ${perguntaHeaders.length} coluna(s) de pergunta, mas MAPA_COLUNAS espera ${MAPA_COLUNAS.length}. ` +
      'O formulário provavelmente mudou — revise o mapeamento antes de continuar.'
    );
  }

  const outRows = rawRows.map((rawRow, i) => {
    const out = {};
    colunasSaida.forEach((c) => { out[c] = ''; });
    out.respondent_id = String(i + 1);

    perguntaHeaders.forEach((header, idx) => {
      const coluna = MAPA_COLUNAS[idx];
      const natureza = naturezaPorColuna.get(coluna);
      out[coluna] = converterValor(natureza, rawRow[header], coluna);
    });

    if (naturezaPorColuna.has('s3_fusex_usuario')) {
      out.s3_fusex_usuario = 'Sim';
    }

    return out;
  });

  const linhas = [colunasSaida.map(csvEscape).join(',')];
  outRows.forEach((row) => {
    linhas.push(colunasSaida.map((c) => csvEscape(row[c])).join(','));
  });
  const csv = linhas.join('\n') + '\n';

  // Ordenação lexicográfica funciona aqui porque o timestamp é ISO 8601 de
  // largura fixa com o mesmo fuso em todas as linhas (AAAA-MM-DDThh:mm:ss-03:00) —
  // evita qualquer conversão de fuso horário na máquina que roda o processamento.
  const timestamps = rawRows.map((r) => r[COLUNA_TIMESTAMP]).filter(Boolean).sort();
  const periodoInicio = timestamps.length ? timestamps[0].slice(0, 10) : null;
  const periodoFim = timestamps.length ? timestamps[timestamps.length - 1].slice(0, 10) : null;

  const meta = {
    totalRespondentes: outRows.length,
    periodoInicio,
    periodoFim,
    processadoEm: new Date().toISOString(),
  };

  return { csv, meta, omsDetectadas: detectarOMs(outRows) };
}

/**
 * Conta os respondentes por OM nas linhas já processadas (seção 3.1 da v2).
 * Linhas sem OM preenchida são ignoradas — não existe "OM em branco" cadastrável.
 */
function detectarOMs(linhas) {
  const contagem = new Map();
  linhas.forEach((linha) => {
    const om = (linha.om || '').trim();
    if (om === '') return;
    contagem.set(om, (contagem.get(om) || 0) + 1);
  });
  return Array.from(contagem.entries())
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total);
}

module.exports = {
  ErroValidacaoPlanilha,
  COLUNAS_DESCARTADAS,
  SEM_CORRESPONDENCIA_NO_FORMULARIO,
  MAPA_COLUNAS,
  csvEscape,
  converterValor,
  validarConteudoCsv,
  processarPlanilhaBruta,
  detectarOMs,
};
