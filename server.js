const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// Rate limiter (protección básica)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

app.use(limiter);

// Routes
app.use("/auth", require("./routes/auth"));
app.use("/documentos", require("./routes/documentos"));

app.listen(process.env.PORT, () => {
  console.log("API corriendo en puerto " + process.env.PORT);
});