const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const asegurarEsquema = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS colegios (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL,
            logo_url TEXT,
            plan VARCHAR(20) DEFAULT 'trial',
            activo BOOLEAN DEFAULT true,
            dias_prueba_restantes INTEGER DEFAULT 30,
            creado_en TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS configuracion (
            id SERIAL PRIMARY KEY,
            clave VARCHAR(100) UNIQUE NOT NULL,
            valor VARCHAR(255) NOT NULL,
            descripcion TEXT,
            actualizado_en TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query(`
        ALTER TABLE rutas
        ADD COLUMN IF NOT EXISTS colegio_id INTEGER REFERENCES colegios(id)
    `);

    await pool.query(`
        ALTER TABLE usuarios
        ADD COLUMN IF NOT EXISTS colegio_id INTEGER REFERENCES colegios(id)
    `);

    await pool.query(`
        ALTER TABLE alumnos
        ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8)
    `);

    await pool.query(`
        ALTER TABLE alumnos
        ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8)
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS alertas_configuracion (
            id SERIAL PRIMARY KEY,
            tipo VARCHAR(50) UNIQUE NOT NULL,
            activo BOOLEAN DEFAULT true,
            modo VARCHAR(20) NOT NULL DEFAULT 'mensual',
            titulo VARCHAR(150) NOT NULL,
            mensaje TEXT NOT NULL,
            hora_recogida VARCHAR(5) NOT NULL,
            hora_alerta VARCHAR(5) NOT NULL,
            dias_semana JSONB DEFAULT '[]'::jsonb,
            canal VARCHAR(20) DEFAULT 'push',
            actualizado_por VARCHAR(100),
            creado_en TIMESTAMP DEFAULT NOW(),
            actualizado_en TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS alertas_programadas (
            id SERIAL PRIMARY KEY,
            configuracion_id INTEGER REFERENCES alertas_configuracion(id) ON DELETE CASCADE,
            tipo VARCHAR(50) NOT NULL,
            titulo VARCHAR(150) NOT NULL,
            mensaje TEXT NOT NULL,
            fecha_programada TIMESTAMP NOT NULL,
            canal VARCHAR(20) DEFAULT 'push',
            activo BOOLEAN DEFAULT true,
            enviada BOOLEAN DEFAULT false,
            creado_en TIMESTAMP DEFAULT NOW(),
            actualizado_en TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query(`
        INSERT INTO configuracion (clave, valor, descripcion)
        VALUES
            ('llamadas_conductor', 'true', 'Permitir que padres llamen al conductor'),
            ('mostrar_numero_conductor', 'true', 'Mostrar numero del conductor a los padres'),
            ('mostrar_aviso_abordaje', 'false', 'Ocultar aviso de especificar donde abordar'),
            ('requiere_ubicacion_recogida', 'false', 'No requerir ubicacion diaria del punto de recogida'),
            ('mostrar_aviso_ausentes_ruta', 'false', 'Ocultar aviso persistente de alumnos ausentes'),
            ('mostrar_total_alumnos_historial_padre', 'false', 'Ocultar conteo de alumnos en historial del padre'),
            ('permitir_inscripcion_conductor', 'true', 'Permitir que el conductor inscriba alumnos'),
            ('mostrar_logo_colegio_inicio', 'true', 'Mostrar el logo del colegio en la pantalla de inicio')
        ON CONFLICT (clave) DO NOTHING
    `);
};

pool.connect()
    .then(async () => {
        console.log('PostgreSQL conectado');
        await asegurarEsquema();
    })
    .catch((err) => console.error('Error PostgreSQL:', err));

module.exports = pool;
