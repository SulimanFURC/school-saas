const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const UPLOADS_ROOT = path.resolve(__dirname, '../../../uploads');

/**
 * Resolve a logo file on disk for the given tenant branding row.
 * Returns null when no logo is configured or file is unreadable.
 */
function resolveLogoPath(branding) {
  if (!branding || !branding.logo_url) return null;
  const rel = String(branding.logo_url).replace(/^[\\/]+/, '');
  const candidate = path.resolve(UPLOADS_ROOT, '..', rel);
  if (!candidate.startsWith(path.resolve(UPLOADS_ROOT, '..'))) return null;
  try {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  } catch (err) {
    return null;
  }
  return null;
}

function newDoc(options = {}) {
  return new PDFDocument({ margin: 40, size: 'A4', ...options });
}

function drawHeader(doc, { tenantName, logoPath, title, subtitle, primaryColor }) {
  const startX = doc.page.margins.left;
  const startY = doc.y;
  const headerHeight = 70;
  const accent = primaryColor || '#1f4f8b';

  if (logoPath) {
    try {
      doc.image(logoPath, startX, startY, { fit: [60, 60] });
    } catch (err) {
      // ignore broken logo file
    }
  }
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(accent)
    .text(tenantName || 'School', startX + 70, startY + 5, { width: 400 });
  if (title) {
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#222').text(title, startX + 70, startY + 30, {
      width: 400,
    });
  }
  if (subtitle) {
    doc.font('Helvetica').fontSize(10).fillColor('#444').text(subtitle, startX + 70, startY + 48, {
      width: 400,
    });
  }
  doc.moveTo(startX, startY + headerHeight)
    .lineTo(doc.page.width - doc.page.margins.right, startY + headerHeight)
    .lineWidth(1)
    .strokeColor(accent)
    .stroke();
  doc.fillColor('#000');
  doc.y = startY + headerHeight + 12;
}

function drawKeyValueRow(doc, label, value) {
  const startX = doc.page.margins.left;
  const labelWidth = 130;
  const fullWidth = doc.page.width - doc.page.margins.right - startX;
  const valueWidth = fullWidth - labelWidth;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text(label, startX, doc.y, {
    width: labelWidth,
    continued: false,
  });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#000')
    .text(String(value == null ? '' : value), startX + labelWidth, doc.y, {
      width: valueWidth,
    });
  doc.moveDown(0.3);
}

/**
 * Draw a simple table with optional header row. Columns: [{ key, label, width, align }].
 */
function drawTable(doc, { columns, rows, headerFill }) {
  const startX = doc.page.margins.left;
  const totalWidth = columns.reduce((a, c) => a + (c.width || 60), 0);
  const fullWidth = Math.max(totalWidth, doc.page.width - doc.page.margins.right - startX);
  const xs = [];
  let acc = startX;
  for (const c of columns) {
    xs.push(acc);
    acc += c.width || 60;
  }
  const headerHeight = 22;

  doc.save();
  doc.rect(startX, doc.y, fullWidth, headerHeight).fill(headerFill || '#1f4f8b');
  doc.restore();
  let y = doc.y + 6;
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10);
  for (let i = 0; i < columns.length; i += 1) {
    const c = columns[i];
    doc.text(c.label, xs[i] + 4, y, {
      width: (c.width || 60) - 8,
      align: c.align || 'left',
    });
  }
  doc.y += headerHeight;
  doc.fillColor('#000');

  doc.font('Helvetica').fontSize(10);
  for (const row of rows) {
    const startY = doc.y;
    let rowHeight = 18;
    for (let i = 0; i < columns.length; i += 1) {
      const c = columns[i];
      const v = row[c.key];
      const text = v == null ? '' : String(v);
      const measure = doc.heightOfString(text, { width: (c.width || 60) - 8 });
      if (measure > rowHeight) rowHeight = measure + 6;
    }
    if (startY + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
    for (let i = 0; i < columns.length; i += 1) {
      const c = columns[i];
      const v = row[c.key];
      doc.text(v == null ? '' : String(v), xs[i] + 4, doc.y + 4, {
        width: (c.width || 60) - 8,
        align: c.align || 'left',
      });
    }
    doc.moveTo(startX, doc.y + rowHeight).lineTo(startX + fullWidth, doc.y + rowHeight)
      .lineWidth(0.5).strokeColor('#cccccc').stroke();
    doc.y += rowHeight;
  }
}

module.exports = {
  newDoc,
  drawHeader,
  drawKeyValueRow,
  drawTable,
  resolveLogoPath,
  PDFDocument,
};
