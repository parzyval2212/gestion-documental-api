CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  categoria TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  cargo TEXT NOT NULL DEFAULT '',
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expediente_id TEXT NOT NULL DEFAULT 'GENERAL',
  nombre TEXT NOT NULL,
  nombre_archivo TEXT NOT NULL,
  ruta_archivo TEXT NOT NULL,
  tipo_mime TEXT NOT NULL,
  extension TEXT NOT NULL,
  tamano INTEGER NOT NULL,
  version TEXT NOT NULL DEFAULT 'v1.0',
  estado TEXT NOT NULL DEFAULT 'Subido',
  rechazo_motivo TEXT,
  creado_por INTEGER NOT NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (creado_por) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS expedientes (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'Activo',
  juzgado TEXT NOT NULL DEFAULT '',
  fecha_inicio TEXT NOT NULL DEFAULT CURRENT_DATE,
  progreso REAL NOT NULL DEFAULT 0,
  descripcion TEXT,
  creado_por INTEGER,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (creado_por) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS participantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expediente_id TEXT NOT NULL,
  usuario_id INTEGER,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL,
  categoria TEXT,
  email TEXT,
  telefono TEXT,
  estado TEXT NOT NULL DEFAULT 'Activo',
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (expediente_id) REFERENCES expedientes(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS documento_versiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER NOT NULL,
  numero_version INTEGER NOT NULL,
  version TEXT NOT NULL,
  nombre TEXT NOT NULL,
  nombre_archivo TEXT NOT NULL,
  ruta_archivo TEXT NOT NULL,
  tipo_mime TEXT NOT NULL,
  extension TEXT NOT NULL,
  tamano INTEGER NOT NULL,
  accion TEXT NOT NULL,
  motivo TEXT,
  creado_por INTEGER NOT NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (documento_id) REFERENCES documentos(id),
  FOREIGN KEY (creado_por) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS trazabilidad (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  usuario_nombre TEXT,
  rol TEXT,
  accion TEXT NOT NULL,
  entidad_tipo TEXT NOT NULL,
  entidad_id TEXT,
  expediente_id TEXT,
  documento_id INTEGER,
  ip TEXT,
  dispositivo TEXT,
  metadata TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (documento_id) REFERENCES documentos(id)
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_destino_id INTEGER NOT NULL,
  usuario_origen_id INTEGER,
  tipo TEXT NOT NULL,
  documento_id INTEGER,
  expediente_id TEXT,
  mensaje TEXT NOT NULL,
  accion TEXT,
  estado TEXT NOT NULL DEFAULT 'No leida',
  metadata TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  leido_en TEXT,
  FOREIGN KEY (usuario_destino_id) REFERENCES usuarios(id),
  FOREIGN KEY (usuario_origen_id) REFERENCES usuarios(id),
  FOREIGN KEY (documento_id) REFERENCES documentos(id)
);

CREATE TABLE IF NOT EXISTS solicitudes_firma (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER,
  documento_nombre TEXT NOT NULL,
  expediente_id TEXT NOT NULL DEFAULT 'GENERAL',
  version TEXT NOT NULL DEFAULT 'v1.0',
  solicitante_id INTEGER NOT NULL,
  firmante_usuario_id INTEGER,
  firmante_categoria TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'Pendiente',
  firma_tipo TEXT,
  firma_valor TEXT,
  firma_archivo TEXT,
  firmado_por INTEGER,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  firmado_en TEXT,
  FOREIGN KEY (documento_id) REFERENCES documentos(id),
  FOREIGN KEY (solicitante_id) REFERENCES usuarios(id),
  FOREIGN KEY (firmante_usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (firmado_por) REFERENCES usuarios(id)
);
