const express = require("express");
const auth = require("../middleware/auth");
const apiKey = require("../middleware/apiKey");
const roles = require("../middleware/roles");

const router = express.Router();

let documentos = [];

// crear documento (solo admin)
router.post("/", apiKey, auth, roles("admin"), (req, res) => {
  const doc = {
    id: documentos.length + 1,
    nombre: req.body.nombre
  };

  documentos.push(doc);
  res.json(doc);
});

// ver documentos (user o admin)
router.get("/", apiKey, auth, (req, res) => {
  res.json(documentos);
});

module.exports = router;