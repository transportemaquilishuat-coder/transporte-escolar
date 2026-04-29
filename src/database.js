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

// Limpiar valores vacíos
if (!poolConfig.host) delete poolConfig.host;
if (!poolConfig.user) delete poolConfig.user;
if (!poolConfig.password) delete poolConfig.password;
if (!poolConfig.database) delete poolConfig.database;
if (!poolConfig.port) delete poolConfig.port;

const pool = new Pool(poolConfig);

const asegurarEsquema = async () => {
    console.log('[DB] Verificando esquema...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Tablas básicas
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

        // Columnas necesarias
        await client.query(`
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(20);
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dui VARCHAR(20);
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS licencia VARCHAR(50);
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS placa VARCHAR(20);
        `);

        // Otras tablas esenciales
        await client.query(`
            CREATE TABLE IF NOT EXISTS rutas (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                conductor_id INTEGER REFERENCES usuarios(id),
                colegio_id INTEGER,
                activa BOOLEAN DEFAULT true
            );
            CREATE TABLE IF NOT EXISTS alumnos (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                padre_id INTEGER REFERENCES usuarios(id),
                ruta_id INTEGER REFERENCES rutas(id),
                activo BOOLEAN DEFAULT true
            );
            CREATE TABLE IF NOT EXISTS super_admins (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL
            );
        `);

        await client.query('COMMIT');
        console.log('[DB] Esquema verificado.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[DB] Error en esquema:', error.message);
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
