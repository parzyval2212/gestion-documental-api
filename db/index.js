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
const seedPasswordHash = bcrypt.hashSync(process.env.SEED_USER_PASSWORD || "1234", 10);

db.serialize(() => {
  db.exec(schema);
  db.run(
    `INSERT OR IGNORE INTO usuarios (username, password_hash, categoria)
     VALUES (?, ?, ?)`,
    [process.env.SEED_USER_USERNAME || "juez", seedPasswordHash, "Juez"]
  );
});

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

module.exports = {
  db,
  get,
  all,
  run
};
