const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Estado global de la DB para el healthcheck
let dbStatus = {
    connected: false,
    schemaOk: false,
    error: null,
    version: 'V7-SOFT-START'
};

const asegurarEsquema = async () => {
    console.log('[DB] >>> VERSIÓN 7 - INICIO ASÍNCRONO - NO BLOQUEANTE <<<');
    let client;
    try {
        client = await pool.connect();
        dbStatus.connected = true;
        console.log('✅ Conexión física establecida');

        // Intentar crear tabla básica de control si no existe
        await client.query('CREATE TABLE IF NOT EXISTS sistema_control (id SERIAL PRIMARY KEY, version TEXT, actualizado_en TIMESTAMP DEFAULT NOW())');
        dbStatus.schemaOk = true;
        console.log('✅ Esquema básico verificado');

    } catch (error) {
        dbStatus.error = error.message;
        console.error('⚠️ Advertencia: Error en inicialización DB (No crítico para el arranque):', error.message);
    } finally {
        if (client) client.release();
    }
};

// El "ready" ahora es instantáneo para no bloquear el index.js
const ready = (async () => {
    console.log('🚀 Iniciando arranque suave...');
    // Ejecutamos el esquema en segundo plano sin esperar (no bloqueante)
    asegurarEsquema();
    return true;
})();

pool.ready = ready;
pool.getStatus = () => dbStatus;

module.exports = pool;
