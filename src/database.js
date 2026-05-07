const { Pool } = require('pg');
require('dotenv').config();

// Configuración flexible para Railway
// Priorizamos variables individuales que Railway inyecta automáticamente
const poolConfig = {
    host: process.env.PGHOST || process.env.DB_HOST,
    user: process.env.PGUSER || process.env.DB_USER,
    password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
    database: process.env.PGDATABASE || process.env.DB_NAME,
    port: process.env.PGPORT || process.env.DB_PORT || 5432,
    connectionString: process.env.DATABASE_URL,
    
    // SSL: En Railway interno no suele ser necesario. En externo sí.
    // Si hay PGHOST y no es localhost, probablemente es interno de Railway.
    ssl: (process.env.PGHOST && !process.env.PGHOST.includes('localhost') && !process.env.PGHOST.includes('proxy.rlwy.net')) 
        ? false 
        : { rejectUnauthorized: false },
    
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
};

// Si estamos conectando localmente a una DB externa, forzamos SSL
if (poolConfig.connectionString && poolConfig.connectionString.includes('proxy.rlwy.net')) {
    poolConfig.ssl = { rejectUnauthorized: false };
}

// Limpiar valores vacíos o sospechosos (localhost por defecto de pg)
if (!poolConfig.host || poolConfig.host === 'localhost') delete poolConfig.host;
if (!poolConfig.user) delete poolConfig.user;
if (!poolConfig.password) delete poolConfig.password;
if (!poolConfig.database) delete poolConfig.database;
if (!poolConfig.port) delete poolConfig.port;

// Si NO hay variables individuales, node-postgres usará connectionString automáticamente.
// Si HAY variables individuales, node-postgres las prefiere.
// Para Railway Externo, forzamos SSL.
if (poolConfig.connectionString && (poolConfig.connectionString.includes('rlwy.net') || poolConfig.connectionString.includes('railway'))) {
    poolConfig.ssl = { rejectUnauthorized: false };
}

console.log('[DB] Configurando Pool con:', {
    host: poolConfig.host || 'Usando connectionString',
    port: poolConfig.port || 'Usando connectionString',
    ssl: !!poolConfig.ssl
});

const pool = new Pool(poolConfig);

const asegurarEsquema = async () => {
    console.log('[DB] Verificando esquema completo...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Tablas fundamentales
        await client.query(`
            CREATE TABLE IF NOT EXISTS colegios (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                logo_url TEXT,
                plan VARCHAR(20) DEFAULT 'trial',
                activo BOOLEAN DEFAULT true,
                dias_prueba_restantes INTEGER DEFAULT 30,
                admin_id INTEGER,
                creado_en TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                rol VARCHAR(20) NOT NULL CHECK (rol IN ('padre', 'conductor', 'admin')),
                colegio_id INTEGER,
                activo BOOLEAN DEFAULT true,
                creado_en TIMESTAMP DEFAULT NOW()
            );
        `);

        // 2. Asegurar columnas en usuarios
        await client.query(`
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(20);
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dui VARCHAR(20);
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS licencia VARCHAR(50);
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS placa VARCHAR(20);
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS colegio_id INTEGER;
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fecha_inicio_servicio DATE;
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fecha_fin_servicio DATE;
            ALTER TABLE colegios ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8);
            ALTER TABLE colegios ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8);
        `);

        // 3. Tablas de negocio
        await client.query(`
            CREATE TABLE IF NOT EXISTS rutas (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                conductor_id INTEGER REFERENCES usuarios(id),
                colegio_id INTEGER REFERENCES colegios(id),
                activa BOOLEAN DEFAULT true,
                creado_en TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS alumnos (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                grado VARCHAR(50),
                ruta_id INTEGER REFERENCES rutas(id),
                padre_id INTEGER REFERENCES usuarios(id),
                parada VARCHAR(150),
                latitude DECIMAL(10,8),
                longitude DECIMAL(11,8),
                orden INTEGER,
                activo BOOLEAN DEFAULT true,
                creado_en TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS ausencias (
                id SERIAL PRIMARY KEY,
                alumno_id INTEGER REFERENCES alumnos(id),
                padre_id INTEGER REFERENCES usuarios(id),
                motivo TEXT,
                fecha DATE DEFAULT CURRENT_DATE,
                hora TIME DEFAULT CURRENT_TIME,
                creado_en TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS eventos_ruta (
                id SERIAL PRIMARY KEY,
                ruta_id INTEGER REFERENCES rutas(id),
                conductor_id INTEGER REFERENCES usuarios(id),
                tipo VARCHAR(50),
                descripcion TEXT,
                latitud DECIMAL(10,8),
                longitud DECIMAL(11,8),
                creado_en TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS pagos (
                id SERIAL PRIMARY KEY,
                padre_id INTEGER REFERENCES usuarios(id),
                monto DECIMAL(10,2),
                mes VARCHAR(20),
                estado VARCHAR(20) DEFAULT 'pendiente',
                transaccion_id VARCHAR(100),
                metodo_pago VARCHAR(50),
                creado_en TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS tokens_push (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id),
                token VARCHAR(255) NOT NULL,
                plataforma VARCHAR(10),
                activo BOOLEAN DEFAULT true,
                creado_en TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS puntos_ruta (
                id SERIAL PRIMARY KEY,
                ruta_id INTEGER REFERENCES rutas(id),
                alumno_id INTEGER REFERENCES alumnos(id),
                tipo VARCHAR(20) DEFAULT 'recogida',
                latitud DECIMAL(10,8) NOT NULL,
                longitud DECIMAL(11,8) NOT NULL,
                orden INTEGER NOT NULL,
                nombre_parada VARCHAR(100),
                creado_en TIMESTAMP DEFAULT NOW()
            );
        `);

        // 4. Tablas de vinculación y códigos
        await client.query(`
            CREATE TABLE IF NOT EXISTS codigos_invitacion (
                id SERIAL PRIMARY KEY,
                codigo VARCHAR(20) UNIQUE NOT NULL,
                tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('colegio_admin', 'colegio_conductor', 'conductor_padre')),
                entidad_id INTEGER,
                creado_por INTEGER NOT NULL,
                usado_por INTEGER REFERENCES usuarios(id),
                usado_en TIMESTAMP,
                max_usos INTEGER DEFAULT 1,
                usos_actuales INTEGER DEFAULT 0,
                activo BOOLEAN DEFAULT true,
                expira_en TIMESTAMP,
                creado_en TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS vinculaciones (
                id SERIAL PRIMARY KEY,
                tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('colegio_admin', 'colegio_conductor', 'conductor_padre')),
                entidad_id INTEGER NOT NULL,
                vinculado_por INTEGER NOT NULL,
                colegio_id INTEGER REFERENCES colegios(id),
                conductor_id INTEGER REFERENCES usuarios(id),
                codigo_usado VARCHAR(20),
                estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'pendiente', 'expirado', 'rechazado', 'inactivo')),
                creado_en TIMESTAMP DEFAULT NOW(),
                actualizado_en TIMESTAMP DEFAULT NOW()
            );
        `);

        // 5. Configuración y Super Admin
        await client.query(`
            CREATE TABLE IF NOT EXISTS super_admins (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                creado_en TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS configuracion (
                id SERIAL PRIMARY KEY,
                clave VARCHAR(100) UNIQUE NOT NULL,
                valor VARCHAR(255) NOT NULL,
                descripcion TEXT,
                actualizado_en TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS anuncios_voz (
                id SERIAL PRIMARY KEY,
                colegio_id INTEGER REFERENCES colegios(id),
                titulo VARCHAR(100) NOT NULL,
                mensaje TEXT NOT NULL,
                activo BOOLEAN DEFAULT true,
                orden INTEGER DEFAULT 1,
                creado_por VARCHAR(50) DEFAULT 'superadmin',
                creado_en TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS alertas_configuracion (
                id SERIAL PRIMARY KEY,
                tipo VARCHAR(50) UNIQUE NOT NULL,
                activo BOOLEAN DEFAULT true,
                modo VARCHAR(20) NOT NULL DEFAULT 'mensual',
                titulo VARCHAR(150) NOT NULL,
                mensaje TEXT NOT NULL,
                mensajes_diarios JSONB DEFAULT '[]'::jsonb,
                hora_recogida VARCHAR(5) NOT NULL,
                hora_alerta VARCHAR(5) NOT NULL,
                dias_semana JSONB DEFAULT '[]'::jsonb,
                canal VARCHAR(20) DEFAULT 'push',
                actualizado_por VARCHAR(100),
                creado_en TIMESTAMP DEFAULT NOW(),
                actualizado_en TIMESTAMP DEFAULT NOW()
            );
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
            );
            CREATE TABLE IF NOT EXISTS avisos_informativos (
                id SERIAL PRIMARY KEY,
                colegio_id INTEGER REFERENCES colegios(id),
                titulo VARCHAR(150) NOT NULL,
                contenido TEXT NOT NULL,
                tipo VARCHAR(50) DEFAULT 'politica_comunicacion',
                activo BOOLEAN DEFAULT true,
                creado_en TIMESTAMP DEFAULT NOW(),
                actualizado_en TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS alumno_padres (
                id SERIAL PRIMARY KEY,
                alumno_id INTEGER REFERENCES alumnos(id) ON DELETE CASCADE,
                padre_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
                rol VARCHAR(50) DEFAULT 'principal',
                creado_en TIMESTAMP DEFAULT NOW(),
                UNIQUE(alumno_id, padre_id)
            );
            CREATE TABLE IF NOT EXISTS programacion_rutas (
                id SERIAL PRIMARY KEY,
                alumno_id INTEGER REFERENCES alumnos(id) ON DELETE CASCADE,
                fecha DATE NOT NULL,
                ruta_id INTEGER REFERENCES rutas(id) ON DELETE SET NULL,
                parada VARCHAR(150),
                latitude DECIMAL(10,8),
                longitude DECIMAL(11,8),
                tipo VARCHAR(20) DEFAULT 'ambos',
                nota TEXT,
                creado_por INTEGER REFERENCES usuarios(id),
                creado_en TIMESTAMP DEFAULT NOW(),
                UNIQUE(alumno_id, fecha, tipo)
            );
        `);

        await client.query(`
            ALTER TABLE alertas_configuracion
            ADD COLUMN IF NOT EXISTS mensajes_diarios JSONB DEFAULT '[]'::jsonb;

            ALTER TABLE puntos_ruta ADD COLUMN IF NOT EXISTS alumno_id INTEGER REFERENCES alumnos(id);
            ALTER TABLE puntos_ruta ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'recogida';

            CREATE UNIQUE INDEX IF NOT EXISTS idx_puntos_ruta_alumno_tipo
            ON puntos_ruta (alumno_id, tipo)
            WHERE alumno_id IS NOT NULL;

            ALTER TABLE pagos ADD COLUMN IF NOT EXISTS transaccion_id VARCHAR(100);
            ALTER TABLE pagos ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(50);

            -- Actualizar constraints de tipos de vinculación
            ALTER TABLE codigos_invitacion DROP CONSTRAINT IF EXISTS codigos_invitacion_tipo_check;
            ALTER TABLE codigos_invitacion ADD CONSTRAINT codigos_invitacion_tipo_check CHECK (tipo IN ('colegio_admin', 'colegio_conductor', 'conductor_padre', 'padre_compartido'));

            ALTER TABLE vinculaciones DROP CONSTRAINT IF EXISTS vinculaciones_tipo_check;
            ALTER TABLE vinculaciones ADD CONSTRAINT vinculaciones_tipo_check CHECK (tipo IN ('colegio_admin', 'colegio_conductor', 'conductor_padre', 'padre_compartido'));

            UPDATE colegios
            SET admin_id = NULL
            WHERE admin_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM usuarios u WHERE u.id = colegios.admin_id
              );


INSERT INTO alumno_padres (alumno_id, padre_id, rol)
SELECT id, padre_id, 'principal'
FROM alumnos
WHERE padre_id IS NOT NULL
ON CONFLICT (alumno_id, padre_id) DO NOTHING;

DO $$
BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.table_constraints
                    WHERE constraint_name = 'fk_colegios_admin'
                      AND table_name = 'colegios'
                ) THEN
                    ALTER TABLE colegios
                    ADD CONSTRAINT fk_colegios_admin
                    FOREIGN KEY (admin_id) REFERENCES usuarios(id);
                END IF;
            END $$;
        `);

        await client.query('COMMIT');
        
        // 6. Datos semilla (Super Admins Oficiales)
        const superAdminsOficiales = [
            { nombre: 'Daniel Guzmán (Principal)', email: 'danielguzman_13@hotmail.com' },
            { nombre: 'Daniel Guzmán (Respaldo)', email: '13.guzman@gmail.com' }
        ];

        const passwordHash = '$2b$10$RfznvLvXhKnnZ.HwIRfetece9vvk0g8GJtSItvp6/wTLqM7yoPk8G'; // Pruebas2026!

        for (const admin of superAdminsOficiales) {
            await pool.query(
                `INSERT INTO super_admins (nombre, email, password) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (email)
                 DO UPDATE SET nombre = EXCLUDED.nombre, password = EXCLUDED.password`,
                [admin.nombre, admin.email, passwordHash]
            );
        }

        await pool.query(
            `INSERT INTO super_admins (nombre, email, password)
             VALUES ($1, $2, $3)
             ON CONFLICT (email)
             DO UPDATE SET nombre = EXCLUDED.nombre, password = EXCLUDED.password`,
            ['Paula Superadmin', 'superadmin.pruebas@transporte.local', passwordHash]
        );

        await pool.query(`
            INSERT INTO configuracion (clave, valor, descripcion)
            VALUES
                ('llamadas_conductor', 'true', 'Permitir que padres llamen al conductor'),
                ('mostrar_numero_conductor', 'true', 'Mostrar numero del conductor a los padres'),
                ('periodo_prueba_dias', '30', 'Dias de periodo de prueba gratuito'),
                ('codigo_expiracion_dias', '7', 'Dias de validez de codigos de invitacion')
            ON CONFLICT (clave) DO NOTHING
        `);

        await pool.query(`
            INSERT INTO alertas_configuracion
                (tipo, activo, modo, titulo, mensaje, hora_recogida, hora_alerta, dias_semana, canal, actualizado_por)
            VALUES
                (
                    'recogida_5min',
                    true,
                    'mensual',
                    'Recogida en 5 minutos',
                    'El transporte escolar llegara en 5 minutos al punto de recogida.',
                    '06:45',
                    '06:40',
                    '[1,2,3,4,5]'::jsonb,
                    'push',
                    'setup'
                )
            ON CONFLICT (tipo) DO NOTHING
        `);

        await pool.query(`
            INSERT INTO avisos_informativos (titulo, contenido, tipo)
            VALUES (
                'Política de Comunicación',
                'Bienvenido al panel informativo. Aquí podrá gestionar la comunicación con los padres y conductores. Recuerde seguir nuestras políticas de privacidad.',
                'politica_comunicacion'
            ) ON CONFLICT DO NOTHING
        `);

        console.log('[DB] Super Admins oficiales verificados/creados.');
        console.log('[DB] Esquema verificado completamente.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[DB] Error crítico en esquema:', error.message);
        throw error;
    } finally {
        client.release();
    }
};

const ready = (async () => {
    let retries = 5;
    let lastError;
    while (retries > 0) {
        try {
            const client = await pool.connect();
            console.log('✅ PostgreSQL conectado');
            client.release();
            await asegurarEsquema();
            return;
        } catch (err) {
            lastError = err;
            retries -= 1;
            console.error(`❌ Error PostgreSQL (reintento ${5-retries}/5): ${err.message}`);
            if (retries === 0) throw lastError;
            await new Promise(res => setTimeout(res, 5000));
        }
    }
})();

pool.ready = ready;
module.exports = pool;
