import AsyncStorage from '@react-native-async-storage/async-storage';
import { desactivarTokenNotificaciones } from './notificaciones';
import { API_URL } from './apiConfig';

let tokenActual = null;
let usuarioActual = null;

export const guardarSesion = ({ token, usuario }) => {
  tokenActual = token || tokenActual; // Mantener token si no viene uno nuevo
  usuarioActual = usuario || null;

  if (token) {
    AsyncStorage.setItem('token', token).catch(() => {});
  }

  if (usuario) {
    AsyncStorage.setItem('usuario', JSON.stringify(usuario)).catch(() => {});
  }
};

export const obtenerToken = () => tokenActual;

export const obtenerUsuario = () => usuarioActual;

export const cargarSesionPersistida = async () => {
  const [token, rawUsuario] = await Promise.all([
    AsyncStorage.getItem('token'),
    AsyncStorage.getItem('usuario'),
  ]);

  if (!token || !rawUsuario) {
    return null;
  }

  try {
    const usuario = JSON.parse(rawUsuario);
    tokenActual = token;
    usuarioActual = usuario;
    return { token, usuario };
  } catch (_error) {
    await limpiarSesion({ desactivarPush: false });
    return null;
  }
};

/**
 * Verifica la sesión con el backend llamando a /auth/me
 * Esto asegura que el usuario tenga los datos más recientes y el token sea válido.
 */
export const verificarSesion = async () => {
  try {
    const sesion = await cargarSesionPersistida();
    if (!sesion) return null;

    const respuesta = await fetch(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${sesion.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (respuesta.ok) {
      const datos = await respuesta.json();
      const usuarioActualizado = datos.usuario || datos;
      guardarSesion({ token: sesion.token, usuario: usuarioActualizado });
      return { token: sesion.token, usuario: usuarioActualizado };
    } else {
      // Si el token expiró o es inválido, limpiamos
      await limpiarSesion({ desactivarPush: false });
      return null;
    }
  } catch (error) {
    console.log('Error verificando sesion:', error);
    // En caso de error de red, intentamos usar la sesión local si existe
    return await cargarSesionPersistida();
  }
};

export const limpiarSesion = async ({ desactivarPush = true } = {}) => {
  const token = tokenActual || await AsyncStorage.getItem('token');

  if (desactivarPush && token) {
    await desactivarTokenNotificaciones(token);
  }

  tokenActual = null;
  usuarioActual = null;
  await Promise.all([
    AsyncStorage.removeItem('token'),
    AsyncStorage.removeItem('usuario'),
  ]);
};
