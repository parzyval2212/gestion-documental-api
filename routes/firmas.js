const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const auth = require("../middleware/auth");
const apiKey = require("../middleware/apiKey");
const { requirePermission } = require("../middleware/permissions");
const db = require("../db");
const { registrarTrazabilidad } = require("../services/auditoria");
const { crearNotificacion } = require("../services/notificaciones");
const { crearVersion } = require("../services/versiones");
const { anexarHojaFirmaPdf } = require("../services/pdfFirmas");

const router = express.Router();
const firmasDir = path.resolve(process.env.FIRMAS_DIR || "uploads/firmas");

fs.mkdirSync(firmasDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, firmasDir),
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + extension);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

function mapSolicitud(row) {
  return {
    id: String(row.id),
    documentoId: row.documento_id ? String(row.documento_id) : null,
    documento: row.documento_nombre,
    nombre: row.documento_nombre,
    expedienteId: row.expediente_id,
    version: row.version,
    solicitanteId: row.solicitante_id,
    solicitante: row.solicitante_nombre || "Usuario",
    firmanteCategoria: row.firmante_categoria,
    firmanteUsuarioId: row.firmante_usuario_id ? String(row.firmante_usuario_id) : null,
    firmanteNombre: row.firmante_nombre || null,
    estado: row.estado,
    firmaTipo: row.firma_tipo,
    firmaValor: row.firma_valor,
    firmaArchivo: row.firma_archivo,
    firmadoPor: row.firmado_por,
    fecha: row.creado_en,
    firmadoEn: row.firmado_en,
    tamano: "-",
    paginas: 1,
  };
}

router.get("/solicitudes", apiKey, auth, requirePermission("firmas.leer"), async (req, res, next) => {
  try {
    const params = [];
    let where = "";

    if (req.query.estado) {
      where = "WHERE sf.estado = ?";
      params.push(req.query.estado);
    }

    const solicitudes = await db.all(
      `SELECT sf.*, u.nombre AS solicitante_nombre, fu.nombre AS firmante_nombre
       FROM solicitudes_firma sf
       LEFT JOIN usuarios u ON u.id = sf.solicitante_id
       LEFT JOIN usuarios fu ON fu.id = sf.firmante_usuario_id
       ${where}
       ORDER BY sf.creado_en DESC`,
      params
    );

    const categoriaUsuario = req.user.categoria;
    const visibles = solicitudes.filter((solicitud) => {
      if (categoriaUsuario === "Abogado") return true;
      if (solicitud.firmante_usuario_id) return solicitud.firmante_usuario_id === req.user.id || solicitud.firmado_por === req.user.id;
      return solicitud.firmante_categoria === categoriaUsuario || solicitud.firmado_por === req.user.id;
    });

    res.json(visibles.map(mapSolicitud));
  } catch (err) {
    next(err);
  }
});

router.post("/solicitudes", apiKey, auth, requirePermission("firmas.solicitar"), async (req, res, next) => {
  try {
    const {
      documentoId = null,
      expedienteId = "GENERAL",
      version = "v1.0",
      firmanteUsuarioId = null,
    } = req.body;

    if (!documentoId) {
      return res.status(400).json({ message: "Debes seleccionar un documento existente" });
    }

    const documentoExistente = await db.get("SELECT * FROM documentos WHERE id = ?", [documentoId]);

    if (!documentoExistente) {
      return res.status(404).json({ message: "Documento no encontrado" });
    }

    if (documentoExistente.expediente_id !== expedienteId) {
      return res.status(400).json({ message: "El documento no pertenece al expediente indicado" });
    }

    let firmanteFinalUsuarioId = firmanteUsuarioId || null;

    if (!firmanteFinalUsuarioId) {
      return res.status(400).json({ message: "Debes seleccionar un firmante del expediente" });
    }

    const firmante = await db.get(
      `SELECT u.id, u.categoria
       FROM usuarios u
       JOIN participantes p ON p.usuario_id = u.id
       WHERE u.id = ?
         AND p.expediente_id = ?
         AND p.estado <> 'Eliminado'`,
      [firmanteFinalUsuarioId, expedienteId]
    );

    if (!firmante) {
      return res.status(400).json({ message: "El firmante debe ser participante del expediente" });
    }

    firmanteFinalUsuarioId = firmante.id;
    const firmanteFinalCategoria = firmante.categoria;

    const result = await db.run(
      `INSERT INTO solicitudes_firma
        (documento_id, documento_nombre, expediente_id, version, solicitante_id, firmante_usuario_id, firmante_categoria)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        documentoId,
        documentoExistente.nombre,
        expedienteId,
        documentoExistente.version || version,
        req.user.id,
        firmanteFinalUsuarioId,
        firmanteFinalCategoria,
      ]
    );

    if (documentoId) {
      await db.run(
        "UPDATE documentos SET estado = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?",
        ["Pendiente firma", documentoId]
      );
    }

    await registrarTrazabilidad(req, {
      accion: "crear_solicitud_firma",
      entidadTipo: "firma",
      entidadId: result.id,
      documentoId,
      expedienteId,
      metadata: {
        documento: documentoExistente.nombre,
        firmanteCategoria: firmanteFinalCategoria,
        firmanteUsuarioId: firmanteFinalUsuarioId,
      },
    });

    const firmantes = firmanteFinalUsuarioId
      ? await db.all("SELECT id FROM usuarios WHERE id = ?", [firmanteFinalUsuarioId])
      : await db.all("SELECT id FROM usuarios WHERE categoria = ?", [firmanteFinalCategoria]);
    for (const firmante of firmantes) {
      if (firmante.id === req.user.id) continue;
      await crearNotificacion({
        usuarioDestinoId: firmante.id,
        usuarioOrigenId: req.user.id,
        tipo: "firma_pendiente",
        documentoId,
        expedienteId,
        mensaje: `Tienes una solicitud de firma pendiente para "${documentoExistente.nombre}".`,
        accion: "firmar_documento",
        metadata: {
          solicitudId: result.id,
          documento: documentoExistente.nombre,
          firmanteCategoria: firmanteFinalCategoria,
          firmanteUsuarioId: firmanteFinalUsuarioId,
        },
      });
    }

    const solicitud = await db.get(
      `SELECT sf.*, u.nombre AS solicitante_nombre, fu.nombre AS firmante_nombre
       FROM solicitudes_firma sf
       LEFT JOIN usuarios u ON u.id = sf.solicitante_id
       LEFT JOIN usuarios fu ON fu.id = sf.firmante_usuario_id
       WHERE sf.id = ?`,
      [result.id]
    );

    res.status(201).json(mapSolicitud(solicitud));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/solicitudes/:id/firmar",
  apiKey,
  auth,
  requirePermission("firmas.firmar"),
  upload.single("firmaArchivo"),
  async (req, res, next) => {
    try {
      const solicitud = await db.get("SELECT * FROM solicitudes_firma WHERE id = ?", [req.params.id]);

      if (!solicitud) {
        return res.status(404).json({ message: "Solicitud de firma no encontrada" });
      }

      if (solicitud.estado === "Firmado") {
        return res.status(400).json({ message: "La solicitud ya fue firmada" });
      }

      if (solicitud.firmante_usuario_id && solicitud.firmante_usuario_id !== req.user.id) {
        return res.status(403).json({ message: "Esta solicitud fue asignada a otro usuario" });
      }

      const firmaTipo = req.body.firmaTipo || (req.file ? "archivo" : "texto");
      const firmaValor = req.body.firmaValor || "";
      const firmaArchivo = req.file ? req.file.path : null;

      if (!firmaValor && !firmaArchivo) {
        return res.status(400).json({ message: "Debes enviar una firma dibujada, escrita o como archivo" });
      }

      await db.run(
        `UPDATE solicitudes_firma
         SET estado = ?,
             firma_tipo = ?,
             firma_valor = ?,
             firma_archivo = ?,
             firmado_por = ?,
             firmado_en = CURRENT_TIMESTAMP
         WHERE id = ?`,
        ["Firmado", firmaTipo, firmaValor, firmaArchivo, req.user.id, req.params.id]
      );

      let versionFirmada = null;

      if (solicitud.documento_id) {
        const documento = await db.get("SELECT * FROM documentos WHERE id = ?", [solicitud.documento_id]);
        const firmante = await db.get(
          "SELECT id, username, categoria, nombre, cargo FROM usuarios WHERE id = ?",
          [req.user.id]
        );
        const archivoFirmado = documento
          ? await anexarHojaFirmaPdf({
              documento,
              solicitud,
              firmante,
              firmaTipo,
              firmaValor,
              firmaArchivo,
            })
          : null;

        if (documento && archivoFirmado) {
          versionFirmada = await crearVersion(documento, {
            ...archivoFirmado,
            nombre: documento.nombre,
            accion: "firma_anexada",
            motivo: `Hoja de firma anexada por ${firmante?.nombre || req.user.nombre}`,
            creadoPor: req.user.id,
          });

          await db.run(
            `UPDATE documentos
             SET nombre_archivo = ?,
                 ruta_archivo = ?,
                 tipo_mime = ?,
                 extension = ?,
                 tamano = ?,
                 version = ?,
                 estado = ?,
                 actualizado_en = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
              archivoFirmado.nombreArchivo,
              archivoFirmado.rutaArchivo,
              archivoFirmado.tipoMime,
              archivoFirmado.extension,
              archivoFirmado.tamano,
              versionFirmada.version,
              "Autorizado",
              solicitud.documento_id,
            ]
          );
        } else {
          await db.run(
            "UPDATE documentos SET estado = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?",
            ["Autorizado", solicitud.documento_id]
          );
        }
      }

      await registrarTrazabilidad(req, {
        accion: "firmar_documento",
        entidadTipo: "firma",
        entidadId: req.params.id,
        documentoId: solicitud.documento_id,
        expedienteId: solicitud.expediente_id,
        metadata: {
          documento: solicitud.documento_nombre,
          firmaTipo,
          versionFirmada: versionFirmada?.version || null,
          hojaFirmaAnexada: Boolean(versionFirmada),
        },
      });

      if (solicitud.solicitante_id && solicitud.solicitante_id !== req.user.id) {
        await crearNotificacion({
          usuarioDestinoId: solicitud.solicitante_id,
          usuarioOrigenId: req.user.id,
          tipo: "documento_firmado",
          documentoId: solicitud.documento_id,
          expedienteId: solicitud.expediente_id,
          mensaje: `El documento "${solicitud.documento_nombre}" fue firmado.`,
          accion: "ver_solicitud_firma",
          metadata: {
            solicitudId: req.params.id,
            firmaTipo,
          },
        });
      }

      const actualizada = await db.get(
        `SELECT sf.*, u.nombre AS solicitante_nombre, fu.nombre AS firmante_nombre
         FROM solicitudes_firma sf
         LEFT JOIN usuarios u ON u.id = sf.solicitante_id
         LEFT JOIN usuarios fu ON fu.id = sf.firmante_usuario_id
         WHERE sf.id = ?`,
        [req.params.id]
      );

      res.json(mapSolicitud(actualizada));
    } catch (err) {
      next(err);
    }
  }
);

router.post("/solicitudes/:id/rechazar", apiKey, auth, requirePermission("firmas.rechazar"), async (req, res, next) => {
  try {
    const solicitud = await db.get("SELECT * FROM solicitudes_firma WHERE id = ?", [req.params.id]);

    if (!solicitud) {
      return res.status(404).json({ message: "Solicitud de firma no encontrada" });
    }

    if (solicitud.firmante_usuario_id && solicitud.firmante_usuario_id !== req.user.id) {
      return res.status(403).json({ message: "Esta solicitud fue asignada a otro usuario" });
    }

    await db.run(
      `UPDATE solicitudes_firma
       SET estado = ?, firma_valor = ?, firmado_por = ?, firmado_en = CURRENT_TIMESTAMP
       WHERE id = ?`,
      ["Rechazado", req.body.motivo || "Rechazado desde Doc Hub", req.user.id, req.params.id]
    );

    await registrarTrazabilidad(req, {
      accion: "rechazar_firma",
      entidadTipo: "firma",
      entidadId: req.params.id,
      documentoId: solicitud.documento_id,
      expedienteId: solicitud.expediente_id,
      metadata: {
        documento: solicitud.documento_nombre,
        motivo: req.body.motivo || "Rechazado desde Doc Hub",
      },
    });

    if (solicitud.solicitante_id && solicitud.solicitante_id !== req.user.id) {
      await crearNotificacion({
        usuarioDestinoId: solicitud.solicitante_id,
        usuarioOrigenId: req.user.id,
        tipo: "firma_rechazada",
        documentoId: solicitud.documento_id,
        expedienteId: solicitud.expediente_id,
        mensaje: `La firma del documento "${solicitud.documento_nombre}" fue rechazada.`,
        accion: "ver_solicitud_firma",
        metadata: {
          solicitudId: req.params.id,
          motivo: req.body.motivo || "Rechazado desde Doc Hub",
        },
      });
    }

    const actualizada = await db.get(
      `SELECT sf.*, u.nombre AS solicitante_nombre, fu.nombre AS firmante_nombre
       FROM solicitudes_firma sf
       LEFT JOIN usuarios u ON u.id = sf.solicitante_id
       LEFT JOIN usuarios fu ON fu.id = sf.firmante_usuario_id
       WHERE sf.id = ?`,
      [req.params.id]
    );

    res.json(mapSolicitud(actualizada));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
