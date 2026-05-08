const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const asegurarEsquema = async () => {
    console.log('[DB] >>> VERSIÓN 6 - MÁXIMA SIMPLICIDAD - START <<<');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Comandos SQL ultra-simples, uno por uno, sin parámetros complejos
        const queries = [
            "CREATE TABLE IF NOT EXISTS colegios (id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, logo_url TEXT, plan TEXT DEFAULT 'trial', activo BOOLEAN DEFAULT true, admin_id INTEGER, creado_en TIMESTAMP DEFAULT NOW())",
            "CREATE TABLE IF NOT EXISTS usuarios (id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, rol TEXT NOT NULL, colegio_id INTEGER, activo BOOLEAN DEFAULT true, creado_en TIMESTAMP DEFAULT NOW())",
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono TEXT",
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dui TEXT",
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS licencia TEXT",
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS placa TEXT",
            "CREATE TABLE IF NOT EXISTS rutas (id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, conductor_id INTEGER REFERENCES usuarios(id), colegio_id INTEGER REFERENCES colegios(id), activa BOOLEAN DEFAULT true, creado_en TIMESTAMP DEFAULT NOW())",
            "CREATE TABLE IF NOT EXISTS alumnos (id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, grado TEXT, ruta_id INTEGER REFERENCES rutas(id), padre_id INTEGER REFERENCES usuarios(id), parada TEXT, latitude DECIMAL, longitude DECIMAL, orden INTEGER, activo BOOLEAN DEFAULT true, creado_en TIMESTAMP DEFAULT NOW())",
            "CREATE TABLE IF NOT EXISTS codigos_invitacion (id SERIAL PRIMARY KEY, codigo TEXT UNIQUE NOT NULL, tipo TEXT NOT NULL, entidad_id INTEGER, creado_por INTEGER NOT NULL, usos_actuales INTEGER DEFAULT 0, max_usos INTEGER DEFAULT 1, activo BOOLEAN DEFAULT true, expira_en TIMESTAMP, creado_en TIMESTAMP DEFAULT NOW())",
            "CREATE TABLE IF NOT EXISTS vinculaciones (id SERIAL PRIMARY KEY, tipo TEXT NOT NULL, entidad_id INTEGER NOT NULL, vinculado_por INTEGER NOT NULL, colegio_id INTEGER REFERENCES colegios(id), conductor_id INTEGER REFERENCES usuarios(id), codigo_usado TEXT, estado TEXT DEFAULT 'activo', creado_en TIMESTAMP DEFAULT NOW())",
            "CREATE TABLE IF NOT EXISTS super_admins (id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, creado_en TIMESTAMP DEFAULT NOW())",
            "CREATE TABLE IF NOT EXISTS configuracion (id SERIAL PRIMARY KEY, clave TEXT UNIQUE NOT NULL, valor TEXT NOT NULL, descripcion TEXT, actualizado_en TIMESTAMP DEFAULT NOW())"
        ];

        for (const q of queries) {
            await client.query(q).catch(err => console.log("[DB] Nota:", err.message));
        }

        await client.query('COMMIT');

        // Insertar Super Admin usando hashing manual para evitar problemas con símbolos $ en el SQL
        const salt = await bcrypt.genSalt(10);
        const passHash = await bcrypt.hash('Pruebas2026!', salt);
        
        await client.query("INSERT INTO super_admins (nombre, email, password) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password", 
            ['Daniel Guzmán', 'danielguzman_13@hotmail.com', passHash]);
            
        await client.query("INSERT INTO super_admins (nombre, email, password) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password", 
            ['Paula Superadmin', 'superadmin.pruebas@transporte.local', passHash]);

        console.log('[DB] >>> VERSIÓN 6 - LISTO <<<');
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('[DB] Error Crítico V6:', error.message);
        throw error;
    } finally {
        if (client) client.release();
    }
};

const ready = (async () => {
    try {
        await asegurarEsquema();
        console.log('✅ Base de Datos Conectada y Esquema V6 OK');
    } catch (err) {
        console.error('❌ Error inicializando DB V6:', err.message);
    }
})();

pool.ready = ready;
module.exports = pool;
