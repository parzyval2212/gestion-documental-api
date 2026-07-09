const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();
require("dotenv").config();

const databasePath = path.resolve(process.env.DATABASE_PATH || "data/gestion_documental.db");
const schemaPath = path.join(__dirname, "schema.sql");

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new sqlite3.Database(databasePath);
const schema = fs.readFileSync(schemaPath, "utf8");
const passwordHash = bcrypt.hashSync(process.env.SEED_USER_PASSWORD || "1234", 10);

db.serialize(() => {
  db.exec(schema);
  db.run(
    `INSERT OR IGNORE INTO usuarios (username, password_hash, categoria)
     VALUES (?, ?, ?)`,
    [process.env.SEED_USER_USERNAME || "juez", passwordHash, "Juez"]
  );
});

db.close((err) => {
  if (err) {
    console.error("Error inicializando la base de datos:", err.message);
    process.exit(1);
  }

  console.log("Base de datos lista en " + databasePath);
  console.log("Usuario inicial: " + (process.env.SEED_USER_USERNAME || "juez"));
});
