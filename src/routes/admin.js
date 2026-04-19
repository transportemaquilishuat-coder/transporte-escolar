require('dotenv').config();
const express = require('express');
const router = express.Router();
const pool = require('../database');

router.get('/dashboard', async (req, res) => {
    try {
        const usuarios = await pool.query('SELECT COUNT(*) FROM usuarios');
        const alumnos = await pool.query('SELECT COUNT(*) FROM alumnos');
        const rutas = await pool.query('SELECT COUNT(*) FROM rutas');
        const ausencias = await pool.query('SELECT COUNT(*) FROM ausencias');

        res.json({
            totalUsuarios: parseInt(usuarios.rows[0].count),
            totalAlumnos: parseInt(alumnos.rows[0].count),
            totalRutas: parseInt(rutas.rows[0].count),
            ausenciasHoy: parseInt(ausencias.rows[0].count),
        });
    } catch (error) {
        console.error('Error dashboard:', error.message);
        res.status(500).json({ error: error.message });
    }
});

router.get('/conductores', async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT u.id, u.nombre, u.email, u.telefono, u.dui, u.licencia, u.placa, u.activo
       FROM usuarios u
       WHERE u.rol = 'conductor'
       ORDER BY u.nombre`
        );
        res.json({ conductores: resultado.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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
        res.status(500).json({ error: error.message });
    }
});

router.post('/alumnos', async (req, res) => {
    const { nombre, grado, ruta_id, padre_id, parada, orden, latitude, longitude } = req.body;
    try {
        const resultado = await pool.query(
            `INSERT INTO alumnos (nombre, grado, ruta_id, padre_id, parada, latitude, longitude, orden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [nombre, grado, ruta_id, padre_id, parada, latitude ?? null, longitude ?? null, orden]
        );
        res.json({ mensaje: 'Alumno agregado', alumno: resultado.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/colegios', async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT id, nombre, logo_url AS "logoUrl", plan, activo, dias_prueba_restantes, creado_en
             FROM colegios
             ORDER BY nombre`
        );
        res.json({ colegios: resultado.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/colegios/:id/logo', async (req, res) => {
    const { logo_url } = req.body;

    if (!logo_url) {
        return res.status(400).json({ error: 'logo_url es requerido' });
    }

    try {
        const resultado = await pool.query(
            `UPDATE colegios
             SET logo_url = $1
             WHERE id = $2
             RETURNING id, nombre, logo_url AS "logoUrl", plan, activo, dias_prueba_restantes, creado_en`,
            [logo_url, req.params.id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({ error: 'Colegio no encontrado' });
        }

        res.json({
            mensaje: 'Logo del colegio actualizado',
            colegio: resultado.rows[0],
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/alumnos/:id', async (req, res) => {
    const { id } = req.params;
    const {
        nombre,
        grado,
        ruta_id,
        padre_id,
        parada,
        latitude,
        longitude,
        orden,
        activo,
    } = req.body;

    try {
        const actual = await pool.query('SELECT * FROM alumnos WHERE id = $1', [id]);

        if (actual.rows.length === 0) {
            return res.status(404).json({ error: 'Alumno no encontrado' });
        }

        const alumno = actual.rows[0];
        const resultado = await pool.query(
            `UPDATE alumnos
             SET nombre = $1,
                 grado = $2,
                 ruta_id = $3,
                 padre_id = $4,
                 parada = $5,
                 latitude = $6,
                 longitude = $7,
                 orden = $8,
                 activo = $9
             WHERE id = $10
             RETURNING *`,
            [
                nombre ?? alumno.nombre,
                grado ?? alumno.grado,
                ruta_id ?? alumno.ruta_id,
                padre_id ?? alumno.padre_id,
                parada ?? alumno.parada,
                latitude ?? alumno.latitude,
                longitude ?? alumno.longitude,
                orden ?? alumno.orden,
                activo ?? alumno.activo,
                id,
            ]
        );

        res.json({ mensaje: 'Alumno actualizado', alumno: resultado.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/rutas', async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT r.*, u.nombre as conductor_nombre, c.nombre as colegio_nombre,
        COUNT(a.id) as total_alumnos
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

router.post('/rutas', async (req, res) => {
    const { nombre, conductor_id, colegio_id } = req.body;

    if (!nombre || !colegio_id) {
        return res.status(400).json({ error: 'nombre y colegio_id son requeridos' });
    }

    try {
        const resultado = await pool.query(
            `INSERT INTO rutas (nombre, conductor_id, colegio_id) VALUES ($1, $2, $3) RETURNING *`,
            [nombre, conductor_id ?? null, colegio_id]
        );
        res.json({ mensaje: 'Ruta creada', ruta: resultado.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin/configuracion
router.get('/configuracion', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM configuracion ORDER BY clave');
        res.json({ configuracion: resultado.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/admin/configuracion/:clave
router.put('/configuracion/:clave', async (req, res) => {
    const { valor } = req.body;
    try {
        const resultado = await pool.query(
            `UPDATE configuracion 
       SET valor = $1, actualizado_en = NOW()
       WHERE clave = $2 RETURNING *`,
            [valor, req.params.clave]
        );
        if (resultado.rows.length === 0)
            return res.status(404).json({ error: 'Configuración no encontrada' });
        res.json({ mensaje: 'Configuración actualizada', config: resultado.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
