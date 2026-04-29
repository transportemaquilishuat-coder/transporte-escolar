const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

const db = require('./database');
const pool = require('./database');

const app = express();
const server = http.createServer(app);

// 🔥 SOCKET.IO CONFIG
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = Number(process.env.PORT || 8080);
const BASE_URL = (process.env.BASE_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');

// 🔧 MIDDLEWARES
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Logger de peticiones para debug
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    if (req.method === 'POST') console.log('Body:', { ...req.body, password: '***' });
    next();
});

// 🌐 RUTA BASE
app.get('/', (req, res) => {
    res.json({
        mensaje: '🚌 API Transporte Escolar funcionando',
        version: '2.0.0'
    });
});

app.get('/health', (req, res) => {
    res.json({
        ok: true,
        service: 'transporte-backend',
        port: PORT,
    });
});

// 📦 RUTAS API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/rutas', require('./routes/rutas'));

// 🔧 DEBUG: Verificar usuarios en la base de datos
app.get('/api/debug/usuarios', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT id, email, rol, nombre, activo FROM usuarios LIMIT 10');
        res.json({ usuarios: resultado.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔧 DEBUG: Verificar super_admins
app.get('/api/debug/superadmins', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT id, email, nombre FROM super_admins LIMIT 10');
        res.json({ superadmins: resultado.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.use('/api/alumnos', require('./routes/alumnos'));
app.use('/api/pagos', require('./routes/pagos'));
app.use('/api/asignaciones', require('./routes/asignaciones'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/super-admin', require('./routes/superAdmin'));
app.use('/api/notificaciones', require('./routes/notificaciones'));
app.use('/api/padres', require('./routes/padres'));
app.use('/api/colegios', require('./routes/colegios'));
app.use('/api/desvios', require('./routes/desvios'));
app.use('/api/vinculaciones', require('./routes/vinculaciones'));
// ================================
// 🚍 ESTADO GLOBAL EN MEMORIA
// ================================

// Ubicación general (para compatibilidad con app padre)
let ubicacionBus = {
    latitude: 13.6929,
    longitude: -89.2182,
    conductorId: null,
    activo: false,
};

// 🔥 MULTI-CONDUCTORES (clave para admin PRO)
let conductoresActivos = {};

// ================================
// 📍 ENDPOINT REST (fallback)
// ================================
app.get('/api/ubicacion', (req, res) => {
    res.json(ubicacionBus);
});

// ================================
// ⚡ WEBSOCKET (TIEMPO REAL REAL)
// ================================
io.on('connection', (socket) => {

    console.log(`🟢 Cliente conectado: ${socket.id}`);

    // 🚍 Conductor envía ubicación
    socket.on('conductor:ubicacion', (datos) => {

        // Guardar última ubicación global
        ubicacionBus = {
            latitude: datos.latitude,
            longitude: datos.longitude,
            conductorId: datos.conductorId || null,
            activo: true,
        };

        // Guardar por conductor (multi-ruta)
        if (datos.conductorId) {
            conductoresActivos[datos.conductorId] = {
                id: datos.conductorId,
                latitude: datos.latitude,
                longitude: datos.longitude,
                nombre: datos.nombre || 'Conductor',
                ruta: datos.ruta || 'Sin ruta',
                activo: true,
                ultimaActualizacion: new Date().toISOString(),
            };
        }

        // 📡 Emitir a TODOS
        io.emit('bus:ubicacion', ubicacionBus);
        // Verificar desvío y notificar
        if (datos.conductorId && datos.rutaId) {
            fetch(`${BASE_URL}/api/desvios/verificar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conductorId: datos.conductorId,
                    rutaId: datos.rutaId,
                    latitude: datos.latitude,
                    longitude: datos.longitude,
                }),
            })
                .then(r => r.json())
                .then(resultado => {
                    if (resultado.desviado) {
                        io.emit('bus:desvio', {
                            conductorId: datos.conductorId,
                            distanciaMetros: resultado.distanciaMetros,
                            mensaje: resultado.mensaje,
                        });
                        console.log(`⚠️ Desvío detectado: ${resultado.distanciaMetros}m`);
                    }
                })
                .catch(e => console.log('Error verificando desvío:', e));
        }
        io.emit('admin:conductores_activos', Object.values(conductoresActivos));

    });

    // 🟢 Inicio de ruta
    socket.on('conductor:inicio_ruta', (datos) => {
        ubicacionBus.activo = true;

        io.emit('bus:inicio_ruta', datos);
        console.log(`🟢 Ruta iniciada por conductor ${datos.conductorId}`);
    });

    // 🔴 Fin de ruta
    socket.on('conductor:fin_ruta', (datos) => {

        ubicacionBus.activo = false;

        if (datos.conductorId) {
            delete conductoresActivos[datos.conductorId];
        }

        io.emit('bus:fin_ruta', datos);
        io.emit('admin:conductores_activos', Object.values(conductoresActivos));

        console.log(`🔴 Ruta finalizada por conductor ${datos.conductorId}`);
    });

    // 👨‍👩‍👧 Padre solicita ubicación
    socket.on('padre:solicitar_ubicacion', () => {
        socket.emit('bus:ubicacion', ubicacionBus);
    });

    // 🧑‍💼 Admin solicita lista activa
    socket.on('admin:solicitar_conductores', () => {
        socket.emit('admin:conductores_activos', Object.values(conductoresActivos));
    });

    // 🔌 Desconexión
    socket.on('disconnect', () => {
        console.log(`🔴 Cliente desconectado: ${socket.id}`);
    });

});

// ================================
// 🚀 START SERVER
// ================================
// Admin consulta conductores activos (REST fallback)
app.get('/api/admin/conductores-activos', (req, res) => {
    res.json({
        conductores: Object.values(conductoresActivos),
        total: Object.values(conductoresActivos).length,
    });
});

(async () => {
    await db.ready;

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Servidor corriendo en puerto ${PORT}`);
        console.log(`🌐 BASE_URL configurada: ${BASE_URL}`);
    });
})().catch((err) => {
    console.error('No se pudo iniciar el servidor:', err);
    process.exit(1);
});
