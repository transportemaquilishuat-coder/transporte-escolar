const express = require('express');
const router = express.Router();
const pool = require('../database');

router.get('/', async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT r.*, u.nombre AS conductor_nombre, c.nombre AS colegio_nombre,
                    COUNT(a.id) AS total_alumnos
             FROM rutas r
             LEFT JOIN usuarios u ON u.id = r.conductor_id
             LEFT JOIN colegios c ON c.id = r.colegio_id
             LEFT JOIN alumnos a ON a.ruta_id = r.id AND a.activo = true
             WHERE r.activa = true
             GROUP BY r.id, u.nombre, c.nombre
             ORDER BY r.nombre`
        );

        res.json({ rutas: resultado.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT r.*, u.nombre AS conductor_nombre, c.nombre AS colegio_nombre,
                    COUNT(a.id) AS total_alumnos
             FROM rutas r
             LEFT JOIN usuarios u ON u.id = r.conductor_id
             LEFT JOIN colegios c ON c.id = r.colegio_id
             LEFT JOIN alumnos a ON a.ruta_id = r.id AND a.activo = true
             WHERE r.id = $1
             GROUP BY r.id, u.nombre, c.nombre`,
            [req.params.id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }

        res.json({ ruta: resultado.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
