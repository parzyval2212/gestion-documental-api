const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();
const mysql = require("mysql2/promise");
const { buildSeedUsers } = require("./seedUsers");
require("dotenv").config();

const dbClient = (process.env.DB_CLIENT || "sqlite").toLowerCase();
const seedUser = process.env.SEED_USER_USERNAME || "juez";
const seedPassword = process.env.SEED_USER_PASSWORD || "1234";

async function main() {
  if (dbClient === "mysql") {
    await initMysql();
  } else {
    await initSqlite();
  }
}

async function initSqlite() {
  const databasePath = path.resolve(process.env.DATABASE_PATH || "data/gestion_documental.db");
  const schemaPath = path.join(__dirname, "schema.sql");

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new sqlite3.Database(databasePath);

  const exec = (sql) => new Promise((resolve, reject) => db.exec(sql, (err) => (err ? reject(err) : resolve())));
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, (err) => (err ? reject(err) : resolve())));
  const all = (sql) => new Promise((resolve, reject) => db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows))));

  async function ensureColumn(table, column, definition) {
    const columns = await all(`PRAGMA table_info(${table})`);
    const exists = columns.some((item) => item.name === column);
    if (!exists) await run(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }

  await exec(fs.readFileSync(schemaPath, "utf8"));
  await ensureColumn("documentos", "expediente_id", "expediente_id TEXT NOT NULL DEFAULT 'GENERAL'");
  await ensureColumn("documentos", "version", "version TEXT NOT NULL DEFAULT 'v1.0'");
  await ensureColumn("documentos", "estado", "estado TEXT NOT NULL DEFAULT 'Subido'");
  await ensureColumn("documentos", "rechazo_motivo", "rechazo_motivo TEXT");
  await ensureColumn("solicitudes_firma", "firmante_usuario_id", "firmante_usuario_id INTEGER");
  await ensureColumn("usuarios", "nombre", "nombre TEXT NOT NULL DEFAULT ''");
  await ensureColumn("usuarios", "cargo", "cargo TEXT NOT NULL DEFAULT ''");

  for (const user of buildSeedUsers(seedUser, seedPassword)) {
    await run(
      `INSERT OR IGNORE INTO usuarios (username, password_hash, categoria, nombre, cargo)
       VALUES (?, ?, ?, ?, ?)`,
      [user.username, user.passwordHash, user.categoria, user.nombre, user.cargo]
    );
    await run(
      "UPDATE usuarios SET categoria = ?, nombre = ?, cargo = ? WHERE username = ?",
      [user.categoria, user.nombre, user.cargo, user.username]
    );
  }

  await backfillSqliteDocumentVersions(all, run);

  await new Promise((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())));
  console.log("Base de datos SQLite lista en " + databasePath);
}

async function initMysql() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || "mysql",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "dochub",
    password: process.env.MYSQL_PASSWORD || "dochub_password",
    database: process.env.MYSQL_DATABASE || "gestion_documental",
    waitForConnections: true,
    connectionLimit: 2,
  });

  const schema = fs.readFileSync(path.join(__dirname, "schema.mysql.sql"), "utf8");
  for (const statement of schema.split(";").map((item) => item.trim()).filter(Boolean)) {
    await pool.query(statement);
  }

  for (const user of buildSeedUsers(seedUser, seedPassword)) {
    await pool.query(
      `INSERT IGNORE INTO usuarios (username, password_hash, categoria, nombre, cargo)
       VALUES (?, ?, ?, ?, ?)`,
      [user.username, user.passwordHash, user.categoria, user.nombre, user.cargo]
    );
    await pool.query(
      "UPDATE usuarios SET categoria = ?, nombre = ?, cargo = ? WHERE username = ?",
      [user.categoria, user.nombre, user.cargo, user.username]
    );
  }
  await backfillMysqlDocumentVersions(pool);
  await pool.end();
  console.log("Base de datos MySQL lista en " + (process.env.MYSQL_HOST || "mysql"));
}

async function backfillSqliteDocumentVersions(all, run) {
  const docs = await all(
    `SELECT d.*
     FROM documentos d
     LEFT JOIN documento_versiones v ON v.documento_id = d.id
     WHERE v.id IS NULL`
  );

  for (const doc of docs) {
    await run(
      `INSERT INTO documento_versiones
        (documento_id, numero_version, version, nombre, nombre_archivo, ruta_archivo, tipo_mime, extension, tamano, accion, motivo, creado_por, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        doc.id,
        1,
        doc.version || "v1.0",
        doc.nombre,
        doc.nombre_archivo,
        doc.ruta_archivo,
        doc.tipo_mime,
        doc.extension,
        doc.tamano,
        "migracion_inicial",
        "Version inicial generada desde documento existente",
        doc.creado_por,
        doc.creado_en,
      ]
    );
  }
}

async function backfillMysqlDocumentVersions(pool) {
  const [docs] = await pool.query(
    `SELECT d.*
     FROM documentos d
     LEFT JOIN documento_versiones v ON v.documento_id = d.id
     WHERE v.id IS NULL`
  );

  for (const doc of docs) {
    await pool.query(
      `INSERT INTO documento_versiones
        (documento_id, numero_version, version, nombre, nombre_archivo, ruta_archivo, tipo_mime, extension, tamano, accion, motivo, creado_por, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        doc.id,
        1,
        doc.version || "v1.0",
        doc.nombre,
        doc.nombre_archivo,
        doc.ruta_archivo,
        doc.tipo_mime,
        doc.extension,
        doc.tamano,
        "migracion_inicial",
        "Version inicial generada desde documento existente",
        doc.creado_por,
        doc.creado_en,
      ]
    );
  }
}

main()
  .then(() => {
    console.log("Usuario inicial: " + seedUser);
  })
  .catch((err) => {
    console.error("Error inicializando la base de datos:", err.message);
    process.exit(1);
  });
