const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const usuarios = [
    { id: 1, nombre: 'Carlos Padre', email: 'padre@test.com', password: bcrypt.hashSync('1234', 10), rol: 'padre' },
    { id: 2, nombre: 'Luis Conductor', email: 'conductor@test.com', password: bcrypt.hashSync('1234', 10), rol: 'conductor' },
    { id: 3, nombre: 'Ana Admin', email: 'admin@test.com', password: bcrypt.hashSync('1234', 10), rol: 'admin' },
];

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password)
        return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const usuario = usuarios.find(u => u.email === email.toLowerCase());
    if (!usuario)
        return res.status(401).json({ error: 'Credenciales incorrectas' });

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
        usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }
    });
});

module.exports = router;