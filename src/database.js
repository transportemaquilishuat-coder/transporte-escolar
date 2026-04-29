const { Pool } = require('pg');

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
                 ON CONFLICT (email) DO NOTHING`,
                [admin.nombre, admin.email, passwordHash]
            );
        }

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
    while (retries > 0) {
        try {
            const client = await pool.connect();
            console.log('✅ PostgreSQL conectado');
            client.release();
            await asegurarEsquema();
            return;
        } catch (err) {
            retries -= 1;
            console.error(`❌ Error PostgreSQL (reintento ${5-retries}/5): ${err.message}`);
            if (retries === 0) break;
            await new Promise(res => setTimeout(res, 5000));
        }
    }
})();

pool.ready = ready;
module.exports = pool;
