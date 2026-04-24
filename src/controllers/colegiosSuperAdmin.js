const pool = require('../database');

const parseBoolean = (value, defaultValue = true) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
    }
    return defaultValue;
};

const generarCodigo = (longitud = 8) => {
    const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let codigo = '';
    for (let i = 0; i < longitud; i++) {
        codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return codigo;
};

const listarColegiosSuperAdmin = async (req, res) => {
    try {
        console.log('[LISTAR COLEGIOS] req.user:', req.user);

        const resultado = await pool.query(`
            SELECT 
                c.id,
                c.nombre,
                c.logo_url,
                c.plan,
                c.activo,
                c.dias_prueba_restantes,
                c.creado_en,
                c.admin_id,
                u.nombre as admin_nombre,
                u.email as admin_email,
                u.telefono as admin_telefono
            FROM colegios c
            LEFT JOIN usuarios u ON u.id = c.admin_id
            ORDER BY c.nombre
        `);

        console.log('[LISTAR COLEGIOS] total:', resultado.rows.length);
        console.log('[LISTAR COLEGIOS] primeros:', resultado.rows.slice(0, 5));

        return res.json({ colegios: resultado.rows });
    } catch (error) {
        console.error('Error listando colegios superadmin:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};

const crearColegioSuperAdmin = async (req, res) => {
    try {
        console.log('[CREAR COLEGIO] req.user:', req.user);
        console.log('[CREAR COLEGIO] req.body:', req.body);

        const {
            nombre,
            logo_url = null,
            plan = 'trial',
            activo = true,
            admin_id = null,
            diasPrueba,
            dias_prueba,
        } = req.body;

        const diasPruebaRestantes =
            typeof diasPrueba !== 'undefined'
                ? Number(diasPrueba)
                : typeof dias_prueba !== 'undefined'
                    ? Number(dias_prueba)
                    : plan === 'trial'
                        ? 30
                        : null;

        const payload = {
            nombre,
            logo_url,
            plan,
            activo: parseBoolean(activo, true),
            dias_prueba_restantes: Number.isFinite(diasPruebaRestantes) ? diasPruebaRestantes : null,
            admin_id: admin_id || null,
        };

        console.log('[CREAR COLEGIO] payload final:', payload);

        if (!nombre) {
            return res.status(400).json({ error: 'El nombre del colegio es requerido' });
        }

        const nuevoColegio = await pool.query(
            `INSERT INTO colegios (nombre, logo_url, plan, activo, dias_prueba_restantes, admin_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                payload.nombre,
                payload.logo_url,
                payload.plan,
                payload.activo,
                payload.dias_prueba_restantes,
                payload.admin_id,
            ]
        );

        console.log('[CREAR COLEGIO] insert result:', nuevoColegio.rows[0]);

        return res.status(201).json({
            colegio: nuevoColegio.rows[0],
            mensaje: 'Colegio creado correctamente',
        });
    } catch (error) {
        console.error('Error creando colegio superadmin:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};

const generarCodigoAdminSuperAdmin = async (req, res) => {
    try {
        console.log('[CODIGO ADMIN] req.user:', req.user);
        console.log('[CODIGO ADMIN] req.params:', req.params);
        console.log('[CODIGO ADMIN] req.body:', req.body);

        const { colegioId } = req.params;
        const { maxUsos = 1, diasValidez = 7 } = req.body;

        const colegioEncontrado = await pool.query(
            'SELECT * FROM colegios WHERE id = $1',
            [colegioId]
        );

        console.log('[CODIGO ADMIN] colegio encontrado:', colegioEncontrado.rows[0] || null);

        if (colegioEncontrado.rows.length === 0) {
            return res.status(404).json({ error: 'Colegio no encontrado' });
        }

        if (colegioEncontrado.rows[0].admin_id) {
            return res.status(400).json({ error: 'Este colegio ya tiene un administrador asignado' });
        }

        let codigo;
        let existe = true;
        let intentos = 0;
        do {
            codigo = generarCodigo(8);
            const check = await pool.query(
                'SELECT id FROM codigos_invitacion WHERE codigo = $1',
                [codigo]
            );
            existe = check.rows.length > 0;
            intentos++;
        } while (existe && intentos < 10);

        if (existe) {
            return res.status(500).json({ error: 'No se pudo generar un codigo unico, intenta de nuevo' });
        }

        const expiraEn = Number(diasValidez) > 0
            ? new Date(Date.now() + Number(diasValidez) * 24 * 60 * 60 * 1000)
            : null;

        console.log('[CODIGO ADMIN] codigo generado:', codigo);

        const resultado = await pool.query(
            `INSERT INTO codigos_invitacion (codigo, tipo, entidad_id, creado_por, max_usos, expira_en)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [codigo, 'colegio_admin', colegioId, req.user.id, maxUsos, expiraEn]
        );

        return res.status(201).json({
            mensaje: 'Codigo de invitacion generado correctamente',
            codigo: resultado.rows[0].codigo,
            expira_en: resultado.rows[0].expira_en,
            colegio: colegioEncontrado.rows[0].nombre,
        });
    } catch (error) {
        console.error('Error generando codigo admin superadmin:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};

module.exports = {
    listarColegiosSuperAdmin,
    crearColegioSuperAdmin,
    generarCodigoAdminSuperAdmin,
};
