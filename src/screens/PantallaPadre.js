import socket from '../config/socket';
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  TextInput, ActivityIndicator, Linking, Alert,
  Animated, PanResponder, Dimensions, ScrollView,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from '../components/MapaSeguro';
import { enviarNotificacionLocal, escucharNotificaciones } from '../services/notificaciones';
import fetchWithAuth, {
  vincularConCodigo,
  generarInvitacionPadre,
  obtenerCambiosProgramados,
  crearCambioProgramado,
  eliminarCambioProgramado
} from '../services/api';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import {
  Bus, Home, Phone, Volume2, VolumeX, AlertTriangle, AlertCircle,
  Check, X, MapPin, Clock, User,
  LogOut, Plus, Users, CreditCard,
  Sun, CloudRain, Wind, Car, Activity, Bell, Edit3
} from 'lucide-react-native';
import { cargarSesionPersistida, limpiarSesion, obtenerToken, obtenerUsuario } from '../services/session';

import { API_BASE_URL } from '../services/apiConfig';

const SERVIDOR = API_BASE_URL;
const GOOGLE_API_KEY = 'AIzaSyDVaVcUL_e_lO0nD29QUfOfl0u3RUUFEdM';
const CASA_DEFAULT = { latitude: 13.7020, longitude: -89.2250 };
const PAIS_GEOCODING = 'El Salvador';

// Función para obtener ETA real usando Google Directions API
const obtenerETADeGoogle = async (origen, destino) => {
  try {
    const origenStr = `${origen.latitude},${origen.longitude}`;
    const destinoStr = `${destino.latitude},${destino.longitude}`;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origenStr}&destination=${destinoStr}&key=${GOOGLE_API_KEY}&language=es`;

    // Timeout de 5 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log('Google API response not ok:', response.status);
      return null;
    }

    const data = await response.json();

    if (data.status === 'OK' && data.routes.length > 0) {
      const leg = data.routes[0].legs[0];
      return {
        minutos: Math.round(leg.duration.value / 60),
        distancia: leg.distance.text,
        horaLlegada: leg.arrival_time?.text || null,
        estadoTrafico: leg.duration_in_traffic?.text || null
      };
    } else if (data.status === 'REQUEST_DENIED') {
      console.log('Google API key sin permisos para Directions API');
    } else if (data.status === 'OVER_QUERY_LIMIT') {
      console.log('Google API límite excedido');
    }
    return null;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Google API timeout');
    } else {
      console.log('Error obteniendo ETA:', error.message);
    }
    return null;
  }
};
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SHEET_MIN = 124;
const SHEET_MAX = SCREEN_HEIGHT * 0.75;

const obtenerAuthHeaders = async () => {
  const token = obtenerToken() || await AsyncStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Tema Gris Elegante - Igual que pantalla conductor
const THEME = {
  primary: '#3f3f41',      // Gris oscuro elegante
  primaryDark: '#404042',  // Gris más oscuro para header
  secondary: '#007AFF',    // Azul iOS
  background: '#F2F2F7',   // Gris muy claro fondo iOS
  surface: '#FFFFFF',      // Blanco puro para tarjetas
  text: '#1C1C1E',         // Negro suave para texto
  textSecondary: '#8E8E93',  // Gris medio para subtítulos
  border: '#E5E5EA',       // Gris claro para bordes
  success: '#34C759',      // Verde iOS
  error: '#FF3B30',        // Rojo iOS (conservado para "No asiste")
  warning: '#FF9500',      // Naranja iOS
  info: '#5856D6',         // Púrpura iOS
};

export default function PantallaPadre({ navigation }) {
  const mapRef = useRef(null);
  const avisoVozDadoRef = useRef(false);
  const vozActivadaRef = useRef(true);
  const sugerenciaDireccionIntentadaRef = useRef(false);

  // ========== ESTADOS ==========
  const [socketConectado, setSocketConectado] = useState(socket.connected);

  // Lista de hijos
  const [hijos, setHijos] = useState([]);
  const [hijoSeleccionadoId, setHijoSeleccionadoId] = useState(null);
  const [cargandoHijos, setCargandoHijos] = useState(true);

  // Estado del bus (ahora es un objeto indexado por rutaId)
  const [buses, setBuses] = useState({});
  const [rutaActiva, setRutaActiva] = useState(false);
  const [minutosRestantes, setMinutosRestantes] = useState(null);
  const [historialRuta, setHistorialRuta] = useState([]);
  const [puntoRecogida, setPuntoRecogida] = useState(CASA_DEFAULT);
  const [puntoRecogidaBloqueado, setPuntoRecogidaBloqueado] = useState(false);
  const [guardandoPunto, setGuardandoPunto] = useState(false);
  const [mostrarPickupHint, setMostrarPickupHint] = useState(true);
  const [puntoSugeridoPorDireccion, setPuntoSugeridoPorDireccion] = useState(false);
  const [direccionSugerida, setDireccionSugerida] = useState('');
  const [infoTrafico, setInfoTrafico] = useState(null); // Info de tráfico de Google

  // Ausencia
  const [modalAusencia, setModalAusencia] = useState(false);
  const [motivoAusencia, setMotivoAusencia] = useState('');
  const [diasAusencia, setDiasAusencia] = useState(1);
  const [hijosAusentesIds, setHijosAusentesIds] = useState([]);
  const [ausenciaReportada, setAusenciaReportada] = useState(false);
  const [loadingAusencia, setLoadingAusencia] = useState(false);

  // Configuración
  const [llamadasPermitidas, setLlamadasPermitidas] = useState(true);
  const [telefonoConductor, setTelefonoConductor] = useState('70000002');

  // Bottom sheet
  const sheetY = useRef(new Animated.Value(SHEET_MIN)).current;
  const [sheetAbierto, setSheetAbierto] = useState(false);
  const [seccionSheet, setSeccionSheet] = useState('info');

  // Vincular nuevo hijo
  const [modalVincular, setModalVincular] = useState(false);
  const [codigoVinculacion, setCodigoVinculacion] = useState('');
  const [loadingVincular, setLoadingVincular] = useState(false);

  // Edicion de hijo
  const [modalEditarHijo, setModalEditarHijo] = useState(false);
  const [datosEdicionHijo, setDatosEdicionHijo] = useState({
    nombre: '',
    grado: '',
    colegioNombre: '',
    direccion: '',
  });

  const abrirEdicionHijo = () => {
    if (!hijoSeleccionado) return;
    setDatosEdicionHijo({
      nombre: hijoSeleccionado.nombre,
      grado: hijoSeleccionado.grado,
      colegioNombre: hijoSeleccionado.colegioNombre || '',
      direccion: obtenerDireccionFicha(hijoSeleccionado),
    });
    setModalEditarHijo(true);
  };

  const obtenerValorFicha = (valor, respaldo = 'No especificado') => {
    const texto = String(valor || '').trim();
    return texto || respaldo;
  };

  const obtenerDireccionFicha = (alumno = {}) => (
    String(alumno?.parada || obtenerDireccionTexto(alumno) || '').trim()
  );

  const tienePuntoRecogida = (alumno = {}) => (
    Boolean(alumno?.latitude && alumno?.longitude)
  );

  const direccionEstaBloqueada = (alumno = {}) => (
    Boolean(obtenerDireccionFicha(alumno) || tienePuntoRecogida(alumno))
  );

  const esErrorAprobacionRuta = (status, datos = {}) => {
    const codigo = datos?.codigo || datos?.code || datos?.error;
    return status === 409 && [
      'CAMBIO_DIRECCION_REQUIERE_APROBACION',
      'CAMBIO_PUNTO_RECOGIDA_REQUIERE_APROBACION',
    ].includes(codigo);
  };

  const mostrarReglaAprobacionRuta = () => {
    Alert.alert(
      'Autorizacion requerida',
      'Este cambio afecta la ruta escolar. Coordina con el conductor antes de modificar la direccion o el punto de recogida.',
      [
        { text: 'Entendido', style: 'cancel' },
        { text: 'Llamar conductor', onPress: llamarConductor },
      ]
    );
  };

  const handleGuardarEdicionHijo = async () => {
    try {
      const direccionOriginal = obtenerDireccionFicha(hijoSeleccionado);
      const direccionNueva = String(datosEdicionHijo.direccion || '').trim();
      const direccionCambio = direccionNueva !== direccionOriginal;
      
      if (direccionEstaBloqueada(hijoSeleccionado) && direccionCambio) {
        mostrarReglaAprobacionRuta();
        return;
      }

      const res = await fetch(`${SERVIDOR}/api/padres/hijos/${hijoSeleccionado.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
        body: JSON.stringify({
          ...datosEdicionHijo,
          direccion: direccionNueva,
        }),
      });

      const rawBody = await res.text();
      let datosRespuesta = {};
      try {
        datosRespuesta = rawBody ? JSON.parse(rawBody) : {};
      } catch (_errorParse) {
        datosRespuesta = { error: rawBody };
      }

      if (!res.ok && esErrorAprobacionRuta(res.status, datosRespuesta)) {
        mostrarReglaAprobacionRuta();
        return;
      }

      if (!res.ok) throw new Error('No se pudo actualizar la información');

      setModalEditarHijo(false);
      Alert.alert('¡Éxito!', 'Información actualizada correctamente.');
      await cargarHijos();
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  // Voz
  const [vozActivada, setVozActivada] = useState(true);
  const [avisoVozDado, setAvisoVozDado] = useState(false);

  // Multi-padre
  const [codigoInvitacion, setCodigoInvitacion] = useState(null);
  const [mostrarModalInvitacion, setMostrarModalInvitacion] = useState(false);
  const [generandoInvitacion, setGenerandoInvitacion] = useState(false);

  // Programación de cambios
  const [cambiosProgramados, setCambiosProgramados] = useState([]);
  const [cargandoCambios, setCargandoCambios] = useState(false);
  const [modalNuevoCambio, setModalNuevoCambio] = useState(false);
  const [datosNuevoCambio, setDatosNuevoCambio] = useState({
    tipo: 'devolucion',
    parada: '',
    nota: '',
    fecha: new Date().toISOString().split('T')[0],
    latitude: null, // Añadido para coincidir con el backend
    longitude: null, // Añadido para coincidir con el backend
  });

  // Historial
  const [historialViajes, setHistorialViajes] = useState([]);

  const hijoSeleccionado = hijos.find(h => h.id === hijoSeleccionadoId) || hijos[0];

  // Clima (Real-time API)
  const [clima, setClima] = useState({
    tipo: 'despejado',
    temp: 25,
    mensaje: 'Cargando clima...',
    color: THEME.secondary,
    cargando: true
  });

  const [interesCarpool, setInteresCarpool] = useState(false);
  const [usuario, setUsuario] = useState(obtenerUsuario());

  useEffect(() => {
    const user = obtenerUsuario();
    if (user) setUsuario(user);
    else {
      cargarSesionPersistida().then(res => {
        if (res?.usuario) setUsuario(res.usuario);
      });
    }
  }, []);

  // Posicion arrastrable del clima
  const climaPos = useRef(new Animated.ValueXY({ x: 14, y: 98 })).current;
  const panResponderClima = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        climaPos.setOffset({
          x: climaPos.x._value,
          y: climaPos.y._value
        });
        climaPos.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: climaPos.x, dy: climaPos.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        climaPos.flattenOffset();
      },
    })
  ).current;

  const obtenerClimaReal = async (coords) => {
    try {
      const API_KEY = '23c242058b9bc32130e3d4cef5f44b2c';
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${coords.latitude}&lon=${coords.longitude}&appid=${API_KEY}&units=metric&lang=es`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.main) {
        const temp = Math.round(data.main.temp);
        const condicion = data.weather[0].main.toLowerCase();
        let tipo = 'despejado';
        let mensaje = 'Clima agradable para el viaje.';
        let color = THEME.success;

        if (condicion.includes('rain') || condicion.includes('drizzle') || condicion.includes('thunderstorm')) {
          tipo = 'lluvia';
          mensaje = 'Se espera lluvia. No olvides el impermeable.';
          color = '#3B82F6';
        } else if (temp >= 29) {
          tipo = 'calor';
          mensaje = 'Dia caluroso. Lleva hidratacion extra.';
          color = '#F59E0B';
        } else if (data.wind.speed > 20) {
          tipo = 'viento';
          mensaje = 'Viento fuerte. Se recomienda chaqueta.';
          color = '#64748B';
        } else if (temp <= 18) {
          tipo = 'frio';
          mensaje = 'Clima fresco. Abriga a tu hijo.';
          color = '#6366F1';
        }

        setClima({ tipo, temp, mensaje, color, cargando: false });
      }
    } catch (e) {
      console.log('Error obteniendo clima:', e);
      setClima(prev => ({ ...prev, mensaje: 'Clima no disponible', cargando: false }));
    }
  };

  useEffect(() => {
    if (puntoRecogida?.latitude) {
      obtenerClimaReal(puntoRecogida);
    }
  }, [puntoRecogida]);

  const renderClima = () => {
    if (clima.cargando) return null;
    const WeatherIcon = clima.tipo === 'lluvia' ? CloudRain : clima.tipo === 'calor' ? Sun : clima.tipo === 'viento' ? Wind : Sun;
    return (
      <Animated.View
        {...panResponderClima.panHandlers}
        style={[
          styles.climaBadge,
          {
            backgroundColor: THEME.surface,
            transform: climaPos.getTranslateTransform()
          }
        ]}
      >
        <TouchableOpacity
          style={styles.climaTouchArea}
          onPress={() => obtenerClimaReal(puntoRecogida)}
        >
          <View style={[styles.climaIconContainer, { backgroundColor: clima.color + '15' }]}>
            <WeatherIcon size={18} color={clima.color} strokeWidth={2.5} />
          </View>
          <View style={styles.climaInfo}>
            <Text style={styles.climaTemp}>{clima.temp}°C</Text>
            <Text style={styles.climaMensaje} numberOfLines={2}>{clima.mensaje}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

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
    avisoVozDadoRef.current = avisoVozDado;
  }, [avisoVozDado]);

  useEffect(() => {
    vozActivadaRef.current = vozActivada;
  }, [vozActivada]);

  // Escuchar notificaciones en tiempo real para el abordaje
  useEffect(() => {
    const cleanup = escucharNotificaciones((notification) => {
      const { data } = notification.request.content;
      if (data?.tipo === 'abordado' && data?.alumnoId) {
        setHijos(prev => prev.map(h => h.id === data.alumnoId ? { ...h, abordado: true } : h));
      }

      // Alerta de proximidad 5 minutos con TTS
      if (data?.tipo === 'alerta_proximidad') {
        const mensajeAudio = data?.mensajeAudio || `Atención. El bus llegará en 5 minutos.`;
        if (vozActivadaRef.current) {
          Speech.speak(mensajeAudio, { language: 'es-MX', rate: 0.85 });
        }
        // Mostrar alerta visual adicional por si el audio no se escucha
        enviarNotificacionLocal('🚌 Bus cerca', mensajeAudio);
      }
    }, () => { });

    // Escuchar eventos de la ruta en tiempo real vía Sockets
    socket.on('ruta:evento', (datos) => {
      const hijoActual = hijos.find(h => h.id === hijoSeleccionadoId) || hijos[0];
      if (hijoActual && datos.rutaId === hijoActual.rutaId) {
        setHistorialViajes(prev => [
          {
            fecha: 'Hoy',
            hora: datos.evento.hora,
            estado: 'Evento',
            texto: datos.evento.texto
          },
          ...prev
        ]);
      }
    });

    return () => {
      cleanup();
      socket.off('ruta:evento');
    };
  }, [hijos, hijoSeleccionadoId]);

  useEffect(() => {
    const verificarHint = async () => {
      const configurado = await AsyncStorage.getItem(`punto_configurado_${usuario?.id}`);
      if (configurado === 'true') {
        setMostrarPickupHint(false);
      }
    };
    if (usuario?.id) verificarHint();
  }, [usuario]);

  useEffect(() => {
    if (hijoSeleccionado) {
      if (hijoSeleccionado.latitude && hijoSeleccionado.longitude) {
        const coords = {
          latitude: Number(hijoSeleccionado.latitude),
          longitude: Number(hijoSeleccionado.longitude)
        };
        setPuntoRecogida(coords);
        setPuntoRecogidaBloqueado(true);
        setMostrarPickupHint(false);
        setPuntoSugeridoPorDireccion(false);
      } else {
        setPuntoRecogidaBloqueado(false);
        obtenerDireccionParaSugerencia(hijoSeleccionado).then(direccion => {
          sugerirPuntoDesdeDireccion(direccion);
        });
      }
      setTelefonoConductor(hijoSeleccionado.conductorTelefono || '70000002');
    }
  }, [hijoSeleccionadoId, hijos]);

  // ── Bottom Sheet PanResponder ──────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        const newY = Math.max(SHEET_MIN, Math.min(SHEET_MAX, SHEET_MIN + gesture.dy * -1 + SHEET_MIN));
        if (gesture.dy < 0) {
          sheetY.setValue(Math.min(SHEET_MAX, SHEET_MIN - gesture.dy));
        } else {
          sheetY.setValue(Math.max(SHEET_MIN, SHEET_MIN - gesture.dy));
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -50) {
          abrirSheet();
        } else {
          cerrarSheet();
        }
      },
    })
  ).current;

  const abrirSheet = () => {
    setSheetAbierto(true);
    Animated.spring(sheetY, {
      toValue: SHEET_MAX,
      useNativeDriver: false,
      tension: 80,
      friction: 12,
    }).start();
  };

  const cerrarSheet = () => {
    setSheetAbierto(false);
    Animated.spring(sheetY, {
      toValue: SHEET_MIN,
      useNativeDriver: false,
      tension: 80,
      friction: 12,
    }).start();
  };

  // ── Tracking GPS ──────────────────────────────────────────
  useEffect(() => {
    cargarConfiguracion();
    cargarHijos();

    try {
      socket.connect();
    } catch (err) {
      console.log('Socket connection error:', err.message);
    }

    socket.on('bus:ubicacion', async (datos) => {
      if (datos.activo) {
        const busCoords = { latitude: datos.latitude, longitude: datos.longitude };

        // Actualizar mapa de buses
        setBuses(prev => ({
          ...prev,
          [datos.rutaId || 'global']: busCoords
        }));

        // Si el bus es del hijo seleccionado, actualizar historial y ETA
        const hijoActual = hijos.find(h => h.id === hijoSeleccionadoId) || hijos[0];
        if (hijoActual && (datos.rutaId === hijoActual.rutaId || !datos.rutaId)) {
          setRutaActiva(true);
          setHistorialRuta(prev => [...prev, busCoords]);

          if (navigator.onLine) {
            try {
              const etaData = await obtenerETADeGoogle(busCoords, puntoRecogida);
              if (etaData && etaData.minutos) {
                setMinutosRestantes(etaData.minutos);
                setInfoTrafico({
                  distancia: etaData.distancia,
                  horaLlegada: etaData.horaLlegada,
                  estadoTrafico: etaData.estadoTrafico
                });
              }
            } catch (e) { }
          }

          const distancia = calcularDistancia(
            datos.latitude, datos.longitude,
            puntoRecogida.latitude, puntoRecogida.longitude
          );
          const minutos = Math.round(distancia / 0.5);
          if (!infoTrafico) setMinutosRestantes(minutos);

          if (minutos <= 5 && minutos > 0 && !avisoVozDadoRef.current && vozActivadaRef.current) {
            setAvisoVozDado(true);
            darAvisoDeVoz(minutos);
            await enviarNotificacionLocal(
              '🚌 Bus cercano',
              `El bus de ${hijoActual.nombre} llegará en ${minutos} minutos.`
            );
          }

          mapRef.current?.animateToRegion({
            ...busCoords,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 800);
        }
      }
    });

    socket.on('bus:desvio', async (datos) => {
      const hijoActual = hijos.find(h => h.id === hijoSeleccionadoId);
      if (hijoActual && datos.rutaId === hijoActual.rutaId) {
        await enviarNotificacionLocal(
          '⚠️ Alerta de desvío',
          `El bus de ${hijoActual.nombre} se desvió ${datos.distanciaMetros}m.`
        );
      }
    });

    socket.emit('padre:solicitar_ubicacion');

    return () => {
      socket.off('bus:ubicacion');
      socket.off('bus:desvio');
      socket.disconnect();
    };
  }, [hijos, hijoSeleccionadoId, puntoRecogida]);

  // ── Funciones ─────────────────────────────────────────────
  const cargarHijos = async () => {
    try {
      const data = await fetchWithAuth('/padres/mis-hijos');
      const listaHijos = data.hijos || [];
      setHijos(listaHijos);

      if (listaHijos.length > 0) {
        setHijoSeleccionadoId((idActual) => (
          listaHijos.some(hijo => hijo.id === idActual) ? idActual : listaHijos[0].id
        ));
        const rutasIds = [...new Set(listaHijos.map(h => h.rutaId).filter(Boolean))];
        socket.emit('padre:unirse_rutas', rutasIds);
      } else {
        setHijoSeleccionadoId(null);
      }
    } catch (e) {
      console.log('Error cargando hijos:', e);
    } finally {
      setCargandoHijos(false);
    }
  };

  useEffect(() => {
    const refrescarDatosPadre = () => {
      cargarHijos();
      if (seccionSheet === 'calendario') {
        handleCargarCambios();
      }
    };

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refrescarDatosPadre();
      }
    });

    const focusUnsubscribe = navigation?.addListener?.('focus', refrescarDatosPadre);

    return () => {
      appStateSubscription.remove();
      if (typeof focusUnsubscribe === 'function') {
        focusUnsubscribe();
      }
    };
  }, [navigation, seccionSheet]);

  const darAvisoDeVoz = (minutos) => {
    const mensaje = minutos === 1
      ? 'Atención. El bus escolar llegará en un minuto. Por favor prepara a tu hijo.'
      : `Atención. El bus escolar llegará en ${minutos} minutos. Por favor prepara a tu hijo.`;
    Speech.speak(mensaje, { language: 'es-MX', rate: 0.85, pitch: 1.0 });
  };

  const cargarConfiguracion = async () => {
    try {
      const res = await fetch(`${SERVIDOR}/api/admin/configuracion`, { headers: await obtenerAuthHeaders() });
      const datos = await res.json();
      const config = datos.configuracion || [];
      const llamadas = config.find(c => c.clave === 'llamadas_conductor');
      if (llamadas) setLlamadasPermitidas(llamadas.valor === 'true');
    } catch (e) { }
  };

  const obtenerDireccionTexto = (origen = {}) => {
    const partes = [
      origen.direccion,
      origen.direccion_residencia,
      origen.direccionResidencia,
      origen.domicilio,
      origen.address,
      origen.colonia,
      origen.municipio,
      origen.departamento,
    ];

    return partes
      .filter(Boolean)
      .map((parte) => String(parte).trim())
      .filter(Boolean)
      .join(', ');
  };

  const obtenerDireccionParaSugerencia = async (alumno) => {
    const direccionAlumno = obtenerDireccionTexto(alumno);
    const parada = String(alumno?.parada || '').trim();

    if (direccionAlumno) return direccionAlumno;
    if (parada && !/^punto\s+-?\d/i.test(parada)) return parada;

    try {
      const rawUsuario = await AsyncStorage.getItem('usuario');
      const usuario = rawUsuario ? JSON.parse(rawUsuario) : null;
      return obtenerDireccionTexto(usuario);
    } catch (e) {
      return '';
    }
  };

  const sugerirPuntoDesdeDireccion = async (direccion) => {
    const texto = String(direccion || '').trim();
    if (!texto || sugerenciaDireccionIntentadaRef.current) return false;

    sugerenciaDireccionIntentadaRef.current = true;

    try {
      const consulta = texto.toLowerCase().includes('el salvador')
        ? texto
        : `${texto}, ${PAIS_GEOCODING}`;
      const resultados = await Location.geocodeAsync(consulta);
      const primerResultado = resultados?.[0];

      if (!primerResultado?.latitude || !primerResultado?.longitude) {
        return false;
      }

      const coords = {
        latitude: primerResultado.latitude,
        longitude: primerResultado.longitude,
      };

      setPuntoRecogida(coords);
      setDireccionSugerida(texto);
      setPuntoSugeridoPorDireccion(true);
      setMostrarPickupHint(true);
      mapRef.current?.animateToRegion({
        ...coords,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      }, 800);

      return true;
    } catch (e) {
      console.log('No se pudo sugerir punto por direccion:', e?.message);
      return false;
    }
  };

  const calcularDistancia = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const llamarConductor = () => {
    if (!hijoSeleccionado) return;
    Alert.alert(
      'Llamar conductor',
      `¿Deseas llamar al conductor de ${hijoSeleccionado.rutaNombre}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Llamar',
          onPress: async () => {
            const url = `tel:${telefonoConductor}`;
            const supported = await Linking.canOpenURL(url);
            if (supported) await Linking.openURL(url);
            else Alert.alert('Error', 'No se puede realizar la llamada.');
          }
        }
      ]
    );
  };

  const llamadaEmergencia = () => {
    Alert.alert(
      'Emergencia',
      '¿Deseas llamar al conductor por una emergencia?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'LLAMAR AHORA',
          style: 'destructive',
          onPress: async () => {
            await Linking.openURL(`tel:${telefonoConductor}`);
          }
        }
      ]
    );
  };

  const reportarAusencia = async () => {
    if (hijosAusentesIds.length === 0) {
      Alert.alert('Error', 'Selecciona al menos un hijo.');
      return;
    }
    
    setLoadingAusencia(true);
    try {
      const response = await fetch(`${SERVIDOR}/api/asignaciones/ausencia-multiple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
        body: JSON.stringify({ 
          alumnosIds: hijosAusentesIds, 
          motivo: motivoAusencia || 'Sin especificar',
          dias: diasAusencia
        }),
      });

      if (!response.ok) throw new Error('Error al reportar ausencia');

      setAusenciaReportada(true);
      setModalAusencia(false);
      Alert.alert('Éxito', 'Ausencia reportada correctamente.');
      cargarHijos();
    } catch (e) {
      Alert.alert('Error', 'No se pudo reportar la ausencia. Intenta más tarde.');
    } finally {
      setLoadingAusencia(false);
    }
  };

  const toggleHijoAusente = (id) => {
    setHijosAusentesIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleVincularHijo = async () => {
    if (!codigoVinculacion.trim()) {
      Alert.alert('Error', 'Ingresa el código de vinculación.');
      return;
    }

    setLoadingVincular(true);
    try {
      const res = await fetch(`${SERVIDOR}/api/vinculaciones/vincular-con-codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
        body: JSON.stringify({ codigo: codigoVinculacion.trim().toUpperCase() }),
      });

      const datos = await res.json();
      if (!res.ok) throw new Error(datos.error || 'No se pudo completar la vinculación');

      setModalVincular(false);
      setCodigoVinculacion('');

      Alert.alert(
        '¡Listo!',
        `Tus hijos han sido vinculados correctamente. ${datos.desc || ''}`,
        [
          {
            text: 'Configurar recogida',
            onPress: () => {
              setSeccionSheet('info');
              abrirSheet();
            }
          },
          { text: 'Entendido' }
        ]
      );
      await cargarHijos();
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo vincular.');
    } finally {
      setLoadingVincular(false);
    }
  };

  const handleGenerarInvitacion = async () => {
    if (!hijoSeleccionado) return;
    setGenerandoInvitacion(true);
    try {
      const res = await generarInvitacionPadre(hijoSeleccionado.id);
      setCodigoInvitacion(res.codigo);
      setMostrarModalInvitacion(true);
    } catch (e) {
      Alert.alert('Error', 'No se pudo generar el codigo de invitacion.');
    } finally {
      setGenerandoInvitacion(false);
    }
  };

  const handleCargarCambios = async () => {
    setCargandoCambios(true);
    try {
      const res = await obtenerCambiosProgramados();
      setCambiosProgramados(res.programaciones || res.cambios || []);
    } catch (e) {
      console.log('Error cargando cambios:', e);
    } finally {
      setCargandoCambios(false);
    }
  };

  const handleCrearCambio = async () => {
    if (!hijoSeleccionado) return;
    if (!datosNuevoCambio.parada.trim()) {
      Alert.alert('Error', 'Ingresa la nueva direccion o parada.');
      return;
    }

    try {
      await crearCambioProgramado({
        alumno_id: hijoSeleccionado.id,
        tipo: datosNuevoCambio.tipo,
        parada: datosNuevoCambio.parada,
        nota: datosNuevoCambio.nota,
        fecha: datosNuevoCambio.fecha,
        latitude: datosNuevoCambio.latitude, // Aseguramos que se envíe
        longitude: datosNuevoCambio.longitude, // Aseguramos que se envíe
      });
      setModalNuevoCambio(false);
      setDatosNuevoCambio({
        tipo: 'devolucion',
        parada: '',
        nota: '',
        fecha: new Date().toISOString().split('T')[0],
        latitude: null,
        longitude: null,
      });
      Alert.alert('Exito', 'Cambio programado correctamente.');
      await Promise.all([handleCargarCambios(), cargarHijos()]);
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo programar el cambio.');
    }
  };

  const handleEliminarCambio = (id) => {
    Alert.alert(
      'Eliminar cambio',
      '¿Deseas cancelar este cambio programado?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Si, eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await eliminarCambioProgramado(id);
              await Promise.all([handleCargarCambios(), cargarHijos()]);
            } catch (e) {
              Alert.alert('Error', 'No se pudo eliminar el cambio.');
            }
          }
        }
      ]
    );
  };

  const guardarPuntoRecogida = async (coords, aplicarATodos = false) => {
    if (!hijoSeleccionado) return;
    setGuardandoPunto(true);

    try {
      let parada = `Punto ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;

      try {
        const lugares = await Location.reverseGeocodeAsync(coords);
        const lugar = lugares?.[0];
        if (lugar) {
          parada = [
            lugar.name,
            lugar.street,
            lugar.district,
            lugar.city,
          ].filter(Boolean).join(', ') || parada;
        }
      } catch (e) { }

      const payload = {
        parada,
        latitude: coords.latitude,
        longitude: coords.longitude,
        aplicarATodos // Nuevo parámetro para el backend
      };

      const response = await fetch(`${SERVIDOR}/api/padres/hijos/${hijoSeleccionado.id}/punto-recogida`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (esErrorAprobacionRuta(response.status, errorData)) {
          mostrarReglaAprobacionRuta();
          return;
        }
        throw new Error(errorData.error || 'No se pudo guardar el punto de recogida');
      }

      setPuntoRecogida(coords);
      setPuntoRecogidaBloqueado(true);
      setMostrarPickupHint(false);
      setPuntoSugeridoPorDireccion(false);
      
      // Persistir que ya se configuró el punto para no mostrar el anuncio de nuevo
      await AsyncStorage.setItem(`punto_configurado_${usuario?.id}`, 'true');

      // Actualizar localmente
      if (aplicarATodos) {
        setHijos(prev => prev.map(h => ({ ...h, latitude: coords.latitude, longitude: coords.longitude, parada })));
      } else {
        setHijos(prev => prev.map(h => h.id === hijoSeleccionado.id ? { ...h, latitude: coords.latitude, longitude: coords.longitude, parada } : h));
      }

      Alert.alert('Punto actualizado', 'El conductor usará este punto para marcar el abordaje automático.');
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo guardar el punto.');
    } finally {
      setGuardandoPunto(false);
    }
  };

  const seleccionarPuntoRecogida = ({ nativeEvent }) => {
    const coords = nativeEvent.coordinate;
    
    if (puntoRecogidaBloqueado) {
      solicitarAutorizacionCambio();
      return;
    }

    if (hijos.length > 1) {
      Alert.alert(
        'Definir punto de recogida',
        '¿Deseas usar esta misma dirección para todos tus hijos?',
        [
          { text: 'Solo para este hijo', onPress: () => guardarPuntoRecogida(coords, false) },
          { text: 'Para todos', onPress: () => guardarPuntoRecogida(coords, true) },
          { text: 'Cancelar', style: 'cancel' }
        ]
      );
    } else {
      guardarPuntoRecogida(coords, false);
    }
  };

  const solicitarAutorizacionCambio = () => {
    Alert.alert(
      '¿Deseas cambiar el punto de recogida?',
      'Para modificar el punto de recogida y entrega ya establecido, debes comunicarte con el conductor para coordinar el cambio de ruta de manera segura.\n\n¿Quieres contactar al conductor ahora?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Contactar Conductor', onPress: llamarConductor },
      ]
    );
  };

  const horaEstimadaLlegada = minutosRestantes != null
    ? new Date(Date.now() + Math.max(minutosRestantes, 0) * 60000).toLocaleTimeString('es-SV', {
      hour: '2-digit',
      minute: '2-digit',
    })
    : '--:--';

  const estadoColor = !rutaActiva ? THEME.textSecondary :
    minutosRestantes === 0 ? THEME.success :
      minutosRestantes <= 3 ? THEME.error : THEME.secondary;

  const estadoTexto = !rutaActiva ? 'Bus no activo' :
    minutosRestantes === 0 ? 'Bus llegó' :
      minutosRestantes <= 3 ? `Llegando — ${minutosRestantes} min` :
        `En camino — ${minutosRestantes} min`;

  const estadoIcono = !rutaActiva ? <Bus size={16} color={THEME.textSecondary} strokeWidth={2} /> :
    minutosRestantes === 0 ? <Check size={16} color={THEME.success} strokeWidth={3} /> :
      minutosRestantes <= 3 ? <AlertTriangle size={16} color={THEME.error} strokeWidth={2} /> :
        <Bus size={16} color={THEME.secondary} strokeWidth={2} />;

  const direccionEdicionBloqueada = direccionEstaBloqueada(hijoSeleccionado);
  const textoDireccionBloqueada = tienePuntoRecogida(hijoSeleccionado)
    ? 'El punto de recogida ya esta definido. Coordina cualquier cambio con el conductor.'
    : 'La direccion ya esta registrada. Coordina cualquier cambio con el conductor.';

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.bienvenida}>{(() => {
                const hora = new Date().getHours();
                if (hora >= 5 && hora < 12) return 'Buenos días';
                if (hora >= 12 && hora < 19) return 'Buenas tardes';
                return 'Buenas noches';
              })()}</Text>
              <View style={[styles.socketStatus, { backgroundColor: socketConectado ? THEME.success : THEME.error }]} />
            </View>
            {hijos.length > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hijosSelector}>
                  {hijos.map(h => (
                    <TouchableOpacity
                      key={h.id}
                      onPress={() => setHijoSeleccionadoId(h.id)}
                      style={[styles.hijoChip, hijoSeleccionadoId === h.id && styles.hijoChipActivo]}
                    >
                      <Users size={14} color={hijoSeleccionadoId === h.id ? '#fff' : 'rgba(255,255,255,0.6)'} style={{ marginRight: 6 }} />
                      <Text style={[styles.hijoChipTexto, hijoSeleccionadoId === h.id && styles.hijoChipTextoActivo]}>
                        {h.nombre.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={styles.btnAddHijoSubtle}
                  onPress={() => setModalVincular(true)}
                >
                  <Plus size={18} color="rgba(255,255,255,0.8)" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.btnVincularHeaderLarge} onPress={() => setModalVincular(true)}>
                <Plus size={18} color="#fff" strokeWidth={3} />
                <Text style={styles.titulo}>Vincular primer hijo</Text>
              </TouchableOpacity>
            )}

            {hijoSeleccionado && (
              <View style={styles.subtituloRow}>
                <User size={12} color="rgba(255,255,255,0.7)" strokeWidth={2} />
                <Text style={[styles.subtitulo, !hijoSeleccionado.rutaId && { color: '#FFBABA', fontWeight: '700' }]}>
                  {hijoSeleccionado?.grado} · {hijoSeleccionado?.rutaNombre || 'Ruta no asignada'}
                </Text>
              </View>
            )}
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

      {/* ETA SUTIL Y ESTÉTICO (PARTE SUPERIOR IZQUIERDA DEL MAPA) */}
      {rutaActiva && minutosRestantes !== null && (
        <View style={styles.etaContainer}>
          <View style={styles.etaContent}>
            <Clock size={14} color={THEME.secondary} strokeWidth={2.5} />
            <View>
              <Text style={styles.etaMinutos}>{minutosRestantes} min</Text>
              <Text style={styles.etaHora}>Llega {horaEstimadaLlegada}</Text>
            </View>
          </View>
        </View>
      )}
      <View style={styles.mapaContainer}>
        {hijoSeleccionado && !hijoSeleccionado.rutaId && !cargandoHijos && (
          <View style={styles.childNoRouteOverlay}>
            <View style={styles.childNoRouteIcon}>
              <AlertCircle size={18} color={THEME.warning} />
            </View>
            <View style={styles.childNoRouteText}>
              <Text style={styles.childNoRouteTitle}>Ruta no asignada</Text>
              <Text style={styles.childNoRouteDesc} numberOfLines={2}>
                {hijoSeleccionado.nombre.split(' ')[0]} no tiene bus. Usa el código del conductor arriba.
              </Text>
            </View>
          </View>
        )}

        {hijoSeleccionado && hijoSeleccionado.rutaId && (!hijoSeleccionado.latitude || !hijoSeleccionado.longitude) && !cargandoHijos && (
          <View style={[styles.childNoRouteOverlay, { backgroundColor: 'rgba(239, 246, 255, 0.95)', borderColor: '#3B82F6' }]}>
            <View style={[styles.childNoRouteIcon, { backgroundColor: '#3B82F6' }]}>
              <MapPin size={18} color="#fff" />
            </View>
            <View style={styles.childNoRouteText}>
              <Text style={[styles.childNoRouteTitle, { color: '#1E40AF' }]}>Configurar recogida</Text>
              <Text style={[styles.childNoRouteDesc, { color: '#1E40AF' }]} numberOfLines={2}>
                Por favor, mantén presionado el mapa para indicar dónde debemos recoger a {hijoSeleccionado.nombre.split(' ')[0]}.
              </Text>
            </View>
          </View>
        )}

        {cargandoHijos ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={THEME.primary} />
            <Text style={styles.loadingText}>Cargando información...</Text>
          </View>
        ) : (
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.mapa}
            initialRegion={{
              latitude: Number(hijoSeleccionado?.latitude) || CASA_DEFAULT.latitude,
              longitude: Number(hijoSeleccionado?.longitude) || CASA_DEFAULT.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01
            }}
            showsUserLocation={true}
            showsTraffic={true}
            showsMyLocationButton={true}
            onLongPress={hijoSeleccionado ? (puntoRecogidaBloqueado ? solicitarAutorizacionCambio : seleccionarPuntoRecogida) : undefined}
          >
            {/* Buses activos */}
            {Object.entries(buses).map(([rutaId, pos]) => (
              <Marker
                key={rutaId}
                coordinate={pos}
                title={rutaId === 'global' ? 'Bus escolar' : `Bus Ruta ${rutaId}`}
              >
                <View style={[styles.busMarker, (hijoSeleccionado?.rutaId == rutaId) && styles.busMarkerSelected]}>
                  <Bus size={24} color={(hijoSeleccionado?.rutaId == rutaId) ? THEME.secondary : THEME.textSecondary} strokeWidth={2} />
                </View>
              </Marker>
            ))}

            {/* Puntos de recogida de todos los hijos */}
            {hijos.map((hijo) => (
              hijo.latitude && hijo.longitude && (
                <Marker
                  key={`home-${hijo.id}`}
                  coordinate={{ latitude: Number(hijo.latitude), longitude: Number(hijo.longitude) }}
                  title={`Recogida ${hijo.nombre}`}
                  onPress={() => setHijoSeleccionadoId(hijo.id)}
                >
                  <View style={[styles.pickupMarker, hijoSeleccionadoId === hijo.id && styles.pickupMarkerSelected]}>
                    <Home size={24} color={hijoSeleccionadoId === hijo.id ? THEME.success : THEME.textSecondary} strokeWidth={2} />
                  </View>
                </Marker>
              )
            ))}

            {historialRuta.length > 1 && (
              <Polyline coordinates={historialRuta} strokeColor={THEME.secondary} strokeWidth={3} lineDashPattern={[5, 3]} />
            )}
          </MapView>
        )}

        {hijoSeleccionado && mostrarPickupHint && !puntoRecogidaBloqueado && !cargandoHijos && (
          <View style={[styles.pickupHint, puntoSugeridoPorDireccion && styles.pickupHintSugerido]}>
            <View style={styles.pickupHintHeader}>
              <MapPin size={14} color={THEME.primary} strokeWidth={2} />
              <Text style={styles.pickupHintTexto}>
                {puntoSugeridoPorDireccion
                  ? `Aproximamos el punto de ${hijoSeleccionado?.nombre.split(' ')[0]} con su direccion.`
                  : 'Manten presionado el mapa para definir el punto exacto de recogida'}
              </Text>
            </View>
            {puntoSugeridoPorDireccion && (
              <>
                {direccionSugerida ? (
                  <Text style={styles.pickupDireccion} numberOfLines={2}>{direccionSugerida}</Text>
                ) : null}
                <View style={styles.pickupHintActions}>
                  <TouchableOpacity
                    style={[styles.pickupHintButton, styles.pickupHintButtonSecondary]}
                    onPress={ajustarPuntoSugerido}
                    disabled={guardandoPunto}
                  >
                    <Text style={styles.pickupHintButtonSecondaryText}>Ajustar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pickupHintButton, styles.pickupHintButtonPrimary]}
                    onPress={confirmarPuntoSugerido}
                    disabled={guardandoPunto}
                  >
                    {guardandoPunto ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.pickupHintButtonPrimaryText}>Confirmar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {/* Badge estado */}
        {hijoSeleccionado && (
          <View style={[styles.estadoBadge, { borderColor: estadoColor, backgroundColor: THEME.surface }]}>
            <View style={styles.estadoIconoContainer}>
              {estadoIcono}
            </View>
            <Text style={[styles.estadoTexto, { color: estadoColor }]}>{estadoTexto}</Text>
          </View>
        )}

        {/* Badge abordado hoy */}
        {hijoSeleccionado?.abordado && (
          <View style={[styles.abordadoBadge, { backgroundColor: THEME.success }]}>
            <Check size={14} color="#fff" strokeWidth={3} />
            <Text style={styles.abordadoTexto}>Abordo hoy</Text>
          </View>
        )}

        {/* Badge Cambio Programado Hoy */}
        {hijoSeleccionado?.tieneProgramacionHoy && (
          <View style={[styles.cambioHoyBadge, { backgroundColor: THEME.warning }]}>
            <MapPin size={14} color="#fff" strokeWidth={3} />
            <Text style={styles.cambioHoyTexto}>Cambio programado</Text>
          </View>
        )}

        {/* Badge de clima (Prototipo) */}
        {renderClima()}

        {/* Badge de trafico en tiempo real */}
        {infoTrafico && rutaActiva && (
          <View style={[styles.traficoBadge, { backgroundColor: THEME.surface }]}>
            <Text style={styles.traficoLabel}>🚗 Tráfico</Text>
            <Text style={styles.traficoValor}>{infoTrafico.distancia}</Text>
            {infoTrafico.horaLlegada && (
              <Text style={styles.traficoHora}>LLega: {infoTrafico.horaLlegada}</Text>
            )}
          </View>
        )}

        {/* Botón ausencia flotante */}
        {hijoSeleccionado && !ausenciaReportada && !rutaActiva ? (
          <TouchableOpacity style={styles.btnAusencia} onPress={() => setModalAusencia(true)}>
            <Text style={styles.btnAusenciaTexto}>No asiste hoy</Text>
          </TouchableOpacity>
        ) : hijoSeleccionado && !ausenciaReportada && rutaActiva ? (
          <View style={[styles.btnAusencia, { backgroundColor: THEME.textSecondary, opacity: 0.7 }]}>
            <Text style={styles.btnAusenciaTexto}>Ruta en curso</Text>
          </View>
        ) : hijoSeleccionado && ausenciaReportada && (
          <View style={[styles.btnAusencia, { backgroundColor: THEME.textSecondary }]}>
            <Text style={styles.btnAusenciaTexto}>Ausencia reportada</Text>
          </View>
        )}

        {/* Botón voz flotante */}
        <TouchableOpacity
          style={[styles.btnVoz, { backgroundColor: vozActivada ? THEME.primary : THEME.textSecondary }]}
          onPress={() => setVozActivada(!vozActivada)}
        >
          {vozActivada ? (
            <Volume2 size={22} color="#fff" strokeWidth={2} />
          ) : (
            <VolumeX size={22} color="#fff" strokeWidth={2} />
          )}
        </TouchableOpacity>

        {/* Botón EMERGENCIA flotante */}
        {llamadasPermitidas && (
          <TouchableOpacity style={styles.btnEmergencia} onPress={llamadaEmergencia}>
            <AlertTriangle size={26} color="#fff" strokeWidth={2} fill={THEME.error} />
          </TouchableOpacity>
        )}
      </View>

      {/* BOTTOM SHEET ANIMADO */}
      <Animated.View style={[styles.bottomSheet, { height: sheetY }]}>

        {/* Handle — drag para abrir/cerrar */}
        <View {...panResponder.panHandlers} style={styles.sheetHandle}>
          <View style={styles.sheetHandleBar} />
        </View>

        {/* Tabs del sheet */}
        <View style={styles.sheetTabs}>
          {[
            { key: 'info', label: 'Ficha', Icon: User },
            { key: 'calendario', label: 'Cambios', Icon: Clock },
            { key: 'historial', label: 'Historial', Icon: Clock },
            { key: 'llamar', label: 'Llamar', Icon: Phone },
            { key: 'carpool', label: 'Carpool', Icon: Car },
            { key: 'suscripcion', label: 'Plan', Icon: CreditCard },
          ].map(({ key, label, Icon }) => (
            <TouchableOpacity
              key={key}
              style={[styles.sheetTab, seccionSheet === key && styles.sheetTabActivo]}
              onPress={() => {
                setSeccionSheet(key);
                abrirSheet();
                if (key === 'calendario') handleCargarCambios();
              }}
            >
              <Icon size={14} color={seccionSheet === key ? '#fff' : THEME.textSecondary} strokeWidth={2} />
              <Text style={[styles.sheetTabTexto, seccionSheet === key && styles.sheetTabTextoActivo]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Contenido del sheet */}
        <ScrollView style={styles.sheetContenido} showsVerticalScrollIndicator={false}>

          {/* Info */}
          {seccionSheet === 'info' && hijoSeleccionado && (
            <View>
              <View style={styles.fichaHeader}>
                <View style={styles.fichaAvatar}>
                  <User size={22} color={THEME.secondary} strokeWidth={2} />
                </View>
                <View style={styles.fichaHeaderText}>
                  <Text style={styles.fichaTitulo} numberOfLines={1}>{obtenerValorFicha(hijoSeleccionado?.nombre)}</Text>
                  <Text style={styles.fichaSubtitulo} numberOfLines={1}>
                    {obtenerValorFicha(hijoSeleccionado?.grado)} · {obtenerValorFicha(hijoSeleccionado?.colegioNombre)}
                  </Text>
                </View>
                <TouchableOpacity onPress={abrirEdicionHijo} style={styles.btnEditarFicha}>
                  <Edit3 size={16} color="#fff" strokeWidth={2.4} />
                  <Text style={styles.btnEditarFichaTexto}>Editar</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.infoSection}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Alumno</Text>
                  <Text style={styles.infoValor}>{obtenerValorFicha(hijoSeleccionado?.nombre)}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Grado</Text>
                  <Text style={styles.infoValor}>{obtenerValorFicha(hijoSeleccionado?.grado)}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Colegio</Text>
                  <Text style={styles.infoValor}>{obtenerValorFicha(hijoSeleccionado?.colegioNombre)}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Dirección</Text>
                  <Text style={styles.infoValor}>{obtenerValorFicha(hijoSeleccionado?.parada || obtenerDireccionTexto(hijoSeleccionado))}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Ruta</Text>
                  <Text style={styles.infoValor}>{obtenerValorFicha(hijoSeleccionado?.rutaNombre, 'Pendiente de asignación')}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Conductor</Text>
                  <Text style={styles.infoValor}>{hijoSeleccionado?.conductorNombre || 'Pendiente'}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Recogida (Promedio)</Text>
                  <Text style={styles.infoValor}>{hijoSeleccionado?.promedioRecogida || '06:45 AM'}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Llegada (Promedio)</Text>
                  <Text style={styles.infoValor}>{hijoSeleccionado?.promedioLlegada || '01:30 PM'}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Estado bus</Text>
                  <View style={styles.infoValorRow}>
                    <View style={[styles.estadoDot, { backgroundColor: estadoColor }]} />
                    <Text style={[styles.infoValor, { color: estadoColor }]}>{estadoTexto}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.autorizacionRutaNota}>
                <AlertCircle size={16} color={THEME.warning} strokeWidth={2.2} />
                <Text style={styles.autorizacionRutaTexto}>
                  Los cambios de dirección o punto de recogida deben ser autorizados por el conductor antes de aplicarse a la ruta.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.btnShareTracking}
                onPress={handleGenerarInvitacion}
                disabled={generandoInvitacion}
              >
                {generandoInvitacion ? (
                  <ActivityIndicator color={THEME.secondary} size="small" />
                ) : (
                  <Users size={18} color={THEME.secondary} strokeWidth={2} />
                )}
                <Text style={styles.btnShareTrackingTexto}>Compartir seguimiento</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnProbarVoz}
                onPress={() => Speech.speak(`Atención. El bus de ${hijoSeleccionado?.nombre?.split(' ')[0]} llegará en 5 minutos.`, { language: 'es-MX', rate: 0.85 })}
              >
                <Volume2 size={18} color={THEME.primary} strokeWidth={2} />
                <Text style={styles.btnProbarVozTexto}>Probar aviso de voz</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Calendario / Cambios */}
          {seccionSheet === 'calendario' && (
            <View>
              <View style={styles.headerCalendario}>
                <Text style={styles.sheetSeccionTitulo}>Cambios Programados</Text>
                <TouchableOpacity style={styles.btnNuevoCambio} onPress={() => setModalNuevoCambio(true)}>
                  <Plus size={16} color="#fff" strokeWidth={3} />
                  <Text style={styles.btnNuevoCambioTexto}>Nuevo</Text>
                </TouchableOpacity>
              </View>

              {cargandoCambios ? (
                <ActivityIndicator color={THEME.primary} style={{ marginTop: 20 }} />
              ) : cambiosProgramados.length === 0 ? (
                <View style={styles.emptyCambios}>
                  <Clock size={40} color={THEME.border} />
                  <Text style={styles.emptyCambiosTexto}>No hay cambios programados a futuro.</Text>
                </View>
              ) : (
                cambiosProgramados.map((cambio) => (
                  <View key={cambio.id} style={styles.cambioCard}>
                    <View style={styles.cambioHeader}>
                      <View style={styles.cambioFechaContainer}>
                        <Clock size={14} color={THEME.secondary} />
                        <Text style={styles.cambioFecha}>{new Date(cambio.fecha).toLocaleDateString('es-SV', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleEliminarCambio(cambio.id)}>
                        <X size={18} color={THEME.error} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.cambioHijo}>{cambio.alumno_nombre}</Text>
                    <View style={styles.cambioDetalleRow}>
                      <MapPin size={14} color={THEME.textSecondary} />
                      <Text style={styles.cambioParada}>{cambio.parada}</Text>
                    </View>
                    {cambio.nota && (
                      <Text style={styles.cambioNota}>Nota: {cambio.nota}</Text>
                    )}
                    <View style={styles.cambioTipoBadge}>
                      <Text style={styles.cambioTipoTexto}>{cambio.tipo.toUpperCase()}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* Historial / Bitácora de Viaje */}
          {seccionSheet === 'historial' && (
            <View>
              <Text style={styles.sheetSeccionTitulo}>Bitácora y Viajes</Text>
              {historialViajes.length === 0 ? (
                <View style={styles.emptyCambios}>
                  <Activity size={40} color={THEME.border} />
                  <Text style={styles.emptyCambiosTexto}>No hay actividad registrada hoy.</Text>
                </View>
              ) : (
                historialViajes.map((viaje, i) => (
                  <View key={i} style={styles.viajeRow}>
                    <View style={[styles.viajeIcono, {
                      backgroundColor: viaje.estado === 'Completado' ? '#F0FDF4' :
                        viaje.estado === 'Evento' ? '#EFF6FF' : '#FFF8E1',
                      borderColor: viaje.estado === 'Completado' ? '#DCFCE7' :
                        viaje.estado === 'Evento' ? '#DBEAFE' : '#FEF3C7',
                    }]}>
                      {viaje.estado === 'Completado' ? (
                        <Check size={20} color={THEME.success} strokeWidth={3} />
                      ) : viaje.estado === 'Evento' ? (
                        <Bell size={20} color={THEME.secondary} strokeWidth={2} />
                      ) : (
                        <Clock size={20} color={THEME.warning} strokeWidth={2} />
                      )}
                    </View>
                    <View style={styles.viajeInfo}>
                      <Text style={styles.viajeFecha}>{viaje.fecha} · {viaje.hora}</Text>
                      <Text style={[styles.viajeDetalle, viaje.estado === 'Evento' && { color: THEME.text, fontWeight: '600' }]}>
                        {viaje.texto || `Salida: ${viaje.hora} · ${viaje.alumnos} alumnos`}
                      </Text>
                    </View>
                    <View style={[styles.viajeBadge, {
                      backgroundColor: viaje.estado === 'Completado' ? '#F0FDF4' :
                        viaje.estado === 'Evento' ? '#EFF6FF' : '#FFF8E1',
                    }]}>
                      <Text style={[styles.viajeBadgeTexto, {
                        color: viaje.estado === 'Completado' ? THEME.success :
                          viaje.estado === 'Evento' ? THEME.secondary : THEME.warning
                      }]}>
                        {viaje.estado}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* Carpool (Prototipo de interés) */}
          {seccionSheet === 'carpool' && (
            <View style={styles.carpoolContainer}>
              <View style={styles.carpoolHeader}>
                <Car size={32} color={THEME.secondary} strokeWidth={2.5} />
                <Text style={styles.carpoolTitle}>Próximamente: Carpool Escolar</Text>
              </View>

              <Text style={styles.carpoolDesc}>
                Estamos diseñando una nueva forma de ahorrar y colaborar entre padres.
              </Text>

              <View style={styles.carpoolFeatureCard}>
                <View style={styles.featureItem}>
                  <MapPin size={20} color={THEME.secondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>Radio de 1KM</Text>
                    <Text style={styles.featureText}>Conéctate con padres que viven muy cerca de ti.</Text>
                  </View>
                </View>

                <View style={styles.featureItem}>
                  <Bus size={20} color={THEME.secondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>Mismo Destino</Text>
                    <Text style={styles.featureText}>Grupos exclusivos para familias que van al mismo colegio.</Text>
                  </View>
                </View>

                <View style={styles.featureItem}>
                  <Check size={20} color={THEME.secondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>Sistema Equitativo</Text>
                    <Text style={styles.featureText}>Algoritmo que garantiza turnos justos para todos los conductores.</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.btnCarpoolInteres, interesCarpool && styles.btnCarpoolInteresActivo]}
                onPress={() => {
                  setInteresCarpool(true);
                  Alert.alert("¡Gracias!", "Te notificaremos en cuanto esta función esté disponible en tu zona.");
                }}
              >
                <Text style={styles.btnCarpoolInteresTexto}>
                  {interesCarpool ? "¡Me interesa! (Registrado)" : "Avísenme cuando esté listo"}
                </Text>
              </TouchableOpacity>
              
              <Text style={styles.carpoolNota}>
                Esta función está en fase de diseño. Tu interés nos ayuda a priorizar su desarrollo.
              </Text>
            </View>
          )}

          {/* Suscripcion */}
          {seccionSheet === 'suscripcion' && hijoSeleccionado && (
            <View>
              <Text style={styles.sheetSeccionTitulo}>Mi Suscripción</Text>
              <View style={styles.infoSection}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Plan actual</Text>
                  <Text style={[styles.infoValor, { color: THEME.secondary }]}>Servicio Escolar</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Fecha inicio</Text>
                  <Text style={styles.infoValor}>{hijoSeleccionado?.fechaInicio || 'No definida'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Fecha finalización</Text>
                  <Text style={styles.infoValor}>{hijoSeleccionado?.fechaFin || 'No definida'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Estado de pago</Text>
                  <Text style={[styles.infoValor, { color: THEME.success }]}>Al día</Text>
                </View>
              </View>
              <Text style={styles.notaLlamada}>
                Tu cobro está asociado a las fechas de funcionamiento elegidas durante el registro.
              </Text>
            </View>
          )}

          {/* Llamar */}
          {seccionSheet === 'llamar' && hijoSeleccionado && (
            <View>
              <Text style={styles.sheetSeccionTitulo}>Contactar conductor</Text>

              {llamadasPermitidas ? (
                <>
                  <View style={styles.conductorCard}>
                    <View style={styles.conductorAvatar}>
                      <User size={28} color={THEME.secondary} strokeWidth={1.5} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.conductorNombre}>{hijoSeleccionado?.conductorNombre || 'Conductor'}</Text>
                      <Text style={styles.conductorTel}>{telefonoConductor}</Text>
                      <Text style={styles.conductorRuta}>{hijoSeleccionado?.rutaNombre}</Text>
                    </View>
                  </View>

                  <TouchableOpacity style={styles.btnLlamar} onPress={llamarConductor}>
                    <Phone size={20} color="#fff" strokeWidth={2} />
                    <Text style={styles.btnLlamarTexto}>Llamar conductor</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.btnEmergenciaSheet} onPress={llamadaEmergencia}>
                    <AlertTriangle size={20} color={THEME.error} strokeWidth={2} />
                    <Text style={styles.btnEmergenciaSheetTexto}>Llamada de emergencia</Text>
                  </TouchableOpacity>

                  <Text style={styles.notaLlamada}>
                    Las llamadas de emergencia son para situaciones urgentes relacionadas con la seguridad de tu hijo.
                  </Text>
                </>
              ) : (
                <View style={styles.llamadasDesactivadas}>
                  <View style={styles.llamadasIconoContainer}>
                    <Phone size={40} color={THEME.border} strokeWidth={1.5} />
                    <View style={styles.bloqueoOverlay}>
                      <X size={20} color={THEME.error} strokeWidth={3} />
                    </View>
                  </View>
                  <Text style={styles.llamadasDesactivadasTexto}>
                    El administrador ha desactivado las llamadas al conductor.
                  </Text>
                </View>
              )}
            </View>
          )}

        </ScrollView>
      </Animated.View>

      {/* MODAL AUSENCIA */}
      <Modal visible={modalAusencia} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Reportar ausencia</Text>
              <TouchableOpacity onPress={() => setModalAusencia(false)} style={styles.modalCloseBtn}>
                <X size={24} color={THEME.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalSubtitulo}>
                Selecciona quién no asistirá y por cuánto tiempo. Esto pausará las notificaciones de llegada para estos niños.
              </Text>

              <Text style={styles.labelField}>¿Quién no asistirá?</Text>
              <View style={styles.hijosAusenciaGrid}>
                {hijos.map(h => (
                  <TouchableOpacity 
                    key={h.id} 
                    style={[styles.hijoAusenciaBtn, hijosAusentesIds.includes(h.id) && styles.hijoAusenciaBtnActivo]}
                    onPress={() => toggleHijoAusente(h.id)}
                  >
                    <Users size={16} color={hijosAusentesIds.includes(h.id) ? '#fff' : THEME.textSecondary} />
                    <Text style={[styles.hijoAusenciaTexto, hijosAusentesIds.includes(h.id) && styles.hijoAusenciaTextoActivo]}>
                      {h.nombre.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.labelField}>¿Por cuántos días?</Text>
              <View style={styles.diasSelector}>
                {[1, 2, 3, 5, 10].map(d => (
                  <TouchableOpacity 
                    key={d} 
                    style={[styles.diaBtn, diasAusencia === d && styles.diaBtnActivo]}
                    onPress={() => setDiasAusencia(d)}
                  >
                    <Text style={[styles.diaBtnTexto, diasAusencia === d && styles.diaBtnTextoActivo]}>
                      {d === 1 ? 'Solo hoy' : `${d} días`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.labelField}>Motivo (Opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Se siente mal, viaje familiar..."
                value={motivoAusencia}
                onChangeText={setMotivoAusencia}
                multiline
              />

              <View style={styles.modalBotones}>
                <TouchableOpacity
                  style={styles.modalBtnCancelar}
                  onPress={() => setModalAusencia(false)}
                  disabled={loadingAusencia}
                >
                  <Text style={styles.modalBtnCancelarTexto}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtnConfirmar, { backgroundColor: THEME.error }]}
                  onPress={reportarAusencia}
                  disabled={loadingAusencia}
                >
                  {loadingAusencia ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalBtnConfirmarTexto}>Confirmar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL VINCULAR HIJO */}
      <Modal visible={modalVincular} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Vincular estudiante</Text>
              <TouchableOpacity onPress={() => setModalVincular(false)} style={styles.modalCloseBtn}>
                <X size={24} color={THEME.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalSubtitulo}>
                Ingresa el código que te proporcionó el conductor o el colegio.
              </Text>

              <Text style={styles.labelField}>Código de vinculación</Text>
              <TextInput
                style={[styles.modalInput, { fontSize: 20, textAlign: 'center', letterSpacing: 2, color: THEME.secondary }]}
                placeholder="EJ: BUS-1234"
                value={codigoVinculacion}
                onChangeText={setCodigoVinculacion}
                autoCapitalize="characters"
              />

              <View style={styles.modalBotones}>
                <TouchableOpacity
                  style={styles.modalBtnCancelar}
                  onPress={() => setModalVincular(false)}
                  disabled={loadingVincular}
                >
                  <Text style={styles.modalBtnCancelarTexto}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtnConfirmar, { backgroundColor: THEME.secondary }]}
                  onPress={handleVincularHijo}
                  disabled={loadingVincular}
                >
                  {loadingVincular ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalBtnConfirmarTexto}>Vincular</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL INVITACION PADRE */}
      <Modal visible={mostrarModalInvitacion} transparent animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalCardCenter}>
            <Users size={40} color={THEME.secondary} style={{ alignSelf: 'center', marginBottom: 16 }} />
            <Text style={styles.modalTituloCenter}>Compartir seguimiento</Text>
            <Text style={styles.modalSubtituloCenter}>
              Entrega este código a la otra persona para que pueda seguir el bus de {hijoSeleccionado?.nombre.split(' ')[0]}.
            </Text>

            <View style={styles.codigoContainer}>
              <Text style={styles.codigoTexto}>{codigoInvitacion}</Text>
            </View>

            <Text style={styles.codigoAviso}>Válido por 48 horas</Text>

            <TouchableOpacity
              style={[styles.modalBtnConfirmar, { width: '100%', marginTop: 20 }]}
              onPress={() => setMostrarModalInvitacion(false)}
            >
              <Text style={styles.modalBtnConfirmarTexto}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL NUEVO CAMBIO PROGRAMADO */}
      <Modal visible={modalNuevoCambio} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { height: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Programar cambio</Text>
              <TouchableOpacity onPress={() => setModalNuevoCambio(false)} style={styles.modalCloseBtn}>
                <X size={24} color={THEME.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.labelField}>Estudiante</Text>
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyText}>{hijoSeleccionado?.nombre}</Text>
              </View>

              <Text style={styles.labelField}>Fecha del cambio</Text>
              <TextInput
                style={styles.modalInput}
                type="date"
                value={datosNuevoCambio.fecha}
                onChangeText={(v) => setDatosNuevoCambio({ ...datosNuevoCambio, fecha: v })}
                placeholder="AAAA-MM-DD"
              />

              <Text style={styles.labelField}>Tipo de trayecto</Text>
              <View style={styles.tipoSelector}>
                {['recogida', 'devolucion', 'ambos'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.tipoOption, datosNuevoCambio.tipo === t && styles.tipoOptionActiva]}
                    onPress={() => setDatosNuevoCambio({ ...datosNuevoCambio, tipo: t })}
                  >
                    <Text style={[styles.tipoOptionText, datosNuevoCambio.tipo === t && styles.tipoOptionTextActivo]}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.labelField}>Nueva parada / Direccion</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ej: Casa de la abuela"
                value={datosNuevoCambio.parada}
                onChangeText={(v) => setDatosNuevoCambio({ ...datosNuevoCambio, parada: v })}
              />

              <Text style={styles.labelField}>Nota para el conductor</Text>
              <TextInput
                style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Ej: Se queda con su tia hoy"
                multiline
                value={datosNuevoCambio.nota}
                onChangeText={(v) => setDatosNuevoCambio({ ...datosNuevoCambio, nota: v })}
              />

              <View style={styles.modalBotones}>
                <TouchableOpacity style={styles.modalBtnCancelar} onPress={() => setModalNuevoCambio(false)}>
                  <Text style={styles.modalBtnCancelarTexto}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtnConfirmar, { backgroundColor: THEME.secondary }]}
                  onPress={handleCrearCambio}
                >
                  <Text style={styles.modalBtnConfirmarTexto}>Programar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL EDITAR HIJO */}
      <Modal visible={modalEditarHijo} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Editar Estudiante</Text>
              <TouchableOpacity onPress={() => setModalEditarHijo(false)} style={styles.modalCloseBtn}>
                <X size={24} color={THEME.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.labelField}>Nombre completo</Text>
              <TextInput
                style={styles.modalInput}
                value={datosEdicionHijo.nombre}
                onChangeText={(v) => setDatosEdicionHijo({ ...datosEdicionHijo, nombre: v })}
              />

              <Text style={styles.labelField}>Grado</Text>
              <TextInput
                style={styles.modalInput}
                value={datosEdicionHijo.grado}
                onChangeText={(v) => setDatosEdicionHijo({ ...datosEdicionHijo, grado: v })}
              />

              <Text style={styles.labelField}>Colegio</Text>
              <TextInput
                style={styles.modalInput}
                value={datosEdicionHijo.colegioNombre}
                onChangeText={(v) => setDatosEdicionHijo({ ...datosEdicionHijo, colegioNombre: v })}
              />

              <Text style={styles.labelField}>Dirección de recogida</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  { height: 80, textAlignVertical: 'top' },
                  direccionEdicionBloqueada && styles.modalInputBloqueado,
                ]}
                value={datosEdicionHijo.direccion}
                onChangeText={(v) => {
                  if (!direccionEdicionBloqueada) {
                    setDatosEdicionHijo({ ...datosEdicionHijo, direccion: v });
                  }
                }}
                editable={!direccionEdicionBloqueada}
                placeholder={direccionEdicionBloqueada ? '' : 'Ingresa la direccion de recogida'}
                placeholderTextColor={THEME.textSecondary}
                multiline
              />
              {direccionEdicionBloqueada ? (
                <View style={styles.campoBloqueadoNota}>
                  <AlertCircle size={15} color={THEME.warning} strokeWidth={2.2} />
                  <Text style={styles.campoBloqueadoNotaTexto}>{textoDireccionBloqueada}</Text>
                </View>
              ) : (
                <Text style={styles.campoAyudaTexto}>
                  Puedes registrar esta direccion porque aun no hay punto de recogida guardado.
                </Text>
              )}

              <View style={styles.modalBotones}>
                <TouchableOpacity style={styles.modalBtnCancelar} onPress={() => setModalEditarHijo(false)}>
                  <Text style={styles.modalBtnCancelarTexto}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtnConfirmar, { backgroundColor: THEME.secondary }]}
                  onPress={handleGuardarEdicionHijo}
                >
                  <Text style={styles.modalBtnConfirmarTexto}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },

  // Header
  header: {
    backgroundColor: THEME.primaryDark,
    paddingTop: 44,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bienvenida: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 2,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  socketStatus: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  titulo: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  subtituloRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subtitulo: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  botonSalir: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    padding: 10,
    borderRadius: 10,
  },

  // ETA Sutil
  etaContainer: {
    position: 'absolute',
    top: 100, // Debajo del header
    left: 14,
    zIndex: 20,
  },
  etaContent: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  etaMinutos: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.text,
  },
  etaHora: {
    fontSize: 10,
    color: THEME.textSecondary,
    fontWeight: '600',
    marginTop: -2,
  },

  // Mapa
  mapaContainer: { flex: 1 },
  mapa: { flex: 1 },

  // Badge estado - posición original
  estadoBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxWidth: '46%',
  },
  estadoIconoContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  estadoTexto: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Badge de tráfico en tiempo real
  traficoBadge: {
    position: 'absolute',
    top: 56,
    left: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  traficoLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: THEME.textSecondary,
  },
  traficoValor: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.text,
  },
  traficoHora: {
    fontSize: 11,
    fontWeight: '500',
    color: THEME.secondary,
    marginTop: 2,
  },

  // Botón ausencia - posición original, color conservado
  btnAusencia: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: THEME.error, // Rojo conservado
    paddingHorizontal: 11,
    paddingVertical: 6,
    minHeight: 38,
    borderRadius: 19,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    maxWidth: '44%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnAusenciaTexto: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },

  // Botón voz - posición original
  btnVoz: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },

  // Botón emergencia - posición original, color conservado
  btnEmergencia: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: THEME.error, // Rojo conservado
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: THEME.error,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },

  // Markers
  busMarker: {
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 8,
    borderWidth: 2,
    borderColor: THEME.secondary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  casaMarker: {
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 8,
    borderWidth: 2,
    borderColor: THEME.success,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  pickupMarker: {
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 8,
    borderWidth: 2,
    borderColor: THEME.success,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  pickupHint: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 84,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  pickupHintSugerido: {
    paddingVertical: 12,
  },
  pickupHintHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickupHintTexto: {
    flex: 1,
    fontSize: 12,
    color: THEME.text,
    fontWeight: '600',
  },
  pickupDireccion: {
    marginTop: 8,
    fontSize: 11,
    color: THEME.textSecondary,
    fontWeight: '600',
  },
  pickupHintActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  pickupHintButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  pickupHintButtonPrimary: {
    backgroundColor: THEME.primary,
  },
  pickupHintButtonSecondary: {
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  pickupHintButtonPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  pickupHintButtonSecondaryText: {
    color: THEME.primary,
    fontSize: 13,
    fontWeight: '800',
  },

  // Bottom Sheet
  bottomSheet: {
    backgroundColor: THEME.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
    overflow: 'hidden',
  },
  sheetHandle: {
    paddingTop: 8,
    paddingBottom: 6,
    alignItems: 'center',
  },
  sheetHandleBar: {
    width: 40,
    height: 4,
    backgroundColor: THEME.border,
    borderRadius: 2,
  },

  sheetTabs: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingBottom: 4,
    gap: 3,
    marginBottom: 4,
  },
  sheetTab: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingVertical: 4,
    paddingHorizontal: 1,
    borderRadius: 8,
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  sheetTabActivo: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  sheetTabTexto: {
    fontSize: 8,
    color: THEME.textSecondary,
    fontWeight: '800',
    textAlign: 'center',
  },
  sheetTabTextoActivo: {
    color: '#fff',
  },

  sheetContenido: {
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  sheetSeccionTitulo: {
    fontSize: 17,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 12,
    marginTop: 4,
  },

  fichaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  fichaAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  fichaHeaderText: {
    flex: 1,
  },
  fichaTitulo: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.text,
  },
  fichaSubtitulo: {
    fontSize: 12,
    color: THEME.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  btnEditarFicha: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.secondary,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  btnEditarFichaTexto: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  autorizacionRutaNota: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  autorizacionRutaTexto: {
    flex: 1,
    color: '#9A3412',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },

  // Info Section
  infoSection: {
    backgroundColor: THEME.background,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  infoLabel: {
    fontSize: 14,
    color: THEME.textSecondary,
    fontWeight: '500',
  },
  infoValor: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.text,
  },
  infoValorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  estadoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  btnProbarVoz: {
    backgroundColor: THEME.background,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  btnProbarVozTexto: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME.primary,
  },
  btnSolicitarCambio: {
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  btnSolicitarCambioTexto: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.warning,
  },

  // Historial
  viajeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    backgroundColor: THEME.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  viajeIcono: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  viajeInfo: {
    flex: 1,
  },
  viajeFecha: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.text,
  },
  viajeDetalle: {
    fontSize: 13,
    color: THEME.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  viajeBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  viajeBadgeTexto: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Llamar
  conductorCard: {
    backgroundColor: THEME.background,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  conductorAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: THEME.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  conductorNombre: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.text,
  },
  conductorTel: {
    fontSize: 14,
    color: THEME.secondary,
    marginTop: 2,
    fontWeight: '600',
  },
  conductorRuta: {
    fontSize: 13,
    color: THEME.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },

  btnLlamar: {
    backgroundColor: THEME.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  btnLlamarTexto: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  btnEmergenciaSheet: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  btnEmergenciaSheetTexto: {
    color: THEME.error,
    fontSize: 16,
    fontWeight: '700',
  },

  notaLlamada: {
    fontSize: 12,
    color: THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
    fontWeight: '500',
  },

  llamadasDesactivadas: {
    alignItems: 'center',
    padding: 32,
  },
  llamadasIconoContainer: {
    position: 'relative',
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  bloqueoOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 4,
    borderWidth: 2,
    borderColor: THEME.error,
  },
  llamadasDesactivadasTexto: {
    fontSize: 15,
    color: THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '500',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: THEME.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  modalTitulo: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME.text,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalSubtitulo: {
    fontSize: 14,
    color: THEME.textSecondary,
    marginBottom: 20,
    fontWeight: '500',
  },
  input: {
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
    color: THEME.text,
    fontWeight: '500',
  },
  modalBotones: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalBtnCancelar: {
    flex: 1,
    backgroundColor: THEME.background,
    borderRadius: 12,
    paddingVertical: 16,
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
    backgroundColor: THEME.error,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalBtnConfirmarTexto: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '700',
  },

  // Selector de hijos
  hijosSelector: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 4,
  },
  hijoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  hijoChipActivo: {
    backgroundColor: THEME.secondary,
    borderColor: THEME.secondary,
  },
  hijoChipTexto: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  hijoChipTextoActivo: {
    color: '#fff',
    fontWeight: '700',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: THEME.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: THEME.textSecondary,
    fontWeight: '500',
  },

  // Markers extras
  busMarkerSelected: {
    borderColor: THEME.secondary,
    transform: [{ scale: 1.1 }],
    zIndex: 10,
  },
  pickupMarkerSelected: {
    borderColor: THEME.success,
    transform: [{ scale: 1.1 }],
    zIndex: 10,
  },

  // Abordado badge
  abordadoBadge: {
    position: 'absolute',
    top: 56,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  abordadoTexto: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  // Clima Badge
  climaBadge: {
    position: 'absolute',
    top: 98,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxWidth: '60%',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  climaIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  climaInfo: {
    flex: 1,
  },
  climaTemp: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.text,
  },
  climaMensaje: {
    fontSize: 10,
    color: THEME.textSecondary,
    fontWeight: '600',
    marginTop: -2,
  },
  climaTouchArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },

  // Estilos vinculacion y vacios
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: THEME.background,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.text,
    marginTop: 20,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: THEME.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
    lineHeight: 22,
  },
  emptyMapCard: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    minHeight: 72,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 5,
  },
  emptyMapIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyMapText: {
    flex: 1,
  },
  emptyMapTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.text,
  },
  emptyMapSubtitle: {
    fontSize: 11,
    color: THEME.textSecondary,
    lineHeight: 15,
    marginTop: 2,
    fontWeight: '500',
  },
  emptyMapButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: THEME.secondary,
    paddingHorizontal: 10,
    borderRadius: 9,
  },
  emptyMapButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  btnVincularGrande: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  btnVincularGrandeTexto: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  btnAddHijoSubtle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  btnVincularHeaderLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  modalInput: {
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: THEME.text,
    fontWeight: '600',
    marginBottom: 16,
  },
  modalInputBloqueado: {
    backgroundColor: '#F8FAFC',
    color: THEME.textSecondary,
    borderColor: '#E2E8F0',
  },
  campoBloqueadoNota: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 12,
    padding: 10,
    marginTop: -8,
    marginBottom: 16,
  },
  campoBloqueadoNotaTexto: {
    flex: 1,
    color: '#9A3412',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  campoAyudaTexto: {
    color: THEME.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    marginTop: -8,
    marginBottom: 16,
    marginLeft: 4,
  },
  labelField: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.textSecondary,
    marginBottom: 6,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  // Nuevos estilos Gobernanza Flexible
  bannerVinculacion: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    backgroundColor: THEME.primary,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8,
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
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '500',
  },
  bannerVinculacionBtn: {
    backgroundColor: THEME.secondary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: 10,
  },
  bannerVinculacionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  childNoRouteOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    minHeight: 72,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#FED7AA',
    zIndex: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 5,
  },
  childNoRouteIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFF7ED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  childNoRouteText: {
    flex: 1,
  },
  childNoRouteTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.text,
  },
  childNoRouteDesc: {
    fontSize: 11,
    color: THEME.textSecondary,
    marginTop: 2,
    lineHeight: 15,
    fontWeight: '500',
  },
  childNoRouteBtn: {
    backgroundColor: THEME.secondary,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 9,
    shadowColor: THEME.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  childNoRouteBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  // Multi-padre y Cambios
  btnShareTracking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EEF2FF',
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    justifyContent: 'center',
  },
  btnShareTrackingTexto: {
    color: THEME.secondary,
    fontSize: 15,
    fontWeight: '700',
  },
  headerCalendario: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  btnNuevoCambio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.secondary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  btnNuevoCambioTexto: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyCambios: {
    alignItems: 'center',
    padding: 30,
    marginTop: 20,
    gap: 12,
  },
  emptyCambiosTexto: {
    color: THEME.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  cambioCard: {
    backgroundColor: THEME.background,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  cambioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cambioFechaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cambioFecha: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.secondary,
    textTransform: 'capitalize',
  },
  cambioHijo: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.text,
    marginBottom: 4,
  },
  cambioDetalleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  cambioParada: {
    fontSize: 13,
    color: THEME.textSecondary,
    fontWeight: '600',
  },
  cambioNota: {
    fontSize: 12,
    color: THEME.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  cambioTipoBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cambioTipoTexto: {
    fontSize: 9,
    fontWeight: '900',
    color: THEME.textSecondary,
  },
  cambioHoyBadge: {
    position: 'absolute',
    top: 56,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cambioHoyTexto: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCardCenter: {
    backgroundColor: THEME.surface,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalTituloCenter: {
    fontSize: 20,
    fontWeight: '800',
    color: THEME.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtituloCenter: {
    fontSize: 14,
    color: THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  codigoContainer: {
    backgroundColor: THEME.background,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: THEME.secondary,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  codigoTexto: {
    fontSize: 32,
    fontWeight: '900',
    color: THEME.secondary,
    letterSpacing: 4,
  },
  codigoAviso: {
    fontSize: 11,
    color: THEME.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
  },
  readOnlyField: {
    backgroundColor: THEME.background,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  readOnlyText: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.textSecondary,
  },
  tipoSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tipoOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: THEME.background,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  tipoOptionActiva: {
    backgroundColor: THEME.secondary,
    borderColor: THEME.secondary,
  },
  tipoOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.textSecondary,
  },
  tipoOptionTextActivo: {
    color: '#fff',
  },

  // Modal Ausencia mejorado
  hijosAusenciaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  hijoAusenciaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  hijoAusenciaBtnActivo: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  hijoAusenciaTexto: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.textSecondary,
  },
  hijoAusenciaTextoActivo: {
    color: '#fff',
  },
  diasSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  diaBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  diaBtnActivo: {
    backgroundColor: THEME.secondary,
    borderColor: THEME.secondary,
  },
  diaBtnTexto: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.textSecondary,
  },
  diaBtnTextoActivo: {
    color: '#fff',
  },

  // Carpool Styles
  carpoolContainer: {
    paddingVertical: 10,
  },
  carpoolHeader: {
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  carpoolTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: THEME.text,
    textAlign: 'center',
  },
  carpoolDesc: {
    fontSize: 14,
    color: THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  carpoolFeatureCard: {
    backgroundColor: THEME.background,
    borderRadius: 16,
    padding: 16,
    gap: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 2,
  },
  featureText: {
    fontSize: 12,
    color: THEME.textSecondary,
    lineHeight: 16,
  },
  btnCarpoolInteres: {
    backgroundColor: THEME.secondary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: THEME.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  btnCarpoolInteresActivo: {
    backgroundColor: THEME.success,
    shadowColor: THEME.success,
  },
  btnCarpoolInteresTexto: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  carpoolNota: {
    fontSize: 11,
    color: THEME.textSecondary,
    textAlign: 'center',
    marginTop: 16,
    fontStyle: 'italic',
  },
});
