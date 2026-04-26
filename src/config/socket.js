import { io } from 'socket.io-client';

const SOCKET_URL = 'https://transporte-backend-production.up.railway.app';

const socket = io(SOCKET_URL, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
});

socket.on('connect', () => {
    console.log('✅ Socket conectado:', socket.id);
});

socket.on('disconnect', () => {
    console.log('❌ Socket desconectado');
});

socket.on('connect_error', (err) => {
    console.log('⚠️ Error de conexión:', err.message);
});

export default socket;