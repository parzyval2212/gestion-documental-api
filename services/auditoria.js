const db = require("../db");

function getClientInfo(req) {
  return {
    ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || req.ip || null,
    dispositivo: req.headers["user-agent"] || req.headers["x-device-id"] || null,
  };
}

async function registrarTrazabilidad(req, data) {
  const usuario = data.usuario || req.user || {};
  const clientInfo = getClientInfo(req);

  await db.run(
    `INSERT INTO trazabilidad
      (usuario_id, usuario_nombre, rol, accion, entidad_tipo, entidad_id, expediente_id, documento_id, ip, dispositivo, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      usuario.id || null,
      usuario.nombre || usuario.username || null,
      usuario.categoria || usuario.role || null,
      data.accion,
      data.entidadTipo,
      data.entidadId ? String(data.entidadId) : null,
      data.expedienteId || null,
      data.documentoId || null,
      clientInfo.ip,
      clientInfo.dispositivo,
      data.metadata ? JSON.stringify(data.metadata) : null,
    ]
  );
}

function mapTrazabilidad(row) {
  return {
    id: String(row.id),
    usuarioId: row.usuario_id ? String(row.usuario_id) : null,
    usuarioNombre: row.usuario_nombre,
    rol: row.rol,
    accion: row.accion,
    entidadTipo: row.entidad_tipo,
    entidadId: row.entidad_id,
    expedienteId: row.expediente_id,
    documentoId: row.documento_id ? String(row.documento_id) : null,
    ip: row.ip,
    dispositivo: row.dispositivo,
    metadata: parseMetadata(row.metadata),
    fecha: row.creado_en,
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
  registrarTrazabilidad,
  mapTrazabilidad,
};
