/**
 * Constantes de regra de negócio e identidade visual.
 * Centraliza tudo que a especificação marca como "fixo no código" (não vem do CSV).
 */
(function (global) {
  'use strict';

  const LIMIAR_ANONIMATO = 5;

  const CORES = {
    verdePrimario: '#2E4B2E',
    verdeEscuro: '#1C331E',
    ruim: '#BF6A5D',
    bom: '#79D678',
    excelente: '#4CAF50',
    cinzaClaro: '#F4F4F2',
    cinzaTexto: '#333333',
    cinzaNeutro: '#9E9E9E',
  };

  // Ordem: Discordo totalmente, Discordo, Concordo, Concordo totalmente
  const CORES_DIVERGENTE = ['#BF6A5D', '#E8C4BC', '#C7E3C8', '#4CAF50'];
  const LABELS_DIVERGENTE = ['Discordo totalmente', 'Discordo', 'Concordo', 'Concordo totalmente'];

  const PALETA_CATEGORICA = [
    '#2E4B2E', '#B8860B', '#4A6FA5', '#C0392B', '#7A6C5D', '#8FA88F', '#9E9E9E', '#5B3A29',
  ];

  // Lista fixa — concordar com essas afirmações é ruim, por isso o sentido é revertido
  // antes de qualquer cálculo (regra de negócio, não vem marcado no dicionário).
  const ITENS_INVERTIDOS = new Set([
    's3_apostas_q14_costuma_apostar',
    's3_apostas_q15_aumentou_freq_valor',
    's3_apostas_q16_prejuizo_financeiro',
    's3_apostas_q17_afetou_trabalho',
    's3_apostas_q18_quis_parar_dificuldade',
    's3_q2_sobrecarregado_freq',
    's3_q3_dificuldade_relaxar_freq',
    's3_q4_dormiu_mal_freq',
    's3_q5_irritado_freq',
  ]);

  const SECOES_EXCLUIDAS_DO_INDICE = new Set(['Metadados', 'Caracterização', 'Seção 6']);

  const ORDEM_POSTO = [
    'General', 'Coronel', 'Tenente-Coronel', 'Major', 'Capitão', '1º Tenente',
    '2º Tenente', 'Subtenente', '1º Sargento', '2º Sargento', '3º Sargento', 'Cabo',
    'Soldado (Efetivo Profissional – EP)', 'Soldado (Efetivo Variável – EV / Recruta)',
  ];

  const ORDEM_ESCOLARIDADE = [
    'Ensino Fundamental Completo', 'Ensino Médio Incompleto',
    'Ensino Médio Completo / Técnico', 'Ensino Superior Incompleto (faculdade em andamento)',
    'Ensino Superior Completo (Graduação)', 'Pós-Graduação / Especialização', 'Mestrado', 'Doutorado',
  ];

  const METADADOS_SECAO = {
    'Seção 1': { icone: '🧑‍🤝‍🧑', titulo: 'Assuntos Pessoais', subtitulo: 'Situação familiar, rotina, qualidade de vida e vida fora do quartel.' },
    'Seção 2': { icone: '🛠️', titulo: 'Profissional / Trabalho', subtitulo: 'Condições de trabalho, alimentação, ambiente, reconhecimento e carreira.' },
    'Seção 3': { icone: '🧠', titulo: 'Saúde Emocional e Bem-estar', subtitulo: 'Estado emocional, apoio psicológico, FUSEx e jogos/apostas.' },
    'Seção 4': { icone: '💰', titulo: 'Financeiro', subtitulo: 'Situação financeira, soldo, moradia, deslocamento e estabilidade.' },
    'Seção 5': { icone: '📋', titulo: 'Comunicação Interna', subtitulo: 'Hierarquia, disciplina, comunicação, reuniões, formaturas e escalas.' },
    'Seção 6': { icone: '⭐', titulo: 'Avaliação Geral', subtitulo: 'Nota de fechamento para o clima da Organização Militar.' },
  };

  const SECOES_INDICE_GERAL = ['Seção 1', 'Seção 2', 'Seção 3', 'Seção 4', 'Seção 5'];

  const FILTROS_ORDEM = ['om', 'posto_graduacao', 'vinculo', 'escolaridade'];
  const FILTROS_ROTULO = {
    om: 'OM',
    posto_graduacao: 'posto',
    vinculo: 'vínculo',
    escolaridade: 'escolaridade',
  };

  /**
   * Classifica um índice 0-100 em Ruim/Bom/Excelente. Retorna null se o índice for null.
   */
  function classificar(indice) {
    if (indice === null || indice === undefined || Number.isNaN(indice)) return null;
    if (indice < 50) return 'Ruim';
    if (indice < 75) return 'Bom';
    return 'Excelente';
  }

  function corClassificacao(classificacao) {
    switch (classificacao) {
      case 'Ruim': return CORES.ruim;
      case 'Bom': return CORES.bom;
      case 'Excelente': return CORES.excelente;
      default: return CORES.cinzaNeutro;
    }
  }

  /**
   * Ordena valores de um dropdown por uma ordem sugerida; valores fora da lista
   * entram ordenados alfabeticamente no final.
   */
  function ordenarPorListaSugerida(valores, listaSugerida) {
    const naLista = [];
    const foraDaLista = [];
    valores.forEach((v) => {
      if (listaSugerida.includes(v)) naLista.push(v);
      else foraDaLista.push(v);
    });
    naLista.sort((a, b) => listaSugerida.indexOf(a) - listaSugerida.indexOf(b));
    foraDaLista.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return naLista.concat(foraDaLista);
  }

  global.Constants = {
    LIMIAR_ANONIMATO,
    CORES,
    CORES_DIVERGENTE,
    LABELS_DIVERGENTE,
    PALETA_CATEGORICA,
    ITENS_INVERTIDOS,
    SECOES_EXCLUIDAS_DO_INDICE,
    ORDEM_POSTO,
    ORDEM_ESCOLARIDADE,
    METADADOS_SECAO,
    SECOES_INDICE_GERAL,
    FILTROS_ORDEM,
    FILTROS_ROTULO,
    classificar,
    corClassificacao,
    ordenarPorListaSugerida,
  };
})(window);
