const express = require('express');
const router = express.Router();

const pagos = [
    { id: 1, padre: 'Carlos García', monto: 45.00, estado: 'pendiente', mes: 'Abril 2026' },
    { id: 2, padre: 'Ana López', monto: 45.00, estado: 'pagado', mes: 'Abril 2026' },
    { id: 3, padre: 'Luis Martínez', monto: 45.00, estado: 'pendiente', mes: 'Abril 2026' },
    { id: 4, padre: 'Rosa Hernández', monto: 45.00, estado: 'pagado', mes: 'Abril 2026' },
];

router.get('/', (req, res) => {
    res.json({ pagos });
});

router.get('/pendientes', (req, res) => {
    const pendientes = pagos.filter(p => p.estado === 'pendiente');
    res.json({ pendientes, total: pendientes.length });
});

module.exports = router;