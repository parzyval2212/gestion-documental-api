const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const db = require("../db");

const router = express.Router();

router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const user = await db.get(
      "SELECT id, username, password_hash, categoria FROM usuarios WHERE username = ?",
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

    res.json({
      token,
      usuario: {
        id: user.id,
        username: user.username,
        categoria: user.categoria
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
