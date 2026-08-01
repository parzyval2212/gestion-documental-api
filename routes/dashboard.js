const express = require("express");
const auth = require("../middleware/auth");
const apiKey = require("../middleware/apiKey");
const { requirePermission } = require("../middleware/permissions");
const db = require("../db");
const { mapTrazabilidad } = require("../services/auditoria");

const router = express.Router();

router.get("/", apiKey, auth, requirePermission("auth.me"), async (req, res, next) => {
  try {
    const scope = buildScope(req.user);
    const expedientesActivos = await count(
      `SELECT COUNT(*) AS total FROM expedientes e WHERE e.estado = ? ${scope.expedienteWhere}`,
      ["Activo", ...scope.params]
    );
    const docsAutorizados = await count(
      `SELECT COUNT(*) AS total
       FROM documentos d
       JOIN expedientes e ON e.id = d.expediente_id
       WHERE d.estado = ? ${scope.expedienteWhere}`,
      ["Autorizado", ...scope.params]
    );
    const firmasPendientes = await count(
      `SELECT COUNT(*) AS total
       FROM solicitudes_firma sf
       WHERE sf.estado = ?
         AND (
           sf.firmante_usuario_id = ?
           OR (sf.firmante_usuario_id IS NULL AND sf.firmante_categoria = ?)
         )`,
      ["Pendiente", req.user.id, req.user.categoria]
    );
    const documentosPorRevisar = ["Administrador", "Juez"].includes(req.user.categoria)
      ? await count(
          `SELECT COUNT(*) AS total
           FROM documentos d
           JOIN expedientes e ON e.id = d.expediente_id
           WHERE d.estado IN (?, ?) ${scope.expedienteWhere}`,
          ["Subido", "Pendiente firma", ...scope.params]
        )
      : 0;
    const actividad = await db.all(
      `SELECT *
       FROM trazabilidad
       WHERE usuario_id = ?
          OR expediente_id IN (
            SELECT p.expediente_id
            FROM participantes p
            WHERE p.estado <> 'Eliminado' AND p.usuario_id = ?
          )
       ORDER BY creado_en DESC LIMIT 6`,
      [req.user.id, req.user.id]
    );

    res.json({
      resumen: {
        expedientesActivos,
        docsFirmados: docsAutorizados,
        pendientes: documentosPorRevisar + firmasPendientes,
      },
      actividad: actividad.map(mapTrazabilidad),
    });
  } catch (err) {
    next(err);
  }
});

async function count(sql, params) {
  const row = await db.get(sql, params);
  return Number(row?.total || 0);
}

function buildScope(user) {
  if (["Administrador", "Juez"].includes(user.categoria)) {
    return { expedienteWhere: "AND e.estado <> 'Eliminado'", params: [] };
  }

  return {
    expedienteWhere: `AND e.estado <> 'Eliminado'
      AND EXISTS (
        SELECT 1
        FROM participantes p
        WHERE p.expediente_id = e.id
          AND p.estado <> 'Eliminado'
          AND (p.usuario_id = ? OR p.nombre = ?)
      )`,
    params: [user.id, user.nombre],
  };
}

module.exports = router;
