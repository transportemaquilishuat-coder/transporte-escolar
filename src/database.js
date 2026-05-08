const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = {
    host: process.env.PGHOST || process.env.DB_HOST,
    user: process.env.PGUSER || process.env.DB_USER,
    password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
    database: process.env.PGDATABASE || process.env.DB_NAME,
    port: process.env.PGPORT || process.env.DB_PORT || 5432,
    connectionString: process.env.DATABASE_URL,
    ssl: (process.env.DATABASE_URL || '').includes('railway') || (process.env.PGHOST && !process.env.PGHOST.includes('localhost'))
        ? { rejectUnauthorized: false }
        : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
};

// Limpiar valores vacíos para que pg no intente usarlos si no son válidos
if (!poolConfig.host || poolConfig.host === 'localhost') delete poolConfig.host;
if (!poolConfig.user) delete poolConfig.user;
if (!poolConfig.password) delete poolConfig.password;
if (!poolConfig.database) delete poolConfig.database;
if (!poolConfig.port) delete poolConfig.port;

const pool = new Pool(poolConfig);

const asegurarEsquema = async () => {
    console.log('[DB] Iniciando verificación de esquema...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Tablas base
        await client.query(`CREATE TABLE IF NOT EXISTS colegios (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL,
            logo_url TEXT,
            plan VARCHAR(20) DEFAULT 'trial',
            activo BOOLEAN DEFAULT true,
            dias_prueba_restantes INTEGER DEFAULT 30,
            admin_id INTEGER,
            creado_en TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            rol VARCHAR(20) NOT NULL,
            colegio_id INTEGER,
            activo BOOLEAN DEFAULT true,
            creado_en TIMESTAMP DEFAULT NOW()
        )`);

        // 2. Columnas adicionales
        const addColumns = [
            'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(20)',
            'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dui VARCHAR(20)',
            'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS licencia VARCHAR(50)',
            'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS placa VARCHAR(20)',
            'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fecha_inicio_servicio DATE',
            'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fecha_fin_servicio DATE',
            'ALTER TABLE colegios ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8)',
            'ALTER TABLE colegios ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8)'
        ];
        for (const sql of addColumns) {
            await client.query(sql).catch(e => console.log(`[DB] Nota: ${e.message}`));
        }

        // 3. Tablas de negocio
        await client.query(`CREATE TABLE IF NOT EXISTS rutas (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL,
            conductor_id INTEGER REFERENCES usuarios(id),
            colegio_id INTEGER REFERENCES colegios(id),
            activa BOOLEAN DEFAULT true,
            creado_en TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS alumnos (
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
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS ausencias (
            id SERIAL PRIMARY KEY,
            alumno_id INTEGER REFERENCES alumnos(id),
            padre_id INTEGER REFERENCES usuarios(id),
            motivo TEXT,
            fecha DATE DEFAULT CURRENT_DATE,
            hora TIME DEFAULT CURRENT_TIME,
            creado_en TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS pagos (
            id SERIAL PRIMARY KEY,
            padre_id INTEGER REFERENCES usuarios(id),
            monto DECIMAL(10,2),
            mes VARCHAR(20),
            estado VARCHAR(20) DEFAULT 'pendiente',
            transaccion_id VARCHAR(100),
            metodo_pago VARCHAR(50),
            creado_en TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS codigos_invitacion (
            id SERIAL PRIMARY KEY,
            codigo VARCHAR(20) UNIQUE NOT NULL,
            tipo VARCHAR(20) NOT NULL,
            entidad_id INTEGER,
            creado_por INTEGER NOT NULL,
            usado_por INTEGER REFERENCES usuarios(id),
            usado_en TIMESTAMP,
            max_usos INTEGER DEFAULT 1,
            usos_actuales INTEGER DEFAULT 0,
            activo BOOLEAN DEFAULT true,
            expira_en TIMESTAMP,
            creado_en TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS vinculaciones (
            id SERIAL PRIMARY KEY,
            tipo VARCHAR(30) NOT NULL,
            entidad_id INTEGER NOT NULL,
            vinculado_por INTEGER NOT NULL,
            colegio_id INTEGER REFERENCES colegios(id),
            conductor_id INTEGER REFERENCES usuarios(id),
            codigo_usado VARCHAR(20),
            estado VARCHAR(20) DEFAULT 'activo',
            creado_en TIMESTAMP DEFAULT NOW(),
            actualizado_en TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS super_admins (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            creado_en TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS configuracion (
            id SERIAL PRIMARY KEY,
            clave VARCHAR(100) UNIQUE NOT NULL,
            valor VARCHAR(255) NOT NULL,
            descripcion TEXT,
            actualizado_en TIMESTAMP DEFAULT NOW()
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS alertas_configuracion (
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
        )`);

        // 4. Asegurar restricciones y tipos
        await client.query("ALTER TABLE codigos_invitacion DROP CONSTRAINT IF EXISTS codigos_invitacion_tipo_check");
        await client.query("ALTER TABLE codigos_invitacion ADD CONSTRAINT codigos_invitacion_tipo_check CHECK (tipo IN ('colegio_admin', 'colegio_conductor', 'conductor_padre', 'padre_compartido'))");

        await client.query("ALTER TABLE vinculaciones DROP CONSTRAINT IF EXISTS vinculaciones_tipo_check");
        await client.query("ALTER TABLE vinculaciones ADD CONSTRAINT vinculaciones_tipo_check CHECK (tipo IN ('colegio_admin', 'colegio_conductor', 'conductor_padre', 'padre_compartido'))");

        // Foreign Key circular colegio -> admin (usuario)
        try {
            await client.query(`ALTER TABLE colegios ADD CONSTRAINT fk_colegios_admin FOREIGN KEY (admin_id) REFERENCES usuarios(id)`);
        } catch (e) {
            // Ya existe o no se pudo crear
        }

        await client.query('COMMIT');
        
        // 5. Semillas
        const pass = '$2b$10$RfznvLvXhKnnZ.HwIRfetece9vvk0g8GJtSItvp6/wTLqM7yoPk8G'; // Pruebas2026!
        
        await client.query(`INSERT INTO super_admins (nombre, email, password) 
            VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password`,
            ['Daniel Guzmán', 'danielguzman_13@hotmail.com', pass]);

        await client.query(`INSERT INTO super_admins (nombre, email, password) 
            VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password`,
            ['Paula Superadmin', 'superadmin.pruebas@transporte.local', pass]);

        await client.query(`INSERT INTO configuracion (clave, valor, descripcion)
            VALUES ('llamadas_conductor', 'true', 'Permitir llamadas') ON CONFLICT (clave) DO NOTHING`);

        console.log('[DB] Esquema verificado con éxito.');
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('[DB] Error en esquema:', error.message);
        throw error;
    } finally {
        if (client) client.release();
    }
};

const ready = (async () => {
    try {
        await asegurarEsquema();
        console.log('✅ Base de datos lista');
    } catch (err) {
        console.error('❌ Error fatal iniciando DB:', err.message);
        // No salimos aquí para permitir que la app intente reconectar luego si es necesario
    }
})();

pool.ready = ready;
module.exports = pool;
