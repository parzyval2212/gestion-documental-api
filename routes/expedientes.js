const express = require("express");
const auth = require("../middleware/auth");
const apiKey = require("../middleware/apiKey");
const { requirePermission } = require("../middleware/permissions");
const db = require("../db");
const { registrarTrazabilidad, mapTrazabilidad } = require("../services/auditoria");
const { crearNotificacion } = require("../services/notificaciones");

const router = express.Router();
const estadosExpediente = new Set(["Activo", "Pendiente", "Cerrado", "Eliminado"]);

function mapExpediente(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    estado: row.estado,
    juzgado: row.juzgado,
    fechaInicio: row.fecha_inicio,
    progreso: Number(row.progreso || 0),
    descripcion: row.descripcion || "",
    creadoPor: row.creado_por,
    creadoEn: row.creado_en,
    actualizadoEn: row.actualizado_en,
    docsTotal: Number(row.docs_total || 0),
    docsFirmados: Number(row.docs_firmados || 0),
    participantesTotal: Number(row.participantes_total || 0),
  };
}

function mapParticipante(row) {
  return {
    id: String(row.id),
    expedienteId: row.expediente_id,
    usuarioId: row.usuario_id ? String(row.usuario_id) : null,
    nombre: row.nombre,
    rol: row.rol,
    categoria: row.categoria,
    email: row.email,
    telefono: row.telefono,
    estado: row.estado,
    creadoEn: row.creado_en,
    actualizadoEn: row.actualizado_en,
  };
}

router.get("/", apiKey, auth, requirePermission("expedientes.leer"), async (req, res, next) => {
  try {
    const params = [];
    let where = "e.estado <> 'Eliminado'";

    if (!["Administrador", "Juez", "Notario"].includes(req.user.categoria)) {
      where += " AND EXISTS (SELECT 1 FROM participantes p WHERE p.expediente_id = e.id AND p.estado <> 'Eliminado' AND (p.usuario_id = ? OR p.nombre = ?))";
      params.push(req.user.id, req.user.nombre);
    }

    const expedientes = await db.all(
      `SELECT e.*,
              COUNT(DISTINCT d.id) AS docs_total,
              SUM(CASE WHEN d.estado = 'Autorizado' THEN 1 ELSE 0 END) AS docs_firmados,
              COUNT(DISTINCT p.id) AS participantes_total
       FROM expedientes e
       LEFT JOIN documentos d ON d.expediente_id = e.id
       LEFT JOIN participantes p ON p.expediente_id = e.id AND p.estado <> 'Eliminado'
       WHERE ${where}
       GROUP BY e.id
       ORDER BY e.creado_en DESC`,
      params
    );

    res.json(expedientes.map(mapExpediente));
  } catch (err) {
    next(err);
  }
});

router.post("/", apiKey, auth, requirePermission("expedientes.crear"), async (req, res, next) => {
  try {
    const id = String(req.body.id || "").trim();
    const tipo = String(req.body.tipo || "").trim();

    if (!id || !tipo) {
      return res.status(400).json({ message: "El id y tipo del expediente son obligatorios" });
    }

    await db.run(
      `INSERT INTO expedientes (id, tipo, estado, juzgado, fecha_inicio, progreso, descripcion, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tipo,
        req.body.estado || "Activo",
        req.body.juzgado || "",
        req.body.fechaInicio || req.body.fecha_inicio || new Date().toISOString().slice(0, 10),
        clampProgress(req.body.progreso),
        req.body.descripcion || null,
        req.user.id,
      ]
    );

    const expediente = await getExpediente(id);
    await registrarTrazabilidad(req, {
      accion: "crear_expediente",
      entidadTipo: "expediente",
      entidadId: id,
      expedienteId: id,
      metadata: { tipo: expediente.tipo, estado: expediente.estado },
    });

    res.status(201).json(mapExpediente(expediente));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", apiKey, auth, requirePermission("expedientes.leer"), async (req, res, next) => {
  try {
    const expediente = await getExpediente(req.params.id);

    if (!expediente || expediente.estado === "Eliminado") {
      return res.status(404).json({ message: "Expediente no encontrado" });
    }

    res.json(mapExpediente(expediente));
  } catch (err) {
    next(err);
  }
});

router.put("/:id", apiKey, auth, requirePermission("expedientes.editar"), async (req, res, next) => {
  try {
    const expediente = await getExpediente(req.params.id);

    if (!expediente || expediente.estado === "Eliminado") {
      return res.status(404).json({ message: "Expediente no encontrado" });
    }

    await db.run(
      `UPDATE expedientes
       SET tipo = ?,
           estado = ?,
           juzgado = ?,
           fecha_inicio = ?,
           progreso = ?,
           descripcion = ?,
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        req.body.tipo || expediente.tipo,
        req.body.estado || expediente.estado,
        req.body.juzgado || expediente.juzgado,
        req.body.fechaInicio || req.body.fecha_inicio || expediente.fecha_inicio,
        req.body.progreso === undefined ? expediente.progreso : clampProgress(req.body.progreso),
        req.body.descripcion === undefined ? expediente.descripcion : req.body.descripcion,
        req.params.id,
      ]
    );

    const actualizado = await getExpediente(req.params.id);
    await registrarTrazabilidad(req, {
      accion: "editar_expediente",
      entidadTipo: "expediente",
      entidadId: actualizado.id,
      expedienteId: actualizado.id,
      metadata: {
        anterior: pickExpediente(expediente),
        nuevo: pickExpediente(actualizado),
      },
    });

    res.json(mapExpediente(actualizado));
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/estado", apiKey, auth, requirePermission("expedientes.cambiar_estado"), async (req, res, next) => {
  try {
    const estado = req.body.estado;
    if (!estadosExpediente.has(estado)) {
      return res.status(400).json({ message: "Estado de expediente no valido" });
    }

    const expediente = await getExpediente(req.params.id);
    if (!expediente) {
      return res.status(404).json({ message: "Expediente no encontrado" });
    }

    await db.run(
      "UPDATE expedientes SET estado = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?",
      [estado, req.params.id]
    );

    const actualizado = await getExpediente(req.params.id);
    await registrarTrazabilidad(req, {
      accion: "cambiar_estado_expediente",
      entidadTipo: "expediente",
      entidadId: actualizado.id,
      expedienteId: actualizado.id,
      metadata: {
        estadoAnterior: expediente.estado,
        estadoNuevo: estado,
        motivo: req.body.motivo || null,
      },
    });

    res.json(mapExpediente(actualizado));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", apiKey, auth, requirePermission("expedientes.eliminar"), async (req, res, next) => {
  try {
    const expediente = await getExpediente(req.params.id);

    if (!expediente || expediente.estado === "Eliminado") {
      return res.status(404).json({ message: "Expediente no encontrado" });
    }

    await db.run(
      "UPDATE expedientes SET estado = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?",
      ["Eliminado", req.params.id]
    );

    await registrarTrazabilidad(req, {
      accion: "eliminar_expediente",
      entidadTipo: "expediente",
      entidadId: req.params.id,
      expedienteId: req.params.id,
      metadata: { tipo: expediente.tipo, motivo: req.body?.motivo || null },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get("/:id/participantes", apiKey, auth, requirePermission("expedientes.participantes.leer"), async (req, res, next) => {
  try {
    const participantes = await db.all(
      `SELECT * FROM participantes
       WHERE expediente_id = ? AND estado <> 'Eliminado'
       ORDER BY creado_en DESC`,
      [req.params.id]
    );

    res.json(participantes.map(mapParticipante));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/participantes", apiKey, auth, requirePermission("participantes.crear"), async (req, res, next) => {
  try {
    const expediente = await getExpediente(req.params.id);
    if (!expediente || expediente.estado === "Eliminado") {
      return res.status(404).json({ message: "Expediente no encontrado" });
    }

    const participanteData = readParticipanteBody(req.body);
    if (!participanteData.nombre || !participanteData.rol) {
      return res.status(400).json({ message: "Nombre y rol del participante son obligatorios" });
    }

    const result = await db.run(
      `INSERT INTO participantes (expediente_id, usuario_id, nombre, rol, categoria, email, telefono)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        participanteData.usuarioId,
        participanteData.nombre,
        participanteData.rol,
        participanteData.categoria,
        participanteData.email,
        participanteData.telefono,
      ]
    );

    const participante = await db.get("SELECT * FROM participantes WHERE id = ?", [result.id]);
    await registrarTrazabilidad(req, {
      accion: "asignar_participante",
      entidadTipo: "participante",
      entidadId: String(participante.id),
      expedienteId: req.params.id,
      metadata: { participante: participante.nombre, rol: participante.rol, categoria: participante.categoria },
    });
    await notificarParticipante(req, participante, expediente);

    res.status(201).json(mapParticipante(participante));
  } catch (err) {
    next(err);
  }
});

router.put("/:id/participantes/:participanteId", apiKey, auth, requirePermission("participantes.editar"), async (req, res, next) => {
  try {
    const participante = await db.get(
      "SELECT * FROM participantes WHERE id = ? AND expediente_id = ? AND estado <> 'Eliminado'",
      [req.params.participanteId, req.params.id]
    );

    if (!participante) {
      return res.status(404).json({ message: "Participante no encontrado" });
    }

    const data = readParticipanteBody(req.body, participante);
    await db.run(
      `UPDATE participantes
       SET usuario_id = ?,
           nombre = ?,
           rol = ?,
           categoria = ?,
           email = ?,
           telefono = ?,
           estado = ?,
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        data.usuarioId,
        data.nombre,
        data.rol,
        data.categoria,
        data.email,
        data.telefono,
        data.estado || participante.estado,
        req.params.participanteId,
      ]
    );

    const actualizado = await db.get("SELECT * FROM participantes WHERE id = ?", [req.params.participanteId]);
    await registrarTrazabilidad(req, {
      accion: "editar_participante",
      entidadTipo: "participante",
      entidadId: String(actualizado.id),
      expedienteId: req.params.id,
      metadata: {
        anterior: mapParticipante(participante),
        nuevo: mapParticipante(actualizado),
      },
    });

    res.json(mapParticipante(actualizado));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id/participantes/:participanteId", apiKey, auth, requirePermission("participantes.eliminar"), async (req, res, next) => {
  try {
    const participante = await db.get(
      "SELECT * FROM participantes WHERE id = ? AND expediente_id = ? AND estado <> 'Eliminado'",
      [req.params.participanteId, req.params.id]
    );

    if (!participante) {
      return res.status(404).json({ message: "Participante no encontrado" });
    }

    await db.run(
      "UPDATE participantes SET estado = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?",
      ["Eliminado", req.params.participanteId]
    );

    await registrarTrazabilidad(req, {
      accion: "eliminar_participante",
      entidadTipo: "participante",
      entidadId: String(participante.id),
      expedienteId: req.params.id,
      metadata: { participante: participante.nombre, rol: participante.rol },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get("/:id/trazabilidad", apiKey, auth, requirePermission("expedientes.trazabilidad.leer"), async (req, res, next) => {
  try {
    const historial = await db.all(
      `SELECT *
       FROM trazabilidad
       WHERE expediente_id = ? OR (entidad_tipo = ? AND entidad_id = ?)
       ORDER BY creado_en DESC`,
      [req.params.id, "expediente", req.params.id]
    );

    res.json(historial.map(mapTrazabilidad));
  } catch (err) {
    next(err);
  }
});

async function getExpediente(id) {
  return db.get(
    `SELECT e.*,
            COUNT(DISTINCT d.id) AS docs_total,
            SUM(CASE WHEN d.estado = 'Autorizado' THEN 1 ELSE 0 END) AS docs_firmados,
            COUNT(DISTINCT p.id) AS participantes_total
     FROM expedientes e
     LEFT JOIN documentos d ON d.expediente_id = e.id
     LEFT JOIN participantes p ON p.expediente_id = e.id AND p.estado <> 'Eliminado'
     WHERE e.id = ?
     GROUP BY e.id`,
    [id]
  );
}

function readParticipanteBody(body, current = {}) {
  return {
    usuarioId: body.usuarioId || body.usuario_id || current.usuario_id || null,
    nombre: body.nombre === undefined ? current.nombre : String(body.nombre || "").trim(),
    rol: body.rol === undefined ? current.rol : String(body.rol || "").trim(),
    categoria: body.categoria === undefined ? current.categoria : body.categoria || null,
    email: body.email === undefined ? current.email : body.email || null,
    telefono: body.telefono === undefined ? current.telefono : body.telefono || null,
    estado: body.estado === undefined ? current.estado : body.estado || "Activo",
  };
}

function clampProgress(value) {
  const number = Number(value ?? 0);
  if (Number.isNaN(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function pickExpediente(expediente) {
  return {
    id: expediente.id,
    tipo: expediente.tipo,
    estado: expediente.estado,
    juzgado: expediente.juzgado,
    fechaInicio: expediente.fecha_inicio,
    progreso: Number(expediente.progreso || 0),
  };
}

async function notificarParticipante(req, participante, expediente) {
  if (!participante.usuario_id || participante.usuario_id === req.user.id) return;

  await crearNotificacion({
    usuarioDestinoId: participante.usuario_id,
    usuarioOrigenId: req.user.id,
    tipo: "participante_asignado",
    expedienteId: expediente.id,
    mensaje: `Fuiste asignado al expediente ${expediente.id}.`,
    accion: "ver_expediente",
    metadata: {
      rol: participante.rol,
      categoria: participante.categoria,
      tipoExpediente: expediente.tipo,
    },
  });
}

module.exports = router;
