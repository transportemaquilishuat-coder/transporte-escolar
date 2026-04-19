const express = require('express');
const router = express.Router();
const pool = require('../database');

const CONFIG_UI_POR_DEFECTO = {
    mostrarTotalAlumnosHistorial: false,
    mostrarLogoColegioInicio: true,
};

const obtenerConfiguracionPadre = async () => {
    const resultado = await pool.query(
        `SELECT clave, valor
         FROM configuracion
         WHERE clave = ANY($1::text[])`,
        [[
            'mostrar_total_alumnos_historial_padre',
            'mostrar_logo_colegio_inicio',
        ]]
    );

    const configuracion = { ...CONFIG_UI_POR_DEFECTO };
    for (const item of resultado.rows) {
        const valor = String(item.valor).toLowerCase() === 'true';
        if (item.clave === 'mostrar_total_alumnos_historial_padre') {
            configuracion.mostrarTotalAlumnosHistorial = valor;
        }
        if (item.clave === 'mostrar_logo_colegio_inicio') {
            configuracion.mostrarLogoColegioInicio = valor;
        }
    }

    return configuracion;
};

router.get('/:padreId/historial', async (req, res) => {
    const padreId = Number(req.params.padreId);

    if (!Number.isInteger(padreId)) {
        return res.status(400).json({ error: 'padreId invalido' });
    }

    try {
        const [eventosResult, colegioResult, configuracionUi] = await Promise.all([
            pool.query(
                `WITH rutas_padre AS (
                    SELECT DISTINCT a.ruta_id
                    FROM alumnos a
                    WHERE a.padre_id = $1
                      AND a.activo = true
                      AND a.ruta_id IS NOT NULL
                )
                SELECT
                    e.ruta_id AS "rutaId",
                    r.nombre AS "rutaNombre",
                    TO_CHAR(DATE(e.creado_en), 'YYYY-MM-DD') AS fecha,
                    e.tipo,
                    e.descripcion,
                    TO_CHAR(e.creado_en, 'HH24:MI:SS') AS hora,
                    u.nombre AS "conductorNombre"
                FROM eventos_ruta e
                INNER JOIN rutas_padre rp ON rp.ruta_id = e.ruta_id
                INNER JOIN rutas r ON r.id = e.ruta_id
                LEFT JOIN usuarios u ON u.id = e.conductor_id
                WHERE e.tipo <> 'abordado'
                ORDER BY e.creado_en DESC`,
                [padreId]
            ),
            pool.query(
                `SELECT DISTINCT
                    c.id,
                    c.nombre,
                    c.logo_url AS "logoUrl"
                 FROM alumnos a
                 INNER JOIN rutas r ON r.id = a.ruta_id
                 INNER JOIN colegios c ON c.id = r.colegio_id
                 WHERE a.padre_id = $1
                   AND a.activo = true
                 ORDER BY c.id
                 LIMIT 1`,
                [padreId]
            ),
            obtenerConfiguracionPadre(),
        ]);

        const viajesMap = new Map();

        for (const evento of eventosResult.rows) {
            const llave = `${evento.rutaId}-${evento.fecha}`;

            if (!viajesMap.has(llave)) {
                viajesMap.set(llave, {
                    rutaId: evento.rutaId,
                    rutaNombre: evento.rutaNombre,
                    fecha: evento.fecha,
                    conductorNombre: evento.conductorNombre,
                    horaInicio: null,
                    reportes: [],
                });
            }

            const viaje = viajesMap.get(llave);

            if (evento.tipo === 'inicio_ruta') {
                viaje.horaInicio = evento.hora;
                continue;
            }

            viaje.reportes.push({
                tipo: evento.tipo,
                descripcion: evento.descripcion,
                hora: evento.hora,
            });
        }

        res.json({
            historial: Array.from(viajesMap.values()),
            colegio: colegioResult.rows[0] || null,
            configuracionUi,
        });
    } catch (error) {
        console.error('Error historialPadre:', error.message);
        res.status(500).json({ error: 'Error obteniendo historial del padre' });
    }
});

module.exports = router;
