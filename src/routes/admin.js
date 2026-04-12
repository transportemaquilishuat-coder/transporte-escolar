// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const [usuarios, alumnos, rutas, ausencias] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM usuarios'),
            pool.query('SELECT COUNT(*) FROM alumnos'),
            pool.query('SELECT COUNT(*) FROM rutas'),
            pool.query('SELECT COUNT(*) FROM ausencias'),
        ]);

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