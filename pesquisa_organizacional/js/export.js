/**
 * Exportação de relatório PDF/Word — seção 9 da especificação. Recalcula o
 * recorte do zero a partir dos filtros ativos no momento do clique, usando
 * sempre a leitura interpretada combinada (nunca a versão com eixo de
 * comparação, mesmo que a tela esteja mostrando várias).
 */
(function (global) {
  'use strict';

  const C = global.Constants;
  const F = global.Format;

  function hexToRgbArray(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }

  function coletarDadosExportacao() {
    const App = global.App;
    const leitura = global.Interpretation.gerarLeituraUnica(App.structure, App.allRows, App.filtros);
    const result = global.Engine.computeResult(App.structure, App.allRows, App.filtros);

    const tabela = [];
    App.structure.sectionOrder.forEach((nomeSecao) => {
      const secaoResult = result.secoes.get(nomeSecao);
      const corSecao = secaoResult.suprimida ? C.CORES.cinzaNeutro : C.corClassificacao(secaoResult.classificacao);
      tabela.push({
        tipo: 'secao',
        nome: nomeSecao,
        indiceFmt: secaoResult.suprimida ? '—' : F.formatIndice(secaoResult.indice),
        classificacao: secaoResult.suprimida ? 'N insuficiente' : secaoResult.classificacao,
        corRGB: hexToRgbArray(corSecao),
        corHex: corSecao.replace('#', ''),
      });
      secaoResult.subsecoes.forEach((sub) => {
        const cor = sub.suprimida ? C.CORES.cinzaNeutro : C.corClassificacao(sub.classificacao);
        tabela.push({
          tipo: 'subsecao',
          nome: sub.nome,
          n: sub.n,
          indiceFmt: sub.suprimida ? '—' : F.formatIndice(sub.indice),
          classificacao: sub.suprimida ? 'N insuficiente' : sub.classificacao,
          corRGB: hexToRgbArray(cor),
          corHex: cor.replace('#', ''),
        });
      });
    });

    const fechamentoS6 = (result.fechamentoS6 && !result.fechamentoS6.suprimida)
      ? { indiceFmt: F.formatIndice(result.fechamentoS6.indice), classificacao: result.fechamentoS6.classificacao }
      : null;

    const corGeral = C.corClassificacao(result.classificacaoGeral);

    return {
      cabecalho: leitura.cabecalho,
      geradoEm: F.formatData(new Date(), true),
      nTotal: F.formatInteiro(result.n),
      indiceGeralFmt: result.indiceGeral !== null ? F.formatIndice(result.indiceGeral) : '—',
      classificacaoGeral: result.classificacaoGeral || 'N insuficiente',
      corIndiceGeralRGB: hexToRgbArray(corGeral),
      corIndiceGeralHex: corGeral.replace('#', ''),
      paragrafo: leitura.paragrafo,
      positivos: leitura.positivos,
      negativos: leitura.negativos,
      fallbackPositivos: 'Nenhum destaque positivo identificado nesta seleção.',
      fallbackNegativos: 'Nenhum ponto crítico identificado nesta seleção.',
      tabela,
      fechamentoS6,
      dataISO: F.dataHojeISO(),
      suficiente: result.suficiente,
    };
  }

  async function carregarLogoDataUrl() {
    try {
      const resp = await fetch('assets/simbolo_bda.png');
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return null;
    }
  }

  async function carregarLogoBytes() {
    try {
      const resp = await fetch('assets/simbolo_bda.png');
      if (!resp.ok) return null;
      const buffer = await resp.arrayBuffer();
      return new Uint8Array(buffer);
    } catch (e) {
      return null;
    }
  }

  // ============================== PDF ==============================

  function ensureSpace(doc, y, margin, needed) {
    if (y + needed > 800) {
      doc.addPage();
      return margin;
    }
    return y;
  }

  function renderGrupoListaPDF(doc, titulo, grupos, fallback, margin, yIn) {
    let y = ensureSpace(doc, yIn, margin, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(51, 51, 51);
    doc.text(titulo, margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    if (!grupos.length) {
      y = ensureSpace(doc, y, margin, 14);
      doc.setTextColor(150, 150, 150);
      doc.text(fallback, margin, y);
      y += 16;
      doc.setTextColor(51, 51, 51);
      return y;
    }

    grupos.forEach((g) => {
      const meta = C.METADADOS_SECAO[g.secao];
      y = ensureSpace(doc, y, margin, 14);
      doc.setFont('helvetica', 'bold');
      doc.text(`${g.secao} — ${meta.titulo}`, margin, y);
      y += 13;
      doc.setFont('helvetica', 'normal');
      g.pontos.forEach((p) => {
        y = ensureSpace(doc, y, margin, 13);
        const prefixo = `•  ${p.subsecao} — `;
        doc.setTextColor(51, 51, 51);
        doc.text(prefixo, margin + 10, y);
        const largura = doc.getTextWidth(prefixo);
        const cor = hexToRgbArray(C.corClassificacao(p.classificacao));
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(cor[0], cor[1], cor[2]);
        doc.text(p.classificacao, margin + 10 + largura, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 51, 51);
        y += 13;
      });
    });
    return y + 6;
  }

  async function gerarPDF(dados) {
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const logo = await carregarLogoDataUrl();
    let textoX = margin;
    if (logo) {
      try { doc.addImage(logo, 'PNG', margin, y, 40, 40); textoX = margin + 52; } catch (e) { /* ignora logo inválido */ }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(28, 51, 30);
    doc.text('Braço Forte, Abraço Amigo', textoX, y + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(51, 51, 51);
    doc.text('Dashboard de Clima Organizacional — 3ª Brigada de Cavalaria Mecanizada', textoX, y + 34);
    y += 60;

    doc.setFontSize(11);
    doc.text(`Recorte: ${dados.cabecalho}`, margin, y); y += 16;
    doc.text(`Gerado em ${dados.geradoEm} — N = ${dados.nTotal} respondentes`, margin, y); y += 22;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(dados.corIndiceGeralRGB[0], dados.corIndiceGeralRGB[1], dados.corIndiceGeralRGB[2]);
    doc.text(`Índice Geral: ${dados.indiceGeralFmt} — ${dados.classificacaoGeral}`, margin, y);
    y += 26;
    doc.setTextColor(51, 51, 51);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Leitura Interpretada', margin, y); y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const linhasParagrafo = doc.splitTextToSize(dados.paragrafo, contentWidth);
    linhasParagrafo.forEach((linha) => { y = ensureSpace(doc, y, margin, 13); doc.text(linha, margin, y); y += 13; });
    y += 6;

    y = renderGrupoListaPDF(doc, 'Positivos', dados.positivos, dados.fallbackPositivos, margin, y);
    y = renderGrupoListaPDF(doc, 'Negativos', dados.negativos, dados.fallbackNegativos, margin, y);

    y = ensureSpace(doc, y, margin, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(51, 51, 51);
    doc.text('Índices por Seção e Subseção', margin, y);
    y += 8;

    const body = dados.tabela.map((linha) => {
      if (linha.tipo === 'secao') {
        const estilo = { fontStyle: 'bold', fillColor: [242, 245, 242] };
        return [
          { content: linha.nome, styles: estilo },
          { content: '', styles: estilo },
          { content: linha.indiceFmt, styles: estilo },
          { content: linha.classificacao, styles: Object.assign({}, estilo, { textColor: linha.corRGB }) },
        ];
      }
      return [
        { content: `   ${linha.nome}` },
        { content: String(linha.n) },
        { content: linha.indiceFmt },
        { content: linha.classificacao, styles: { textColor: linha.corRGB } },
      ];
    });

    doc.autoTable({
      startY: y + 4,
      margin: { left: margin, right: margin },
      head: [['Seção / Subseção', 'N', 'Índice', 'Classificação']],
      body,
      styles: { fontSize: 9, font: 'helvetica', textColor: [51, 51, 51] },
      headStyles: { fillColor: [46, 75, 46], textColor: 255 },
    });

    y = doc.lastAutoTable.finalY + 20;

    if (dados.fechamentoS6) {
      y = ensureSpace(doc, y, margin, 16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(51, 51, 51);
      doc.text(`Seção 6 — Avaliação Geral (nota de fechamento): ${dados.fechamentoS6.indiceFmt} (${dados.fechamentoS6.classificacao})`, margin, y);
    }

    doc.save(`relatorio_clima_${dados.dataISO}.pdf`);
  }

  // ============================== WORD (.docx) ==============================

  function renderGrupoListaDocx(titulo, grupos, fallback) {
    const { Paragraph, TextRun, HeadingLevel } = global.docx;
    const out = [new Paragraph({ text: titulo, heading: HeadingLevel.HEADING3 })];
    if (!grupos.length) {
      out.push(new Paragraph({ children: [new TextRun({ text: fallback, italics: true, color: '999999' })] }));
      return out;
    }
    grupos.forEach((g) => {
      const meta = C.METADADOS_SECAO[g.secao];
      out.push(new Paragraph({ children: [new TextRun({ text: `${g.secao} — ${meta.titulo}`, bold: true })] }));
      g.pontos.forEach((p) => {
        const corHex = C.corClassificacao(p.classificacao).replace('#', '');
        out.push(new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: `${p.subsecao} — ` }),
            new TextRun({ text: p.classificacao, bold: true, color: corHex }),
          ],
        }));
      });
    });
    return out;
  }

  function buildTabelaDocx(tabela) {
    const { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, ShadingType } = global.docx;

    const headerRow = new TableRow({
      tableHeader: true,
      children: ['Seção / Subseção', 'N', 'Índice', 'Classificação'].map((t) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, color: 'FFFFFF' })] })],
        shading: { type: ShadingType.CLEAR, fill: '2E4B2E' },
      })),
    });

    const rows = [headerRow];
    tabela.forEach((linha) => {
      const isSecao = linha.tipo === 'secao';
      const shading = isSecao ? { type: ShadingType.CLEAR, fill: 'F2F5F2' } : undefined;
      const cellTexto = (texto, opts) => new TableCell({
        children: [new Paragraph({ children: [new TextRun(Object.assign({ text: texto, bold: isSecao }, opts || {}))] })],
        shading,
      });
      rows.push(new TableRow({
        children: [
          cellTexto((isSecao ? '' : '   ') + linha.nome),
          cellTexto(isSecao ? '' : String(linha.n)),
          cellTexto(linha.indiceFmt),
          cellTexto(linha.classificacao, { bold: true, color: linha.corHex }),
        ],
      }));
    });

    return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
  }

  async function gerarDOCX(dados) {
    const {
      Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun,
    } = global.docx;

    const children = [];
    const logoBytes = await carregarLogoBytes();
    if (logoBytes) {
      try {
        children.push(new Paragraph({ children: [new ImageRun({ data: logoBytes, transformation: { width: 50, height: 50 } })] }));
      } catch (e) { /* ignora logo inválido */ }
    }

    children.push(new Paragraph({ text: 'Braço Forte, Abraço Amigo', heading: HeadingLevel.HEADING1 }));
    children.push(new Paragraph({ text: 'Dashboard de Clima Organizacional — 3ª Brigada de Cavalaria Mecanizada' }));
    children.push(new Paragraph({ text: '' }));
    children.push(new Paragraph({ text: `Recorte: ${dados.cabecalho}` }));
    children.push(new Paragraph({ text: `Gerado em ${dados.geradoEm} — N = ${dados.nTotal} respondentes` }));
    children.push(new Paragraph({ text: '' }));
    children.push(new Paragraph({
      children: [new TextRun({ text: `Índice Geral: ${dados.indiceGeralFmt} — ${dados.classificacaoGeral}`, bold: true, color: dados.corIndiceGeralHex, size: 32 })],
    }));
    children.push(new Paragraph({ text: '' }));

    children.push(new Paragraph({ text: 'Leitura Interpretada', heading: HeadingLevel.HEADING2 }));
    children.push(new Paragraph({ text: dados.paragrafo }));
    children.push(...renderGrupoListaDocx('Positivos', dados.positivos, dados.fallbackPositivos));
    children.push(...renderGrupoListaDocx('Negativos', dados.negativos, dados.fallbackNegativos));

    children.push(new Paragraph({ text: '' }));
    children.push(new Paragraph({ text: 'Índices por Seção e Subseção', heading: HeadingLevel.HEADING2 }));
    children.push(buildTabelaDocx(dados.tabela));

    if (dados.fechamentoS6) {
      children.push(new Paragraph({ text: '' }));
      children.push(new Paragraph({
        children: [new TextRun({ text: `Seção 6 — Avaliação Geral (nota de fechamento): ${dados.fechamentoS6.indiceFmt} (${dados.fechamentoS6.classificacao})`, bold: true })],
      }));
    }

    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    global.saveAs(blob, `relatorio_clima_${dados.dataISO}.docx`);
  }

  // ============================== API PÚBLICA ==============================

  async function exportar(formato) {
    const dados = coletarDadosExportacao();
    if (!dados.suficiente) {
      window.alert('Dados insuficientes para exportar este recorte.');
      return;
    }
    if (formato === 'docx') await gerarDOCX(dados);
    else await gerarPDF(dados);
  }

  global.Exportador = { exportar };
})(window);
