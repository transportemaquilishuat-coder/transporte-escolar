require('dotenv').config();
const express = require('express');
const router = express.Router();
const pool = require('../database');

// Primero agregamos la tabla de tokens
const crearTablaTokens = async () => {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS tokens_push (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      token VARCHAR(255) NOT NULL,
      plataforma VARCHAR(10),
      activo BOOLEAN DEFAULT true,
      creado_en TIMESTAMP DEFAULT NOW()
    );
  `);
};
crearTablaTokens();

// POST /api/notificaciones/token
router.post('/token', async (req, res) => {
    const { usuarioId, token, plataforma } = req.body;
    try {
        await pool.query(
            `INSERT INTO tokens_push (usuario_id, token, plataforma)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
            [usuarioId, token, plataforma]
        );
        res.json({ mensaje: 'Token registrado correctamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/notificaciones/enviar
router.post('/enviar', async (req, res) => {
    const { usuarioId, titulo, mensaje } = req.body;
    try {
        const tokens = await pool.query(
            'SELECT token FROM tokens_push WHERE usuario_id = $1 AND activo = true',
            [usuarioId]
        );

        if (tokens.rows.length === 0) {
            return res.json({ mensaje: 'No hay tokens registrados para este usuario' });
        }

        // Enviar via Expo Push API
        const mensajes = tokens.rows.map(t => ({
            to: t.token,
            title: titulo,
            body: mensaje,
            sound: 'default',
            priority: 'high',
            channelId: 'transporte',
        }));

        const respuesta = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(mensajes),
        });

        const resultado = await respuesta.json();
        res.json({ mensaje: 'Notificación enviada', resultado });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/notificaciones/alerta-bus
router.post('/alerta-bus', async (req, res) => {
    const { rutaId, minutosRestantes } = req.body;
    try {
        // Obtener todos los padres de la ruta
        const padres = await pool.query(
            `SELECT DISTINCT a.padre_id, u.nombre
       FROM alumnos a
       JOIN usuarios u ON u.id = a.padre_id
       WHERE a.ruta_id = $1 AND a.activo = true`,
            [rutaId]
        );

        const tokens = await pool.query(
            `SELECT tp.token, u.nombre
       FROM tokens_push tp
       JOIN usuarios u ON u.id = tp.usuario_id
       WHERE tp.usuario_id = ANY($1) AND tp.activo = true`,
            [padres.rows.map(p => p.padre_id)]
        );

        if (tokens.rows.length === 0) {
            return res.json({ mensaje: 'No hay tokens registrados' });
        }

        const titulo = minutosRestantes <= 1
            ? '🚌 El bus está llegando'
            : `🚌 El bus llega en ${minutosRestantes} minutos`;

        const cuerpo = minutosRestantes <= 1
            ? 'El bus escolar está llegando a tu parada'
            : `Prepara a tu hijo, el bus escolar llegará en ${minutosRestantes} minutos`;

        const mensajes = tokens.rows.map(t => ({
            to: t.token,
            title: titulo,
            body: cuerpo,
            sound: 'default',
            priority: 'high',
            channelId: 'transporte',
        }));

        await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mensajes),
        });

        res.json({ mensaje: `Alerta enviada a ${tokens.rows.length} padres` });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;