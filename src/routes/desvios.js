require('dotenv').config();
const express = require('express');
const router = express.Router();
const pool = require('../database');

// Calcula distancia entre dos puntos GPS en metros
const calcularDistancia = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Encuentra la distancia mínima del punto actual a la ruta programada
const distanciaALaRuta = (latActual, lonActual, puntos) => {
    let minDistancia = Infinity;
    for (const punto of puntos) {
        const dist = calcularDistancia(
            latActual, lonActual,
            parseFloat(punto.latitud),
            parseFloat(punto.longitud)
        );
        if (dist < minDistancia) minDistancia = dist;
    }
    return minDistancia;
};

// POST /api/desvios/verificar
router.post('/verificar', async (req, res) => {
    const { conductorId, rutaId, latitude, longitude } = req.body;

    if (!conductorId || !rutaId || !latitude || !longitude)
        return res.status(400).json({ error: 'Datos incompletos' });

    try {
        // Obtener puntos de la ruta programada
        const puntos = await pool.query(
            'SELECT * FROM puntos_ruta WHERE ruta_id = $1 ORDER BY orden',
            [rutaId]
        );

        if (puntos.rows.length === 0)
            return res.json({ desviado: false, mensaje: 'Sin ruta programada' });

        // Calcular distancia a la ruta
        const distancia = distanciaALaRuta(latitude, longitude, puntos.rows);
        const LIMITE_METROS = 200;
        const desviado = distancia > LIMITE_METROS;

        // Si está desviado, guardar alerta
        if (desviado) {
            await pool.query(
                `INSERT INTO eventos_ruta (ruta_id, conductor_id, tipo, descripcion, latitud, longitud)
         VALUES ($1, $2, 'desvio', $3, $4, $5)`,
                [
                    rutaId,
                    conductorId,
                    `Bus desviado ${Math.round(distancia)} metros de la ruta`,
                    latitude,
                    longitude
                ]
            );
        }

        res.json({
            desviado,
            distanciaMetros: Math.round(distancia),
            limiteMetros: LIMITE_METROS,
            mensaje: desviado
                ? `⚠️ Bus desviado ${Math.round(distancia)} metros de la ruta`
                : '✅ Bus en ruta correcta',
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/desvios/alertas/:rutaId
router.get('/alertas/:rutaId', async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT * FROM eventos_ruta
       WHERE ruta_id = $1 AND tipo = 'desvio'
       AND DATE(creado_en) = CURRENT_DATE
       ORDER BY creado_en DESC`,
            [req.params.rutaId]
        );
        res.json({ alertas: resultado.rows, total: resultado.rows.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/desvios/puntos/:rutaId
router.get('/puntos/:rutaId', async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT * FROM puntos_ruta WHERE ruta_id = $1 ORDER BY orden',
            [req.params.rutaId]
        );
        res.json({ puntos: resultado.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;