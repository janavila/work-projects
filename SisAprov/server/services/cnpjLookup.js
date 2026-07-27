const BRASILAPI_URL = 'https://brasilapi.com.br/api/cnpj/v1/';

async function lookupCnpj(cnpj) {
  const digits = String(cnpj).replace(/\D/g, '');
  if (digits.length !== 14) {
    throw new Error('CNPJ deve conter 14 dígitos');
  }

  const response = await fetch(BRASILAPI_URL + digits, {
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Falha ao consultar CNPJ (status ${response.status})`);
  }

  const data = await response.json();
  return data.razao_social || data.nome_fantasia || null;
}

module.exports = { lookupCnpj };
