const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// Rate limiter (protecciÃ³n bÃ¡sica)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 1000),
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Routes
app.use("/auth", require("./routes/auth"));
app.use("/usuarios", require("./routes/usuarios"));
app.use("/dashboard", require("./routes/dashboard"));
app.use("/expedientes", require("./routes/expedientes"));
app.use("/documentos", require("./routes/documentos"));
app.use("/firmas", require("./routes/firmas"));
app.use("/notificaciones", require("./routes/notificaciones"));

app.use((err, _req, res, _next) => {
  res.status(400).json({ message: err.message || "Error en la solicitud" });
});

app.listen(process.env.PORT, "0.0.0.0", () => {
  console.log("API corriendo en puerto " + process.env.PORT);
});

