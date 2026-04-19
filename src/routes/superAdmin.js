require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const pool = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken, requireRole('super_admin'));

const parseHora = (valor) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(valor || '').trim());
    if (!match) return null;

    const hora = Number(match[1]);
    const minuto = Number(match[2]);
    if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return null;

    return { hora, minuto };
};

const restarCincoMinutos = (horaTexto) => {
    const parsed = parseHora(horaTexto);
    if (!parsed) return null;

    const fecha = new Date(2026, 0, 1, parsed.hora, parsed.minuto, 0, 0);
    fecha.setMinutes(fecha.getMinutes() - 5);
    return `${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;
};

const validarDiasSemana = (diasSemana) =>
    Array.isArray(diasSemana) &&
    diasSemana.every((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6);

router.get('/dashboard', async (req, res) => {
    try {
        const [colegios, anuncios, superAdmins] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM colegios WHERE activo = true'),
            pool.query('SELECT COUNT(*) FROM anuncios_voz WHERE activo = true'),
            pool.query('SELECT COUNT(*) FROM super_admins'),
        ]);

        res.json({
            totalColegios: parseInt(colegios.rows[0].count, 10),
            totalAnunciosActivos: parseInt(anuncios.rows[0].count, 10),
            totalSuperAdmins: parseInt(superAdmins.rows[0].count, 10),
        });
    } catch (error) {
        console.error('Error dashboard super admin:', error.message);
        res.status(500).json({ error: error.message });
    }
});

router.get('/colegios', async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT id, nombre, plan, activo, dias_prueba_restantes, creado_en
             FROM colegios
             ORDER BY nombre`
        );

        res.json({ colegios: resultado.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/anuncios', async (req, res) => {
    const { colegioId } = req.query;

    try {
        const valores = [];
        let whereClause = '';

        if (colegioId) {
            valores.push(colegioId);
            whereClause = `WHERE a.colegio_id = $${valores.length}`;
        }

        const resultado = await pool.query(
            `SELECT a.*, c.nombre AS colegio_nombre
             FROM anuncios_voz a
             LEFT JOIN colegios c ON c.id = a.colegio_id
             ${whereClause}
             ORDER BY c.nombre, a.orden, a.id`,
            valores
        );

        res.json({ anuncios: resultado.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/anuncios', async (req, res) => {
    const { colegio_id, titulo, mensaje, orden = 1, activo = true } = req.body;

    if (!colegio_id || !titulo || !mensaje) {
        return res.status(400).json({ error: 'colegio_id, titulo y mensaje son requeridos' });
    }

    try {
        const resultado = await pool.query(
            `INSERT INTO anuncios_voz (colegio_id, titulo, mensaje, orden, activo, creado_por)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [colegio_id, titulo, mensaje, orden, activo, req.user.email]
        );

        res.status(201).json({
            mensaje: 'Anuncio creado correctamente',
            anuncio: resultado.rows[0],
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/anuncios/:id', async (req, res) => {
    const { colegio_id, titulo, mensaje, orden, activo } = req.body;

    try {
        const actual = await pool.query('SELECT * FROM anuncios_voz WHERE id = $1', [req.params.id]);

        if (actual.rows.length === 0) {
            return res.status(404).json({ error: 'Anuncio no encontrado' });
        }

        const anuncioActual = actual.rows[0];
        const resultado = await pool.query(
            `UPDATE anuncios_voz
             SET colegio_id = $1,
                 titulo = $2,
                 mensaje = $3,
                 orden = $4,
                 activo = $5
             WHERE id = $6
             RETURNING *`,
            [
                colegio_id ?? anuncioActual.colegio_id,
                titulo ?? anuncioActual.titulo,
                mensaje ?? anuncioActual.mensaje,
                orden ?? anuncioActual.orden,
                activo ?? anuncioActual.activo,
                req.params.id,
            ]
        );

        res.json({
            mensaje: 'Anuncio actualizado correctamente',
            anuncio: resultado.rows[0],
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/anuncios/:id', async (req, res) => {
    try {
        const resultado = await pool.query(
            'DELETE FROM anuncios_voz WHERE id = $1 RETURNING id, titulo',
            [req.params.id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({ error: 'Anuncio no encontrado' });
        }

        res.json({
            mensaje: 'Anuncio eliminado correctamente',
            anuncio: resultado.rows[0],
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/usuarios', async (req, res) => {
    const { nombre, email, password } = req.body;

    if (!nombre || !email || !password) {
        return res.status(400).json({ error: 'nombre, email y password son requeridos' });
    }

    try {
        const existe = await pool.query(
            'SELECT id FROM super_admins WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existe.rows.length > 0) {
            return res.status(400).json({ error: 'El correo ya está registrado como super admin' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const resultado = await pool.query(
            `INSERT INTO super_admins (nombre, email, password)
             VALUES ($1, $2, $3)
             RETURNING id, nombre, email, creado_en`,
            [nombre, email.toLowerCase(), passwordHash]
        );

        res.status(201).json({
            mensaje: 'Super admin creado correctamente',
            superAdmin: resultado.rows[0],
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/alertas/recogida-5min', async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT *
             FROM alertas_configuracion
             WHERE tipo = 'recogida_5min'
             LIMIT 1`
        );

        res.json({
            configuracion: resultado.rows[0] || null,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/alertas/recogida-5min', async (req, res) => {
    const {
        activo = true,
        modo = 'mensual',
        titulo = 'Recogida en 5 minutos',
        mensaje,
        horaRecogida,
        diasSemana = [1, 2, 3, 4, 5],
        canal = 'push',
    } = req.body;

    if (!mensaje || !horaRecogida) {
        return res.status(400).json({ error: 'mensaje y horaRecogida son requeridos' });
    }

    if (!['diaria', 'mensual'].includes(modo)) {
        return res.status(400).json({ error: 'modo invalido' });
    }

    if (!validarDiasSemana(diasSemana)) {
        return res.status(400).json({ error: 'diasSemana invalido' });
    }

    const horaAlerta = restarCincoMinutos(horaRecogida);
    if (!horaAlerta) {
        return res.status(400).json({ error: 'horaRecogida invalida. Usa formato HH:MM' });
    }

    try {
        const resultado = await pool.query(
            `INSERT INTO alertas_configuracion
                (tipo, activo, modo, titulo, mensaje, hora_recogida, hora_alerta, dias_semana, canal, actualizado_por, actualizado_en)
             VALUES
                ('recogida_5min', $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, NOW())
             ON CONFLICT (tipo)
             DO UPDATE SET
                activo = EXCLUDED.activo,
                modo = EXCLUDED.modo,
                titulo = EXCLUDED.titulo,
                mensaje = EXCLUDED.mensaje,
                hora_recogida = EXCLUDED.hora_recogida,
                hora_alerta = EXCLUDED.hora_alerta,
                dias_semana = EXCLUDED.dias_semana,
                canal = EXCLUDED.canal,
                actualizado_por = EXCLUDED.actualizado_por,
                actualizado_en = NOW()
             RETURNING *`,
            [
                activo,
                modo,
                titulo,
                mensaje,
                horaRecogida,
                horaAlerta,
                JSON.stringify(diasSemana),
                canal,
                req.user.email,
            ]
        );

        res.json({
            mensaje: 'Configuracion actualizada',
            configuracion: resultado.rows[0],
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/alertas/recogida-5min/generar-mes', async (req, res) => {
    const hoy = new Date();
    const mes = Number(req.body.mes || hoy.getMonth() + 1);
    const anio = Number(req.body.anio || hoy.getFullYear());

    if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(anio)) {
        return res.status(400).json({ error: 'mes o anio invalido' });
    }

    try {
        const configResult = await pool.query(
            `SELECT * FROM alertas_configuracion WHERE tipo = 'recogida_5min' LIMIT 1`
        );

        if (configResult.rows.length === 0) {
            return res.status(404).json({ error: 'No existe configuracion de alerta de recogida' });
        }

        const config = configResult.rows[0];
        const hora = parseHora(config.hora_alerta);
        const diasSemana = Array.isArray(config.dias_semana) ? config.dias_semana : JSON.parse(config.dias_semana || '[]');

        if (!hora) {
            return res.status(400).json({ error: 'La configuracion tiene una hora_alerta invalida' });
        }

        const primerDia = new Date(anio, mes - 1, 1, hora.hora, hora.minuto, 0, 0);
        const ultimoDia = new Date(anio, mes, 0, hora.hora, hora.minuto, 0, 0);

        await pool.query(
            `DELETE FROM alertas_programadas
             WHERE tipo = 'recogida_5min'
               AND DATE_PART('month', fecha_programada) = $1
               AND DATE_PART('year', fecha_programada) = $2`,
            [mes, anio]
        );

        const generadas = [];
        for (let dia = 1; dia <= ultimoDia.getDate(); dia += 1) {
            const fecha = new Date(anio, mes - 1, dia, hora.hora, hora.minuto, 0, 0);
            if (!diasSemana.includes(fecha.getDay())) continue;

            const resultado = await pool.query(
                `INSERT INTO alertas_programadas
                    (configuracion_id, tipo, titulo, mensaje, fecha_programada, canal, activo, enviada, actualizado_en)
                 VALUES
                    ($1, 'recogida_5min', $2, $3, $4, $5, $6, false, NOW())
                 RETURNING *`,
                [
                    config.id,
                    config.titulo,
                    config.mensaje,
                    fecha,
                    config.canal,
                    config.activo,
                ]
            );

            generadas.push(resultado.rows[0]);
        }

        res.json({
            mensaje: 'Agenda mensual generada',
            total: generadas.length,
            alertas: generadas,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/alertas/recogida-5min/agenda', async (req, res) => {
    const hoy = new Date();
    const mes = Number(req.query.mes || hoy.getMonth() + 1);
    const anio = Number(req.query.anio || hoy.getFullYear());

    if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(anio)) {
        return res.status(400).json({ error: 'mes o anio invalido' });
    }

    try {
        const resultado = await pool.query(
            `SELECT *
             FROM alertas_programadas
             WHERE tipo = 'recogida_5min'
               AND DATE_PART('month', fecha_programada) = $1
               AND DATE_PART('year', fecha_programada) = $2
             ORDER BY fecha_programada`,
            [mes, anio]
        );

        res.json({ alertas: resultado.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/alertas/recogida-5min/agenda', async (req, res) => {
    const hoy = new Date();
    const mes = Number(req.query.mes || hoy.getMonth() + 1);
    const anio = Number(req.query.anio || hoy.getFullYear());

    if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(anio)) {
        return res.status(400).json({ error: 'mes o anio invalido' });
    }

    try {
        const resultado = await pool.query(
            `DELETE FROM alertas_programadas
             WHERE tipo = 'recogida_5min'
               AND DATE_PART('month', fecha_programada) = $1
               AND DATE_PART('year', fecha_programada) = $2
             RETURNING id`,
            [mes, anio]
        );

        res.json({
            mensaje: 'Agenda eliminada',
            totalEliminadas: resultado.rows.length,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
