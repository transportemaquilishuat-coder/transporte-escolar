const express = require('express');
const router = express.Router();

const rutas = [
    { id: 1, nombre: 'Ruta Norte', conductor: 'Carlos M.', estado: 'activa', alumnos: 15 },
    { id: 2, nombre: 'Ruta Sur', conductor: 'Ana G.', estado: 'completada', alumnos: 12 },
    { id: 3, nombre: 'Ruta Centro', conductor: 'Luis P.', estado: 'pendiente', alumnos: 18 },
];

router.get('/', (req, res) => {
    res.json({ rutas });
});

router.get('/:id', (req, res) => {
    const ruta = rutas.find(r => r.id === parseInt(req.params.id));
    if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada' });
    res.json({ ruta });
});

module.exports = router;