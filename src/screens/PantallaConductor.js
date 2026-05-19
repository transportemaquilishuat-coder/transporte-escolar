import { enviarNotificacionLocal } from '../services/notificaciones';
import socket from '../config/socket';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, StatusBar, Modal, TextInput, Alert, Animated, Easing, PanResponder, useWindowDimensions, Linking
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useKeepAwake } from 'expo-keep-awake';
import {
  Play, Square, MapPin, Users, GraduationCap,
  Clock, AlertCircle, Check, X, Plus, Trash2,
  LogOut, Activity, Navigation, KeyRound, UsersRound, Phone, Home
} from 'lucide-react-native';
import { useBranding } from '../hooks/useBranding';
import { cargarSesionPersistida, limpiarSesion, obtenerToken, obtenerUsuario } from '../services/session';

import { API_BASE_URL } from '../services/apiConfig';

const SERVIDOR = API_BASE_URL;
const GOOGLE_API_KEY = 'AIzaSyDVaVcUL_e_lO0nD29QUfOfl0u3RUUFEdM';
const CONDUCTOR_ID_DEMO = 2;
const RADIO_AUTO_ABORDAJE_METROS = 100;

// Función para obtener ETA real usando Google Directions API
const obtenerETADeGoogle = async (origen, destino) => {
  try {
    const origenStr = `${origen.latitude},${origen.longitude}`;
    const destinoStr = `${destino.latitude},${destino.longitude}`;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origenStr}&destination=${destinoStr}&key=${GOOGLE_API_KEY}&language=es`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const data = await response.json();

    if (data.status === 'OK' && data.routes.length > 0) {
      const leg = data.routes[0].legs[0];
      return {
        minutos: Math.round(leg.duration.value / 60),
        distancia: leg.distance.text
      };
    }
    return null;
  } catch (error) {
    return null;
  }
};

// Tema Gris Elegante - Sofisticado y moderno
const THEME = {
  primary: '#3A3A3C',
  primaryDark: '#2C2C2E',
  secondary: '#007AFF',
  background: '#F2F2F7',
  surface: '#FFFFFF',
  text: '#1C1C1E',
  textSecondary: '#8E8E93',
  border: '#E5E5EA',
  success: '#34C759',
  error: '#FF3B30',
  warning: '#FF9500',
  info: '#5856D6',
};

const TURNOS_ESTUDIO = {
  mañana: 'matutino',
  tarde: 'vespertino',
};

const OPCIONES_TURNO_ESTUDIO = [
  { key: 'matutino', label: 'Matutino' },
  { key: 'vespertino', label: 'Vespertino' },
];

const obtenerAuthHeaders = async () => {
  const token = obtenerToken() || await AsyncStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function PantallaConductor({ navigation }) {
  const { branding } = useBranding();
  const { height: windowHeight } = useWindowDimensions();
  useKeepAwake();

  // ========== ESTADOS ==========
  const [conductorId, setConductorId] = useState(obtenerUsuario()?.id || null);
  const [rutaActiva, setRutaActiva] = useState(false);
  const [socketConectado, setSocketConectado] = useState(socket.connected);
  const [eventos, setEventos] = useState([]);
  const [ubicacion, setUbicacion] = useState(null);
  const [usuario, setUsuario] = useState(obtenerUsuario());

  useEffect(() => {
    const user = obtenerUsuario();
    if (user) setUsuario(user);
  }, []);

  const [alumnos, setAlumnos] = useState([]);
  const [rutas, setRutas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const intervaloRef = useRef(null);
  const abordajesEnProcesoRef = useRef(new Set());
  const [tabActiva, setTabActiva] = useState('mapa');
  const [turno, setTurno] = useState(() => {
    const hora = new Date().getHours();
    return (hora >= 5 && hora < 12) ? 'mañana' : 'tarde';
  });
  const [sentido, setSentido] = useState(() => {
    const hora = new Date().getHours();
    return (hora >= 5 && hora < 12) ? 'recogida' : 'entrega';
  });
  const turnoEstudioActivo = TURNOS_ESTUDIO[turno] || 'matutino';
  const [modalAlumnoVisible, setModalAlumnoVisible] = useState(false);
  const [modalColegioVisible, setModalColegioVisible] = useState(false);
  const [codigoColegio, setCodigoColegio] = useState('');
  const [loadingVincular, setLoadingVincular] = useState(false);

  // Alertas y Autorizaciones (NUEVO FLUJO)
  const [ausenciasPendientes, setAusenciasPendientes] = useState([]);
  const [programacionesPendientes, setProgramacionesPendientes] = useState([]);
  const [solicitudesPendientes, setSolicitudesPendientes] = useState([]);
  const [modalAlertasVisible, setModalAlertasVisible] = useState(false);
  const [cargandoAlertas, setCargandoAlertas] = useState(false);

  const alturaMapaConductor = Math.max(430, Math.min(640, windowHeight - 165));

  // Sockets para alertas en tiempo real (NUEVO)
  useEffect(() => {
    if (!socket) return;
    
    const manejarNuevaAlerta = () => {
      cargarAlertasPendientes();
      // Pequeña notificación visual si el conductor está en la app
      agregarEvento('🔔 Nueva solicitud pendiente de revisión');
    };

    socket.on('parent:solicitud_cambio', manejarNuevaAlerta);
    socket.on('parent:nueva_ausencia', manejarNuevaAlerta);
    socket.on('parent:nueva_programacion', manejarNuevaAlerta);

    return () => {
      socket.off('parent:solicitud_cambio', manejarNuevaAlerta);
      socket.off('parent:nueva_ausencia', manejarNuevaAlerta);
      socket.off('parent:nueva_programacion', manejarNuevaAlerta);
    };
  }, []);

  // ... (dentro de las funciones)
  const cargarAlertasPendientes = async () => {
    setCargandoAlertas(true);
    try {
      const headers = await obtenerAuthHeaders();
      
      // Intentar cargar desde varios endpoints por compatibilidad con el backend
      const [resAus, resProg, resSol] = await Promise.all([
        fetch(`${SERVIDOR}/api/conductor/ausencias-pendientes`, { headers }).catch(() => null),
        fetch(`${SERVIDOR}/api/conductor/programaciones-pendientes`, { headers }).catch(() => null),
        fetch(`${SERVIDOR}/api/conductor/solicitudes-pendientes`, { headers }).catch(() => 
          fetch(`${SERVIDOR}/api/conductor/solicitudes?estado=pendiente`, { headers }) // Fallback
        )
      ]);

      const dataAus = resAus?.ok ? await resAus.json().catch(() => ({})) : {};
      const dataProg = resProg?.ok ? await resProg.json().catch(() => ({})) : {};
      const dataSol = resSol?.ok ? await resSol.json().catch(() => ({})) : {};

      const listaAusencias = dataAus.ausencias || dataAus.data || [];
      const listaProgramaciones = dataProg.programaciones || dataProg.data || [];
      const listaSolicitudes = dataSol.solicitudes || dataSol.data || dataSol.solicitudesPendientes || [];

      setAusenciasPendientes(Array.isArray(listaAusencias) ? listaAusencias : []);
      setProgramacionesPendientes(Array.isArray(listaProgramaciones) ? listaProgramaciones : []);
      setSolicitudesPendientes(Array.isArray(listaSolicitudes) ? listaSolicitudes : []);

      return (listaAusencias.length || 0) + (listaProgramaciones.length || 0) + (listaSolicitudes.length || 0);
    } catch (e) {
      console.log('Error cargando alertas:', e);
      return 0;
    } finally {
      setCargandoAlertas(false);
    }
  };

  const handleResponderAusencia = async (id, estado, respuesta = '') => {
    try {
      const res = await fetch(`${SERVIDOR}/api/conductor/ausencias/${id}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
        body: JSON.stringify({ estado, respuesta_conductor: respuesta }),
      });
      if (res.ok) {
        setAusenciasPendientes(prev => prev.filter(a => a.id !== id));
        cargarAlumnos(); // Refrescar lista para filtrar si fue autorizado
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo responder a la ausencia.');
    }
  };

  const handleResponderProgramacion = async (id, estado, respuesta = '') => {
    try {
      const res = await fetch(`${SERVIDOR}/api/conductor/programaciones/${id}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
        body: JSON.stringify({ estado, respuesta_conductor: respuesta }),
      });
      if (res.ok) {
        setProgramacionesPendientes(prev => prev.filter(p => p.id !== id));
        cargarAlumnos();
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo responder al cambio temporal.');
    }
  };

  const handleResponderSolicitud = async (id, estado, respuesta = '') => {
    try {
      // Usar endpoint existente para cambios permanentes
      const res = await fetch(`${SERVIDOR}/api/conductor/solicitudes/${id}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
        body: JSON.stringify({ estado, respuesta_conductor: respuesta }),
      });
      if (res.ok) {
        setSolicitudesPendientes(prev => prev.filter(s => s.id !== id));
        cargarAlumnos();
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo responder a la solicitud.');
    }
  };

  const handleVincularColegio = async () => {
    if (!codigoColegio.trim()) {
      Alert.alert('Error', 'Ingresa el código del colegio.');
      return;
    }

    setLoadingVincular(true);
    try {
      const res = await fetch(`${SERVIDOR}/api/vinculaciones/vincular-con-codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
        body: JSON.stringify({ codigo: codigoColegio.trim().toUpperCase() }),
      });

      const datos = await res.json();
      if (!res.ok) throw new Error(datos.error || 'No se pudo completar la vinculación');

      setModalColegioVisible(false);
      setCodigoColegio('');
      Alert.alert('¡Éxito!', `Tu unidad ha sido vinculada correctamente al colegio.`);
      
      // Actualizar datos del usuario localmente para reflejar la vinculación
      const usuarioActual = obtenerUsuario();
      if (usuarioActual) {
        const nuevoUsuario = { ...usuarioActual, colegioId: datos.colegioId, colegioNombre: datos.colegioNombre };
        setUsuario(nuevoUsuario);
        await AsyncStorage.setItem('usuario', JSON.stringify(nuevoUsuario));
      }
      
      cargarAlumnos();
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo vincular al colegio.');
    } finally {
      setLoadingVincular(false);
    }
  };
  const [loadingGestion, setLoadingGestion] = useState(false);
  const [mostrarAvisoAusentes, setMostrarAvisoAusentes] = useState(false);
  const [nuevoAlumno, setNuevoAlumno] = useState({
    nombre: '',
    grado: '',
    parada: '',
    telefonoPadre: '',
    ruta_id: null,
    turno_estudio: 'matutino'
  });
  const [desvioActivo, setDesvioActivo] = useState(false);
  const [distanciaDesvio, setDistanciaDesvio] = useState(0);
  const avisoAusentesAnim = useRef(new Animated.Value(0)).current;
  const alertasProximidadEnviadasRef = useRef(new Set());
  const mapOverlayPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const mapOverlayPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2,
      onPanResponderGrant: () => {
        mapOverlayPosition.extractOffset();
      },
      onPanResponderMove: Animated.event(
        [null, { dx: mapOverlayPosition.x, dy: mapOverlayPosition.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        mapOverlayPosition.flattenOffset();
      },
      onPanResponderTerminate: () => {
        mapOverlayPosition.flattenOffset();
      },
    })
  ).current;

  useEffect(() => {
    const onConnect = () => setSocketConectado(true);
    const onDisconnect = () => setSocketConectado(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  useEffect(() => {
    const cargarConductorSesion = async () => {
      const usuarioMemoria = obtenerUsuario();
      if (usuarioMemoria?.id) {
        setUsuario(usuarioMemoria);
        setConductorId(usuarioMemoria.id);
        return;
      }

      const sesion = await cargarSesionPersistida();
      if (sesion?.usuario?.id) {
        setUsuario(sesion.usuario);
        setConductorId(sesion.usuario.id);
      } else {
        setLoading(false);
      }
    };

    cargarConductorSesion();
  }, []);

  useEffect(() => {
    if (!conductorId) return undefined;

    cargarAlumnos();
    cargarAlertasPendientes();
    solicitarPermisos();

    // Polling de alertas cada 30 segundos
    const alertaInterval = setInterval(cargarAlertasPendientes, 30000);

    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
      clearInterval(alertaInterval);
    };
  }, [conductorId]);

  useEffect(() => {
    let timer = null;

    if (rutaActiva) {
      setMostrarAvisoAusentes(true);
      Animated.timing(avisoAusentesAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();

      timer = setTimeout(() => {
        Animated.timing(avisoAusentesAnim, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }).start(() => setMostrarAvisoAusentes(false));
      }, 6000);
    } else {
      setMostrarAvisoAusentes(false);
      avisoAusentesAnim.setValue(0);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [rutaActiva, avisoAusentesAnim]);

  const cerrarAvisoAusentes = () => {
    Animated.timing(avisoAusentesAnim, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => setMostrarAvisoAusentes(false));
  };

  useEffect(() => {
    if (conductorId) cargarAlumnos();
  }, [turno, sentido]);

  // ========== FUNCIONES ==========
  const cargarAlumnos = async () => {
    try {
      const url = `${SERVIDOR}/api/asignaciones/conductor/${conductorId || CONDUCTOR_ID_DEMO}?turno=${turno}&turno_estudio=${turnoEstudioActivo}&sentido=${sentido}`;
      const res = await fetch(url, {
        headers: await obtenerAuthHeaders(),
      });
      const datos = await res.json().catch(() => ({}));
      const alumnosRespuesta = Array.isArray(datos?.alumnos) ? datos.alumnos : [];
      const rutasRespuesta = Array.isArray(datos?.rutas) ? datos.rutas : [];

      if (!res.ok) {
        const mensaje = datos?.error || datos?.message || 'No se pudo cargar la lista de alumnos.';
        throw new Error(mensaje);
      }

      // Asegurar que no haya duplicados por ID (Gobernanza de datos)
      const alumnosUnicos = Array.from(new Map(alumnosRespuesta.map(a => [a.id, a])).values());

      const alumnosNormalizados = alumnosUnicos
        .map((alumno) => ({
          ...alumno,
          latitude: alumno.latitude != null ? Number(alumno.latitude) : null,
          longitude: alumno.longitude != null ? Number(alumno.longitude) : null,
        }))
        .sort((a, b) => (a.orden || 0) - (b.orden || 0));

      setAlumnos(alumnosNormalizados);
      setRutas(rutasRespuesta);
      setError('');
      if (rutasRespuesta.length > 0 && !nuevoAlumno.ruta_id) {
        setNuevoAlumno(prev => ({ ...prev, ruta_id: rutasRespuesta[0].id }));
      }
    } catch (e) {
      setAlumnos([]);
      setRutas([]);
      setError(e.message || 'No se pudo cargar la lista de alumnos.');
    } finally {
      setLoading(false);
    }
  };

  const solicitarPermisos = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') setError('Se necesita permiso de ubicación.');
  };

  const calcularDistanciaMetros = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handleLlamarPadre = (telefono, nombre) => {
    if (!telefono) {
      Alert.alert('Error', `No hay un teléfono registrado para el padre de ${nombre}.`);
      return;
    }
    Linking.openURL(`tel:${telefono}`);
  };

  const alumnosActivosEnRuta = alumnos.filter((alumno) => {
    const esInactivo = alumno.activo === false;
    const esAusenteAutorizado = alumno.infoAusencia?.esAusente && !alumno.infoAusencia?.pendienteAutorizacion;
    return !esInactivo && !esAusenteAutorizado;
  });

  const sincronizarAbordajesAutomaticos = async (coords) => {
    if (!coords) return;

    const candidatos = alumnosActivosEnRuta.filter((alumno) =>
      alumno.estado !== 'abordado' &&
      alumno.latitude != null &&
      alumno.longitude != null &&
      !abordajesEnProcesoRef.current.has(alumno.id) &&
      calcularDistanciaMetros(
        coords.latitude,
        coords.longitude,
        alumno.latitude,
        alumno.longitude
      ) <= RADIO_AUTO_ABORDAJE_METROS
    );

    for (const alumno of candidatos) {
      abordajesEnProcesoRef.current.add(alumno.id);
      try {
        await marcarAbordado(alumno, true);
      } finally {
        abordajesEnProcesoRef.current.delete(alumno.id);
      }
    }
  };

  const verificarProximidadParaAlerta = async (coords) => {
    if (!coords) return;
    
    // Encontrar el primer alumno activo que no ha abordado y al que no se le ha enviado alerta
    const proximoAlumno = alumnosActivosEnRuta.find(a => 
      a.estado !== 'abordado' && 
      a.latitude != null && 
      !alertasProximidadEnviadasRef.current.has(a.id)
    );

    if (!proximoAlumno) return;

    const distanciaMetros = calcularDistanciaMetros(
      coords.latitude, coords.longitude,
      proximoAlumno.latitude, proximoAlumno.longitude
    );

    // Si está a menos de 2.5km, verificar ETA
    if (distanciaMetros < 2500) {
      const eta = await obtenerETADeGoogle(coords, { latitude: proximoAlumno.latitude, longitude: proximoAlumno.longitude });
      
      if (eta && eta.minutos <= 5) {
        alertasProximidadEnviadasRef.current.add(proximoAlumno.id);
        
        try {
          const rutaActual = rutas[0] || {};
          await fetch(`${SERVIDOR}/api/notificaciones/alerta-bus`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
            body: JSON.stringify({
              rutaId: rutaActual.id,
              minutosRestantes: 5,
              colegioId: rutaActual.colegio_id,
              alumnoId: proximoAlumno.id
            })
          });
          agregarEvento(`📢 Alerta 5 min enviada para ${proximoAlumno.nombre}`);
        } catch (e) {
          console.log('Error enviando alerta de proximidad:', e);
        }
      }
    }
  };

  const iniciarRuta = async () => {
    try {
      if (intervaloRef.current) return;

      alertasProximidadEnviadasRef.current.clear();
      const loc = await Location.getCurrentPositionAsync({});
      const rutaActivaActual = rutas[0] || {};
      setUbicacion(loc.coords);
      setRutaActiva(true);
      agregarEvento(`Ruta iniciada - ${sentido === 'recogida' ? 'Hacia Colegio' : 'Hacia Casas'}`);

      if (!socket.connected) {
        socket.connect();
      }

      socket.emit('conductor:inicio_ruta', {
        conductorId: conductorId || CONDUCTOR_ID_DEMO,
        nombre: rutaActivaActual.conductor_nombre || 'Conductor',
        ruta: rutaActivaActual.nombre || 'Sin ruta',
        rutaId: rutaActivaActual.id || null,
        sentido: sentido,
        turno: turnoEstudioActivo,
      });

      socket.emit('conductor:ubicacion', {
        conductorId: conductorId || CONDUCTOR_ID_DEMO,
        nombre: rutaActivaActual.conductor_nombre || 'Conductor',
        ruta: rutaActivaActual.nombre || 'Sin ruta',
        rutaId: rutaActivaActual.id || null,
        sentido: sentido,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      // Recargar alumnos para obtener el "mapa perfecto" (ausencias filtradas, etc)
      cargarAlumnos();

      intervaloRef.current = setInterval(async () => {
        try {
          const locActual = await Location.getCurrentPositionAsync({});
          setUbicacion(locActual.coords);

          socket.emit('conductor:ubicacion', {
            conductorId: conductorId || CONDUCTOR_ID_DEMO,
            nombre: rutaActivaActual.conductor_nombre || 'Conductor',
            ruta: rutaActivaActual.nombre || 'Sin ruta',
            rutaId: rutaActivaActual.id || null,
            sentido: sentido,
            latitude: locActual.coords.latitude,
            longitude: locActual.coords.longitude,
          });

          // Auto abordaje
          await sincronizarAbordajesAutomaticos(locActual.coords);

          // Proximidad 5 minutos
          await verificarProximidadParaAlerta(locActual.coords);

          // Verificar desvío
          try {
            const res = await fetch(`${SERVIDOR}/api/desvios/verificar`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
              body: JSON.stringify({
                conductorId: conductorId || CONDUCTOR_ID_DEMO,
                rutaId: rutaActivaActual.id || 1,
                latitude: locActual.coords.latitude,
                longitude: locActual.coords.longitude,
              }),
            });

            const datos = await res.json();

            if (datos.desviado) {
              setDesvioActivo(true);
              setDistanciaDesvio(datos.distanciaMetros);
              agregarEvento(`⚠️ Desvío detectado: ${datos.distanciaMetros}m`);
              await enviarNotificacionLocal(
                '⚠️ Desvío de ruta',
                `Desvío de ${datos.distanciaMetros} metros`
              );
            } else {
              setDesvioActivo(false);
              setDistanciaDesvio(0);
            }
          } catch (errorDesvio) {
            console.log('Error desvío:', errorDesvio);
          }

        } catch (errorGPS) {
          console.log('Error GPS:', errorGPS);
        }
      }, 5000);

    } catch (error) {
      console.log('Error iniciar ruta:', error);
    }
  };

  const finalizarRuta = () => {
    if (intervaloRef.current) clearInterval(intervaloRef.current);
    intervaloRef.current = null;
    setRutaActiva(false);
    setDesvioActivo(false);
    setDistanciaDesvio(0);
    agregarEvento('Ruta finalizada');

    const rutaActivaActual = rutas[0] || {};
    socket.emit('conductor:fin_ruta', {
      conductorId: conductorId || CONDUCTOR_ID_DEMO,
      rutaId: rutaActivaActual.id || null,
      sentido: sentido,
    });
    socket.disconnect();
  };

  const marcarAbordado = async (alumno, automatico = false) => {
    try {
      await fetch(`${SERVIDOR}/api/asignaciones/abordar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
        body: JSON.stringify({ alumnoId: alumno.id }),
      });
      setAlumnos(prev => prev.map(a =>
        a.id === alumno.id ? { ...a, estado: 'abordado' } : a
      ));
      agregarEvento(
        automatico
          ? `${alumno.nombre} abordo automaticamente en su punto de recogida`
          : `${alumno.nombre} abordo el bus`
      );
    } catch (e) {
      setError('No se pudo actualizar el estado.');
    }
  };

  const agregarEvento = (texto) => {
    const hora = new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
    const nuevoEvento = { texto, hora };
    setEventos(prev => [nuevoEvento, ...prev]);

    // Emitir evento por socket para que los padres lo vean
    const rutaActual = rutas[0] || {};
    socket.emit('conductor:evento', {
      rutaId: rutaActual.id,
      evento: nuevoEvento
    });
  };

  const inscribirAlumno = async () => {
    if (!nuevoAlumno.nombre.trim()) {
      Alert.alert('Error', 'El nombre del alumno es requerido');
      return;
    }

    setLoadingGestion(true);
    try {
      const rutaId = nuevoAlumno.ruta_id || (rutas.length > 0 ? rutas[0].id : null);

      if (!rutaId) {
        Alert.alert('Error', 'No hay una ruta activa para inscribir al alumno.');
        return;
      }

      // Endpoint unificado para inscripción directa (Soportado por el nuevo backend)
      const response = await fetch(`${SERVIDOR}/api/asignaciones/conductor/${conductorId || CONDUCTOR_ID_DEMO}/inscribir-directo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
        body: JSON.stringify({
          nombre: nuevoAlumno.nombre,
          grado: nuevoAlumno.grado || '',
          parada: nuevoAlumno.parada || '',
          ruta_id: rutaId,
          turno_estudio: nuevoAlumno.turno_estudio,
          turnoEstudio: nuevoAlumno.turno_estudio,
          orden: alumnos.length + 1,
          activo: true
        }),
      });

      if (response.ok) {
        agregarEvento(`Nuevo alumno inscrito: ${nuevoAlumno.nombre}`);
        setModalAlumnoVisible(false);
        setNuevoAlumno({
          nombre: '',
          grado: '',
          parada: '',
          telefonoPadre: '',
          ruta_id: rutas.length > 0 ? rutas[0].id : null,
          turno_estudio: 'matutino'
        });
        cargarAlumnos();
        Alert.alert('Éxito', 'Alumno inscrito correctamente');
      } else {
        Alert.alert('Error', 'No se pudo inscribir el alumno');
      }
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Error de conexión con el servidor');
    } finally {
      setLoadingGestion(false);
    }
  };

  const desinscribirAlumno = async (alumno) => {
    Alert.alert(
      'Desvincular alumno',
      `¿Estás seguro de que deseas desvincular a ${alumno.nombre}?\n\nEsta acción eliminará la asignación de este alumno a tu ruta.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel'
        },
        {
          text: 'Desvincular',
          style: 'destructive',
          onPress: async () => {
            setLoadingGestion(true);
            try {
              const response = await fetch(`${SERVIDOR}/api/asignaciones/conductor/${conductorId || CONDUCTOR_ID_DEMO}/alumnos/${alumno.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
              });

              if (response.ok) {
                const datos = await response.json();
                agregarEvento(`Alumno desvinculado: ${alumno.nombre}`);
                cargarAlumnos();
                Alert.alert('Éxito', datos.mensaje || 'Alumno desvinculado correctamente');
              } else {
                Alert.alert('Error', 'No se pudo desvincular el alumno');
              }
            } catch (error) {
              console.error('Error:', error);
              Alert.alert('Error', 'Error de conexión con el servidor');
            } finally {
              setLoadingGestion(false);
            }
          }
        }
      ]
    );
  };

  // ========== CÁLCULOS ==========
  const totalAbordados = alumnosActivosEnRuta.filter(a => a.estado === 'abordado').length;
  const totalAusentes = alumnos.filter(a => a.ausente).length;
  const totalPendientes = alumnosActivosEnRuta.filter(a => a.estado !== 'abordado').length;
  const progreso = alumnosActivosEnRuta.length > 0
    ? (totalAbordados / alumnosActivosEnRuta.length) * 100
    : 0;

  // ========== RENDER ==========
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={THEME.primaryDark} />
      <View style={styles.container}>

        {/* HEADER COMPACTO */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Text style={styles.bienvenida}>{(() => {
                  const hora = new Date().getHours();
                  if (hora >= 5 && hora < 12) return 'Buenos días';
                  if (hora >= 12 && hora < 19) return 'Buenas tardes';
                  return 'Buenas noches';
                })()}</Text>
                <View style={[styles.socketStatus, { backgroundColor: socketConectado ? THEME.success : THEME.error }]} />
              </View>
              <Text style={styles.nombreConductor}>
                {rutas.length > 0 ? rutas[0].conductor_nombre || 'Conductor' : 'Conductor'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Text style={styles.brandCaption}>{branding.appName || 'KidsGo!'}</Text>
                {usuario?.colegioNombre ? (
                  <View style={styles.badgeColegio}>
                    <GraduationCap size={10} color={THEME.secondary} strokeWidth={2.5} />
                    <Text style={styles.badgeColegioTexto}>{usuario.colegioNombre}</Text>
                  </View>
                ) : (
                  <View style={[styles.badgeColegio, { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' }]}>
                    <Activity size={10} color="#64748B" strokeWidth={2.5} />
                    <Text style={[styles.badgeColegioTexto, { color: '#64748B' }]}>Modo Independiente</Text>
                  </View>
                )}
              </View>
              <View style={styles.rutaBadge}>
                <Navigation size={10} color="#fff" strokeWidth={2} />
                <Text style={styles.rutaBadgeTexto}>
                  {loading ? 'Cargando...' : (rutas.length > 0 ? rutas[0].nombre : 'Sin ruta asignada')}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={async () => {
                await limpiarSesion();
                navigation.replace('Login');
              }}
              style={styles.botonSalir}
            >
              <LogOut size={18} color="#fff" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        {/* TABS COMPACTOS - AHORA ARRIBA */}
        <View style={styles.tabsContainer}>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, tabActiva === 'control' && styles.tabActiva]}
              onPress={() => setTabActiva('control')}
            >
              <Activity size={12} color={tabActiva === 'control' ? '#fff' : THEME.textSecondary} strokeWidth={2} />
              <Text style={[styles.tabTexto, tabActiva === 'control' && styles.tabTextoActivo]}>
                Control
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tabActiva === 'mapa' && styles.tabActiva]}
              onPress={() => setTabActiva('mapa')}
            >
              <MapPin size={12} color={tabActiva === 'mapa' ? '#fff' : THEME.textSecondary} strokeWidth={2} />
              <Text style={[styles.tabTexto, tabActiva === 'mapa' && styles.tabTextoActivo]}>
                Mapa
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tabActiva === 'alumnos' && styles.tabActiva]}
              onPress={() => setTabActiva('alumnos')}
            >
              <Users size={12} color={tabActiva === 'alumnos' ? '#fff' : THEME.textSecondary} strokeWidth={2} />
              <Text style={[styles.tabTexto, tabActiva === 'alumnos' && styles.tabTextoActivo]}>
                Alumnos
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* CONTENIDO SEGÚN TAB ACTIVA */}
        <ScrollView
          style={styles.contenido}
          showsVerticalScrollIndicator={false}
          scrollEnabled={tabActiva !== 'mapa'}
          contentContainerStyle={styles.contentContainer}
        >
          {tabActiva === 'control' ? (
            // ========== TAB DE CONTROL DE RUTA ==========
            <View style={styles.tabContent}>
              {/* SELECTOR DE TURNO - MOVIDO AQUÍ */}
              <View style={[styles.turnoSelectorContainer, { marginHorizontal: -16, marginTop: -16, marginBottom: 16 }]}>
                <TouchableOpacity
                  style={[styles.turnoBtn, turno === 'mañana' && styles.turnoBtnActivo]}
                  onPress={() => setTurno('mañana')}
                  disabled={rutaActiva}
                >
                  <Clock size={12} color={turno === 'mañana' ? '#fff' : THEME.textSecondary} strokeWidth={2.5} />
                  <Text style={[styles.turnoBtnTexto, turno === 'mañana' && styles.turnoBtnTextoActivo]}>
                    Ruta matutina
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.turnoBtn, turno === 'tarde' && styles.turnoBtnActivo]}
                  onPress={() => setTurno('tarde')}
                  disabled={rutaActiva}
                >
                  <Clock size={12} color={turno === 'tarde' ? '#fff' : THEME.textSecondary} strokeWidth={2.5} />
                  <Text style={[styles.turnoBtnTexto, turno === 'tarde' && styles.turnoBtnTextoActivo]}>
                    Ruta vespertina
                  </Text>
                </TouchableOpacity>
              </View>

              {/* SELECTOR DE SENTIDO - MOVIDO AQUÍ */}
              <View style={[styles.turnoSelectorContainer, { marginHorizontal: -16, marginTop: -16, marginBottom: 16, borderBottomWidth: 1 }]}>
                <TouchableOpacity
                  style={[styles.turnoBtn, sentido === 'recogida' && styles.turnoBtnActivo]}
                  onPress={() => setSentido('recogida')}
                  disabled={rutaActiva}
                >
                  <MapPin size={12} color={sentido === 'recogida' ? '#fff' : THEME.textSecondary} strokeWidth={2.5} />
                  <Text style={[styles.turnoBtnTexto, sentido === 'recogida' && styles.turnoBtnTextoActivo]}>
                    Hacia Colegio
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.turnoBtn, sentido === 'entrega' && styles.turnoBtnActivo]}
                  onPress={() => setSentido('entrega')}
                  disabled={rutaActiva}
                >
                  <Home size={12} color={sentido === 'entrega' ? '#fff' : THEME.textSecondary} strokeWidth={2.5} />
                  <Text style={[styles.turnoBtnTexto, sentido === 'entrega' && styles.turnoBtnTextoActivo]}>
                    Hacia Casas
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ESTADO DE RUTA */}
              <View style={styles.tarjetaEstado}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <View style={styles.estadoHeader}>
                      <View style={[styles.estadoIndicador, { backgroundColor: rutaActiva ? THEME.success : THEME.warning }]} />
                      <Text style={styles.estadoTexto}>{rutaActiva ? 'Ruta en curso' : 'Ruta detenida'}</Text>
                    </View>
                    <Text style={styles.estadoDescripcion}>
                      {rutaActiva ? 'Continúa con tu recorrido habitual' : 'Inicia la ruta para comenzar'}
                    </Text>
                  </View>

                  {/* INDICADOR DE ALERTAS PENDIENTES */}
                  {(ausenciasPendientes.length > 0 || programacionesPendientes.length > 0 || solicitudesPendientes.length > 0) && (
                    <TouchableOpacity 
                      style={styles.btnAlertasNotif}
                      onPress={() => setModalAlertasVisible(true)}
                    >
                      <AlertCircle size={20} color="#fff" strokeWidth={2.5} />
                      <View style={styles.badgeAlertaCount}>
                        <Text style={styles.badgeAlertaCountTexto}>
                          {ausenciasPendientes.length + programacionesPendientes.length + solicitudesPendientes.length}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {desvioActivo && (
                <View style={styles.alertaDesvio}>
                  <Text style={styles.alertaDesvioIcono}>⚠️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertaDesvioTitulo}>Desvío detectado</Text>
                    <Text style={styles.alertaDesvioSub}>
                      Estás a {distanciaDesvio}m de la ruta programada
                    </Text>
                  </View>
                </View>
              )}

              {/* GPS ACTIVO */}
              {ubicacion && (
                <View style={styles.gpsCard}>
                  <View style={styles.gpsIconoContainer}>
                    <MapPin size={18} color={THEME.success} strokeWidth={2} />
                  </View>
                  <View style={styles.gpsInfo}>
                    <Text style={styles.gpsTitulo}>GPS activo</Text>
                    <Text style={styles.gpsCoords}>
                      {ubicacion.latitude.toFixed(5)}, {ubicacion.longitude.toFixed(5)}
                    </Text>
                  </View>
                </View>
              )}

              {mostrarAvisoAusentes && (
                <Animated.View
                  style={[
                    styles.autoInfoBanner,
                    {
                      opacity: avisoAusentesAnim,
                      transform: [
                        {
                          translateY: avisoAusentesAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-10, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View style={styles.autoInfoBannerContenido}>
                    <AlertCircle size={18} color={THEME.secondary} strokeWidth={2} />
                    <Text style={styles.autoInfoTexto}>
                      Los alumnos ausentes se excluyen de la ruta y el abordaje se registra automaticamente al llegar al punto definido por el padre.
                    </Text>
                  </View>
                  <TouchableOpacity onPress={cerrarAvisoAusentes} style={styles.autoInfoCerrar}>
                    <X size={16} color={THEME.textSecondary} strokeWidth={2.5} />
                  </TouchableOpacity>
                </Animated.View>
              )}

              {/* PROGRESO */}
              <View style={styles.tarjetaProgreso}>
                <Text style={styles.progresoTitulo}>Progreso de hoy</Text>
                <View style={styles.barraProgreso}>
                  <View style={[styles.barraLlena, { width: `${progreso}%`, backgroundColor: rutaActiva ? THEME.success : THEME.textSecondary }]} />
                </View>
                <Text style={styles.progresoPorcentaje}>{Math.round(progreso)}% completado</Text>

                <View style={styles.resumenRow}>
                  <View style={styles.resumenItem}>
                    <Text style={[styles.resumenNumero, { color: THEME.success }]}>{totalAbordados}</Text>
                    <Text style={styles.resumenLabel}>Abordados</Text>
                  </View>
                  <View style={styles.resumenDivider} />
                  <View style={styles.resumenItem}>
                    <Text style={[styles.resumenNumero, { color: THEME.warning }]}>{totalPendientes}</Text>
                    <Text style={styles.resumenLabel}>Pendientes</Text>
                  </View>
                  <View style={styles.resumenDivider} />
                  <View style={styles.resumenItem}>
                    <Text style={[styles.resumenNumero, { color: THEME.error }]}>{totalAusentes}</Text>
                    <Text style={styles.resumenLabel}>Ausentes</Text>
                  </View>
                </View>
              </View>

              {/* LISTA DE ALUMNOS */}
              <View style={styles.listaHeader}>
                <View>
                  <Text style={styles.listaTitulo}>Lista de alumnos</Text>
                  <Text style={styles.listaContador}>{alumnosActivosEnRuta.length} estudiantes programados en ruta</Text>
                </View>
              </View>

              {loading ? (
                <ActivityIndicator color={THEME.primary} style={{ marginTop: 20 }} />
              ) : error ? (
                <Text style={styles.errorTexto}>{error}</Text>
              ) : (
                alumnosActivosEnRuta.map((alumno) => (
                  <View key={alumno.id} style={[
                    styles.alumnoCard,
                    alumno.estado === 'abordado' && styles.alumnoAbordado,
                    alumno.infoAusencia?.esAusente && styles.alumnoAusente,
                  ]}>
                    <View style={[
                      styles.alumnoOrden,
                      alumno.estado === 'abordado' && styles.alumnoOrdenAbordado,
                      alumno.infoAusencia?.esAusente && styles.alumnoOrdenAusente,
                    ]}>
                      <Text style={styles.alumnoOrdenNum}>{alumno.orden}</Text>
                    </View>

                    <View style={styles.alumnoInfo}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.alumnoNombre} numberOfLines={1}>{alumno.nombre}</Text>
                        {alumno.esCambioTemporal && (
                          <View style={styles.badgeTemp}>
                            <Clock size={10} color={THEME.warning} />
                            <Text style={styles.badgeTempTexto}>Temp</Text>
                          </View>
                        )}
                        {alumno.infoAusencia?.pendienteAutorizacion && (
                          <View style={styles.badgeAusenciaPend}>
                            <AlertCircle size={10} color={THEME.error} />
                            <Text style={styles.badgeAusenciaPendTexto}>Pte.</Text>
                          </View>
                        )}
                      </View>
                      
                      <View style={styles.infoRow}>
                        <MapPin size={12} color={alumno.esCambioTemporal ? THEME.warning : THEME.textSecondary} strokeWidth={2} />
                        <Text style={[styles.alumnoParada, alumno.esCambioTemporal && { color: THEME.warning, fontWeight: '700' }]} numberOfLines={1}>
                          {alumno.parada}
                        </Text>
                      </View>
                      
                      {alumno.notaProgramacion ? (
                        <Text style={{ fontSize: 10, color: THEME.warning, fontStyle: 'italic' }} numberOfLines={1}>
                          Nota: {alumno.notaProgramacion}
                        </Text>
                      ) : (
                        <View style={styles.infoRow}>
                          <GraduationCap size={12} color={THEME.textSecondary} strokeWidth={2} />
                          <Text style={styles.alumnoGrado}>{alumno.grado}</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.alumnoAccion}>
                      {alumno.estado === 'abordado' ? (
                        <View style={styles.badgeAbordado}>
                          <Check size={12} color={THEME.success} strokeWidth={3} />
                          <Text style={styles.badgeAbordadoTexto}>Abordado</Text>
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {alumno.padreTelefono && (
                            <TouchableOpacity 
                              style={styles.btnLlamarPadre}
                              onPress={() => handleLlamarPadre(alumno.padreTelefono, alumno.nombre)}
                            >
                              <Phone size={16} color={THEME.secondary} strokeWidth={2.5} />
                            </TouchableOpacity>
                          )}
                          <View style={[styles.badgeEsperaAuto, !rutaActiva && styles.btnDeshabilitado]}>
                            <Clock size={12} color={THEME.warning} strokeWidth={2} />
                            <Text style={styles.badgeEsperaAutoTexto}>
                              {alumno.latitude != null && alumno.longitude != null ? 'Auto' : 'Manual'}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                ))
              )}

              {/* BITÁCORA */}
              {eventos.length > 0 && (
                <View style={styles.bitacora}>
                  <View style={styles.bitacoraHeader}>
                    <View style={styles.bitacoraTitleRow}>
                      <Clock size={18} color={THEME.primary} strokeWidth={2} />
                      <Text style={styles.seccionTitulo}>Bitácora de hoy</Text>
                    </View>
                    <Text style={styles.bitacoraContador}>{eventos.length} eventos</Text>
                  </View>
                  {eventos.map((ev, i) => (
                    <View key={i} style={styles.eventoRow}>
                      <View style={styles.eventoHoraContainer}>
                        <Text style={styles.eventoHora}>{ev.hora}</Text>
                      </View>
                      <View style={styles.eventoPunto} />
                      <Text style={styles.eventoTexto}>{ev.texto}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : tabActiva === 'mapa' ? (
            // ========== TAB DE MAPA DE RECOGIDA ==========
            <View style={[styles.tabContent, styles.mapaTabContent]}>
              <View style={[styles.mapContainer, { height: alturaMapaConductor }]}>
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={styles.map}
                  initialRegion={{
                    latitude: ubicacion?.latitude || 13.68935,
                    longitude: ubicacion?.longitude || -89.18718,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05,
                  }}
                >
                  {/* Marcador del Conductor */}
                  {ubicacion && (
                    <Marker
                      coordinate={{ latitude: ubicacion.latitude, longitude: ubicacion.longitude }}
                      title="Mi ubicación"
                    >
                      <View style={styles.markerConductor}>
                        <Navigation size={18} color="#fff" strokeWidth={2.5} />
                      </View>
                    </Marker>
                  )}

                  {/* Marcador del Colegio (Meta Final) */}
                  {rutas[0]?.colegio_latitude && rutas[0]?.colegio_longitude && (
                    <Marker
                      coordinate={{ 
                        latitude: Number(rutas[0].colegio_latitude), 
                        longitude: Number(rutas[0].colegio_longitude) 
                      }}
                      title="Colegio (Meta Final)"
                      description={rutas[0].colegio_nombre}
                    >
                      <View style={[styles.markerAlumno, { backgroundColor: THEME.secondary, borderRadius: 8 }]}>
                        <GraduationCap size={16} color="#fff" strokeWidth={2.5} />
                      </View>
                    </Marker>
                  )}

                  {/* Marcadores de Alumnos (Puntos de Recogida) */}
                  {alumnos.filter(a => a.latitude && a.longitude).map(alumno => (
                    <Marker
                      key={alumno.id}
                      coordinate={{ latitude: alumno.latitude, longitude: alumno.longitude }}
                      title={alumno.nombre}
                      description={alumno.parada}
                    >
                      <View style={[
                        styles.markerAlumno,
                        { backgroundColor: alumno.estado === 'abordado' ? THEME.success : THEME.warning }
                      ]}>
                        <Users size={14} color="#fff" strokeWidth={2.5} />
                      </View>
                    </Marker>
                  ))}
                </MapView>
                
                <Animated.View
                  {...mapOverlayPanResponder.panHandlers}
                  style={[
                    styles.mapOverlay,
                    { transform: mapOverlayPosition.getTranslateTransform() },
                  ]}
                >
                  <Text style={styles.mapOverlayTitulo}>Mapa de Recogida</Text>
                  <Text style={styles.mapOverlaySub}>Visualiza los puntos de recogida de tus alumnos.</Text>
                  
                  <View style={styles.mapLeyenda}>
                    <View style={styles.leyendaItem}>
                      <View style={[styles.leyendaPunto, { backgroundColor: THEME.warning }]} />
                      <Text style={styles.leyendaTexto}>Pendiente</Text>
                    </View>
                    <View style={styles.leyendaItem}>
                      <View style={[styles.leyendaPunto, { backgroundColor: THEME.success }]} />
                      <Text style={styles.leyendaTexto}>Abordado</Text>
                    </View>
                  </View>
                </Animated.View>

                <View style={styles.mapControlsOverlay}>
                  <View style={styles.botonesContainer}>
                    <TouchableOpacity
                      style={[styles.btnIniciar, rutaActiva && styles.btnDeshabilitado]}
                      onPress={iniciarRuta}
                      disabled={rutaActiva}
                    >
                      <Play size={13} color="#fff" strokeWidth={2.5} fill="#fff" />
                      <Text style={styles.btnIniciarTexto}>Iniciar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnFinalizar, !rutaActiva && styles.btnDeshabilitado]}
                      onPress={finalizarRuta}
                      disabled={!rutaActiva}
                    >
                      <Square size={13} color="#fff" strokeWidth={2.5} fill="#fff" />
                      <Text style={styles.btnFinalizarTexto}>Finalizar</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.mapControlsTitle}>Eventos rápidos</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.eventosScroll}>
                    <View style={styles.eventosGrid}>
                      {[
                        'Retraso en ruta',
                        'Llegando al colegio',
                        'Alumno no abordó',
                        'Parada no programada',
                        'Problema mecánico',
                        'Todos a bordo',
                      ].map((ev, i) => (
                        <TouchableOpacity key={i} style={styles.eventoBtn} onPress={() => agregarEvento(ev)}>
                          <Text style={styles.eventoBtnTexto}>{ev}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </View>
            </View>
          ) : (
            // ========== TAB DE GESTIÓN DE ALUMNOS ==========
            <View style={styles.tabContent}>
              {/* RESUMEN DE ALUMNOS */}
              <View style={styles.resumenGestion}>
                <View style={styles.resumenGestionItem}>
                  <Text style={styles.resumenGestionNumero}>{alumnos.filter(a => a.activo !== false).length}</Text>
                  <Text style={styles.resumenGestionLabel}>Activos</Text>
                </View>
                <View style={styles.resumenGestionDivider} />
                <View style={styles.resumenGestionItem}>
                  <Text style={[styles.resumenGestionNumero, { color: THEME.success }]}>{totalAbordados}</Text>
                  <Text style={styles.resumenGestionLabel}>Abordados</Text>
                </View>
                <View style={styles.resumenGestionDivider} />
                <View style={styles.resumenGestionItem}>
                  <Text style={[styles.resumenGestionNumero, { color: THEME.error }]}>{alumnos.filter(a => a.activo === false).length}</Text>
                  <Text style={styles.resumenGestionLabel}>Inactivos</Text>
                </View>
              </View>

              {/* ACCIONES PRINCIPALES - LIMPIAS Y SIN REDUNDANCIA */}
              <View style={styles.accionesPrincipales}>
                <TouchableOpacity 
                  style={[styles.accionCard, { backgroundColor: THEME.secondary, flex: 1 }]} 
                  onPress={() => navigation.navigate('ConductorPadres')}
                >
                  <Users size={20} color="#fff" strokeWidth={2.5} />
                  <Text style={styles.accionCardTexto}>Vinculaciones</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.accionCard, { backgroundColor: THEME.info, flex: 1 }]} 
                  onPress={() => setModalColegioVisible(true)}
                >
                  <Navigation size={20} color="#fff" strokeWidth={2.5} />
                  <Text style={styles.accionCardTexto}>Vincular Colegio</Text>
                </TouchableOpacity>
              </View>

              {/* LISTA COMPLETA CON ACCIONES DE GESTIÓN */}
              <View style={styles.gestionHeader}>
                <Text style={styles.seccionTitulo}>Todos los alumnos</Text>
              </View>

              {loading ? (
                <ActivityIndicator color={THEME.primary} style={{ marginTop: 20 }} />
              ) : error ? (
                <Text style={styles.errorTexto}>{error}</Text>
              ) : alumnos.length === 0 ? (
                <View style={styles.emptyState}>
                  <Users size={48} color={THEME.border} strokeWidth={1.5} />
                  <Text style={styles.emptyStateTitulo}>No hay alumnos registrados</Text>
                  <Text style={styles.emptyStateSub}>Presiona "Nuevo" para agregar el primer alumno</Text>
                </View>
              ) : (
                alumnos.map((alumno) => (
                  <View key={alumno.id} style={[
                    styles.alumnoGestionCard,
                    alumno.activo === false && styles.alumnoInactivo,
                    alumno.infoAusencia?.esAusente && styles.alumnoAusente
                  ]}>
                    <View style={styles.alumnoGestionInfo}>
                      <View style={styles.alumnoGestionHeader}>
                        <Text style={styles.alumnoGestionNombre}>{alumno.nombre}</Text>
                        {alumno.activo === false && (
                          <View style={styles.badgeInactivo}>
                            <Text style={styles.badgeInactivoTexto}>Inactivo</Text>
                          </View>
                        )}
                        {alumno.esCambioTemporal && (
                          <View style={styles.badgeTemp}>
                            <Text style={styles.badgeTempTexto}>Temporal</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.alumnoGestionDetalles}>
                        <View style={styles.infoRow}>
                          <GraduationCap size={14} color={THEME.textSecondary} strokeWidth={2} />
                          <Text style={styles.alumnoGestionDetalle}>{alumno.grado || 'Sin grado'}</Text>
                        </View>
                        <View style={styles.infoRow}>
                          <MapPin size={14} color={alumno.esCambioTemporal ? THEME.warning : THEME.textSecondary} strokeWidth={2} />
                          <Text style={[styles.alumnoGestionDetalle, alumno.esCambioTemporal && { color: THEME.warning, fontWeight: '700' }]}>
                            {alumno.parada || 'Sin parada'}
                          </Text>
                        </View>
                        {alumno.padreNombre && (
                          <View style={styles.infoRow}>
                            <Users size={14} color={THEME.textSecondary} strokeWidth={2} />
                            <Text style={styles.alumnoGestionDetalle}>Padre: {alumno.padreNombre}</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.alumnoGestionEstado}>
                        {alumno.estado === 'abordado' ? (
                          <View style={styles.estadoRow}>
                            <Check size={14} color={THEME.success} strokeWidth={2.5} />
                            <Text style={[styles.estadoTextoRow, { color: THEME.success }]}>Abordado hoy</Text>
                          </View>
                        ) : (alumno.ausente || alumno.infoAusencia?.esAusente) ? (
                          <View style={styles.estadoRow}>
                            <AlertCircle size={14} color={THEME.error} strokeWidth={2} />
                            <Text style={[styles.estadoTextoRow, { color: THEME.error }]}>
                              {alumno.infoAusencia?.pendienteAutorizacion ? 'Ausencia pendiente' : 'Ausente hoy'}
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.estadoRow}>
                            <Clock size={14} color={THEME.textSecondary} strokeWidth={2} />
                            <Text style={[styles.estadoTextoRow, { color: THEME.textSecondary }]}>Pendiente</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* ACCIONES DE GESTIÓN */}
                    <View style={styles.gestionAcciones}>
                      <View style={{ gap: 8 }}>
                        {alumno.padreTelefono && (
                          <TouchableOpacity
                            style={styles.btnLlamarPadre}
                            onPress={() => handleLlamarPadre(alumno.padreTelefono, alumno.nombre)}
                          >
                            <Phone size={18} color={THEME.secondary} strokeWidth={2.5} />
                          </TouchableOpacity>
                        )}
                        {alumno.activo !== false && (
                          <TouchableOpacity
                            style={styles.btnDesinscribir}
                            onPress={() => desinscribirAlumno(alumno)}
                          >
                            <Trash2 size={18} color={THEME.error} strokeWidth={2} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                ))
              )}

              {/* ESPACIO PARA EL BOTÓN FLOTANTE */}
              <View style={{ height: 80 }} />
            </View>
          )}
        </ScrollView>

        {/* BOTÓN NUEVO FLOTANTE (SOLO EN TAB ALUMNOS) */}
        {tabActiva === 'alumnos' && (
          <TouchableOpacity
            style={styles.btnNuevoFlotante}
            onPress={() => setModalAlumnoVisible(true)}
          >
            <Plus size={24} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        )}

        {/* MODAL PARA INSCRIBIR NUEVO ALUMNO */}
        <Modal
          visible={modalAlumnoVisible}
          animationType="slide"
          transparent={true}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitulo}>Inscribir nuevo alumno</Text>
                <TouchableOpacity onPress={() => setModalAlumnoVisible(false)} style={styles.modalCloseBtn}>
                  <X size={24} color={THEME.textSecondary} strokeWidth={2} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalLabel}>Nombre completo *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Ej: María González"
                  value={nuevoAlumno.nombre}
                  onChangeText={(text) => setNuevoAlumno({ ...nuevoAlumno, nombre: text })}
                  placeholderTextColor={THEME.textSecondary}
                />

                <Text style={styles.modalLabel}>Grado</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Ej: 4to primaria"
                  value={nuevoAlumno.grado}
                  onChangeText={(text) => setNuevoAlumno({ ...nuevoAlumno, grado: text })}
                  placeholderTextColor={THEME.textSecondary}
                />

                <Text style={styles.modalLabel}>Parada</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Ej: Colonia Santa Fe"
                  value={nuevoAlumno.parada}
                  onChangeText={(text) => setNuevoAlumno({ ...nuevoAlumno, parada: text })}
                  placeholderTextColor={THEME.textSecondary}
                />

                <Text style={styles.modalLabel}>Teléfono del padre/tutor</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Ej: 7012-3456"
                  keyboardType="phone-pad"
                  value={nuevoAlumno.telefonoPadre}
                  onChangeText={(text) => setNuevoAlumno({ ...nuevoAlumno, telefonoPadre: text })}
                  placeholderTextColor={THEME.textSecondary}
                />

                <Text style={styles.modalLabel}>Turno de estudio</Text>
                <View style={styles.modalRutasContainer}>
                  {OPCIONES_TURNO_ESTUDIO.map((opcion) => (
                    <TouchableOpacity
                      key={opcion.key}
                      style={[
                        styles.modalRutaBtn,
                        nuevoAlumno.turno_estudio === opcion.key && styles.modalRutaBtnActivo
                      ]}
                      onPress={() => setNuevoAlumno({ ...nuevoAlumno, turno_estudio: opcion.key })}
                    >
                      <Text style={[
                        styles.modalRutaBtnTexto,
                        nuevoAlumno.turno_estudio === opcion.key && styles.modalRutaBtnTextoActivo
                      ]}>
                        {opcion.label}
                      </Text>
                      {nuevoAlumno.turno_estudio === opcion.key && (
                        <Check size={16} color="#fff" strokeWidth={3} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.modalLabel}>Ruta</Text>
                <View style={styles.modalRutasContainer}>
                  {rutas.map((ruta) => (
                    <TouchableOpacity
                      key={ruta.id}
                      style={[
                        styles.modalRutaBtn,
                        nuevoAlumno.ruta_id === ruta.id && styles.modalRutaBtnActivo
                      ]}
                      onPress={() => setNuevoAlumno({ ...nuevoAlumno, ruta_id: ruta.id })}
                    >
                      <Text style={[
                        styles.modalRutaBtnTexto,
                        nuevoAlumno.ruta_id === ruta.id && styles.modalRutaBtnTextoActivo
                      ]}>
                        {ruta.nombre}
                      </Text>
                      {nuevoAlumno.ruta_id === ruta.id && (
                        <Check size={16} color="#fff" strokeWidth={3} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.modalBotones}>
                <TouchableOpacity
                  style={styles.modalBtnCancelar}
                  onPress={() => setModalAlumnoVisible(false)}
                >
                  <Text style={styles.modalBtnCancelarTexto}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtnConfirmar, loadingGestion && styles.btnDeshabilitado]}
                  onPress={inscribirAlumno}
                  disabled={loadingGestion}
                >
                  {loadingGestion ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Check size={18} color="#fff" strokeWidth={2.5} />
                      <Text style={styles.modalBtnConfirmarTexto}>Inscribir</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL PARA VINCULAR COLEGIO */}
        <Modal
          visible={modalColegioVisible}
          animationType="fade"
          transparent={true}
        >
          <View style={[styles.modalOverlay, { justifyContent: 'center', padding: 20 }]}>
            <View style={[styles.modalContainer, { borderRadius: 20, maxHeight: 'auto' }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitulo}>Vincular Colegio</Text>
                  <Text style={styles.modalSubtitulo}>Asocia tu ruta y alumnos a una institución.</Text>
                </View>
                <TouchableOpacity onPress={() => setModalColegioVisible(false)} style={styles.modalCloseBtn}>
                  <X size={24} color={THEME.textSecondary} strokeWidth={2} />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>Código del Colegio</Text>
              <TextInput
                style={[styles.modalInput, { fontSize: 20, textAlign: 'center', letterSpacing: 2, color: THEME.secondary }]}
                placeholder="COL-12345"
                value={codigoColegio}
                onChangeText={setCodigoColegio}
                autoCapitalize="characters"
                placeholderTextColor={THEME.textSecondary}
              />

              <View style={styles.modalBotones}>
                <TouchableOpacity
                  style={styles.modalBtnCancelar}
                  onPress={() => setModalColegioVisible(false)}
                >
                  <Text style={styles.modalBtnCancelarTexto}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtnConfirmar, { backgroundColor: THEME.secondary }, (loadingVincular || !codigoColegio.trim()) && styles.btnDeshabilitado]}
                  onPress={handleVincularColegio}
                  disabled={loadingVincular || !codigoColegio.trim()}
                >
                  {loadingVincular ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Navigation size={18} color="#fff" strokeWidth={2.5} />
                      <Text style={styles.modalBtnConfirmarTexto}>Vincular</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL DE ALERTAS Y AUTORIZACIONES */}
        <Modal
          visible={modalAlertasVisible}
          animationType="slide"
          transparent={true}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContainer, { height: '80%' }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitulo}>Alertas y Solicitudes</Text>
                  <Text style={styles.modalSubtitulo}>Autoriza cambios de ruta y ausencias.</Text>
                </View>
                <TouchableOpacity onPress={() => setModalAlertasVisible(false)} style={styles.modalCloseBtn}>
                  <X size={24} color={THEME.textSecondary} strokeWidth={2} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {cargandoAlertas ? (
                  <ActivityIndicator color={THEME.secondary} style={{ marginTop: 20 }} />
                ) : (ausenciasPendientes.length === 0 && programacionesPendientes.length === 0 && solicitudesPendientes.length === 0) ? (
                  <View style={styles.emptyState}>
                    <Check size={48} color={THEME.success} strokeWidth={1.5} />
                    <Text style={styles.emptyStateTitulo}>Todo al día</Text>
                    <Text style={styles.emptyStateSub}>No tienes solicitudes pendientes de aprobación.</Text>
                  </View>
                ) : (
                  <>
                    {/* SOLICITUDES PERMANENTES (CAMBIOS DE DIRECCIÓN) */}
                    {solicitudesPendientes.map((sol) => (
                      <View key={`sol-${sol.id}`} style={styles.alertaItemCard}>
                        <View style={[styles.alertaIconBadge, { backgroundColor: '#EEF2FF' }]}>
                          <MapPin size={20} color={THEME.secondary} />
                        </View>
                        <View style={styles.alertaContent}>
                          <Text style={styles.alertaHijo}>{sol.hijo_nombre}</Text>
                          <Text style={styles.alertaTipo}>Cambio permanente de punto</Text>
                          <Text style={styles.alertaDetalle}>Nueva parada: {sol.nueva_parada || 'Ubicación en mapa'}</Text>
                        </View>
                        <View style={styles.alertaAcciones}>
                          <TouchableOpacity 
                            style={styles.btnAlertaRechazar}
                            onPress={() => handleResponderSolicitud(sol.id, 'rechazado')}
                          >
                            <X size={18} color={THEME.error} />
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.btnAlertaAprobar}
                            onPress={() => handleResponderSolicitud(sol.id, 'aprobado')}
                          >
                            <Check size={18} color={THEME.success} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}

                    {/* CAMBIOS TEMPORALES */}
                    {programacionesPendientes.map((prog) => (
                      <View key={`prog-${prog.id}`} style={styles.alertaItemCard}>
                        <View style={[styles.alertaIconBadge, { backgroundColor: '#FFF7ED' }]}>
                          <Clock size={20} color={THEME.warning} />
                        </View>
                        <View style={styles.alertaContent}>
                          <Text style={styles.alertaHijo}>{prog.hijo_nombre}</Text>
                          <Text style={styles.alertaTipo}>Cambio temporal de ruta</Text>
                          <Text style={styles.alertaDetalle}>Fecha: {prog.fecha}</Text>
                        </View>
                        <View style={styles.alertaAcciones}>
                          <TouchableOpacity 
                            style={styles.btnAlertaRechazar}
                            onPress={() => handleResponderProgramacion(prog.id, 'rechazado')}
                          >
                            <X size={18} color={THEME.error} />
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.btnAlertaAprobar}
                            onPress={() => handleResponderProgramacion(prog.id, 'aprobado')}
                          >
                            <Check size={18} color={THEME.success} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}

                    {/* AUSENCIAS */}
                    {ausenciasPendientes.map((aus) => (
                      <View key={`aus-${aus.id}`} style={styles.alertaItemCard}>
                        <View style={[styles.alertaIconBadge, { backgroundColor: '#FEF2F2' }]}>
                          <AlertCircle size={20} color={THEME.error} />
                        </View>
                        <View style={styles.alertaContent}>
                          <Text style={styles.alertaHijo}>{aus.hijo_nombre}</Text>
                          <Text style={styles.alertaTipo}>Reporte de ausencia</Text>
                          <Text style={styles.alertaDetalle}>Motivo: {aus.motivo || 'No especificado'}</Text>
                        </View>
                        <View style={styles.alertaAcciones}>
                          <TouchableOpacity 
                            style={styles.btnAlertaRechazar}
                            onPress={() => handleResponderAusencia(aus.id, 'rechazado')}
                          >
                            <X size={18} color={THEME.error} />
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.btnAlertaAprobar}
                            onPress={() => handleResponderAusencia(aus.id, 'autorizado')}
                          >
                            <Check size={18} color={THEME.success} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  contenido: { flex: 1 },
  contentContainer: { paddingBottom: 30 },
  tabContent: { padding: 16 },
  mapaTabContent: { padding: 0 },
  alertaDesvio: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FEF3C7', marginHorizontal: 16,
    marginTop: 8, borderRadius: 14, padding: 14,
    borderLeftWidth: 4, borderLeftColor: '#F59E0B',
  },
  alertaDesvioIcono: { fontSize: 24 },
  alertaDesvioTitulo: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  alertaDesvioSub: { fontSize: 12, color: '#78350F', marginTop: 2 },

  // Alertas Notificaciones
  btnAlertasNotif: {
    backgroundColor: THEME.secondary,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    shadowColor: THEME.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  badgeAlertaCount: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: THEME.error,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    paddingHorizontal: 2,
  },
  badgeAlertaCountTexto: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },

  // Alerta Items
  alertaItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  alertaIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  alertaContent: {
    flex: 1,
    gap: 2,
  },
  alertaHijo: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.text,
  },
  alertaTipo: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.textSecondary,
  },
  alertaDetalle: {
    fontSize: 11,
    color: THEME.textSecondary,
    fontStyle: 'italic',
  },
  alertaAcciones: {
    flexDirection: 'row',
    gap: 8,
  },
  btnAlertaAprobar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  btnAlertaRechazar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  // Header Compacto
  header: {
    backgroundColor: THEME.primaryDark,
    paddingTop: 30,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: { flex: 1 },
  socketStatus: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bienvenida: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 1,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nombreConductor: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  brandCaption: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '700',
    marginBottom: 4,
  },
  rutaBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rutaBadgeTexto: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  botonSalir: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    padding: 8,
    borderRadius: 10,
    marginLeft: 12,
  },
  badgeColegio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,122,255,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,122,255,0.3)',
  },
  badgeColegioTexto: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '700',
  },

  // Tabs Compactos
  tabsContainer: {
    backgroundColor: THEME.surface,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 6,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: THEME.background,
  },
  tabActiva: {
    backgroundColor: THEME.primary,
  },
  tabTexto: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.textSecondary,
  },
  tabTextoActivo: {
    color: '#fff',
  },

  // Control de Ruta - Estado
  tarjetaEstado: {
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  estadoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  estadoIndicador: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  estadoTexto: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.text,
  },
  estadoDescripcion: {
    fontSize: 13,
    color: THEME.textSecondary,
    fontWeight: '500',
  },

  // GPS
  gpsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  gpsIconoContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  gpsInfo: { flex: 1 },
  gpsTitulo: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.success,
  },
  gpsCoords: {
    fontSize: 12,
    color: THEME.textSecondary,
    marginTop: 2,
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  autoInfoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: '#EEF5FF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D6E7FF',
    shadowColor: '#2563EB',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  autoInfoBannerContenido: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
  },
  autoInfoCerrar: {
    padding: 2,
    marginTop: -2,
  },
  autoInfoTexto: {
    flex: 1,
    fontSize: 12,
    color: THEME.text,
    lineHeight: 18,
    fontWeight: '600',
  },

  // Botones
  botonesContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  btnIniciar: {
    flex: 1,
    backgroundColor: THEME.success,
    borderRadius: 12,
    paddingVertical: 14, // Aumentado para mejor manipulación
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  btnIniciarTexto: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14, // Texto más legible
  },
  btnFinalizar: {
    flex: 1,
    backgroundColor: THEME.error,
    borderRadius: 12,
    paddingVertical: 14, // Aumentado
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  btnFinalizarTexto: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14, // Texto más legible
  },
  btnDeshabilitado: {
    opacity: 0.4,
  },

  // Progreso
  tarjetaProgreso: {
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  progresoTitulo: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 10,
  },
  barraProgreso: {
    height: 6,
    backgroundColor: THEME.background,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  barraLlena: {
    height: '100%',
    borderRadius: 3,
  },
  progresoPorcentaje: {
    fontSize: 13,
    color: THEME.textSecondary,
    marginBottom: 14,
    fontWeight: '600',
  },
  resumenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  resumenItem: {
    flex: 1,
    alignItems: 'center',
  },
  resumenNumero: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 2,
  },
  resumenLabel: {
    fontSize: 11,
    color: THEME.textSecondary,
    fontWeight: '600',
  },
  resumenDivider: {
    width: 1,
    height: 32,
    backgroundColor: THEME.border,
  },

  // Lista de alumnos
  listaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  listaTitulo: {
    fontSize: 17,
    fontWeight: '700',
    color: THEME.text,
  },
  listaContador: {
    fontSize: 12,
    color: THEME.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },

  // Alumno Card (Control)
  alumnoCard: {
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  alumnoAusente: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  alumnoAbordado: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  alumnoOrden: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: THEME.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  alumnoOrdenAbordado: {
    backgroundColor: '#DCFCE7',
  },
  alumnoOrdenAusente: {
    backgroundColor: '#FEE2E2',
  },
  alumnoOrdenNum: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.primary,
  },
  alumnoInfo: {
    flex: 1,
    gap: 3,
  },
  alumnoNombre: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME.text,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  alumnoParada: {
    fontSize: 12,
    color: THEME.textSecondary,
    fontWeight: '500',
  },
  alumnoGrado: {
    fontSize: 12,
    color: THEME.textSecondary,
    fontWeight: '500',
  },
  alumnoAccion: {
    alignItems: 'flex-end',
    gap: 4,
  },

  // Badges
  badgeAusente: {
    backgroundColor: '#FEE2E2',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeAusenteTexto: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.error,
  },
  badgeAbordado: {
    backgroundColor: '#DCFCE7',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeAbordadoTexto: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.success,
  },
  badgeEsperaAuto: {
    backgroundColor: '#FFF8E1',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeEsperaAutoTexto: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.warning,
  },
  btnAbordar: {
    backgroundColor: THEME.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnAbordarTexto: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  // Eventos
  seccionTitulo: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.text,
    marginTop: 20,
    marginBottom: 10,
  },
  linkAction: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF5FF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D6E7FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  linkActionText: {
    color: THEME.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  eventosScroll: {
    flexGrow: 0,
    marginBottom: 2,
  },
  eventosGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  eventoBtn: {
    backgroundColor: THEME.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10, // Aumentado para mejor tacto
    borderWidth: 1,
    borderColor: THEME.border,
  },
  eventoBtnTexto: {
    fontSize: 12,
    color: THEME.text,
    fontWeight: '700',
  },

  // Bitácora
  bitacora: {
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    marginTop: 6,
  },
  bitacoraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  bitacoraTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bitacoraContador: {
    fontSize: 12,
    color: THEME.textSecondary,
    fontWeight: '600',
  },
  eventoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.background,
  },
  eventoHoraContainer: {
    width: 45,
  },
  eventoHora: {
    fontSize: 12,
    color: THEME.textSecondary,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  eventoPunto: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.secondary,
    marginRight: 10,
  },
  eventoTexto: {
    fontSize: 13,
    color: THEME.text,
    flex: 1,
    fontWeight: '500',
  },

  // Gestión de Alumnos
  resumenGestion: {
    flexDirection: 'row',
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  resumenGestionItem: {
    flex: 1,
    alignItems: 'center',
  },
  resumenGestionNumero: {
    fontSize: 22,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 2,
  },
  resumenGestionLabel: {
    fontSize: 11,
    color: THEME.textSecondary,
    fontWeight: '600',
  },
  resumenGestionDivider: {
    width: 1,
    backgroundColor: THEME.border,
  },

  // Alumno Card (Gestión)
  alumnoGestionCard: {
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  alumnoInactivo: {
    backgroundColor: THEME.background,
    borderColor: THEME.border,
    opacity: 0.7,
  },
  alumnoGestionInfo: {
    flex: 1,
    gap: 6,
  },
  alumnoGestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alumnoGestionNombre: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME.text,
    flex: 1,
  },
  badgeInactivo: {
    backgroundColor: THEME.background,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  badgeInactivoTexto: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.textSecondary,
  },
  alumnoGestionDetalles: {
    gap: 3,
  },
  alumnoGestionDetalle: {
    fontSize: 12,
    color: THEME.textSecondary,
    fontWeight: '500',
  },
  alumnoGestionEstado: {
    marginTop: 2,
  },
  estadoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  estadoTextoRow: {
    fontSize: 12,
    fontWeight: '600',
  },
  gestionAcciones: {
    marginLeft: 10,
  },
  btnDesinscribir: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },

  // Botón Nuevo Flotante
  btnNuevoFlotante: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: THEME.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyStateTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.text,
  },
  emptyStateSub: {
    fontSize: 13,
    color: THEME.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Error
  errorTexto: {
    color: THEME.error,
    textAlign: 'center',
    margin: 16,
    fontSize: 14,
    fontWeight: '600',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: THEME.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitulo: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME.text,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.text,
    marginBottom: 6,
    marginTop: 14,
  },
  modalInput: {
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: THEME.text,
    fontWeight: '500',
  },
  modalRutasContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  modalRutaBtn: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: THEME.background,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: THEME.border,
    gap: 8,
  },
  modalRutaBtnActivo: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  modalRutaBtnTexto: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.text,
    flex: 1,
  },
  modalRutaBtnTextoActivo: {
    color: '#fff',
  },
  modalBotones: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  modalBtnCancelar: {
    flex: 1,
    backgroundColor: THEME.background,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  modalBtnCancelarTexto: {
    fontSize: 15,
    color: THEME.textSecondary,
    fontWeight: '700',
  },
  modalBtnConfirmar: {
    flex: 1,
    backgroundColor: THEME.success,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  modalBtnConfirmarTexto: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '700',
  },
  btnDesinscribirMini: {
    padding: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  btnLlamarPadre: {
    padding: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D6E7FF',
  },
  badgeTemp: {
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#FFEDD5',
  },
  badgeTempTexto: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.warning,
  },
  badgeAusenciaPend: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  badgeAusenciaPendTexto: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.error,
  },
  mapContainer: {
    height: 620,
    borderRadius: 0,
    overflow: 'hidden',
    borderWidth: 0,
    backgroundColor: '#fff',
  },
  map: {
    flex: 1,
  },
  markerConductor: {
    backgroundColor: THEME.secondary,
    padding: 8,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  markerAlumno: {
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  mapOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    maxWidth: 230,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(229,229,234,0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  mapControlsOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 20, // Elevado para dar espacio al mapa y estar sobre la barra del sistema
    backgroundColor: 'rgba(255,255,255,0.98)',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  mapControlsTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.text,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mapOverlayTitulo: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.text,
  },
  mapOverlaySub: {
    fontSize: 10,
    color: THEME.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  mapLeyenda: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 10,
  },
  leyendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  leyendaPunto: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  leyendaTexto: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.text,
  },
  // Nuevos estilos Gobernanza Flexible
  accionesPrincipales: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    marginTop: 4,
  },
  accionCard: {
    flex: 1,
    height: 64,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  accionCardTexto: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  bannerVinculacion: {
    backgroundColor: THEME.secondary,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bannerVinculacionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  bannerVinculacionTextContainer: {
    flex: 1,
  },
  bannerVinculacionTitulo: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  bannerVinculacionDesc: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '500',
  },
  bannerVinculacionBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 10,
  },
  bannerVinculacionBtnText: {
    color: THEME.secondary,
    fontSize: 12,
    fontWeight: '800',
  },
  gestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 10,
  },
  btnGestionVinculaciones: {
    backgroundColor: THEME.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: THEME.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  btnGestionVinculacionesTexto: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  cardVinculacionPrincipal: {
    backgroundColor: THEME.surface,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardVinculacionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cardVinculacionText: {
    flex: 1,
  },
  cardVinculacionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.text,
  },
  cardVinculacionDesc: {
    fontSize: 12,
    color: THEME.textSecondary,
    marginTop: 2,
    lineHeight: 16,
    fontWeight: '500',
  },
  // Estilos del Selector de Turno
  turnoSelectorContainer: {
    flexDirection: 'row',
    backgroundColor: THEME.surface,
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  turnoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  turnoBtnActivo: {
    backgroundColor: THEME.secondary,
    borderColor: THEME.secondary,
  },
  turnoBtnTexto: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.textSecondary,
  },
  turnoBtnTextoActivo: {
    color: '#fff',
  },
});
