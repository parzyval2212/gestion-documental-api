const jwt = require("jsonwebtoken");
const db = require("../db");

module.exports = async (req, res, next) => {
  const token = req.headers["authorization"] || (req.query.token ? `Bearer ${req.query.token}` : null);

  if (!token) {
    return res.status(401).json({ message: "No token" });
  }

  try {
    const decoded = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET);
    const user = await db.get(
      "SELECT id, username, categoria, nombre, cargo FROM usuarios WHERE id = ?",
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({ message: "Usuario no encontrado" });
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Token invalido" });
  }
};
