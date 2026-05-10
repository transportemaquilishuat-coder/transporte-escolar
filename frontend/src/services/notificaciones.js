import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { API_URL } from './apiConfig';

// Configurar cómo se muestran las notificaciones
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

// Solicitar permisos
const obtenerProjectId = () => (
    Constants.expoConfig?.extra?.eas?.projectId
    || Constants.easConfig?.projectId
    || Constants.manifest2?.extra?.expoClient?.extra?.eas?.projectId
);

const obtenerExpoPushToken = async () => {
    if (Platform.OS === 'web' || !Device.isDevice) {
        return null;
    }

    const projectId = obtenerProjectId();
    
    // Si no hay projectId (común en desarrollo sin EAS configurado), evitar llamar a la API que lanza el warning
    if (!projectId && !Constants.expoConfig?.extra?.eas?.projectId) {
        console.log('Aviso: Saltando registro de notificaciones remotas (Falta projectId).');
        return null;
    }

    try {
        const respuesta = await Notifications.getExpoPushTokenAsync({
            projectId: projectId || Constants.expoConfig?.extra?.eas?.projectId
        });
        return respuesta?.data || null;
    } catch (e) {
        console.log('Error obteniendo token push:', e.message);
        return null;
    }
};

const guardarTokenEnBackend = async ({ usuarioId, expoPushToken, tokenSesion }) => {
    if (!expoPushToken || !tokenSesion) return;

    await fetch(`${API_URL}/notificaciones/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenSesion}`,
        },
        body: JSON.stringify({
            usuarioId,
            token: expoPushToken,
            pushToken: expoPushToken,
            plataforma: Platform.OS,
            dispositivo: Device.deviceName || Device.modelName || Platform.OS,
        }),
    });
};

export const desactivarTokenNotificaciones = async (tokenSesion) => {
    try {
        if (!tokenSesion || Platform.OS === 'web') return;

        const expoPushToken = await obtenerExpoPushToken();
        if (!expoPushToken) return;

        await fetch(`${API_URL}/notificaciones/token`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${tokenSesion}`,
            },
            body: JSON.stringify({
                token: expoPushToken,
                pushToken: expoPushToken,
                plataforma: Platform.OS,
            }),
        });
    } catch (error) {
        console.log('Error desactivando token push:', error);
    }
};

export const registrarNotificaciones = async (usuarioId, tokenSesion) => {
    try {
        if (Platform.OS === 'web') {
            return null;
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.log('Permiso de notificaciones denegado');
            return null;
        }

        // Canal para Android
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('transporte', {
                name: 'KidsGo!',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                sound: true,
            });
        }

        const expoPushToken = await obtenerExpoPushToken();
        await guardarTokenEnBackend({ usuarioId, expoPushToken, tokenSesion });

        console.log('Notificaciones activadas para usuario:', usuarioId);
        return expoPushToken || true;

    } catch (error) {
        console.log('Error registrando notificaciones:', error);
        return null;
    }
};

// Notificación local inmediata
export const enviarNotificacionLocal = async (titulo, mensaje, datos = {}) => {
    await Notifications.scheduleNotificationAsync({
        content: {
            title: titulo,
            body: mensaje,
            sound: true,
            data: datos,
        },
        trigger: null,
    });
};

// Notificación programada (en X segundos)
export const programarNotificacion = async (titulo, mensaje, segundos, datos = {}) => {
    await Notifications.scheduleNotificationAsync({
        content: {
            title: titulo,
            body: mensaje,
            sound: true,
            data: datos,
        },
        trigger: { seconds: segundos },
    });
};

export const programarNotificacionFecha = async (titulo, mensaje, fecha, datos = {}) => {
    await Notifications.scheduleNotificationAsync({
        content: {
            title: titulo,
            body: mensaje,
            sound: true,
            data: datos,
        },
        trigger: fecha,
    });
};

export const programarNotificacionDiaria = async (titulo, mensaje, hora, minuto, datos = {}) => {
    await Notifications.scheduleNotificationAsync({
        content: {
            title: titulo,
            body: mensaje,
            sound: true,
            data: datos,
        },
        trigger: {
            hour: hora,
            minute: minuto,
            repeats: true,
        },
    });
};

export const cancelarNotificacionesPorTipo = async (tipo) => {
    const programadas = await Notifications.getAllScheduledNotificationsAsync();
    const objetivo = programadas.filter((item) => item.content?.data?.tipo === tipo);

    await Promise.all(
        objetivo.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier))
    );

    return objetivo.length;
};

// Escuchar notificaciones
export const escucharNotificaciones = (onRecibida, onPresionada) => {
    const s1 = Notifications.addNotificationReceivedListener(onRecibida);
    const s2 = Notifications.addNotificationResponseReceivedListener(onPresionada);
    return () => { s1.remove(); s2.remove(); };
};
