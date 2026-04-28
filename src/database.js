const { Pool } = require('pg');

// Configuración flexible para Railway (Interno vs Externo)
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

const poolConfig = {
    connectionString: process.env.DATABASE_URL,
    // Si estamos en Railway, preferimos usar las variables individuales para mayor estabilidad
    host: process.env.PGHOST || process.env.DB_HOST,
    user: process.env.PGUSER || process.env.DB_USER,
    password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
    database: process.env.PGDATABASE || process.env.DB_NAME,
    port: process.env.PGPORT || process.env.DB_PORT || 5432,
    
    // SSL es obligatorio para conexiones externas, pero opcional/diferente internamente en Railway
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
    
    max: 15, 
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000, // Reducido para fallar rápido y reintentar
};

// Limpiar valores undefined para que no sobrescriban el connectionString si no existen
if (!poolConfig.host) delete poolConfig.host;
if (!poolConfig.user) delete poolConfig.user;
if (!poolConfig.password) delete poolConfig.password;
if (!poolConfig.database) delete poolConfig.database;
if (!poolConfig.port) delete poolConfig.port;

const pool = new Pool(poolConfig);

const asegurarEsquema = async () => {
    console.log('[DB] Verificando esquema de tablas...');
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
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                rol VARCHAR(20) NOT NULL CHECK (rol IN ('padre', 'conductor', 'admin')),
                telefono VARCHAR(20),
                dui VARCHAR(20),
                licencia VARCHAR(50),
                placa VARCHAR(20),
                colegio_id INTEGER,
                activo BOOLEAN DEFAULT true,
                creado_en TIMESTAMP DEFAULT NOW()
            );
        `);

        // 2. Asegurar columnas y FKs
        await client.query(`
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS colegio_id INTEGER;
        `);

        // 3. Resto de tablas (simplificado para brevedad, pero manteniendo integridad)
        await client.query(`
            CREATE TABLE IF NOT EXISTS rutas (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                conductor_id INTEGER REFERENCES usuarios(id),
                colegio_id INTEGER,
                activa BOOLEAN DEFAULT true,
                creado_en TIMESTAMP DEFAULT NOW()
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
            CREATE TABLE IF NOT EXISTS configuracion (
                id SERIAL PRIMARY KEY,
                clave VARCHAR(100) UNIQUE NOT NULL,
                valor VARCHAR(255) NOT NULL
            );
        `);

        await client.query('COMMIT');
        console.log('[DB] Esquema verificado correctamente.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[DB] Error asegurando esquema:', error.message);
        throw error;
    } finally {
        client.release();
    }
};

const ready = (async () => {
    let retries = 5;
    while (retries > 0) {
        try {
            console.log(`[DB] Intentando conectar (reintentos: ${retries})...`);
            const client = await pool.connect();
            console.log('✅ PostgreSQL conectado');
            client.release();
            await asegurarEsquema();
            return;
        } catch (err) {
            retries -= 1;
            console.error(`❌ Error PostgreSQL: ${err.message}`);
            if (retries === 0) {
                console.error('Finalizando reintentos. El servidor podría no funcionar correctamente.');
                return;
            }
            await new Promise(res => setTimeout(res, 3000));
        }
    }
})();

pool.ready = ready;
module.exports = pool;
