const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const auth = require("../middleware/auth");
const apiKey = require("../middleware/apiKey");
const categoria = require("../middleware/roles");
const db = require("../db");

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
    id: row.id,
    nombre: row.nombre,
    nombreArchivo: row.nombre_archivo,
    tipoMime: row.tipo_mime,
    extension: row.extension,
    tamano: row.tamano,
    creadoPor: row.creado_por,
    creadoEn: row.creado_en,
    actualizadoEn: row.actualizado_en,
    abrirUrl: `/documentos/${row.id}/abrir`
  };
}

router.post("/", apiKey, auth, categoria("Juez"), upload.single("archivo"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Debes enviar un archivo en el campo 'archivo'" });
    }

    const nombre = req.body.nombre || req.file.originalname;
    const extension = path.extname(req.file.originalname).toLowerCase();

    const result = await db.run(
      `INSERT INTO documentos
        (nombre, nombre_archivo, ruta_archivo, tipo_mime, extension, tamano, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre,
        req.file.originalname,
        req.file.path,
        req.file.mimetype,
        extension,
        req.file.size,
        req.user.id
      ]
    );

    const documento = await db.get("SELECT * FROM documentos WHERE id = ?", [result.id]);
    res.status(201).json(mapDocumento(documento));
  } catch (err) {
    next(err);
  }
});

router.get("/", apiKey, auth, async (_req, res, next) => {
  try {
    const documentos = await db.all("SELECT * FROM documentos ORDER BY creado_en DESC");
    res.json(documentos.map(mapDocumento));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", apiKey, auth, async (req, res, next) => {
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

router.get("/:id/abrir", apiKey, auth, async (req, res, next) => {
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
    res.sendFile(path.resolve(documento.ruta_archivo));
  } catch (err) {
    next(err);
  }
});

router.put("/:id", apiKey, auth, categoria("Juez"), upload.single("archivo"), async (req, res, next) => {
  try {
    const documento = await db.get("SELECT * FROM documentos WHERE id = ?", [req.params.id]);

    if (!documento) {
      return res.status(404).json({ message: "Documento no encontrado" });
    }

    const nombre = req.body.nombre || documento.nombre;
    let archivo = {
      nombreArchivo: documento.nombre_archivo,
      rutaArchivo: documento.ruta_archivo,
      tipoMime: documento.tipo_mime,
      extension: documento.extension,
      tamano: documento.tamano
    };

    if (req.file) {
      if (fs.existsSync(documento.ruta_archivo)) {
        fs.unlinkSync(documento.ruta_archivo);
      }

      archivo = {
        nombreArchivo: req.file.originalname,
        rutaArchivo: req.file.path,
        tipoMime: req.file.mimetype,
        extension: path.extname(req.file.originalname).toLowerCase(),
        tamano: req.file.size
      };
    }

    await db.run(
      `UPDATE documentos
       SET nombre = ?,
           nombre_archivo = ?,
           ruta_archivo = ?,
           tipo_mime = ?,
           extension = ?,
           tamano = ?,
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        nombre,
        archivo.nombreArchivo,
        archivo.rutaArchivo,
        archivo.tipoMime,
        archivo.extension,
        archivo.tamano,
        req.params.id
      ]
    );

    const actualizado = await db.get("SELECT * FROM documentos WHERE id = ?", [req.params.id]);
    res.json(mapDocumento(actualizado));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
