const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const db = require("../db");
const { demoUsers } = require("../db/seedUsers");
const { registrarTrazabilidad } = require("../services/auditoria");
const auth = require("../middleware/auth");
const apiKey = require("../middleware/apiKey");
const { getRolePermissions } = require("../services/permisos");
const { requirePermission } = require("../middleware/permissions");

const router = express.Router();

router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const user = await db.get(
      "SELECT id, username, password_hash, categoria, nombre, cargo FROM usuarios WHERE username = ?",
      [username]
    );

    if (!user) {
      return res.status(401).json({ message: "Usuario incorrecto" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ message: "Password incorrecto" });
    }

    const token = jwt.sign(
      { id: user.id, categoria: user.categoria },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    await registrarTrazabilidad(req, {
      usuario: user,
      accion: "login",
      entidadTipo: "usuario",
      entidadId: user.id,
      metadata: { username: user.username },
    });

    res.json({
      token,
      usuario: {
        id: user.id,
        username: user.username,
        categoria: user.categoria,
        nombre: user.nombre,
        cargo: user.cargo,
        permisos: getRolePermissions(user.categoria),
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me", apiKey, auth, requirePermission("auth.me"), (req, res) => {
  res.json({
    usuario: {
      id: req.user.id,
      username: req.user.username,
      categoria: req.user.categoria,
      nombre: req.user.nombre,
      cargo: req.user.cargo,
      permisos: getRolePermissions(req.user.categoria),
    },
  });
});

router.post("/logout", apiKey, auth, requirePermission("auth.logout"), async (req, res, next) => {
  try {
    await registrarTrazabilidad(req, {
      accion: "logout",
      entidadTipo: "usuario",
      entidadId: req.user.id,
      metadata: { username: req.user.username },
    });

    res.json({ message: "Sesion cerrada" });
  } catch (err) {
    next(err);
  }
});

router.get("/demo-users", (_req, res) => {
  res.json(
    demoUsers.map((user) => ({
      username: user.username,
      password: user.password,
      categoria: user.categoria,
      nombre: user.nombre,
      cargo: user.cargo,
      permisos: getRolePermissions(user.categoria),
    }))
  );
});

module.exports = router;
