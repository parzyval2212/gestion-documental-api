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

let sqliteDb = null;
let mysqlPool = null;

const initPromise = dbClient === "mysql" ? initMysql() : initSqlite();

async function initSqlite() {
  const databasePath = path.resolve(process.env.DATABASE_PATH || "data/gestion_documental.db");
  const schemaPath = path.join(__dirname, "schema.sql");

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  sqliteDb = new sqlite3.Database(databasePath);

  await sqliteExec(fs.readFileSync(schemaPath, "utf8"));
  await ensureSqliteColumn("documentos", "expediente_id", "expediente_id TEXT NOT NULL DEFAULT 'GENERAL'");
  await ensureSqliteColumn("documentos", "version", "version TEXT NOT NULL DEFAULT 'v1.0'");
  await ensureSqliteColumn("documentos", "estado", "estado TEXT NOT NULL DEFAULT 'Subido'");
  await ensureSqliteColumn("documentos", "rechazo_motivo", "rechazo_motivo TEXT");
  await ensureSqliteColumn("solicitudes_firma", "firmante_usuario_id", "firmante_usuario_id INTEGER");
  await ensureSqliteColumn("usuarios", "nombre", "nombre TEXT NOT NULL DEFAULT ''");
  await ensureSqliteColumn("usuarios", "cargo", "cargo TEXT NOT NULL DEFAULT ''");

  for (const user of buildSeedUsers(seedUser, seedPassword)) {
    await sqliteRun(
      `INSERT OR IGNORE INTO usuarios (username, password_hash, categoria, nombre, cargo)
       VALUES (?, ?, ?, ?, ?)`,
      [user.username, user.passwordHash, user.categoria, user.nombre, user.cargo]
    );
    await sqliteRun(
      "UPDATE usuarios SET categoria = ?, nombre = ?, cargo = ? WHERE username = ?",
      [user.categoria, user.nombre, user.cargo, user.username]
    );
  }

  await backfillSqliteDocumentVersions();
  await backfillSqliteExpedientes();
}

async function initMysql() {
  mysqlPool = mysql.createPool({
    host: process.env.MYSQL_HOST || "mysql",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "dochub",
    password: process.env.MYSQL_PASSWORD || "dochub_password",
    database: process.env.MYSQL_DATABASE || "gestion_documental",
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
  });

  const schema = fs.readFileSync(path.join(__dirname, "schema.mysql.sql"), "utf8");
  for (const statement of schema.split(";").map((item) => item.trim()).filter(Boolean)) {
    await mysqlPool.query(statement);
  }

  for (const user of buildSeedUsers(seedUser, seedPassword)) {
    await mysqlPool.query(
      `INSERT IGNORE INTO usuarios (username, password_hash, categoria, nombre, cargo)
       VALUES (?, ?, ?, ?, ?)`,
      [user.username, user.passwordHash, user.categoria, user.nombre, user.cargo]
    );
    await mysqlPool.query(
      "UPDATE usuarios SET categoria = ?, nombre = ?, cargo = ? WHERE username = ?",
      [user.categoria, user.nombre, user.cargo, user.username]
    );
  }

  await backfillMysqlDocumentVersions();
  await backfillMysqlExpedientes();
}

async function ensureSqliteColumn(table, column, definition) {
  const columns = await sqliteAll(`PRAGMA table_info(${table})`);
  const exists = columns.some((item) => item.name === column);

  if (!exists) {
    await sqliteRun(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

async function backfillSqliteDocumentVersions() {
  const docs = await sqliteAll(
    `SELECT d.*
     FROM documentos d
     LEFT JOIN documento_versiones v ON v.documento_id = d.id
     WHERE v.id IS NULL`
  );

  for (const doc of docs) {
    await sqliteRun(
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

async function backfillSqliteExpedientes() {
  const expedientes = await sqliteAll(
    `SELECT expediente_id, MIN(creado_por) AS creado_por, MIN(creado_en) AS creado_en
     FROM documentos
     WHERE expediente_id IS NOT NULL AND expediente_id <> ''
     GROUP BY expediente_id`
  );

  for (const expediente of expedientes) {
    await sqliteRun(
      `INSERT OR IGNORE INTO expedientes (id, tipo, estado, juzgado, fecha_inicio, progreso, descripcion, creado_por, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        expediente.expediente_id,
        expediente.expediente_id === "GENERAL" ? "Expediente general" : "Expediente documental",
        "Activo",
        "",
        String(expediente.creado_en || new Date().toISOString()).slice(0, 10),
        0,
        "Expediente generado automaticamente desde documentos existentes",
        expediente.creado_por,
        expediente.creado_en,
      ]
    );
  }
}

async function backfillMysqlDocumentVersions() {
  const [docs] = await mysqlPool.query(
    `SELECT d.*
     FROM documentos d
     LEFT JOIN documento_versiones v ON v.documento_id = d.id
     WHERE v.id IS NULL`
  );

  for (const doc of docs) {
    await mysqlPool.query(
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

async function backfillMysqlExpedientes() {
  const [expedientes] = await mysqlPool.query(
    `SELECT expediente_id, MIN(creado_por) AS creado_por, MIN(creado_en) AS creado_en
     FROM documentos
     WHERE expediente_id IS NOT NULL AND expediente_id <> ''
     GROUP BY expediente_id`
  );

  for (const expediente of expedientes) {
    await mysqlPool.query(
      `INSERT IGNORE INTO expedientes (id, tipo, estado, juzgado, fecha_inicio, progreso, descripcion, creado_por, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        expediente.expediente_id,
        expediente.expediente_id === "GENERAL" ? "Expediente general" : "Expediente documental",
        "Activo",
        "",
        String(expediente.creado_en || new Date().toISOString()).slice(0, 10),
        0,
        "Expediente generado automaticamente desde documentos existentes",
        expediente.creado_por,
        expediente.creado_en,
      ]
    );
  }
}

async function get(sql, params = []) {
  await initPromise;

  if (dbClient === "mysql") {
    const [rows] = await mysqlPool.query(toMysqlSql(sql), params);
    return rows[0];
  }

  return sqliteGet(sql, params);
}

async function all(sql, params = []) {
  await initPromise;

  if (dbClient === "mysql") {
    const [rows] = await mysqlPool.query(toMysqlSql(sql), params);
    return rows;
  }

  return sqliteAll(sql, params);
}

async function run(sql, params = []) {
  await initPromise;

  if (dbClient === "mysql") {
    const [result] = await mysqlPool.query(toMysqlSql(sql), params);
    return { id: result.insertId, changes: result.affectedRows };
  }

  return sqliteRun(sql, params);
}

function toMysqlSql(sql) {
  return sql.replace(/CURRENT_TIMESTAMP/g, "CURRENT_TIMESTAMP()");
}

function sqliteExec(sql) {
  return new Promise((resolve, reject) => {
    sqliteDb.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

function sqliteGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function sqliteAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function sqliteRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

module.exports = {
  get,
  all,
  run,
};
