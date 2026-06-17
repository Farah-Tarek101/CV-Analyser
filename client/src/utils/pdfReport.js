export async function generatePdfReport({ result, breakdownRows, scoreInfo }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const marginX = 14;
  const lineHeight = 7;
  let y = 16;

  const writeLine = (text, options = {}) => {
    const { size = 11, weight = 'normal', color = [20, 24, 35] } = options;
    doc.setFontSize(size);
    doc.setFont('helvetica', weight);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(String(text), 180);
    doc.text(lines, marginX, y);
    y += lines.length * lineHeight;
  };

  const ensureSpace = (needed = 20) => {
    if (y + needed > 280) {
      doc.addPage();
      y = 16;
    }
  };

  const generatedAt = new Date().toLocaleString();
  writeLine('CV Analyzer Report', { size: 18, weight: 'bold' });
  writeLine(`Generated: ${generatedAt}`, { size: 10, color: [90, 99, 117] });
  y += 3;
  writeLine(`Match Score: ${result.matchScorePercent}% (${scoreInfo.label})`, {
    size: 13,
    weight: 'bold',
  });

  ensureSpace();
  if (result.scoreBreakdown) {
    y += 3;
    writeLine('Weighted Breakdown', { size: 12, weight: 'bold' });
    breakdownRows.forEach((row) => {
      const score = Number(result.scoreBreakdown?.[row.key] || 0).toFixed(1);
      const weight = Number(result.scoreBreakdown?.weights?.[row.key] || 0) * 100;
      writeLine(`- ${row.label}: ${score}% (weight ${weight.toFixed(0)}%)`, { size: 10 });
    });
  }

  ensureSpace(30);
  y += 3;
  writeLine('Top Missing Keywords', { size: 12, weight: 'bold' });
  if (!result.missingKeywords.length) {
    writeLine('- None detected at single-word/phrase level.', { size: 10 });
  } else {
    result.missingKeywords.slice(0, 20).forEach((word) => {
      ensureSpace();
      writeLine(`- ${word}`, { size: 10 });
    });
  }

  ensureSpace(35);
  y += 3;
  writeLine('Suggestions', { size: 12, weight: 'bold' });
  result.suggestions.forEach((s) => {
    ensureSpace();
    writeLine(`- ${s}`, { size: 10 });
  });

  const fileDate = new Date().toISOString().slice(0, 10);
  doc.save(`cv-match-report-${fileDate}.pdf`);
}

