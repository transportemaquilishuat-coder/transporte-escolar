require('dotenv').config();
const express = require('express');
const router = express.Router();
const pool = require('../database');

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const usuarios = await pool.query("SELECT COUNT(*) FROM usuarios WHERE activo = true");
        const conductores = await pool.query("SELECT COUNT(*) FROM usuarios WHERE rol = 'conductor' AND activo = true");
        const padres = await pool.query("SELECT COUNT(*) FROM usuarios WHERE rol = 'padre' AND activo = true");
        const alumnos = await pool.query("SELECT COUNT(*) FROM alumnos WHERE activo = true");
        const rutas = await pool.query("SELECT COUNT(*) FROM rutas WHERE activa = true");
        const ausenciasHoy = await pool.query("SELECT COUNT(*) FROM ausencias WHERE fecha = CURRENT_DATE");
        const pagos = await pool.query("SELECT COUNT(*) FROM pagos WHERE estado = 'pendiente'");

        res.json({
            totalUsuarios: parseInt(usuarios.rows[0].count),
            totalConductores: parseInt(conductores.rows[0].count),
            totalPadres: parseInt(padres.rows[0].count),
            totalAlumnos: parseInt(alumnos.rows[0].count),
            totalRutas: parseInt(rutas.rows[0].count),
            ausenciasHoy: parseInt(ausenciasHoy.rows[0].count),
            pagosPendientes: parseInt(pagos.rows[0].count),
        });
    } catch (error) {
        console.error('Error dashboard:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/admin/conductores
router.get('/conductores', async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT u.id, u.nombre, u.email, u.telefono, u.dui, u.licencia, u.placa, u.activo,
        COUNT(r.id) as rutas, COUNT(a.id) as alumnos
       FROM usuarios u
       LEFT JOIN rutas r ON r.conductor_id = u.id AND r.activa = true
       LEFT JOIN alumnos a ON a.ruta_id = r.id AND a.activo = true
       WHERE u.rol = 'conductor'
       GROUP BY u.id ORDER BY u.nombre`
        );
        res.json({ conductores: resultado.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/admin/alumnos
router.get('/alumnos', async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT a.*, r.nombre as ruta_nombre, u.nombre as padre_nombre
       FROM alumnos a
       LEFT JOIN rutas r ON r.id = a.ruta_id
       LEFT JOIN usuarios u ON u.id = a.padre_id
       WHERE a.activo = true
       ORDER BY a.nombre`
        );
        res.json({ alumnos: resultado.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/admin/alumnos
router.post('/alumnos', async (req, res) => {
    const { nombre, grado, ruta_id, padre_id, parada, orden } = req.body;
    try {
        const resultado = await pool.query(
            `INSERT INTO alumnos (nombre, grado, ruta_id, padre_id, parada, orden)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [nombre, grado, ruta_id, padre_id, parada, orden]
        );
        res.json({ mensaje: 'Alumno agregado', alumno: resultado.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    }
});

// PUT /api/admin/alumnos/:id
router.put('/alumnos/:id', async (req, res) => {
    const { nombre, grado, ruta_id, parada, orden, activo } = req.body;
    try {
        const resultado = await pool.query(
            `UPDATE alumnos SET nombre=$1, grado=$2, ruta_id=$3, parada=$4, orden=$5, activo=$6
       WHERE id=$7 RETURNING *`,
            [nombre, grado, ruta_id, parada, orden, activo, req.params.id]
        );
        res.json({ mensaje: 'Alumno actualizado', alumno: resultado.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/admin/rutas
router.get('/rutas', async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT r.*, u.nombre as conductor_nombre,
        COUNT(a.id) as total_alumnos
       FROM rutas r
       LEFT JOIN usuarios u ON u.id = r.conductor_id
       LEFT JOIN alumnos a ON a.ruta_id = r.id AND a.activo = true
       WHERE r.activa = true
       GROUP BY r.id, u.nombre
       ORDER BY r.nombre`
        );
        res.json({ rutas: resultado.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/admin/rutas
router.post('/rutas', async (req, res) => {
    const { nombre, conductor_id } = req.body;
    try {
        const resultado = await pool.query(
            `INSERT INTO rutas (nombre, conductor_id) VALUES ($1, $2) RETURNING *`,
            [nombre, conductor_id]
        );
        res.json({ mensaje: 'Ruta creada', ruta: resultado.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/admin/eventos-hoy
router.get('/eventos-hoy', async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT e.*, r.nombre as ruta_nombre, u.nombre as conductor_nombre
       FROM eventos_ruta e
       LEFT JOIN rutas r ON r.id = e.ruta_id
       LEFT JOIN usuarios u ON u.id = e.conductor_id
       WHERE DATE(e.creado_en) = CURRENT_DATE
       ORDER BY e.creado_en DESC
       LIMIT 20`
        );
        res.json({ eventos: resultado.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;