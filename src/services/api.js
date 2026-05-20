// src/services/api.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { obtenerToken } from './session';
import { API_URL } from './apiConfig';

async function fetchWithAuth(endpoint, options = {}) {
    try {
        const tokenMemoria = obtenerToken();
        const tokenStorage = await AsyncStorage.getItem('token');
        const token = tokenMemoria || tokenStorage;

        const config = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token && { Authorization: `Bearer ${token}` }),
                ...options.headers,
            },
        };

        const response = await fetch(`${API_URL}${endpoint}`, config);
        const rawBody = await response.text();
        let data = null;

        if (rawBody) {
            try {
                data = JSON.parse(rawBody);
            } catch (_error) {
                data = { raw: rawBody };
            }
        }

        if (!response.ok) {
            const detalle = data?.error || data?.message || data?.raw || response.statusText || `Error ${response.status}`;
            throw new Error(`${response.status} ${detalle}`.trim());
        }

        return data;
    } catch (error) {
        console.error(`[API Error] ${endpoint}:`, error.message);
        throw error;
    }
}

export const vincularConCodigo = async (codigo, token, datos = {}) => {
    // Si se proporciona un token manualmente, lo usamos en los headers
    const options = {
        method: 'POST',
        body: JSON.stringify({ codigo: String(codigo || '').trim().toUpperCase(), ...datos }),
    };

    if (token) {
        options.headers = { Authorization: `Bearer ${token}` };
    }

    return fetchWithAuth('/vinculaciones/vincular-con-codigo', options);
};

export const generarInvitacionPadre = async (alumnoId) => {
    return fetchWithAuth(`/padres/hijos/${alumnoId}/generar-invitacion`, {
        method: 'POST',
    });
};

export const compartirSeguimientoPorTelefono = async (alumnoId, telefono) => {
    return fetchWithAuth(`/padres/hijos/${alumnoId}/compartir-por-telefono`, {
        method: 'POST',
        body: JSON.stringify({ telefono: String(telefono).trim() }),
    });
};

export const obtenerCambiosProgramados = async () => {
    return fetchWithAuth('/programacion/mis-hijos-cambios');
};

export const crearCambioProgramado = async (datos) => {
    return fetchWithAuth('/programacion', {
        method: 'POST',
        body: JSON.stringify(datos),
    });
};

export const eliminarCambioProgramado = async (id) => {
    return fetchWithAuth(`/programacion/${id}`, {
        method: 'DELETE',
    });
};

export default fetchWithAuth;
