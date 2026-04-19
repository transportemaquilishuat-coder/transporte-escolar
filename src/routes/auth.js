require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database');

const ROLES_VALIDOS_USUARIO = ['padre', 'conductor', 'admin'];

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password)
        return res.status(400).json({ error: 'Email y contraseña requeridos' });

    try {
        const resultadoUsuarios = await pool.query(
            `SELECT u.*, c.logo_url AS colegio_logo_url, c.nombre AS colegio_nombre
             FROM usuarios u
             LEFT JOIN colegios c ON c.id = u.colegio_id
             WHERE u.email = $1 AND u.activo = true`,
            [email.toLowerCase()]
        );

        if (resultadoUsuarios.rows.length > 0) {
            const usuario = resultadoUsuarios.rows[0];
            const passwordValida = await bcrypt.compare(password, usuario.password);

            if (!passwordValida)
                return res.status(401).json({ error: 'Credenciales incorrectas' });

            const token = jwt.sign(
                { id: usuario.id, email: usuario.email, rol: usuario.rol, tipo: 'usuario' },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            return res.json({
                token,
                usuario: {
                    id: usuario.id,
                    nombre: usuario.nombre,
                    email: usuario.email,
                    rol: usuario.rol,
                    telefono: usuario.telefono,
                    colegioId: usuario.colegio_id,
                    colegioNombre: usuario.colegio_nombre || null,
                    logoUrl: usuario.colegio_logo_url || null,
                }
            });
        }

        const resultadoSuperAdmin = await pool.query(
            'SELECT * FROM super_admins WHERE email = $1',
            [email.toLowerCase()]
        );

        if (resultadoSuperAdmin.rows.length === 0)
            return res.status(401).json({ error: 'Credenciales incorrectas' });

        const superAdmin = resultadoSuperAdmin.rows[0];
        const passwordValida = await bcrypt.compare(password, superAdmin.password);

        if (!passwordValida)
            return res.status(401).json({ error: 'Credenciales incorrectas' });

        const token = jwt.sign(
            { id: superAdmin.id, email: superAdmin.email, rol: 'super_admin', tipo: 'super_admin' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            usuario: {
                id: superAdmin.id,
                nombre: superAdmin.nombre,
                email: superAdmin.email,
                rol: 'super_admin',
            }
        });

    } catch (error) {
        console.error('Error login:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/auth/registro
router.post('/registro', async (req, res) => {
    const { nombre, email, password, rol, telefono, dui, licencia, placa } = req.body;

    if (!nombre || !email || !password || !rol)
        return res.status(400).json({ error: 'Campos requeridos incompletos' });

    if (!ROLES_VALIDOS_USUARIO.includes(rol)) {
        return res.status(400).json({ error: 'Rol inválido para registro público' });
    }

    try {
        const existe = await pool.query(
            'SELECT id FROM usuarios WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existe.rows.length > 0)
            return res.status(400).json({ error: 'El correo ya está registrado' });

        const passwordHash = await bcrypt.hash(password, 10);

        const resultado = await pool.query(
            `INSERT INTO usuarios (nombre, email, password, rol, telefono, dui, licencia, placa)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, nombre, email, rol`,
            [nombre, email.toLowerCase(), passwordHash, rol, telefono, dui, licencia, placa]
        );

        res.json({
            mensaje: 'Usuario registrado correctamente',
            usuario: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error registro:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;
