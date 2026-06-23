const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const router = express.Router();

// usuario fake (en proyecto real sería BD)
const user = {
  id: 1,
  username: "admin",
  password: bcrypt.hashSync("1234", 10),
  role: "admin"
};

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (username !== user.username) {
    return res.status(401).json({ message: "Usuario incorrecto" });
  }

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) {
    return res.status(401).json({ message: "Password incorrecto" });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({ token });
});

module.exports = router;