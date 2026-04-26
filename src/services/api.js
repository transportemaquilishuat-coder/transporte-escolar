// src/services/api.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { obtenerToken } from './session';

const API_URL = 'https://transporte-backend-production.up.railway.app/api';

async function fetchWithAuth(endpoint, options = {}) {
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
}

export const vincularConCodigo = async (codigo, token) => {
    return fetchWithAuth('/vinculaciones/vincular-con-codigo', {
        method: 'POST',
        body: JSON.stringify({ codigo }),
        headers: token
            ? { Authorization: `Bearer ${token}` }
            : {},
    });
};

export default fetchWithAuth;
