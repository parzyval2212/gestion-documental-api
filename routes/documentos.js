const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const auth = require("../middleware/auth");
const apiKey = require("../middleware/apiKey");
const { requirePermission } = require("../middleware/permissions");
const db = require("../db");
const { registrarTrazabilidad, mapTrazabilidad } = require("../services/auditoria");
const { crearVersion, mapVersion } = require("../services/versiones");
const { crearNotificacion } = require("../services/notificaciones");

const router = express.Router();

const uploadDir = path.resolve(process.env.UPLOAD_DIR || "uploads");
const allowedExtensions = new Set([".pdf", ".doc", ".docx"]);

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + extension);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.has(extension)) {
      return cb(new Error("Solo se permiten archivos .pdf, .doc y .docx"));
    }

    cb(null, true);
  }
});

function mapDocumento(row) {
  return {
    id: String(row.id),
    expedienteId: row.expediente_id,
    nombre: row.nombre,
    nombreArchivo: row.nombre_archivo,
    tipoMime: row.tipo_mime,
    extension: row.extension,
    tipo: row.extension.replace(".", "") || "doc",
    tamano: row.tamano,
    tamanoTexto: formatBytes(row.tamano),
    version: row.version,
    estado: row.estado,
    rechazoMotivo: row.rechazo_motivo || null,
    creadoPor: row.creado_por,
    creadoEn: row.creado_en,
    actualizadoEn: row.actualizado_en,
    abrirUrl: `/documentos/${row.id}/abrir`
  };
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

router.post("/", apiKey, auth, requirePermission("documentos.crear"), upload.single("archivo"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Debes enviar un archivo en el campo 'archivo'" });
    }

    const nombre = req.body.nombre || req.file.originalname;
    const expedienteId = req.body.expedienteId || req.body.expediente_id || "GENERAL";
    const extension = path.extname(req.file.originalname).toLowerCase();

    const result = await db.run(
      `INSERT INTO documentos
        (expediente_id, nombre, nombre_archivo, ruta_archivo, tipo_mime, extension, tamano, version, estado, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        expedienteId,
        nombre,
        req.file.originalname,
        req.file.path,
        req.file.mimetype,
        extension,
        req.file.size,
        req.body.version || "v1.0",
        req.body.estado || "Subido",
        req.user.id
      ]
    );

    const documento = await db.get("SELECT * FROM documentos WHERE id = ?", [result.id]);
    await crearVersion(documento, {
      accion: "creacion",
      creadoPor: req.user.id,
      motivo: "Version inicial",
    });
    await registrarTrazabilidad(req, {
      accion: "crear_documento",
      entidadTipo: "documento",
      entidadId: documento.id,
      documentoId: documento.id,
      expedienteId: documento.expediente_id,
      metadata: { nombre: documento.nombre, version: documento.version },
    });

    res.status(201).json(mapDocumento(documento));
  } catch (err) {
    next(err);
  }
});

router.get("/", apiKey, auth, requirePermission("documentos.leer"), async (req, res, next) => {
  try {
    const { expedienteId } = req.query;
    const documentos = expedienteId
      ? await db.all("SELECT * FROM documentos WHERE expediente_id = ? ORDER BY creado_en DESC", [expedienteId])
      : await db.all("SELECT * FROM documentos ORDER BY creado_en DESC");

    res.json(documentos.map(mapDocumento));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", apiKey, auth, requirePermission("documentos.leer"), async (req, res, next) => {
  try {
    const documento = await db.get("SELECT * FROM documentos WHERE id = ?", [req.params.id]);

    if (!documento) {
      return res.status(404).json({ message: "Documento no encontrado" });
    }

    res.json(mapDocumento(documento));
  } catch (err) {
    next(err);
  }
});

router.get("/:id/versiones", apiKey, auth, requirePermission("documentos.versiones.leer"), async (req, res, next) => {
  try {
    const documento = await db.get("SELECT * FROM documentos WHERE id = ?", [req.params.id]);

    if (!documento) {
      return res.status(404).json({ message: "Documento no encontrado" });
    }

    const versiones = await db.all(
      "SELECT * FROM documento_versiones WHERE documento_id = ? ORDER BY numero_version DESC",
      [req.params.id]
    );

    res.json(versiones.map(mapVersion));
  } catch (err) {
    next(err);
  }
});

router.get("/:id/trazabilidad", apiKey, auth, requirePermission("documentos.trazabilidad.leer"), async (req, res, next) => {
  try {
    const documento = await db.get("SELECT * FROM documentos WHERE id = ?", [req.params.id]);

    if (!documento) {
      return res.status(404).json({ message: "Documento no encontrado" });
    }

    const historial = await db.all(
      `SELECT *
       FROM trazabilidad
       WHERE documento_id = ? OR (entidad_tipo = ? AND entidad_id = ?)
       ORDER BY creado_en DESC`,
      [req.params.id, "documento", String(req.params.id)]
    );

    res.json(historial.map(mapTrazabilidad));
  } catch (err) {
    next(err);
  }
});

router.get("/:id/abrir", apiKey, auth, requirePermission("documentos.visualizar"), async (req, res, next) => {
  try {
    const documento = await db.get("SELECT * FROM documentos WHERE id = ?", [req.params.id]);

    if (!documento) {
      return res.status(404).json({ message: "Documento no encontrado" });
    }

    if (!fs.existsSync(documento.ruta_archivo)) {
      return res.status(404).json({ message: "Archivo no encontrado en disco" });
    }

    res.setHeader("Content-Type", documento.tipo_mime);
    res.setHeader("Content-Disposition", `inline; filename="${documento.nombre_archivo}"`);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    await registrarTrazabilidad(req, {
      accion: req.query.download === "1" ? "descargar_documento" : "visualizar_documento",
      entidadTipo: "documento",
      entidadId: documento.id,
      documentoId: documento.id,
      expedienteId: documento.expediente_id,
      metadata: { nombre: documento.nombre, version: documento.version },
    });
    res.sendFile(path.resolve(documento.ruta_archivo));
  } catch (err) {
    next(err);
  }
});

router.put("/:id", apiKey, auth, requirePermission("documentos.editar"), upload.single("archivo"), async (req, res, next) => {
  try {
    const documento = await db.get("SELECT * FROM documentos WHERE id = ?", [req.params.id]);

    if (!documento) {
      return res.status(404).json({ message: "Documento no encontrado" });
    }

    const nombre = req.body.nombre || documento.nombre;
    const expedienteId = req.body.expedienteId || req.body.expediente_id || documento.expediente_id;
    const estado = req.file && documento.estado === "Rechazado" ? "Subido" : req.body.estado || documento.estado;
    let archivo = {
      nombreArchivo: documento.nombre_archivo,
      rutaArchivo: documento.ruta_archivo,
      tipoMime: documento.tipo_mime,
      extension: documento.extension,
      tamano: documento.tamano
    };

    if (req.file) {
      archivo = {
        nombreArchivo: req.file.originalname,
        rutaArchivo: req.file.path,
        tipoMime: req.file.mimetype,
        extension: path.extname(req.file.originalname).toLowerCase(),
        tamano: req.file.size
      };
    }

    const nuevaVersion = await crearVersion(documento, {
      nombre,
      nombreArchivo: archivo.nombreArchivo,
      rutaArchivo: archivo.rutaArchivo,
      tipoMime: archivo.tipoMime,
      extension: archivo.extension,
      tamano: archivo.tamano,
      accion: req.file ? "nueva_version" : "edicion",
      motivo: req.body.motivo || null,
      creadoPor: req.user.id,
    });

    await db.run(
      `UPDATE documentos
       SET expediente_id = ?,
           nombre = ?,
           nombre_archivo = ?,
           ruta_archivo = ?,
           tipo_mime = ?,
           extension = ?,
           tamano = ?,
           version = ?,
           estado = ?,
           rechazo_motivo = ?,
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        expedienteId,
        nombre,
        archivo.nombreArchivo,
        archivo.rutaArchivo,
        archivo.tipoMime,
        archivo.extension,
        archivo.tamano,
        nuevaVersion.version,
        estado,
        estado === "Rechazado" ? documento.rechazo_motivo : null,
        req.params.id
      ]
    );

    const actualizado = await db.get("SELECT * FROM documentos WHERE id = ?", [req.params.id]);
    await registrarTrazabilidad(req, {
      accion: req.file ? "crear_nueva_version" : "editar_documento",
      entidadTipo: "documento",
      entidadId: actualizado.id,
      documentoId: actualizado.id,
      expedienteId: actualizado.expediente_id,
      metadata: {
        nombreAnterior: documento.nombre,
        nombreNuevo: actualizado.nombre,
        version: actualizado.version,
        archivoNuevo: Boolean(req.file),
      },
    });
    res.json(mapDocumento(actualizado));
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/estado", apiKey, auth, requirePermission("documentos.cambiar_estado"), async (req, res, next) => {
  try {
    const estadosValidos = new Set(["Subido", "Pendiente firma", "Autorizado", "Rechazado"]);
    const estado = req.body.estado;

    if (!estadosValidos.has(estado)) {
      return res.status(400).json({ message: "Estado no valido" });
    }

    const documento = await db.get("SELECT * FROM documentos WHERE id = ?", [req.params.id]);

    if (!documento) {
      return res.status(404).json({ message: "Documento no encontrado" });
    }

    await db.run(
      "UPDATE documentos SET estado = ?, rechazo_motivo = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?",
      [estado, estado === "Rechazado" ? req.body.motivo || "Sin motivo especificado" : null, req.params.id]
    );

    const actualizado = await db.get("SELECT * FROM documentos WHERE id = ?", [req.params.id]);
    await registrarTrazabilidad(req, {
      accion: estado === "Autorizado" ? "aprobar_documento" : estado === "Rechazado" ? "rechazar_documento" : "cambiar_estado_documento",
      entidadTipo: "documento",
      entidadId: actualizado.id,
      documentoId: actualizado.id,
      expedienteId: actualizado.expediente_id,
      metadata: {
        estadoAnterior: documento.estado,
        estadoNuevo: estado,
        motivo: req.body.motivo || null,
      },
    });

    await notificarCambioEstadoDocumento(req, documento, actualizado, estado, req.body.motivo || null);
    res.json(mapDocumento(actualizado));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/restaurar/:versionId", apiKey, auth, requirePermission("documentos.restaurar_version"), async (req, res, next) => {
  try {
    const documento = await db.get("SELECT * FROM documentos WHERE id = ?", [req.params.id]);

    if (!documento) {
      return res.status(404).json({ message: "Documento no encontrado" });
    }

    const version = await db.get(
      "SELECT * FROM documento_versiones WHERE id = ? AND documento_id = ?",
      [req.params.versionId, req.params.id]
    );

    if (!version) {
      return res.status(404).json({ message: "Version no encontrada" });
    }

    const restaurada = await crearVersion(documento, {
      nombre: version.nombre,
      nombreArchivo: version.nombre_archivo,
      rutaArchivo: version.ruta_archivo,
      tipoMime: version.tipo_mime,
      extension: version.extension,
      tamano: version.tamano,
      accion: "restauracion",
      motivo: req.body.motivo || `Restaurada desde ${version.version}`,
      creadoPor: req.user.id,
    });

    await db.run(
      `UPDATE documentos
       SET nombre = ?,
           nombre_archivo = ?,
           ruta_archivo = ?,
           tipo_mime = ?,
           extension = ?,
           tamano = ?,
           version = ?,
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        version.nombre,
        version.nombre_archivo,
        version.ruta_archivo,
        version.tipo_mime,
        version.extension,
        version.tamano,
        restaurada.version,
        req.params.id,
      ]
    );

    const actualizado = await db.get("SELECT * FROM documentos WHERE id = ?", [req.params.id]);
    await registrarTrazabilidad(req, {
      accion: "restaurar_version",
      entidadTipo: "documento",
      entidadId: actualizado.id,
      documentoId: actualizado.id,
      expedienteId: actualizado.expediente_id,
      metadata: {
        versionRestaurada: version.version,
        nuevaVersion: restaurada.version,
        motivo: req.body.motivo || null,
      },
    });

    res.json(mapDocumento(actualizado));
  } catch (err) {
    next(err);
  }
});

async function notificarCambioEstadoDocumento(req, documentoAnterior, documentoActual, estado, motivo) {
  if (estado !== "Autorizado" && estado !== "Rechazado") return;

  const tipo = estado === "Autorizado" ? "documento_aprobado" : "documento_rechazado";
  const accion = estado === "Autorizado" ? "ver_documento" : "subir_nueva_version";
  const mensaje =
    estado === "Autorizado"
      ? `El documento "${documentoActual.nombre}" fue autorizado.`
      : `El documento "${documentoActual.nombre}" fue rechazado.${motivo ? ` Motivo: ${motivo}` : ""}`;

  const destinos = new Set();
  if (documentoAnterior.creado_por && documentoAnterior.creado_por !== req.user.id) {
    destinos.add(documentoAnterior.creado_por);
  }

  if (estado === "Rechazado" && destinos.size === 0) {
    const abogados = await db.all("SELECT id FROM usuarios WHERE categoria = ?", ["Abogado"]);
    abogados.forEach((abogado) => destinos.add(abogado.id));
  }

  for (const usuarioDestinoId of destinos) {
    await crearNotificacion({
      usuarioDestinoId,
      usuarioOrigenId: req.user.id,
      tipo,
      documentoId: documentoActual.id,
      expedienteId: documentoActual.expediente_id,
      mensaje,
      accion,
      metadata: {
        estadoAnterior: documentoAnterior.estado,
        estadoNuevo: estado,
        motivo,
        version: documentoActual.version,
      },
    });
  }
}

module.exports = router;

