import AsyncStorage from '@react-native-async-storage/async-storage';
import { desactivarTokenNotificaciones } from './notificaciones';

let tokenActual = null;
let usuarioActual = null;

export const guardarSesion = ({ token, usuario }) => {
  tokenActual = token || null;
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
    guardarSesion({ token, usuario });
    return { token, usuario };
  } catch (_error) {
    await limpiarSesion({ desactivarPush: false });
    return null;
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
