import socket from '../config/socket';
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  TextInput, ActivityIndicator, Linking, Alert,
  Animated, PanResponder, Dimensions, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from '../components/MapaSeguro';
import { enviarNotificacionLocal } from '../services/notificaciones';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import {
  Bus, Home, Phone, Volume2, VolumeX, AlertTriangle,
  Check, X, MapPin, Clock, User, ChevronUp,
  LogOut, Plus, Minus
} from 'lucide-react-native';
import { limpiarSesion, obtenerToken } from '../services/session';

const SERVIDOR = 'https://transporte-backend-production.up.railway.app';
const GOOGLE_API_KEY = 'AIzaSyDVaVcUL_e_lO0nD29QUfOfl0u3RUUFEdM';
const CASA = { latitude: 13.7020, longitude: -89.2250 };
const ALUMNO = { id: 1, nombre: 'Pedro García', grado: '3ro primaria', ruta: 'Ruta Norte' };

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

const SHEET_MIN = 180;
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

  // Estado del bus
  const [busPos, setBusPos] = useState({ latitude: 13.6929, longitude: -89.2182 });
  const [rutaActiva, setRutaActiva] = useState(false);
  const [minutosRestantes, setMinutosRestantes] = useState(null);
  const [historialRuta, setHistorialRuta] = useState([]);
  const [puntoRecogida, setPuntoRecogida] = useState(CASA);
  const [puntoRecogidaBloqueado, setPuntoRecogidaBloqueado] = useState(false);
  const [guardandoPunto, setGuardandoPunto] = useState(false);
  const [mostrarPickupHint, setMostrarPickupHint] = useState(true);
  const [infoTrafico, setInfoTrafico] = useState(null); // Info de tráfico de Google

  // Ausencia
  const [modalAusencia, setModalAusencia] = useState(false);
  const [motivoAusencia, setMotivoAusencia] = useState('');
  const [ausenciaReportada, setAusenciaReportada] = useState(false);
  const [loadingAusencia, setLoadingAusencia] = useState(false);

  // Configuración
  const [llamadasPermitidas, setLlamadasPermitidas] = useState(true);
  const [telefonoConductor, setTelefonoConductor] = useState('70000002');

  // Bottom sheet
  const sheetY = useRef(new Animated.Value(SHEET_MIN)).current;
  const [sheetAbierto, setSheetAbierto] = useState(false);
  const [seccionSheet, setSeccionSheet] = useState('info');

  // Voz
  const [vozActivada, setVozActivada] = useState(true);
  const [avisoVozDado, setAvisoVozDado] = useState(false);

  // Historial
  const [historialViajes, setHistorialViajes] = useState([
    { fecha: 'Hoy', hora: '06:45', estado: 'Completado', alumnos: 5 },
    { fecha: 'Ayer', hora: '06:47', estado: 'Completado', alumnos: 5 },
    { fecha: 'Lun 12', hora: '06:50', estado: 'Completado', alumnos: 4 },
    { fecha: 'Vie 09', hora: '06:43', estado: 'Completado', alumnos: 5 },
    { fecha: 'Jue 08', hora: '06:55', estado: 'Retraso', alumnos: 5 },
  ]);

  useEffect(() => {
    avisoVozDadoRef.current = avisoVozDado;
  }, [avisoVozDado]);

  useEffect(() => {
    vozActivadaRef.current = vozActivada;
  }, [vozActivada]);

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
    // Cargar datos sin bloquear la UI
    cargarConfiguracion();
    cargarPuntoRecogida();

    // Conectar socket con manejo de errores
    try {
      socket.connect();
    } catch (err) {
      console.log('Socket connection error (non-blocking):', err.message);
    }

    socket.on('bus:ubicacion', async (datos) => {
      if (datos.activo) {
        const busCoords = { latitude: datos.latitude, longitude: datos.longitude };
        setBusPos(busCoords);
        setRutaActiva(true);
        setHistorialRuta(prev => [...prev, busCoords]);

        // Obtener ETA real de Google Directions (incluye tráfico)
        // Solo si hay conexión a internet
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
              return; // Salir si exitoso
            }
          } catch (e) {
            console.log('ETA Google failed, using fallback');
          }
        }

        // Fallback: cálculo simple
        const distancia = calcularDistancia(
          datos.latitude, datos.longitude,
          puntoRecogida.latitude, puntoRecogida.longitude
        );
        const minutos = Math.round(distancia / 0.5);
        setMinutosRestantes(minutos);
        setInfoTrafico(null);

        if (minutos <= 5 && minutos > 0 && !avisoVozDadoRef.current && vozActivadaRef.current) {
          setAvisoVozDado(true);
          darAvisoDeVoz(minutos);
          await enviarNotificacionLocal(
            '🚌 Bus cercano',
            `El bus llegará en ${minutos} minutos.`
          );
        }

        if (minutos === 0 && vozActivadaRef.current) {
          Speech.speak('El bus escolar ha llegado a tu parada.', {
            language: 'es-MX',
            rate: 0.9
          });
        }

        mapRef.current?.animateToRegion({
          latitude: datos.latitude,
          longitude: datos.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 800);

      } else {
        setRutaActiva(false);
      }
    });

    socket.on('bus:desvio', async (datos) => {
      await enviarNotificacionLocal(
        '⚠️ Alerta de desvío',
        `El bus se desvió ${datos.distanciaMetros}m de la ruta.`
      );
    });

    socket.emit('padre:solicitar_ubicacion');

    return () => {
      socket.off('bus:ubicacion');
      socket.off('bus:desvio');
      socket.disconnect();
    };
  }, [puntoRecogida.latitude, puntoRecogida.longitude]);

  // ── Funciones ─────────────────────────────────────────────
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

  const cargarPuntoRecogida = async () => {
    try {
      const res = await fetch(`${SERVIDOR}/api/admin/alumnos`, { headers: await obtenerAuthHeaders() });
      const datos = await res.json();
      const alumno = (datos.alumnos || []).find((item) => item.id === ALUMNO.id);

      if (alumno?.latitude && alumno?.longitude) {
        const coords = {
          latitude: Number(alumno.latitude),
          longitude: Number(alumno.longitude),
        };
        setPuntoRecogida(coords);
        setPuntoRecogidaBloqueado(true);
        setMostrarPickupHint(false);
      } else {
        setPuntoRecogidaBloqueado(false);
        setMostrarPickupHint(true);
      }
    } catch (e) { }
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
    Alert.alert(
      'Llamar conductor',
      `¿Deseas llamar al conductor de ${ALUMNO.ruta}?`,
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
    setLoadingAusencia(true);
    try {
      await fetch(`${SERVIDOR}/api/asignaciones/ausencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
        body: JSON.stringify({ alumnoId: ALUMNO.id, motivo: motivoAusencia || 'Sin especificar' }),
      });
      setAusenciaReportada(true);
      setModalAusencia(false);
    } catch (e) {
      console.log(e);
    } finally {
      setLoadingAusencia(false);
    }
  };

  const guardarPuntoRecogida = async (coords) => {
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

      let alumnoActual = null;
      try {
        const res = await fetch(`${SERVIDOR}/api/admin/alumnos`, { headers: await obtenerAuthHeaders() });
        const datos = await res.json();
        alumnoActual = (datos.alumnos || []).find((item) => item.id === ALUMNO.id) || null;
      } catch (e) { }

      const payload = {
        ...(alumnoActual || {}),
        nombre: alumnoActual?.nombre || ALUMNO.nombre,
        grado: alumnoActual?.grado || ALUMNO.grado,
        ruta_id: alumnoActual?.ruta_id || 1,
        padre_id: alumnoActual?.padre_id || 3,
        orden: alumnoActual?.orden || 1,
        activo: alumnoActual?.activo ?? true,
        parada,
        latitude: coords.latitude,
        longitude: coords.longitude,
      };

      const response = await fetch(`${SERVIDOR}/api/admin/alumnos/${ALUMNO.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('No se pudo guardar el punto de recogida');
      }

      setPuntoRecogida(coords);
      setPuntoRecogidaBloqueado(true);
      setMostrarPickupHint(false);
      Alert.alert('Punto actualizado', 'El conductor usara este punto para marcar el abordaje automatico.');
    } catch (e) {
      setPuntoRecogida(coords);
      Alert.alert('Guardado local', 'El punto se actualizo en la app, pero el servidor no confirmo el cambio.');
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

    setPuntoRecogida(coords);
    setMostrarPickupHint(false);
    guardarPuntoRecogida(coords);
  };

  const solicitarAutorizacionCambio = () => {
    Alert.alert(
      'Cambio bloqueado',
      'El punto de recogida ya fue definido. Para cambiarlo, el conductor debe autorizar el ajuste.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Llamar conductor', onPress: llamarConductor },
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

  return (
    <View style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.bienvenida}>Hola</Text>
            <Text style={styles.titulo}>{ALUMNO.nombre}</Text>
            <View style={styles.subtituloRow}>
              <User size={12} color="rgba(255,255,255,0.7)" strokeWidth={2} />
              <Text style={styles.subtitulo}>{ALUMNO.grado} · {ALUMNO.ruta}</Text>
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

      {/* MAPA */}
      <View style={styles.mapaContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.mapa}
          initialRegion={{ ...busPos, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
          showsUserLocation={true}
          showsTraffic={true}
          showsMyLocationButton={true}
          onLongPress={puntoRecogidaBloqueado ? solicitarAutorizacionCambio : seleccionarPuntoRecogida}
        >
          <Marker coordinate={busPos} title="Bus escolar">
            <View style={styles.busMarker}>
              <Bus size={24} color={THEME.secondary} strokeWidth={2} />
            </View>
          </Marker>
          <Marker
            coordinate={puntoRecogida}
            title="Punto de recogida"
            description="Manten presionado el mapa para mover este punto"
          >
            <View style={styles.pickupMarker}>
              <Home size={24} color={THEME.success} strokeWidth={2} />
            </View>
          </Marker>
          {historialRuta.length > 1 && (
            <Polyline coordinates={historialRuta} strokeColor={THEME.secondary} strokeWidth={3} lineDashPattern={[5, 3]} />
          )}
        </MapView>

        {mostrarPickupHint && !puntoRecogidaBloqueado && (
          <View style={styles.pickupHint}>
            <MapPin size={14} color={THEME.primary} strokeWidth={2} />
            <Text style={styles.pickupHintTexto}>
              Manten presionado el mapa para definir el punto exacto de recogida
            </Text>
          </View>
        )}

        {/* Badge estado - posición original conservada */}
        <View style={[styles.estadoBadge, { borderColor: estadoColor, backgroundColor: THEME.surface }]}>
          <View style={styles.estadoIconoContainer}>
            {estadoIcono}
          </View>
          <Text style={[styles.estadoTexto, { color: estadoColor }]}>{estadoTexto}</Text>
        </View>

        {/* Badge de tráfico en tiempo real */}
        {infoTrafico && rutaActiva && (
          <View style={[styles.traficoBadge, { backgroundColor: THEME.surface }]}>
            <Text style={styles.traficoLabel}>🚗 Tráfico</Text>
            <Text style={styles.traficoValor}>{infoTrafico.distancia}</Text>
            {infoTrafico.horaLlegada && (
              <Text style={styles.traficoHora}>LLega: {infoTrafico.horaLlegada}</Text>
            )}
          </View>
        )}

        {/* Botón ausencia flotante - posición original conservada, color conservado */}
        {!ausenciaReportada ? (
          <TouchableOpacity style={styles.btnAusencia} onPress={() => setModalAusencia(true)}>
            <Text style={styles.btnAusenciaTexto}>No asiste hoy</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.btnAusencia, { backgroundColor: THEME.textSecondary }]}>
            <Text style={styles.btnAusenciaTexto}>Ausencia reportada</Text>
          </View>
        )}

        {/* Botón voz flotante - posición original conservada */}
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

        {/* Botón EMERGENCIA flotante - posición original conservada, color conservado */}
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
            { key: 'info', label: 'Info', Icon: MapPin },
            { key: 'historial', label: 'Historial', Icon: Clock },
            { key: 'llamar', label: 'Llamar', Icon: Phone },
          ].map(({ key, label, Icon }) => (
            <TouchableOpacity
              key={key}
              style={[styles.sheetTab, seccionSheet === key && styles.sheetTabActivo]}
              onPress={() => { setSeccionSheet(key); abrirSheet(); }}
            >
              <Icon size={16} color={seccionSheet === key ? '#fff' : THEME.textSecondary} strokeWidth={2} />
              <Text style={[styles.sheetTabTexto, seccionSheet === key && styles.sheetTabTextoActivo]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Contenido del sheet */}
        <ScrollView style={styles.sheetContenido} showsVerticalScrollIndicator={false}>

          {/* Info */}
          {seccionSheet === 'info' && (
            <View>
              <View style={styles.infoSection}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Alumno</Text>
                  <Text style={styles.infoValor}>{ALUMNO.nombre}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Grado</Text>
                  <Text style={styles.infoValor}>{ALUMNO.grado}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Ruta</Text>
                  <Text style={styles.infoValor}>{ALUMNO.ruta}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Recogida</Text>
                  <Text style={styles.infoValor}>
                    {guardandoPunto
                      ? 'Guardando...'
                      : `${puntoRecogida.latitude.toFixed(5)}, ${puntoRecogida.longitude.toFixed(5)}`}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Cambio de punto</Text>
                  <Text style={[styles.infoValor, { color: puntoRecogidaBloqueado ? THEME.warning : THEME.success }]}>
                    {puntoRecogidaBloqueado ? 'Requiere autorizacion del conductor' : 'Disponible'}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Estado bus</Text>
                  <View style={styles.infoValorRow}>
                    <View style={[styles.estadoDot, { backgroundColor: estadoColor }]} />
                    <Text style={[styles.infoValor, { color: estadoColor }]}>{estadoTexto}</Text>
                  </View>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Hora estimada</Text>
                  <Text style={styles.infoValor}>{horaEstimadaLlegada}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Aviso de voz</Text>
                  <TouchableOpacity onPress={() => setVozActivada(!vozActivada)}>
                    <Text style={[styles.infoValor, { color: vozActivada ? THEME.success : THEME.error }]}>
                      {vozActivada ? 'Activado' : 'Desactivado'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Ausencia hoy</Text>
                  <Text style={[styles.infoValor, { color: ausenciaReportada ? THEME.error : THEME.success }]}>
                    {ausenciaReportada ? 'Reportada' : 'No reportada'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.btnProbarVoz}
                onPress={() => Speech.speak('Atención. El bus escolar llegará en 5 minutos. Por favor prepara a tu hijo.', { language: 'es-MX', rate: 0.85 })}
              >
                <Volume2 size={18} color={THEME.primary} strokeWidth={2} />
                <Text style={styles.btnProbarVozTexto}>Probar aviso de voz</Text>
              </TouchableOpacity>
              {puntoRecogidaBloqueado ? (
                <TouchableOpacity style={styles.btnSolicitarCambio} onPress={solicitarAutorizacionCambio}>
                  <MapPin size={18} color={THEME.warning} strokeWidth={2} />
                  <Text style={styles.btnSolicitarCambioTexto}>Solicitar cambio de punto</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {/* Historial */}
          {seccionSheet === 'historial' && (
            <View>
              <Text style={styles.sheetSeccionTitulo}>Últimos viajes</Text>
              {historialViajes.map((viaje, i) => (
                <View key={i} style={styles.viajeRow}>
                  <View style={[styles.viajeIcono, {
                    backgroundColor: viaje.estado === 'Completado' ? '#F0FDF4' : '#FFF8E1',
                    borderColor: viaje.estado === 'Completado' ? '#DCFCE7' : '#FEF3C7',
                  }]}>
                    {viaje.estado === 'Completado' ? (
                      <Check size={20} color={THEME.success} strokeWidth={3} />
                    ) : (
                      <Clock size={20} color={THEME.warning} strokeWidth={2} />
                    )}
                  </View>
                  <View style={styles.viajeInfo}>
                    <Text style={styles.viajeFecha}>{viaje.fecha}</Text>
                    <Text style={styles.viajeDetalle}>Salida: {viaje.hora} · {viaje.alumnos} alumnos</Text>
                  </View>
                  <View style={[styles.viajeBadge, {
                    backgroundColor: viaje.estado === 'Completado' ? '#F0FDF4' : '#FFF8E1',
                  }]}>
                    <Text style={[styles.viajeBadgeTexto, {
                      color: viaje.estado === 'Completado' ? THEME.success : THEME.warning
                    }]}>
                      {viaje.estado}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Llamar */}
          {seccionSheet === 'llamar' && (
            <View>
              <Text style={styles.sheetSeccionTitulo}>Contactar conductor</Text>

              {llamadasPermitidas ? (
                <>
                  <View style={styles.conductorCard}>
                    <View style={styles.conductorAvatar}>
                      <User size={28} color={THEME.secondary} strokeWidth={1.5} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.conductorNombre}>Luis Conductor</Text>
                      <Text style={styles.conductorTel}>{telefonoConductor}</Text>
                      <Text style={styles.conductorRuta}>{ALUMNO.ruta}</Text>
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
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Reportar ausencia</Text>
              <TouchableOpacity onPress={() => setModalAusencia(false)} style={styles.modalCloseBtn}>
                <X size={24} color={THEME.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitulo}>{ALUMNO.nombre} no irá hoy al colegio</Text>

            <TextInput
              style={styles.input}
              placeholder="Motivo (opcional)"
              value={motivoAusencia}
              onChangeText={setMotivoAusencia}
              multiline
              placeholderTextColor={THEME.textSecondary}
            />

            <View style={styles.modalBotones}>
              <TouchableOpacity style={styles.modalBtnCancelar} onPress={() => setModalAusencia(false)}>
                <Text style={styles.modalBtnCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnConfirmar} onPress={reportarAusencia} disabled={loadingAusencia}>
                {loadingAusencia
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.modalBtnConfirmarTexto}>Confirmar</Text>
                }
              </TouchableOpacity>
            </View>
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
    paddingVertical: 12,
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
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 12,
  },
  sheetTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  sheetTabActivo: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  sheetTabTexto: {
    fontSize: 13,
    color: THEME.textSecondary,
    fontWeight: '600',
  },
  sheetTabTextoActivo: {
    color: '#fff',
  },

  sheetContenido: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sheetSeccionTitulo: {
    fontSize: 17,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 12,
    marginTop: 4,
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
});
