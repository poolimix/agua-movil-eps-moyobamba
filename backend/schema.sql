-- PostgreSQL Schema: EPS Moyobamba - Agua Móvil
CREATE TABLE IF NOT EXISTS beneficiarios (
  id SERIAL PRIMARY KEY,
  dni VARCHAR(20) UNIQUE NOT NULL,
  nombres_apellidos VARCHAR(255) NOT NULL,
  distrito VARCHAR(100) DEFAULT 'Moyobamba',
  sector_aahh VARCHAR(150),
  sector VARCHAR(100),
  num_vivienda VARCHAR(50),
  num_miembros INTEGER DEFAULT 1,
  mz VARCHAR(20),
  lt VARCHAR(20),
  calle_direccion VARCHAR(255),
  direccion VARCHAR(255),
  telefono VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS programaciones (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  zona VARCHAR(100) NOT NULL,
  estado VARCHAR(50) DEFAULT 'Activa'
);

CREATE TABLE IF NOT EXISTS entregas_agua (
  id SERIAL PRIMARY KEY,
  beneficiario_id INTEGER REFERENCES beneficiarios(id),
  programacion_id INTEGER REFERENCES programaciones(id),
  litros_entregados DECIMAL(10,2) NOT NULL,
  firma_base64 TEXT,
  latitud DECIMAL(10,8),
  longitud DECIMAL(11,8),
  fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sincronizado INTEGER DEFAULT 1
);
