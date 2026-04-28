require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { SESSION_EXPIRES_IN, firmarTokenSesion } = require('../utils/authTokens');
const {
    listarColegiosSuperAdmin,
    crearColegioSuperAdmin,
    generarCodigoAdminSuperAdmin,
} = require('../controllers/colegiosSuperAdmin');

// ============================================
// UTILIDADES
// ============================================

const verificarCodigo = async (codigo, tipoRequerido) => {
    const resultado = await pool.query(
        `SELECT c.*, 
      (c.usos_actuales >= c.max_usos) as usado_completamente,
      (c.expira_en IS NOT NULL AND c.expira_en < NOW()) as expirado
     FROM codigos_invitacion c
     WHERE c.codigo = $1 AND c.activo = true`,
        [codigo.toUpperCase()]
    );

    if (resultado.rows.length === 0) {
        return { valido: false, error: 'Código no encontrado' };
    }

    const codigoData = resultado.rows[0];

    if (codigoData.usado_completamente) {
        return { valido: false, error: 'Código ya fue usado el máximo de veces permitido' };
    }

    if (codigoData.expirado) {
        return { valido: false, error: 'Código expirado' };
    }

    if (codigoData.tipo !== tipoRequerido) {
        return { valido: false, error: 'Código no válido para este tipo de vinculación' };
    }

    return { valido: true, codigo: codigoData };
};

const TIPOS_CODIGO = ['colegio_admin', 'colegio_conductor', 'conductor_padre'];

const generarCodigo = (longitud = 8) => {
    const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let codigo = '';
    for (let i = 0; i < longitud; i += 1) {
        codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return codigo;
};

const normalizarCodigo = (codigo) =>
    String(codigo || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

const obtenerCodigoValido = async (codigo) => {
    const codigoNormalizado = normalizarCodigo(codigo);
    let ultimoError = 'Codigo invalido';

    for (const tipo of TIPOS_CODIGO) {
        const verificacion = await verificarCodigo(codigoNormalizado, tipo);
        if (verificacion.valido) {
            return verificacion;
        }

        if (
            verificacion.error &&
            !verificacion.error.includes('tipo de vinculaci')
        ) {
            ultimoError = verificacion.error;
        }
    }

    return { valido: false, error: ultimoError };
};

const resolverDestinoVinculacion = async (client, codigoData) => {
    switch (codigoData.tipo) {
        case 'colegio_admin':
            return {
                rol: 'admin',
                colegioId: codigoData.entidad_id,
                conductorId: null
            };
        case 'colegio_conductor':
            return {
                rol: 'conductor',
                colegioId: codigoData.entidad_id,
                conductorId: null
            };
        case 'conductor_padre': {
            const rutaCond = await client.query(
                'SELECT colegio_id FROM rutas WHERE conductor_id = $1 LIMIT 1',
                [codigoData.entidad_id]
            );

            return {
                rol: 'padre',
                colegioId: rutaCond.rows[0]?.colegio_id || null,
                conductorId: codigoData.entidad_id
            };
        }
        default:
            throw new Error('Tipo de codigo no valido');
    }
};

const tipoCodigoEsperadoPorRol = {
    admin: 'colegio_admin',
    conductor: 'colegio_conductor',
    padre: 'conductor_padre',
};

const validarCodigoParaUsuario = (usuario, codigoData) => {
    const tipoEsperado = tipoCodigoEsperadoPorRol[usuario.rol];

    if (!tipoEsperado) {
        return { valido: false, error: 'Rol de usuario no valido para vinculacion' };
    }

    if (codigoData.tipo !== tipoEsperado) {
        return {
            valido: false,
            error: `Este codigo es para ${codigoData.tipo}, pero tu cuenta es ${usuario.rol}`,
        };
    }

    return { valido: true };
};

// ============================================
// 1. SUPERADMIN: Gestionar Colegios y Códigos
// ============================================

// GET /api/vinculaciones/superadmin/colegios
// Lista todos los colegios con su admin vinculado
router.get('/superadmin/colegios', authenticateToken, requireRole('super_admin'), listarColegiosSuperAdmin);

// POST /api/vinculaciones/superadmin/colegios
// Crea un nuevo colegio
router.post('/superadmin/colegios', authenticateToken, requireRole('super_admin'), crearColegioSuperAdmin);

// POST /api/vinculaciones/superadmin/colegios/:colegioId/codigo
// Genera c??digo de invitaci??n para que un admin se vincule a este colegio
router.post('/superadmin/colegios/:colegioId/codigo', authenticateToken, requireRole('super_admin'), generarCodigoAdminSuperAdmin);

// GET /api/vinculaciones/superadmin/codigos
// Lista todos los códigos generados
router.get('/superadmin/codigos', authenticateToken, requireRole('super_admin'), async (req, res) => {
    try {
        const resultado = await pool.query(`
      SELECT
        c.id,
        c.codigo,
        c.tipo,
        c.entidad_id,
        c.creado_por,
        c.usado_por,
        c.usado_en,
        c.max_usos,
        c.usos_actuales,
        c.activo,
        c.expira_en,
        c.creado_en,
        co.nombre as colegio_nombre,
        COALESCE(sa.nombre, u.nombre, 'Sistema') as creado_por_nombre
      FROM codigos_invitacion c
      LEFT JOIN colegios co ON co.id = c.entidad_id
      LEFT JOIN super_admins sa ON sa.id = c.creado_por
      LEFT JOIN usuarios u ON u.id = c.creado_por
      WHERE c.tipo = 'colegio_admin'
      ORDER BY c.creado_en DESC
    `);
        res.json({ codigos: resultado.rows });
    } catch (error) {
        console.error('Error listando códigos:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            hint: error.hint,
            table: error.table,
            column: error.column,
            constraint: error.constraint,
        });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ============================================
// 2. REGISTRO CON CÓDIGO (Admin, Conductor, Padre)
// ============================================

// POST /api/vinculaciones/registro-con-codigo
// Registro de usuario usando código de invitación
router.post('/registro-con-codigo', async (req, res) => {
    const {
        nombre, email, password, telefono, dui,
        licencia, placa, codigo, rol
    } = req.body;
    const emailNormalizado = String(email || '').trim().toLowerCase();

    if (!nombre || !emailNormalizado || !password || !codigo || !rol) {
        return res.status(400).json({ error: 'Nombre, email, contrasena, rol y codigo son requeridos' });
    }

    if (!tipoCodigoEsperadoPorRol[rol]) {
        return res.status(400).json({ error: 'Rol invalido para vinculacion' });
    }

    try {
        // Verificar que el email no exista
        const existeEmail = await pool.query(
            'SELECT id FROM usuarios WHERE email = $1 UNION SELECT id FROM super_admins WHERE email = $1',
            [emailNormalizado]
        );
        if (existeEmail.rows.length > 0) {
            return res.status(400).json({ error: 'El correo ya está registrado' });
        }

        // Verificar código
        const verificacion = await obtenerCodigoValido(codigo);

        if (!verificacion.valido) {
            return res.status(400).json({ error: verificacion.error || 'C??digo inv??lido' });
        }

        const codigoData = verificacion.codigo;
        const validacionRol = validarCodigoParaUsuario({ rol }, codigoData);
        if (!validacionRol.valido) {
            return res.status(400).json({ error: validacionRol.error });
        }

        const { colegioId, conductorId } = await resolverDestinoVinculacion(pool, codigoData);

        const passwordHash = await bcrypt.hash(password, 10);

        // Crear usuario
        const resultado = await pool.query(
            `INSERT INTO usuarios (nombre, email, password, rol, telefono, dui, licencia, placa, colegio_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, nombre, email, rol, colegio_id`,
            [nombre, emailNormalizado, passwordHash, rol, telefono, dui, licencia, placa, colegioId]
        );

        const nuevoUsuario = resultado.rows[0];

        // Marcar código como usado
        await pool.query(
            `UPDATE codigos_invitacion 
       SET usos_actuales = usos_actuales + 1, usado_por = $1, usado_en = NOW()
       WHERE id = $2`,
            [nuevoUsuario.id, codigoData.id]
        );

        // Si es admin, actualizar el colegio
        if (rol === 'admin') {
            await pool.query(
                'UPDATE colegios SET admin_id = $1, activo = true WHERE id = $2',
                [nuevoUsuario.id, colegioId]
            );
        }

        // Registrar vinculación
        await pool.query(
            `INSERT INTO vinculaciones (tipo, entidad_id, vinculado_por, colegio_id, conductor_id, codigo_usado, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 'activo')`,
            [codigoData.tipo, nuevoUsuario.id, codigoData.creado_por, colegioId, conductorId, codigoData.codigo]
        );

        // Generar token
        const token = firmarTokenSesion({
            id: nuevoUsuario.id,
            email: nuevoUsuario.email,
            rol: nuevoUsuario.rol,
            tipo: 'usuario',
        });

        res.status(201).json({
            mensaje: 'Usuario registrado y vinculado correctamente',
            token,
            expiresIn: SESSION_EXPIRES_IN,
            usuario: nuevoUsuario
        });

    } catch (error) {
        console.error('Error en registro con código:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/vinculaciones/vincular-con-codigo
// Vincula una cuenta existente usando un codigo de invitacion
router.post('/vincular-con-codigo', authenticateToken, async (req, res) => {
    const { codigo } = req.body;

    if (!codigo) {
        return res.status(400).json({ error: 'El codigo es requerido' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const usuarioResult = await client.query(
            'SELECT id, nombre, email, rol, telefono, colegio_id, activo FROM usuarios WHERE id = $1',
            [req.user.id]
        );

        if (usuarioResult.rows.length === 0 || !usuarioResult.rows[0].activo) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Usuario no encontrado o inactivo' });
        }

        const usuario = usuarioResult.rows[0];
        const verificacion = await obtenerCodigoValido(codigo);

        if (!verificacion.valido) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: verificacion.error || 'Codigo invalido' });
        }

        const codigoData = verificacion.codigo;
        const { rol, colegioId, conductorId } = await resolverDestinoVinculacion(client, codigoData);
        const validacionRol = validarCodigoParaUsuario(usuario, codigoData);
        if (!validacionRol.valido) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: validacionRol.error });
        }

        if (codigoData.tipo === 'colegio_admin') {
            const colegioResult = await client.query(
                'SELECT id, admin_id FROM colegios WHERE id = $1',
                [colegioId]
            );

            if (colegioResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Colegio no encontrado' });
            }

            const adminActual = colegioResult.rows[0].admin_id;
            if (adminActual && Number(adminActual) !== Number(usuario.id)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Este colegio ya tiene un administrador asignado' });
            }
        }

        if (usuario.colegio_id && colegioId && Number(usuario.colegio_id) !== Number(colegioId)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Tu cuenta ya esta vinculada a otro colegio' });
        }

        const vinculacionExistente = await client.query(
            `SELECT id
             FROM vinculaciones
             WHERE tipo = $1
               AND entidad_id = $2
               AND estado = 'activo'
               AND (($3::INTEGER IS NULL AND conductor_id IS NULL) OR conductor_id = $3)`,
            [codigoData.tipo, usuario.id, conductorId]
        );

        if (vinculacionExistente.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Tu cuenta ya esta vinculada con este codigo' });
        }

        const usuarioActualizado = await client.query(
            `UPDATE usuarios
             SET rol = $1, colegio_id = COALESCE($2, colegio_id)
             WHERE id = $3
             RETURNING id, nombre, email, rol, telefono, colegio_id`,
            [rol, colegioId, usuario.id]
        );

        if (rol === 'admin') {
            await client.query(
                'UPDATE colegios SET admin_id = $1, activo = true WHERE id = $2',
                [usuario.id, colegioId]
            );
        }

        await client.query(
            `INSERT INTO vinculaciones (tipo, entidad_id, vinculado_por, colegio_id, conductor_id, codigo_usado, estado)
             VALUES ($1, $2, $3, $4, $5, $6, 'activo')`,
            [codigoData.tipo, usuario.id, codigoData.creado_por, colegioId, conductorId, codigoData.codigo]
        );

        await client.query(
            `UPDATE codigos_invitacion
             SET usos_actuales = usos_actuales + 1, usado_por = $1, usado_en = NOW()
             WHERE id = $2`,
            [usuario.id, codigoData.id]
        );

        const colegioInfo = colegioId
            ? await client.query('SELECT nombre, logo_url FROM colegios WHERE id = $1', [colegioId])
            : { rows: [] };

        await client.query('COMMIT');

        const usuarioFinal = usuarioActualizado.rows[0];
        const token = firmarTokenSesion({
            id: usuarioFinal.id,
            email: usuarioFinal.email,
            rol: usuarioFinal.rol,
            tipo: 'usuario',
        });

        res.json({
            mensaje: 'Cuenta vinculada correctamente',
            token,
            expiresIn: SESSION_EXPIRES_IN,
            usuario: {
                id: usuarioFinal.id,
                nombre: usuarioFinal.nombre,
                email: usuarioFinal.email,
                rol: usuarioFinal.rol,
                telefono: usuarioFinal.telefono,
                colegioId: usuarioFinal.colegio_id,
                colegioNombre: colegioInfo.rows[0]?.nombre || null,
                logoUrl: colegioInfo.rows[0]?.logo_url || null
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error vinculando cuenta con codigo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    } finally {
        client.release();
    }
});

// ============================================
// 3. ADMIN: Gestionar Conductores
// ============================================

// GET /api/vinculaciones/admin/conductores
// Lista conductores del colegio del admin
router.get('/admin/conductores', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const admin = await pool.query(
            'SELECT colegio_id FROM usuarios WHERE id = $1',
            [req.user.id]
        );

        if (!admin.rows[0]?.colegio_id) {
            return res.status(400).json({ error: 'No tienes un colegio asignado' });
        }

        const colegioId = admin.rows[0].colegio_id;

        const resultado = await pool.query(`
      SELECT u.id, u.nombre, u.email, u.telefono, u.dui, u.licencia, u.placa, u.activo, u.creado_en,
        (SELECT COUNT(*) FROM rutas WHERE conductor_id = u.id) as total_rutas
      FROM usuarios u
      WHERE u.colegio_id = $1 AND u.rol = 'conductor' AND u.activo = true
      ORDER BY u.nombre
    `, [colegioId]);

        res.json({ conductores: resultado.rows });
    } catch (error) {
        console.error('Error listando conductores:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/vinculaciones/admin/conductores/codigo
// Admin genera código para que un conductor se vincule
router.post('/admin/conductores/codigo', authenticateToken, requireRole('admin'), async (req, res) => {
    const { maxUsos = 1, diasValidez = 7 } = req.body;

    try {
        const admin = await pool.query(
            'SELECT colegio_id FROM usuarios WHERE id = $1',
            [req.user.id]
        );

        if (!admin.rows[0]?.colegio_id) {
            return res.status(400).json({ error: 'No tienes un colegio asignado' });
        }

        const colegioId = admin.rows[0].colegio_id;

        // Generar código único
        let codigo;
        let existe = true;
        let intentos = 0;
        do {
            codigo = generarCodigo(8);
            const check = await pool.query('SELECT id FROM codigos_invitacion WHERE codigo = $1', [codigo]);
            existe = check.rows.length > 0;
            intentos++;
        } while (existe && intentos < 10);

        if (existe) {
            return res.status(500).json({ error: 'No se pudo generar un código único' });
        }

        const expiraEn = diasValidez > 0
            ? new Date(Date.now() + diasValidez * 24 * 60 * 60 * 1000)
            : null;

        const resultado = await pool.query(
            `INSERT INTO codigos_invitacion (codigo, tipo, entidad_id, creado_por, max_usos, expira_en)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [codigo, 'colegio_conductor', colegioId, req.user.id, maxUsos, expiraEn]
        );

        res.status(201).json({
            mensaje: 'Código para conductor generado correctamente',
            codigo: resultado.rows[0].codigo,
            expira_en: resultado.rows[0].expira_en
        });
    } catch (error) {
        console.error('Error generando código de conductor:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/vinculaciones/admin/conductores/directo
// Admin asigna un conductor existente directamente (por email)
router.post('/admin/conductores/directo', authenticateToken, requireRole('admin'), async (req, res) => {
    const { email, nombre, telefono, dui, licencia, placa, password } = req.body;

    if (!email || !nombre || !password) {
        return res.status(400).json({ error: 'Email, nombre y contraseña son requeridos' });
    }

    try {
        const admin = await pool.query(
            'SELECT colegio_id FROM usuarios WHERE id = $1',
            [req.user.id]
        );

        if (!admin.rows[0]?.colegio_id) {
            return res.status(400).json({ error: 'No tienes un colegio asignado' });
        }

        const colegioId = admin.rows[0].colegio_id;

        // Verificar que el email no exista
        const existe = await pool.query(
            'SELECT id FROM usuarios WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existe.rows.length > 0) {
            // Si existe y no tiene colegio, lo vinculamos
            const usuarioExistente = await pool.query(
                'SELECT * FROM usuarios WHERE id = $1',
                [existe.rows[0].id]
            );

            if (usuarioExistente.rows[0].colegio_id) {
                return res.status(400).json({ error: 'Este conductor ya está vinculado a otro colegio' });
            }

            await pool.query(
                'UPDATE usuarios SET colegio_id = $1, rol = $2 WHERE id = $3',
                [colegioId, 'conductor', existe.rows[0].id]
            );

            // Registrar vinculación
            await pool.query(
                `INSERT INTO vinculaciones (tipo, entidad_id, vinculado_por, colegio_id, estado)
         VALUES ($1, $2, $3, $4, 'activo')`,
                ['colegio_conductor', existe.rows[0].id, req.user.id, colegioId]
            );

            return res.json({
                mensaje: 'Conductor existente vinculado correctamente',
                conductor: usuarioExistente.rows[0]
            });
        }

        // Crear nuevo conductor
        const passwordHash = await bcrypt.hash(password, 10);
        const resultado = await pool.query(
            `INSERT INTO usuarios (nombre, email, password, rol, telefono, dui, licencia, placa, colegio_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, nombre, email, rol, colegio_id`,
            [nombre, email.toLowerCase(), passwordHash, 'conductor', telefono, dui, licencia, placa, colegioId]
        );

        // Registrar vinculación
        await pool.query(
            `INSERT INTO vinculaciones (tipo, entidad_id, vinculado_por, colegio_id, estado)
       VALUES ($1, $2, $3, $4, 'activo')`,
            ['colegio_conductor', resultado.rows[0].id, req.user.id, colegioId]
        );

        res.status(201).json({
            mensaje: 'Conductor creado y vinculado correctamente',
            conductor: resultado.rows[0]
        });

    } catch (error) {
        console.error('Error en vinculación directa:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// DELETE /api/vinculaciones/admin/conductores/:conductorId
// Desvincular conductor del colegio
router.delete('/admin/conductores/:conductorId', authenticateToken, requireRole('admin'), async (req, res) => {
    const { conductorId } = req.params;

    try {
        const admin = await pool.query(
            'SELECT colegio_id FROM usuarios WHERE id = $1',
            [req.user.id]
        );

        if (!admin.rows[0]?.colegio_id) {
            return res.status(400).json({ error: 'No tienes un colegio asignado' });
        }

        const colegioId = admin.rows[0].colegio_id;

        // Verificar que el conductor pertenece a este colegio
        const conductor = await pool.query(
            'SELECT * FROM usuarios WHERE id = $1 AND colegio_id = $2 AND rol = $3',
            [conductorId, colegioId, 'conductor']
        );

        if (conductor.rows.length === 0) {
            return res.status(404).json({ error: 'Conductor no encontrado en tu colegio' });
        }

        // Desvincular (no eliminar, solo quitar colegio)
        await pool.query(
            'UPDATE usuarios SET colegio_id = NULL, activo = false WHERE id = $1',
            [conductorId]
        );

        // Actualizar vinculación
        await pool.query(
            `UPDATE vinculaciones SET estado = 'inactivo', actualizado_en = NOW()
       WHERE entidad_id = $1 AND tipo = 'colegio_conductor' AND colegio_id = $2`,
            [conductorId, colegioId]
        );

        res.json({ mensaje: 'Conductor desvinculado correctamente' });
    } catch (error) {
        console.error('Error desvinculando conductor:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ============================================
// 4. CONDUCTOR: Gestionar Padres
// ============================================

// GET /api/vinculaciones/conductor/padres
// Lista padres vinculados al conductor
router.get('/conductor/padres', authenticateToken, requireRole('conductor'), async (req, res) => {
    try {
        const resultado = await pool.query(`
      SELECT DISTINCT 
        u.id, u.nombre, u.email, u.telefono, u.dui, u.activo, u.creado_en,
        v.creado_en as vinculado_en
      FROM usuarios u
      JOIN vinculaciones v ON v.entidad_id = u.id AND v.tipo = 'conductor_padre'
      WHERE v.conductor_id = $1 AND u.rol = 'padre' AND u.activo = true
      ORDER BY u.nombre
    `, [req.user.id]);

        res.json({ padres: resultado.rows });
    } catch (error) {
        console.error('Error listando padres:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/vinculaciones/conductor/padres/codigo
// Conductor genera código para que un padre se vincule
router.post('/conductor/padres/codigo', authenticateToken, requireRole('conductor'), async (req, res) => {
    const { maxUsos = 1, diasValidez = 7 } = req.body;

    try {
        // Verificar que el conductor tiene al menos una ruta
        const rutas = await pool.query(
            'SELECT id FROM rutas WHERE conductor_id = $1 AND activa = true',
            [req.user.id]
        );

        if (rutas.rows.length === 0) {
            return res.status(400).json({ error: 'Debes tener al menos una ruta activa para generar códigos' });
        }

        // Generar código único
        let codigo;
        let existe = true;
        let intentos = 0;
        do {
            codigo = generarCodigo(8);
            const check = await pool.query('SELECT id FROM codigos_invitacion WHERE codigo = $1', [codigo]);
            existe = check.rows.length > 0;
            intentos++;
        } while (existe && intentos < 10);

        if (existe) {
            return res.status(500).json({ error: 'No se pudo generar un código único' });
        }

        const expiraEn = diasValidez > 0
            ? new Date(Date.now() + diasValidez * 24 * 60 * 60 * 1000)
            : null;

        const resultado = await pool.query(
            `INSERT INTO codigos_invitacion (codigo, tipo, entidad_id, creado_por, max_usos, expira_en)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [codigo, 'conductor_padre', req.user.id, req.user.id, maxUsos, expiraEn]
        );

        res.status(201).json({
            mensaje: 'Código para padre generado correctamente',
            codigo: resultado.rows[0].codigo,
            expira_en: resultado.rows[0].expira_en
        });
    } catch (error) {
        console.error('Error generando código de padre:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/vinculaciones/conductor/padres/directo
// Conductor asigna un padre existente directamente
router.post('/conductor/padres/directo', authenticateToken, requireRole('conductor'), async (req, res) => {
    const { email, nombre, telefono, dui, password, rutaId } = req.body;

    if (!email || !nombre || !password || !rutaId) {
        return res.status(400).json({ error: 'Email, nombre, contraseña y ruta son requeridos' });
    }

    try {
        // Verificar que la ruta pertenece al conductor
        const ruta = await pool.query(
            'SELECT * FROM rutas WHERE id = $1 AND conductor_id = $2',
            [rutaId, req.user.id]
        );

        if (ruta.rows.length === 0) {
            return res.status(404).json({ error: 'Ruta no encontrada o no te pertenece' });
        }

        const colegioId = ruta.rows[0].colegio_id;

        // Verificar que el email no exista
        const existe = await pool.query(
            'SELECT id FROM usuarios WHERE email = $1',
            [email.toLowerCase()]
        );

        let padreId;

        if (existe.rows.length > 0) {
            const usuarioExistente = await pool.query(
                'SELECT * FROM usuarios WHERE id = $1',
                [existe.rows[0].id]
            );

            if (usuarioExistente.rows[0].rol === 'padre' && usuarioExistente.rows[0].colegio_id) {
                return res.status(400).json({ error: 'Este padre ya está vinculado a otro colegio' });
            }

            await pool.query(
                'UPDATE usuarios SET colegio_id = $1, rol = $2 WHERE id = $3',
                [colegioId, 'padre', existe.rows[0].id]
            );
            padreId = existe.rows[0].id;
        } else {
            const passwordHash = await bcrypt.hash(password, 10);
            const resultado = await pool.query(
                `INSERT INTO usuarios (nombre, email, password, rol, telefono, dui, colegio_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                [nombre, email.toLowerCase(), passwordHash, 'padre', telefono, dui, colegioId]
            );
            padreId = resultado.rows[0].id;
        }

        // Registrar vinculación conductor-padre
        await pool.query(
            `INSERT INTO vinculaciones (tipo, entidad_id, vinculado_por, colegio_id, conductor_id, estado)
       VALUES ($1, $2, $3, $4, $5, 'activo')`,
            ['conductor_padre', padreId, req.user.id, colegioId, req.user.id]
        );

        res.status(201).json({
            mensaje: 'Padre vinculado correctamente',
            padre: { id: padreId, nombre, email }
        });

    } catch (error) {
        console.error('Error en vinculación directa de padre:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// DELETE /api/vinculaciones/conductor/padres/:padreId
// Desvincular padre
router.delete('/conductor/padres/:padreId', authenticateToken, requireRole('conductor'), async (req, res) => {
    const { padreId } = req.params;

    try {
        // Verificar que el padre está vinculado a este conductor
        const vinculacion = await pool.query(
            `SELECT * FROM vinculaciones 
       WHERE entidad_id = $1 AND conductor_id = $2 AND tipo = 'conductor_padre' AND estado = 'activo'`,
            [padreId, req.user.id]
        );

        if (vinculacion.rows.length === 0) {
            return res.status(404).json({ error: 'Padre no encontrado o no está vinculado a ti' });
        }

        // Desvincular
        await pool.query(
            `UPDATE vinculaciones SET estado = 'inactivo', actualizado_en = NOW()
       WHERE entidad_id = $1 AND conductor_id = $2 AND tipo = 'conductor_padre'`,
            [padreId, req.user.id]
        );

        // Opcional: quitar colegio al padre si no tiene más vinculaciones
        const otrasVinculaciones = await pool.query(
            `SELECT COUNT(*) FROM vinculaciones 
       WHERE entidad_id = $1 AND tipo = 'conductor_padre' AND estado = 'activo'`,
            [padreId]
        );

        if (parseInt(otrasVinculaciones.rows[0].count) === 0) {
            await pool.query(
                'UPDATE usuarios SET colegio_id = NULL WHERE id = $1',
                [padreId]
            );
        }

        res.json({ mensaje: 'Padre desvinculado correctamente' });
    } catch (error) {
        console.error('Error desvinculando padre:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ============================================
// 5. VERIFICAR CÓDIGO (Para el frontend)
// ============================================

// GET /api/vinculaciones/verificar-codigo/:codigo
router.get('/verificar-codigo/:codigo', async (req, res) => {
    const { codigo } = req.params;
    const codigoNormalizado = normalizarCodigo(codigo);

    if (!codigoNormalizado) {
        return res.status(400).json({ error: 'El codigo es requerido' });
    }

    try {
        const resultado = await pool.query(`
      SELECT
        c.*,
        co.nombre as colegio_nombre,
        conductor.nombre as conductor_nombre,
        u.nombre as creado_por_nombre
      FROM codigos_invitacion c
      LEFT JOIN colegios co ON co.id = c.entidad_id AND c.tipo IN ('colegio_admin', 'colegio_conductor')
      LEFT JOIN usuarios conductor ON conductor.id = c.entidad_id AND c.tipo = 'conductor_padre'
      LEFT JOIN usuarios u ON u.id = c.creado_por
      WHERE c.codigo = $1 AND c.activo = true
    `, [codigoNormalizado]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({ error: 'Código no encontrado o inactivo' });
        }

        const codigoData = resultado.rows[0];

        // Verificar expiración
        if (codigoData.expira_en && new Date(codigoData.expira_en) < new Date()) {
            return res.status(400).json({ error: 'Código expirado' });
        }

        // Verificar usos
        if (codigoData.usos_actuales >= codigoData.max_usos) {
            return res.status(400).json({ error: 'Código ya fue usado el máximo de veces permitido' });
        }

        res.json({
            valido: true,
            tipo: codigoData.tipo,
            colegio: codigoData.colegio_nombre,
            conductor: codigoData.conductor_nombre,
            expira_en: codigoData.expira_en,
            usos_restantes: codigoData.max_usos - codigoData.usos_actuales
        });

    } catch (error) {
        console.error('Error verificando código:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ============================================
// 6. PADRE: Ver mis vinculaciones
// ============================================

// GET /api/vinculaciones/padre/mis-conductores
router.get('/padre/mis-conductores', authenticateToken, requireRole('padre'), async (req, res) => {
    try {
        const resultado = await pool.query(`
      SELECT 
        u.id as conductor_id,
        u.nombre as conductor_nombre,
        u.telefono as conductor_telefono,
        c.nombre as colegio_nombre,
        r.id as ruta_id,
        r.nombre as ruta_nombre,
        v.creado_en as vinculado_en
      FROM vinculaciones v
      JOIN usuarios u ON u.id = v.conductor_id
      LEFT JOIN colegios c ON c.id = v.colegio_id
      LEFT JOIN rutas r ON r.conductor_id = u.id AND r.activa = true
      WHERE v.entidad_id = $1 AND v.tipo = 'conductor_padre' AND v.estado = 'activo'
    `, [req.user.id]);

        res.json({ conductores: resultado.rows });
    } catch (error) {
        console.error('Error listando conductores del padre:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;
