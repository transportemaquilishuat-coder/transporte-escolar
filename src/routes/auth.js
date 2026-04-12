require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database');

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password)
        return res.status(400).json({ error: 'Email y contraseña requeridos' });

    try {
        const resultado = await pool.query(
            'SELECT * FROM usuarios WHERE email = $1 AND activo = true',
            [email.toLowerCase()]
        );

        if (resultado.rows.length === 0)
            return res.status(401).json({ error: 'Credenciales incorrectas' });

        const usuario = resultado.rows[0];
        const passwordValida = await bcrypt.compare(password, usuario.password);

        if (!passwordValida)
            return res.status(401).json({ error: 'Credenciales incorrectas' });

        const token = jwt.sign(
            { id: usuario.id, email: usuario.email, rol: usuario.rol },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                email: usuario.email,
                rol: usuario.rol,
                telefono: usuario.telefono,
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