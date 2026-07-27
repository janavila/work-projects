const ANO_MINIMO = 2024;

// Valida datas no formato ISO 'YYYY-MM-DD': formato correto, dia/mês/ano
// existentes de fato (rejeita 2024-02-30 etc.) e ano não anterior a 2024.
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

module.exports = { dataValida, hojeISO, ANO_MINIMO };
