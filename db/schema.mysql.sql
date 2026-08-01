CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  categoria VARCHAR(80) NOT NULL,
  nombre VARCHAR(180) NOT NULL DEFAULT '',
  cargo VARCHAR(180) NOT NULL DEFAULT '',
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expediente_id VARCHAR(120) NOT NULL DEFAULT 'GENERAL',
  nombre VARCHAR(255) NOT NULL,
  nombre_archivo VARCHAR(255) NOT NULL,
  ruta_archivo VARCHAR(500) NOT NULL,
  tipo_mime VARCHAR(180) NOT NULL,
  extension VARCHAR(20) NOT NULL,
  tamano BIGINT NOT NULL,
  version VARCHAR(30) NOT NULL DEFAULT 'v1.0',
  estado VARCHAR(80) NOT NULL DEFAULT 'Subido',
  rechazo_motivo TEXT NULL,
  creado_por INT NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_documentos_usuarios FOREIGN KEY (creado_por) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS expedientes (
  id VARCHAR(120) PRIMARY KEY,
  tipo VARCHAR(255) NOT NULL,
  estado VARCHAR(80) NOT NULL DEFAULT 'Activo',
  juzgado VARCHAR(255) NOT NULL DEFAULT '',
  fecha_inicio DATE NOT NULL DEFAULT (CURRENT_DATE),
  progreso DECIMAL(5,4) NOT NULL DEFAULT 0,
  descripcion TEXT NULL,
  creado_por INT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_expedientes_usuarios FOREIGN KEY (creado_por) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS participantes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expediente_id VARCHAR(120) NOT NULL,
  usuario_id INT NULL,
  nombre VARCHAR(180) NOT NULL,
  rol VARCHAR(120) NOT NULL,
  categoria VARCHAR(80) NULL,
  email VARCHAR(180) NULL,
  telefono VARCHAR(80) NULL,
  estado VARCHAR(80) NOT NULL DEFAULT 'Activo',
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_participantes_expedientes FOREIGN KEY (expediente_id) REFERENCES expedientes(id),
  CONSTRAINT fk_participantes_usuarios FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS documento_versiones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  documento_id INT NOT NULL,
  numero_version INT NOT NULL,
  version VARCHAR(30) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  nombre_archivo VARCHAR(255) NOT NULL,
  ruta_archivo VARCHAR(500) NOT NULL,
  tipo_mime VARCHAR(180) NOT NULL,
  extension VARCHAR(20) NOT NULL,
  tamano BIGINT NOT NULL,
  accion VARCHAR(80) NOT NULL,
  motivo TEXT NULL,
  creado_por INT NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_versiones_documentos FOREIGN KEY (documento_id) REFERENCES documentos(id),
  CONSTRAINT fk_versiones_usuarios FOREIGN KEY (creado_por) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS trazabilidad (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NULL,
  usuario_nombre VARCHAR(180) NULL,
  rol VARCHAR(80) NULL,
  accion VARCHAR(120) NOT NULL,
  entidad_tipo VARCHAR(80) NOT NULL,
  entidad_id VARCHAR(120) NULL,
  expediente_id VARCHAR(120) NULL,
  documento_id INT NULL,
  ip VARCHAR(80) NULL,
  dispositivo VARCHAR(255) NULL,
  metadata TEXT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_trazabilidad_usuarios FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_trazabilidad_documentos FOREIGN KEY (documento_id) REFERENCES documentos(id)
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_destino_id INT NOT NULL,
  usuario_origen_id INT NULL,
  tipo VARCHAR(80) NOT NULL,
  documento_id INT NULL,
  expediente_id VARCHAR(120) NULL,
  mensaje TEXT NOT NULL,
  accion VARCHAR(120) NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'No leida',
  metadata TEXT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  leido_en DATETIME NULL,
  CONSTRAINT fk_notificaciones_destino FOREIGN KEY (usuario_destino_id) REFERENCES usuarios(id),
  CONSTRAINT fk_notificaciones_origen FOREIGN KEY (usuario_origen_id) REFERENCES usuarios(id),
  CONSTRAINT fk_notificaciones_documentos FOREIGN KEY (documento_id) REFERENCES documentos(id)
);

CREATE TABLE IF NOT EXISTS solicitudes_firma (
  id INT AUTO_INCREMENT PRIMARY KEY,
  documento_id INT NULL,
  documento_nombre VARCHAR(255) NOT NULL,
  expediente_id VARCHAR(120) NOT NULL DEFAULT 'GENERAL',
  version VARCHAR(30) NOT NULL DEFAULT 'v1.0',
  solicitante_id INT NOT NULL,
  firmante_usuario_id INT NULL,
  firmante_categoria VARCHAR(80) NOT NULL,
  estado VARCHAR(80) NOT NULL DEFAULT 'Pendiente',
  firma_tipo VARCHAR(50) NULL,
  firma_valor TEXT NULL,
  firma_archivo VARCHAR(500) NULL,
  firmado_por INT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  firmado_en DATETIME NULL,
  CONSTRAINT fk_solicitudes_documentos FOREIGN KEY (documento_id) REFERENCES documentos(id),
  CONSTRAINT fk_solicitudes_solicitante FOREIGN KEY (solicitante_id) REFERENCES usuarios(id),
  CONSTRAINT fk_solicitudes_firmante FOREIGN KEY (firmante_usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_solicitudes_firmado_por FOREIGN KEY (firmado_por) REFERENCES usuarios(id)
);
