import { pool } from './index';

export const migrateVales = async () => {
  console.log('🔄 Ejecutando migración: Tabla de Vales de Entrega y Multicanal...');

  await pool.query(`
    -- Agregar email a beneficiarios si no existe
    ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS email VARCHAR(255);

    -- Actualizar algunos correos de prueba para los beneficiarios existentes
    UPDATE beneficiarios SET email = 'vallessaavedrapa@gmail.com' WHERE id = 1 AND email IS NULL;
    UPDATE beneficiarios SET email = 'poolimix@gmail.com' WHERE id = 2 AND email IS NULL;
    UPDATE beneficiarios SET email = 'beneficiario.prueba@epsmoyobamba.gob.pe' WHERE id >= 3 AND email IS NULL;

    -- Crear tabla de vales_entrega
    CREATE TABLE IF NOT EXISTS vales_entrega (
      id SERIAL PRIMARY KEY,
      programacion_id INTEGER REFERENCES programaciones(id) ON DELETE CASCADE,
      beneficiario_id INTEGER REFERENCES beneficiarios(id) ON DELETE CASCADE,
      codigo_unico VARCHAR(50) UNIQUE NOT NULL,
      litros_sugeridos NUMERIC(10, 2) NOT NULL,
      qr_data TEXT NOT NULL,
      whatsapp_enviado BOOLEAN DEFAULT FALSE,
      sms_enviado BOOLEAN DEFAULT FALSE,
      correo_enviado BOOLEAN DEFAULT FALSE,
      fecha_despacho TIMESTAMP NULL,
      errores_notificacion JSONB DEFAULT '{}'::jsonb,
      estado VARCHAR(20) DEFAULT 'EMITIDO',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_vales_prog ON vales_entrega(programacion_id);
    CREATE INDEX IF NOT EXISTS idx_vales_benef ON vales_entrega(beneficiario_id);
  `);

  console.log('✅ Migración de vales_entrega completada exitosamente.');
};

if (require.main === module) {
  migrateVales()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en migración de vales:', err);
      process.exit(1);
    });
}
