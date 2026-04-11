const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ mensaje: '🚌 API Transporte Escolar funcionando', version: '1.0.0' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/rutas', require('./routes/rutas'));
app.use('/api/alumnos', require('./routes/alumnos'));
app.use('/api/pagos', require('./routes/pagos'));
app.use('/api/asignaciones', require('./routes/asignaciones'));

// Ubicación actual del bus
let ubicacionBus = {
    latitude: 13.6929,
    longitude: -89.2182,
    conductor: null,
    activo: false,
};

// Endpoint para consultar ubicación actual del bus
app.get('/api/ubicacion', (req, res) => {
    res.json(ubicacionBus);
});

// WebSocket
io.on('connection', (socket) => {
    console.log(`📱 Dispositivo conectado: ${socket.id}`);

    socket.on('conductor:ubicacion', (datos) => {
        ubicacionBus = { ...datos, activo: true };
        io.emit('bus:ubicacion', ubicacionBus);
        console.log(`📍 Bus en: ${datos.latitude}, ${datos.longitude}`);
    });

    socket.on('conductor:inicio_ruta', (datos) => {
        ubicacionBus.activo = true;
        io.emit('bus:inicio_ruta', datos);
        console.log('🟢 Ruta iniciada');
    });

    socket.on('conductor:fin_ruta', (datos) => {
        ubicacionBus.activo = false;
        io.emit('bus:fin_ruta', datos);
        console.log('🔴 Ruta finalizada');
    });

    socket.on('padre:solicitar_ubicacion', () => {
        socket.emit('bus:ubicacion', ubicacionBus);
    });

    socket.on('disconnect', () => {
        console.log(`📱 Dispositivo desconectado: ${socket.id}`);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});