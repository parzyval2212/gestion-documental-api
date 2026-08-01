const db = require("../db");

async function getNextVersionInfo(documentoId) {
  const latest = await db.get(
    "SELECT MAX(numero_version) AS numero FROM documento_versiones WHERE documento_id = ?",
    [documentoId]
  );
  const numero = Number(latest?.numero || 0) + 1;

  return {
    numero,
    label: `v${numero}.0`,
  };
}

async function crearVersion(documento, options) {
  const versionInfo = await getNextVersionInfo(documento.id);

  const versionData = {
    documentoId: documento.id,
    numeroVersion: versionInfo.numero,
    version: versionInfo.label,
    nombre: options.nombre || documento.nombre,
    nombreArchivo: options.nombreArchivo || documento.nombre_archivo,
    rutaArchivo: options.rutaArchivo || documento.ruta_archivo,
    tipoMime: options.tipoMime || documento.tipo_mime,
    extension: options.extension || documento.extension,
    tamano: options.tamano ?? documento.tamano,
    accion: options.accion,
    motivo: options.motivo || null,
    creadoPor: options.creadoPor,
  };

  const result = await db.run(
    `INSERT INTO documento_versiones
      (documento_id, numero_version, version, nombre, nombre_archivo, ruta_archivo, tipo_mime, extension, tamano, accion, motivo, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      versionData.documentoId,
      versionData.numeroVersion,
      versionData.version,
      versionData.nombre,
      versionData.nombreArchivo,
      versionData.rutaArchivo,
      versionData.tipoMime,
      versionData.extension,
      versionData.tamano,
      versionData.accion,
      versionData.motivo,
      versionData.creadoPor,
    ]
  );

  return {
    id: result.id,
    ...versionData,
  };
}

function mapVersion(row) {
  return {
    id: String(row.id),
    documentoId: String(row.documento_id),
    numeroVersion: row.numero_version,
    version: row.version,
    nombre: row.nombre,
    nombreArchivo: row.nombre_archivo,
    rutaArchivo: row.ruta_archivo,
    tipoMime: row.tipo_mime,
    extension: row.extension,
    tamano: row.tamano,
    accion: row.accion,
    motivo: row.motivo,
    creadoPor: row.creado_por,
    creadoEn: row.creado_en,
  };
}

module.exports = {
  crearVersion,
  mapVersion,
};
