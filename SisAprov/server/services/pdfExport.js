const PDFDocument = require('pdfkit');

const NATUREZA_LABEL = {
  339030: 'Material de Consumo',
  339039: 'Serviço',
  449052: 'Material Permanente',
};

function formatMoeda(valor) {
  return (
    'R$ ' +
    Number(valor || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatData(data) {
  if (!data) return '-';
  const [ano, mes, dia] = String(data).split('-');
  return `${dia}/${mes}/${ano}`;
}

const COLUNAS = [
  { chave: 'numero_empenho', titulo: 'Empenho', largura: 70 },
  { chave: 'favorecido', titulo: 'Favorecido', largura: 75 },
  { chave: 'nome_credor', titulo: 'Nome do Credor', largura: 100 },
  { chave: 'data_emissao', titulo: 'Emissão', largura: 55, tipo: 'data' },
  { chave: 'natureza_despesa', titulo: 'Nat. Despesa', largura: 97, tipo: 'natureza' },
  { chave: 'valor_global', titulo: 'Vlr. Global', largura: 65, tipo: 'moeda' },
  { chave: 'saldo_atual', titulo: 'Saldo Atual', largura: 65, tipo: 'moeda' },
  { chave: 'plano_interno', titulo: 'Plano Interno', largura: 65 },
  { chave: 'quantidade_provisoes', titulo: 'Qtd. Provisões', largura: 55 },
  { chave: 'dias', titulo: 'Dias', largura: 35 },
  { chave: 'observacao', titulo: 'Observação', largura: 100 },
];

function gerarPdfEmpenhos(res, empenhos) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="empenhos_sisaprov.pdf"');
  doc.pipe(res);

  doc.fontSize(14).font('Helvetica-Bold').text('SisAprov — Extração de Empenhos Ativos', { align: 'center' });
  doc.fontSize(9).font('Helvetica').text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });
  doc.moveDown(1);

  const startX = doc.page.margins.left;
  let y = doc.y;
  const rowHeight = 22;

  function desenharCabecalho() {
    let x = startX;
    doc.font('Helvetica-Bold').fontSize(8);
    doc.rect(startX, y, COLUNAS.reduce((s, c) => s + c.largura, 0), rowHeight).fill('#1E4FA3');
    doc.fillColor('#FFFFFF');
    COLUNAS.forEach((col) => {
      doc.text(col.titulo, x + 3, y + 6, { width: col.largura - 6, height: rowHeight - 8, ellipsis: true });
      x += col.largura;
    });
    doc.fillColor('#000000');
    y += rowHeight;
  }

  desenharCabecalho();

  doc.font('Helvetica').fontSize(8);
  empenhos.forEach((emp, idx) => {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      desenharCabecalho();
      doc.font('Helvetica').fontSize(8);
    }

    if (idx % 2 === 0) {
      doc.rect(startX, y, COLUNAS.reduce((s, c) => s + c.largura, 0), rowHeight).fill('#F2F5FA');
      doc.fillColor('#000000');
    }

    let x = startX;
    COLUNAS.forEach((col) => {
      let valor = emp[col.chave];
      if (col.tipo === 'moeda') valor = formatMoeda(valor);
      else if (col.tipo === 'data') valor = formatData(valor);
      else if (col.tipo === 'natureza') valor = NATUREZA_LABEL[valor] || valor;
      else if (valor === null || valor === undefined) valor = '-';
      doc.text(String(valor), x + 3, y + 6, { width: col.largura - 6, height: rowHeight - 8, ellipsis: true });
      x += col.largura;
    });
    y += rowHeight;
  });

  doc.end();
}

module.exports = { gerarPdfEmpenhos };
