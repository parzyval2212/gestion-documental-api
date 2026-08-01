const db = require("../db");

async function crearNotificacion(data) {
  const result = await db.run(
    `INSERT INTO notificaciones
      (usuario_destino_id, usuario_origen_id, tipo, documento_id, expediente_id, mensaje, accion, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.usuarioDestinoId,
      data.usuarioOrigenId || null,
      data.tipo,
      data.documentoId || null,
      data.expedienteId || null,
      data.mensaje,
      data.accion || null,
      data.metadata ? JSON.stringify(data.metadata) : null,
    ]
  );

  return result.id;
}

function mapNotificacion(row) {
  return {
    id: String(row.id),
    usuarioDestinoId: String(row.usuario_destino_id),
    usuarioOrigenId: row.usuario_origen_id ? String(row.usuario_origen_id) : null,
    usuarioOrigen: row.usuario_origen_nombre || null,
    tipo: row.tipo,
    documentoId: row.documento_id ? String(row.documento_id) : null,
    expedienteId: row.expediente_id,
    mensaje: row.mensaje,
    accion: row.accion,
    estado: row.estado,
    leida: row.estado === "Leida",
    fecha: row.creado_en,
    leidoEn: row.leido_en,
    metadata: parseMetadata(row.metadata),
  };
}

function parseMetadata(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

module.exports = {
  crearNotificacion,
  mapNotificacion,
};
