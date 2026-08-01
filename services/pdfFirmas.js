const fs = require("fs/promises");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const signedDir = path.resolve(process.env.SIGNED_PDF_DIR || "uploads/firmados");

function sanitizeFileName(name) {
  return String(name || "documento")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function wrapText(text, maxChars) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : ["-"];
}

function drawLabel(page, font, boldFont, label, value, x, y) {
  page.drawText(label, { x, y, size: 10, font: boldFont, color: rgb(0.1, 0.15, 0.25) });
  const lines = wrapText(value, 70);
  lines.forEach((line, index) => {
    page.drawText(line, { x: x + 120, y: y - index * 14, size: 10, font, color: rgb(0.18, 0.22, 0.3) });
  });
  return y - Math.max(lines.length, 1) * 14 - 8;
}

function drawSignatureTrace(page, points, x, y, width, height) {
  const parsed = JSON.parse(points || "[]");
  if (!Array.isArray(parsed) || parsed.length < 2) return false;

  const validPoints = parsed
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .slice(-450);

  if (validPoints.length < 2) return false;

  const maxX = Math.max(...validPoints.map((point) => point.x), 1);
  const maxY = Math.max(...validPoints.map((point) => point.y), 1);

  for (let index = 1; index < validPoints.length; index += 1) {
    const prev = validPoints[index - 1];
    const current = validPoints[index];
    if (prev.stroke !== current.stroke) continue;

    page.drawLine({
      start: {
        x: x + (prev.x / maxX) * width,
        y: y + height - (prev.y / maxY) * height,
      },
      end: {
        x: x + (current.x / maxX) * width,
        y: y + height - (current.y / maxY) * height,
      },
      thickness: 1.4,
      color: rgb(0.08, 0.16, 0.32),
    });
  }

  return true;
}

async function anexarHojaFirmaPdf({ documento, solicitud, firmante, firmaTipo, firmaValor, firmaArchivo }) {
  if (String(documento.extension || "").toLowerCase() !== ".pdf") {
    return null;
  }

  await fs.mkdir(signedDir, { recursive: true });

  const sourceBytes = await fs.readFile(path.resolve(documento.ruta_archivo));
  const pdfDoc = await PDFDocument.load(sourceBytes);
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const margin = 54;
  let y = 720;

  page.drawText("Hoja de firma digital", {
    x: margin,
    y,
    size: 20,
    font: boldFont,
    color: rgb(0.05, 0.16, 0.34),
  });

  y -= 34;
  page.drawText("Esta pagina fue anexada automaticamente por Doc Hub.", {
    x: margin,
    y,
    size: 10,
    font,
    color: rgb(0.35, 0.4, 0.48),
  });

  y -= 34;
  y = drawLabel(page, font, boldFont, "Documento", documento.nombre, margin, y);
  y = drawLabel(page, font, boldFont, "Expediente", solicitud.expediente_id, margin, y);
  y = drawLabel(page, font, boldFont, "Version firmada", solicitud.version || documento.version, margin, y);
  y = drawLabel(page, font, boldFont, "Firmante", firmante?.nombre || `Usuario #${firmante?.id || ""}`, margin, y);
  y = drawLabel(page, font, boldFont, "Rol", firmante?.categoria || solicitud.firmante_categoria, margin, y);
  y = drawLabel(page, font, boldFont, "Fecha de firma", new Date().toLocaleString("es-MX"), margin, y);
  y = drawLabel(page, font, boldFont, "Metodo", firmaTipo, margin, y);

  y -= 8;
  page.drawRectangle({
    x: margin,
    y: y - 150,
    width: 504,
    height: 150,
    borderWidth: 1,
    borderColor: rgb(0.75, 0.78, 0.84),
    color: rgb(0.98, 0.99, 1),
  });

  page.drawText("Firma", { x: margin + 16, y: y - 24, size: 11, font: boldFont, color: rgb(0.1, 0.15, 0.25) });

  if (firmaTipo === "dibujo" && drawSignatureTrace(page, firmaValor, margin + 34, y - 132, 436, 88)) {
    // Signature trace drawn above.
  } else if (firmaTipo === "texto") {
    page.drawText(firmaValor || "-", {
      x: margin + 34,
      y: y - 92,
      size: 22,
      font,
      color: rgb(0.08, 0.16, 0.32),
    });
  } else {
    page.drawText(firmaArchivo ? `Archivo de firma: ${path.basename(firmaArchivo)}` : "Firma registrada como archivo.", {
      x: margin + 34,
      y: y - 92,
      size: 12,
      font,
      color: rgb(0.08, 0.16, 0.32),
    });
  }

  page.drawText("Validacion: la firma queda registrada en la base de datos y en la trazabilidad del documento.", {
    x: margin,
    y: 72,
    size: 9,
    font,
    color: rgb(0.35, 0.4, 0.48),
  });

  const outputName = `${Date.now()}-${sanitizeFileName(documento.nombre)}-firmado.pdf`;
  const outputPath = path.join(signedDir, outputName);
  const outputBytes = await pdfDoc.save();
  await fs.writeFile(outputPath, outputBytes);

  return {
    nombreArchivo: outputName,
    rutaArchivo: outputPath,
    tipoMime: "application/pdf",
    extension: ".pdf",
    tamano: outputBytes.length,
  };
}

module.exports = {
  anexarHojaFirmaPdf,
};
