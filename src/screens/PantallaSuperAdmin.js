import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl, StatusBar,
  TextInput, Alert, useWindowDimensions, Platform, Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ShieldCheck, Building2, Users, Bus, Route, Bell,
  Settings2, ChevronRight, RefreshCw, LogOut,
  CalendarDays, Clock3, MonitorSmartphone, Check, X, Plus, KeyRound
} from 'lucide-react-native';
import {
  cancelarNotificacionesPorTipo,
  programarNotificacionDiaria,
  programarNotificacionFecha,
} from '../services/notificaciones';
import { obtenerToken, limpiarSesion } from '../services/session';
import { useSuperAdminVinculacion } from '../hooks/useSuperAdminVinculacion';

const SERVIDOR = 'https://transporte-backend-production.up.railway.app';
const TIPO_ALERTA_RECOGIDA = 'superadmin_alerta_recogida_5min';
const DIAS_SEMANA = [
  { key: 0, short: 'D', label: 'Domingo' },
  { key: 1, short: 'L', label: 'Lunes' },
  { key: 2, short: 'M', label: 'Martes' },
  { key: 3, short: 'X', label: 'Miercoles' },
  { key: 4, short: 'J', label: 'Jueves' },
  { key: 5, short: 'V', label: 'Viernes' },
  { key: 6, short: 'S', label: 'Sabado' },
];

const THEME = {
  primary: '#1E293B',
  primaryDark: '#0F172A',
  secondary: '#0F766E',
  accent: '#C2410C',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  success: '#16A34A',
  warning: '#D97706',
  error: '#DC2626',
  info: '#2563EB',
};

const parseHora = (valor) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec((valor || '').trim());
  if (!match) return null;

  const hora = Number(match[1]);
  const minuto = Number(match[2]);

  if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return null;
  return { hora, minuto };
};

const restarMinutos = (hora, minuto, minutosARestar) => {
  const fecha = new Date(2026, 0, 1, hora, minuto, 0, 0);
  fecha.setMinutes(fecha.getMinutes() - minutosARestar);
  return { hora: fecha.getHours(), minuto: fecha.getMinutes() };
};

const formatearFecha = (fecha) => fecha.toLocaleDateString('es-SV', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const generarAgendaMensual = (horaRecogida, diasSeleccionados) => {
  const parsed = parseHora(horaRecogida);
  if (!parsed) return [];

  const { hora, minuto } = restarMinutos(parsed.hora, parsed.minuto, 5);
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1, hora, minuto, 0, 0);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, hora, minuto, 0, 0);
  const agenda = [];

  for (let dia = 1; dia <= fin.getDate(); dia += 1) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), dia, hora, minuto, 0, 0);
    if (fecha < new Date()) continue;
    if (!diasSeleccionados.includes(fecha.getDay())) continue;

    agenda.push({
      id: `${fecha.toISOString()}-${dia}`,
      fecha,
      etiqueta: formatearFecha(fecha),
      horaAlerta: `${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}`,
    });
  }

  return agenda;
};

export default function PantallaSuperAdmin({ navigation }) {
  const { loading: loadingColegios, listarColegios, crearNuevoColegio, generarCodigo: generarCodigoColegio, listarCodigos } = useSuperAdminVinculacion();
  const { width } = useWindowDimensions();
  const isTablet = width >= 720;
  const isDesktop = width >= 1080;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [rutas, setRutas] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [conductores, setConductores] = useState([]);
  const [configuracion, setConfiguracion] = useState([]);
  const [error, setError] = useState('');

  const [horaRecogida, setHoraRecogida] = useState('06:45');
  const [mensajeAlerta, setMensajeAlerta] = useState('El transporte escolar pasara en aproximadamente 5 minutos por tu punto de recogida.');
  const [modoProgramacion, setModoProgramacion] = useState('mensual');
  const [diasSeleccionados, setDiasSeleccionados] = useState([1, 2, 3, 4, 5]);
  const [programando, setProgramando] = useState(false);
  const [estadoProgramacion, setEstadoProgramacion] = useState('');
  const [agendaServidor, setAgendaServidor] = useState([]);
  const [tokenInvalido, setTokenInvalido] = useState(false);
  const [tokenSesion, setTokenSesion] = useState(obtenerToken());
  const [sesionHidratada, setSesionHidratada] = useState(false);
  const [seccionActiva, setSeccionActiva] = useState('panel');
  const [colegios, setColegios] = useState([]);
  const [codigosColegios, setCodigosColegios] = useState([]);
  const [modalCrearColegio, setModalCrearColegio] = useState(false);
  const [modalCodigoColegio, setModalCodigoColegio] = useState(false);
  const [codigoColegioGenerado, setCodigoColegioGenerado] = useState(null);
  const [nuevoColegio, setNuevoColegio] = useState({ nombre: '', plan: 'trial', diasPrueba: '7' });
  const [busquedaColegio, setBusquedaColegio] = useState('');

  const token = tokenSesion;
  const authHeaders = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();

  const fetchSuperAdmin = async (path, options = {}) => {
    const response = await fetch(`${SERVIDOR}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...(options.headers || {}),
      },
    });

    if (response.status === 401 || response.status === 403) {
      setTokenInvalido(true);
      throw new Error('Tu sesion no tiene permisos de super administrador');
    }

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
      const detalle = data?.error || data?.message || data?.raw || response.statusText || 'No se pudo completar la operacion';
      throw new Error(`${response.status} ${detalle}`.trim());
    }

    return data;
  };

  const fetchJsonSeguro = async (url, options = {}, fallback = {}) => {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          ...(options.headers || {}),
        },
      });

      if (response.status === 401 || response.status === 403) {
        setTokenInvalido(true);
        return fallback;
      }

      const data = await response.json().catch(() => fallback);
      if (!response.ok) {
        return fallback;
      }

      return data ?? fallback;
    } catch (error) {
      return fallback;
    }
  };

  const cargarVinculaciones = async () => {
    try {
      const colegiosData = await listarColegios().catch((e) => {
        console.log('No se pudieron cargar los colegios', e);
        return null;
      });

      const codigosData = await listarCodigos().catch((e) => {
        console.log('No se pudieron cargar los codigos', e);
        return null;
      });

      if (colegiosData) {
        setColegios(colegiosData.colegios || []);
      }

      if (codigosData) {
        setCodigosColegios(codigosData.codigos || []);
      }
    } catch (e) {
      console.log('No se pudieron cargar los colegios', e);
    }
  };

  const refrescarVista = async (silencioso = false) => {
    await Promise.allSettled([
      cargarDatos(silencioso),
      cargarVinculaciones(),
    ]);
  };

  const cargarDatos = async (silencioso = false) => {
    if (silencioso) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError('');

    try {
      const [dash, rut, alum, cond, config, superConfig, agenda] = await Promise.all([
        fetchJsonSeguro(`${SERVIDOR}/api/admin/dashboard`, {}, null),
        fetchJsonSeguro(`${SERVIDOR}/api/admin/rutas`, {}, { rutas: [] }),
        fetchJsonSeguro(`${SERVIDOR}/api/admin/alumnos`, {}, { alumnos: [] }),
        fetchJsonSeguro(`${SERVIDOR}/api/admin/conductores`, {}, { conductores: [] }),
        fetchJsonSeguro(`${SERVIDOR}/api/admin/configuracion`, {}, { configuracion: [] }),
        token ? fetchSuperAdmin('/api/super-admin/alertas/recogida-5min').catch(() => ({ configuracion: null })) : Promise.resolve({ configuracion: null }),
        token
          ? fetchSuperAdmin(`/api/super-admin/alertas/recogida-5min/agenda?mes=${mesActual}&anio=${anioActual}`).catch(() => ({ alertas: [] }))
          : Promise.resolve({ alertas: [] }),
      ]);

      setDashboard(dash);
      setRutas(rut?.rutas || []);
      setAlumnos(alum?.alumnos || []);
      setConductores(cond?.conductores || []);
      setConfiguracion(config?.configuracion || []);

      if (superConfig?.configuracion) {
        const backendConfig = superConfig.configuracion;
        setHoraRecogida(backendConfig.hora_recogida || '06:45');
        setMensajeAlerta(backendConfig.mensaje || 'El transporte escolar pasara en aproximadamente 5 minutos por tu punto de recogida.');
        setModoProgramacion(backendConfig.modo || 'mensual');
        setDiasSeleccionados(
          Array.isArray(backendConfig.dias_semana)
            ? backendConfig.dias_semana
            : [1, 2, 3, 4, 5]
        );
      }

      setAgendaServidor(agenda?.alertas || []);
    } catch (e) {
      setError(e.message || 'No se pudo cargar la vista de super administrador.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (sesionHidratada) {
      refrescarVista();
    }
  }, [sesionHidratada, tokenSesion]);

  useEffect(() => {
    const cargarTokenPersistido = async () => {
      if (tokenSesion) {
        setSesionHidratada(true);
        return;
      }

      const tokenStorage = await AsyncStorage.getItem('token');
      if (tokenStorage) {
        setTokenSesion(tokenStorage);
      }
      setSesionHidratada(true);
    };

    cargarTokenPersistido();
  }, [tokenSesion]);

  const agendaMensual = useMemo(
    () => generarAgendaMensual(horaRecogida, diasSeleccionados),
    [horaRecogida, diasSeleccionados]
  );

  const alumnosActivos = alumnos.filter((alumno) => alumno.activo !== false).length;
  const alumnosInactivos = alumnos.filter((alumno) => alumno.activo === false).length;
  const llamadasConductor = configuracion.find((item) => item.clave === 'llamadas_conductor')?.valor === 'true';
  const mostrarNumeroConductor = configuracion.find((item) => item.clave === 'mostrar_numero_conductor')?.valor === 'true';
  const horaAlerta = (() => {
    const parsed = parseHora(horaRecogida);
    if (!parsed) return '--:--';
    const alerta = restarMinutos(parsed.hora, parsed.minuto, 5);
    return `${alerta.hora.toString().padStart(2, '0')}:${alerta.minuto.toString().padStart(2, '0')}`;
  })();

  const metricas = [
    { label: 'Colegios', value: colegios.length, color: THEME.info, Icon: Building2 },
    { label: 'Administradores', value: colegios.filter((item) => item.admin_id).length, color: THEME.secondary, Icon: ShieldCheck },
    { label: 'Conductores', value: conductores.length, color: THEME.warning, Icon: Bus },
    { label: 'Alumnos activos', value: alumnosActivos, color: THEME.success, Icon: Users },
  ];
  const colegiosRecientes = colegios.slice(0, 3);

  const handleCrearColegio = async () => {
    if (!nuevoColegio.nombre.trim()) {
      Alert.alert('Error', 'El nombre es requerido.');
      return;
    }

    try {
      const diasPrueba = Number.parseInt(nuevoColegio.diasPrueba, 10) || 7;
      await crearNuevoColegio({
        ...nuevoColegio,
        diasPrueba,
        dias_prueba: diasPrueba,
      });
      setModalCrearColegio(false);
      setNuevoColegio({ nombre: '', plan: 'trial', diasPrueba: '7' });
      await refrescarVista(true);
      Alert.alert('Exito', 'Colegio creado correctamente.');
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const handleGenerarCodigoColegio = async (colegio) => {
    try {
      const resultado = await generarCodigoColegio(colegio.id, { maxUsos: 1, diasValidez: 7 });
      setCodigoColegioGenerado({
        codigo: resultado.codigo,
        colegio: colegio.nombre,
        expira: resultado.expira_en,
      });
      setModalCodigoColegio(true);
      await refrescarVista(true);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const colegiosFiltrados = colegios.filter((colegio) => {
    const texto = busquedaColegio.trim().toLowerCase();
    if (!texto) return true;

    return [
      colegio.nombre,
      colegio.plan,
      colegio.admin_nombre,
    ]
      .filter(Boolean)
      .some((valor) => valor.toLowerCase().includes(texto));
  });

  const renderPestanaColegios = () => (
    <View style={styles.colegiosSection}>
      <View style={styles.colegiosHeader}>
        <View>
          <Text style={styles.sectionTitle}>Colegios vinculados</Text>
          <Text style={styles.colegiosSubtitle}>
            Administra los colegios creados, revisa su estado y genera el codigo de vinculacion de cada uno.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.createCollegeButton, { backgroundColor: THEME.secondary }]}
          onPress={() => setModalCrearColegio(true)}
        >
          <Plus size={16} color="#fff" strokeWidth={2.4} />
          <Text style={styles.createCollegeButtonText}>Nuevo colegio</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.colegiosSearch}
        value={busquedaColegio}
        onChangeText={setBusquedaColegio}
        placeholder="Buscar colegio, plan o administrador"
        placeholderTextColor={THEME.textSecondary}
      />

      <View style={styles.colegiosCounterRow}>
        <View style={styles.colegiosCounterCard}>
          <Building2 size={18} color={THEME.info} strokeWidth={2} />
          <Text style={styles.colegiosCounterText}>{colegios.length} colegios</Text>
        </View>
        <View style={styles.colegiosCounterCard}>
          <KeyRound size={18} color={THEME.warning} strokeWidth={2} />
          <Text style={styles.colegiosCounterText}>{codigosColegios.length} codigos emitidos</Text>
        </View>
      </View>

      {loadingColegios ? <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 16 }} /> : null}

      {colegiosFiltrados.length === 0 ? (
        <View style={styles.emptyColegioCard}>
          <Text style={styles.emptyColegioTitle}>
            {colegios.length === 0 ? 'Aun no hay colegios registrados.' : 'No hay coincidencias con tu busqueda.'}
          </Text>
          <Text style={styles.emptyColegioSubtitle}>
            {colegios.length === 0
              ? 'Crea el primer colegio para empezar a emitir codigos de administracion.'
              : 'Prueba con otro nombre, plan o administrador.'}
          </Text>
        </View>
      ) : (
        colegiosFiltrados.map((item) => (
          <View key={item.id} style={styles.colegioCard}>
            <View style={styles.colegioCardHeader}>
              <View style={styles.colegioTitleBlock}>
                <View style={[styles.colegioIcon, { backgroundColor: `${THEME.secondary}14` }]}>
                  <Building2 size={18} color={THEME.secondary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.colegioNombre}>{item.nombre}</Text>
                  <Text style={styles.colegioInfo}>Plan: {item.plan || 'trial'}</Text>
                </View>
              </View>
              <View style={[styles.colegioEstado, { backgroundColor: item.activo ? '#E8F8EE' : '#FEECEC' }]}>
                <Text style={[styles.colegioEstadoText, { color: item.activo ? THEME.success : THEME.error }]}>
                  {item.activo ? 'Activo' : 'Inactivo'}
                </Text>
              </View>
            </View>

            <Text style={styles.colegioInfo}>Administrador: {item.admin_nombre || 'Sin asignar'}</Text>
            <Text style={styles.colegioInfo}>Dias de prueba: {item.dias_prueba_restantes || 'N/A'}</Text>

            <TouchableOpacity
              style={[
                styles.colegioCodigoButton,
                { backgroundColor: item.admin_id ? THEME.textSecondary : THEME.primary },
              ]}
              onPress={() => handleGenerarCodigoColegio(item)}
              disabled={!!item.admin_id}
            >
              <ShieldCheck size={16} color="#fff" strokeWidth={2.2} />
              <Text style={styles.colegioCodigoButtonText}>
                {item.admin_id ? 'Ya tiene administrador' : 'Generar codigo admin'}
              </Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <Modal visible={modalCrearColegio} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Crear colegio</Text>
            <Text style={styles.modalSubtitle}>Registra un colegio nuevo y define sus días de prueba.</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre del colegio"
              value={nuevoColegio.nombre}
              onChangeText={(text) => setNuevoColegio({ ...nuevoColegio, nombre: text })}
              placeholderTextColor={THEME.textSecondary}
            />
            <TextInput
              style={styles.input}
              placeholder="Dias de prueba"
              keyboardType="numeric"
              value={nuevoColegio.diasPrueba}
              onChangeText={(text) => setNuevoColegio({ ...nuevoColegio, diasPrueba: text })}
              placeholderTextColor={THEME.textSecondary}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.btnCancelar} onPress={() => setModalCrearColegio(false)}>
                <Text style={styles.btnCancelarText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnConfirmar, { backgroundColor: THEME.primary }]} onPress={handleCrearColegio}>
                <Text style={styles.btnConfirmarText}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={modalCodigoColegio} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Codigo generado</Text>
            <Text style={[styles.codigoText, { color: THEME.secondary }]}>{codigoColegioGenerado?.codigo}</Text>
            <Text style={styles.codigoInfo}>Colegio: {codigoColegioGenerado?.colegio}</Text>
            <Text style={styles.codigoInfo}>
              Expira: {codigoColegioGenerado?.expira ? new Date(codigoColegioGenerado.expira).toLocaleDateString() : 'No disponible'}
            </Text>
            <TouchableOpacity
              style={[styles.btnConfirmar, { backgroundColor: THEME.primary, marginTop: 12 }]}
              onPress={() => setModalCodigoColegio(false)}
            >
              <Text style={styles.btnConfirmarText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );

  const modulos = [
    {
      title: 'Instancia principal',
      subtitle: 'kidGo',
      meta: `${rutas.length} rutas activas registradas`,
      status: 'Operativa',
      statusColor: THEME.success,
    },
    {
      title: 'Politicas globales',
      subtitle: 'Comunicacion con padres',
      meta: llamadasConductor ? 'Llamadas habilitadas' : 'Llamadas deshabilitadas',
      status: mostrarNumeroConductor ? 'Numero visible' : 'Numero oculto',
      statusColor: mostrarNumeroConductor ? THEME.info : THEME.warning,
    },
    {
      title: 'Alertas de recogida',
      subtitle: 'Programacion central',
      meta: `Aviso previo configurado para las ${horaAlerta}`,
      status: Platform.OS === 'web' ? 'Panel web listo' : 'Listo para movil',
      statusColor: Platform.OS === 'web' ? THEME.info : THEME.success,
    },
    {
      title: 'Calidad de datos',
      subtitle: 'Modelo de alumnos',
      meta: `${alumnosInactivos} alumnos inactivos registrados`,
      status: 'Sincronizacion GPS en desarrollo',
      statusColor: THEME.accent,
    },
  ];

  const alternarDia = (dia) => {
    setDiasSeleccionados((prev) =>
      prev.includes(dia)
        ? prev.filter((item) => item !== dia)
        : [...prev, dia].sort((a, b) => a - b)
    );
  };

  const programarAlertaDiaria = async () => {
    const parsed = parseHora(horaRecogida);
    if (!parsed) {
      Alert.alert('Hora invalida', 'Usa el formato HH:MM, por ejemplo 06:45.');
      return;
    }

    const alerta = restarMinutos(parsed.hora, parsed.minuto, 5);

    setProgramando(true);
    try {
      await fetchSuperAdmin('/api/super-admin/alertas/recogida-5min', {
        method: 'PUT',
        body: JSON.stringify({
          activo: true,
          modo: 'diaria',
          titulo: 'Recogida en 5 minutos',
          mensaje: mensajeAlerta,
          horaRecogida: horaRecogida,
          diasSemana: diasSeleccionados,
          canal: 'push',
        }),
      });

      if (Platform.OS !== 'web') {
        await cancelarNotificacionesPorTipo(TIPO_ALERTA_RECOGIDA);
        await programarNotificacionDiaria(
          'Recogida en 5 minutos',
          mensajeAlerta,
          alerta.hora,
          alerta.minuto,
          { tipo: TIPO_ALERTA_RECOGIDA, modo: 'diaria' }
        );
      }

      const mensaje = Platform.OS === 'web'
        ? `Configuracion diaria guardada en backend usando la hora base ${horaRecogida}.`
        : `Configuracion diaria guardada en backend usando la hora base ${horaRecogida}.`;

      setEstadoProgramacion(mensaje);
      Alert.alert('Programacion lista', mensaje);
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo programar la alerta diaria.');
    } finally {
      setProgramando(false);
    }
  };

  const programarMesActual = async () => {
    if (!agendaMensual.length) {
      Alert.alert('Sin agenda', 'No hay fechas validas para programar en el mes actual.');
      return;
    }

    setProgramando(true);
    try {
      await fetchSuperAdmin('/api/super-admin/alertas/recogida-5min', {
        method: 'PUT',
        body: JSON.stringify({
          activo: true,
          modo: 'mensual',
          titulo: 'Recogida en 5 minutos',
          mensaje: mensajeAlerta,
          horaRecogida: horaRecogida,
          diasSemana: diasSeleccionados,
          canal: 'push',
        }),
      });

      const agendaGenerada = await fetchSuperAdmin(
        `/api/super-admin/alertas/recogida-5min/generar-mes`,
        {
          method: 'POST',
          body: JSON.stringify({ mes: mesActual, anio: anioActual }),
        }
      );

      setAgendaServidor(agendaGenerada.alertas || []);

      if (Platform.OS !== 'web') {
        await cancelarNotificacionesPorTipo(TIPO_ALERTA_RECOGIDA);

        for (const item of agendaMensual) {
          await programarNotificacionFecha(
            'Recogida en 5 minutos',
            mensajeAlerta,
            item.fecha,
            { tipo: TIPO_ALERTA_RECOGIDA, modo: 'mensual' }
          );
        }
      }

      const totalAlertas = agendaGenerada.total ?? agendaMensual.length;
      const mensaje = Platform.OS === 'web'
        ? `Agenda mensual guardada en backend con ${totalAlertas} alertas basadas en la hora de referencia.`
        : `Agenda mensual guardada en backend y sincronizada localmente con ${totalAlertas} alertas basadas en la hora de referencia.`;

      setEstadoProgramacion(mensaje);
      Alert.alert('Agenda creada', mensaje);
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo programar la agenda mensual.');
    } finally {
      setProgramando(false);
    }
  };

  const limpiarProgramacion = async () => {
    setProgramando(true);
    try {
      const resultado = await fetchSuperAdmin(
        `/api/super-admin/alertas/recogida-5min/agenda?mes=${mesActual}&anio=${anioActual}`,
        { method: 'DELETE' }
      );
      setAgendaServidor([]);

      let canceladas = 0;
      if (Platform.OS !== 'web') {
        canceladas = await cancelarNotificacionesPorTipo(TIPO_ALERTA_RECOGIDA);
      }

      const mensaje = Platform.OS === 'web'
        ? `La agenda del mes se limpio en backend. Total eliminadas: ${resultado.totalEliminadas ?? 0}.`
        : `Agenda del backend limpiada. Alertas locales canceladas: ${canceladas}.`;

      setEstadoProgramacion(mensaje);
      Alert.alert('Agenda limpiada', mensaje);
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo limpiar la agenda.');
    } finally {
      setProgramando(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={THEME.primary} />
        <Text style={styles.loadingText}>Cargando consola global...</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={THEME.primaryDark} />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerInner}>
            <View style={styles.headerTop}>
              <View style={styles.logoBadge}>
                <ShieldCheck size={22} color="#fff" strokeWidth={2.2} />
              </View>
              <TouchableOpacity
                onPress={() => {
                  limpiarSesion();
                  navigation.replace('Login');
                }}
                style={styles.logoutButton}
              >
                <LogOut size={18} color="#fff" strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.headerEyebrow}>Super Administrador</Text>
            <Text style={styles.headerTitle}>Control global y programacion de alertas</Text>
            <Text style={styles.headerSubtitle}>
              Consola responsive para movil y web.
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => refrescarVista(true)} tintColor={THEME.primary} />
          }
          contentContainerStyle={styles.contentContainer}
        >
          <View style={[styles.pageWrap, isDesktop && styles.pageWrapDesktop]}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {!token ? (
              <View style={styles.authWarning}>
                <Text style={styles.authWarningText}>
                  Esta vista puede abrirse en modo demo, pero para guardar la programacion debes iniciar sesion como super administrador.
                </Text>
              </View>
            ) : null}
            {tokenInvalido ? (
              <View style={styles.authWarning}>
                <Text style={styles.authWarningText}>
                  El token actual no tiene permisos de super administrador. Inicia sesion con `superadmin@tuapp.com`.
                </Text>
              </View>
            ) : null}

            <View style={styles.tabSwitcher}>
              <TouchableOpacity
                style={[styles.tabSwitcherButton, seccionActiva === 'panel' && styles.tabSwitcherButtonActive]}
                onPress={() => setSeccionActiva('panel')}
              >
                <Text style={[styles.tabSwitcherText, seccionActiva === 'panel' && styles.tabSwitcherTextActive]}>Panel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabSwitcherButton, seccionActiva === 'colegios' && styles.tabSwitcherButtonActive]}
                onPress={() => setSeccionActiva('colegios')}
              >
                <Text style={[styles.tabSwitcherText, seccionActiva === 'colegios' && styles.tabSwitcherTextActive]}>Colegios</Text>
              </TouchableOpacity>
            </View>

            {seccionActiva === 'panel' ? (
            <>
            <View style={styles.metricsGrid}>
              {metricas.map(({ label, value, color, Icon }) => (
                <View
                  key={label}
                  style={[
                    styles.metricCard,
                    isTablet && styles.metricCardTablet,
                    isDesktop && styles.metricCardDesktop,
                  ]}
                >
                  <View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}>
                    <Icon size={18} color={color} strokeWidth={2} />
                  </View>
                  <Text style={styles.metricValue}>{value}</Text>
                  <Text style={styles.metricLabel}>{label}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.topGrid, isDesktop && styles.topGridDesktop]}>
              <View style={[styles.mainColumn, isDesktop && styles.mainColumnDesktop]}>
                <View style={styles.heroCard}>
                  <View style={styles.heroHeader}>
                    <Text style={styles.sectionTitle}>Resumen ejecutivo</Text>
                    <TouchableOpacity style={styles.refreshButton} onPress={() => refrescarVista(true)}>
                      <RefreshCw size={15} color={THEME.primary} strokeWidth={2} />
                      <Text style={styles.refreshButtonText}>Actualizar</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.heroStats, !isTablet && styles.heroStatsStack]}>
                    <View style={styles.heroStatItem}>
                      <Text style={styles.heroStatValue}>{dashboard?.totalRutas ?? rutas.length}</Text>
                      <Text style={styles.heroStatLabel}>Rutas</Text>
                    </View>
                    <View style={[styles.heroDivider, !isTablet && styles.heroDividerHorizontal]} />
                    <View style={styles.heroStatItem}>
                      <Text style={styles.heroStatValue}>{dashboard?.totalAlumnos ?? alumnos.length}</Text>
                      <Text style={styles.heroStatLabel}>Alumnos</Text>
                    </View>
                    <View style={[styles.heroDivider, !isTablet && styles.heroDividerHorizontal]} />
                    <View style={styles.heroStatItem}>
                      <Text style={[styles.heroStatValue, { color: dashboard?.ausenciasHoy ? THEME.warning : THEME.success }]}>
                        {dashboard?.ausenciasHoy ?? 0}
                      </Text>
                      <Text style={styles.heroStatLabel}>Ausencias hoy</Text>
                    </View>
                  </View>

                  <View style={styles.resumenColegiosCard}>
                    <View style={styles.resumenColegiosHeader}>
                      <View>
                        <Text style={styles.resumenColegiosTitulo}>Colegios registrados</Text>
                      </View>
                      <View style={styles.resumenColegiosBadge}>
                        <Building2 size={14} color={THEME.info} strokeWidth={2} />
                        <Text style={styles.resumenColegiosBadgeText}>{colegios.length}</Text>
                      </View>
                    </View>

                    {colegiosRecientes.length > 0 ? (
                      colegiosRecientes.map((colegio) => (
                        <View key={colegio.id} style={styles.resumenColegiosRow}>
                          <View style={styles.resumenColegiosDot} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.resumenColegiosNombre}>{colegio.nombre}</Text>
                            <Text style={styles.resumenColegiosMeta}>
                              {colegio.plan || 'trial'} · {colegio.admin_nombre || 'Sin administrador'}
                            </Text>
                          </View>
                        </View>
                      ))
                    ) : (
                      <View style={styles.resumenColegiosVacio}>
                        <Text style={styles.resumenColegiosVacioText}>Crea el primer colegio desde la pestaña Colegios.</Text>
                      </View>
                    )}
                  </View>
                </View>

                <Text style={styles.sectionTitle}>Gobernanza</Text>
                {modulos.map((modulo) => (
                  <View key={modulo.title} style={styles.moduleCard}>
                    <View style={styles.moduleText}>
                      <Text style={styles.moduleTitle}>{modulo.title}</Text>
                      <Text style={styles.moduleSubtitle}>{modulo.subtitle}</Text>
                      <Text style={styles.moduleMeta}>{modulo.meta}</Text>
                    </View>
                    <View style={styles.moduleAside}>
                      <View style={[styles.moduleStatus, { backgroundColor: `${modulo.statusColor}18` }]}>
                        <Text style={[styles.moduleStatusText, { color: modulo.statusColor }]}>{modulo.status}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <View style={[styles.sideColumn, isDesktop && styles.sideColumnDesktop]}>
                <View style={styles.schedulerCard}>
                  <View style={styles.schedulerHeader}>
                    <View style={styles.schedulerTitleWrap}>
                      <CalendarDays size={18} color={THEME.primary} strokeWidth={2} />
                      <Text style={styles.sectionTitle}>Alertas de recogida</Text>
                    </View>
                    <View style={styles.webBadge}>
                      <MonitorSmartphone size={14} color={THEME.info} strokeWidth={2} />
                      <Text style={styles.webBadgeText}>{Platform.OS === 'web' ? 'Web responsive' : 'Movil + web'}</Text>
                    </View>
                  </View>

                  <Text style={styles.schedulerHint}>
                    Configura el mensaje con una hora base de referencia. Hoy esta programacion genera alertas por horario; la activacion dinamica por cercania al punto se completara con el flujo operativo de ruta.
                  </Text>

                  <View style={styles.quickInfoRow}>
                    <View style={styles.quickInfoChip}>
                      <Clock3 size={14} color={THEME.warning} strokeWidth={2} />
                      <Text style={styles.quickInfoText}>Alerta: {horaAlerta}</Text>
                    </View>
                    <View style={styles.quickInfoChip}>
                      <Bell size={14} color={THEME.secondary} strokeWidth={2} />
                      <Text style={styles.quickInfoText}>Hora base: {horaRecogida}</Text>
                    </View>
                  </View>

                  <Text style={styles.inputLabel}>Hora base de recogida</Text>
                  <TextInput
                    style={styles.input}
                    value={horaRecogida}
                    onChangeText={setHoraRecogida}
                    placeholder="06:45"
                    placeholderTextColor={THEME.textSecondary}
                  />

                  <Text style={styles.inputLabel}>Mensaje de alerta</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={mensajeAlerta}
                    onChangeText={setMensajeAlerta}
                    multiline
                    placeholder="Escribe el mensaje que recibirán los padres"
                    placeholderTextColor={THEME.textSecondary}
                  />

                  <Text style={styles.inputLabel}>Modo de programacion</Text>
                  <View style={styles.modeRow}>
                    {[
                      { key: 'diaria', label: 'Diaria' },
                      { key: 'mensual', label: 'Mes actual' },
                    ].map((modo) => (
                      <TouchableOpacity
                        key={modo.key}
                        style={[
                          styles.modeButton,
                          modoProgramacion === modo.key && styles.modeButtonActive,
                        ]}
                        onPress={() => setModoProgramacion(modo.key)}
                      >
                        <Text
                          style={[
                            styles.modeButtonText,
                            modoProgramacion === modo.key && styles.modeButtonTextActive,
                          ]}
                        >
                          {modo.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>Dias del mes a considerar</Text>
                  <View style={styles.daysRow}>
                    {DIAS_SEMANA.map((dia) => {
                      const activo = diasSeleccionados.includes(dia.key);
                      return (
                        <TouchableOpacity
                          key={dia.key}
                          style={[styles.dayChip, activo && styles.dayChipActive]}
                          onPress={() => alternarDia(dia.key)}
                        >
                          <Text style={[styles.dayChipText, activo && styles.dayChipTextActive]}>
                            {dia.short}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.actionButtonsColumn}>
                    <TouchableOpacity
                      style={[styles.primaryAction, programando && styles.buttonDisabled]}
                      onPress={modoProgramacion === 'diaria' ? programarAlertaDiaria : programarMesActual}
                      disabled={programando}
                    >
                      {programando ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Check size={16} color="#fff" strokeWidth={2.4} />
                          <Text style={styles.primaryActionText}>
                            {modoProgramacion === 'diaria' ? 'Programar alerta diaria' : 'Programar mes actual'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.secondaryAction, programando && styles.buttonDisabled]}
                      onPress={limpiarProgramacion}
                      disabled={programando}
                    >
                      <X size={16} color={THEME.error} strokeWidth={2.3} />
                      <Text style={styles.secondaryActionText}>Limpiar programacion</Text>
                    </TouchableOpacity>
                  </View>

                  {estadoProgramacion ? (
                    <View style={styles.statusNote}>
                      <Text style={styles.statusNoteText}>{estadoProgramacion}</Text>
                    </View>
                  ) : null}

                </View>

                <View style={styles.schedulerCard}>
                  <Text style={styles.sectionTitle}>Vista previa del mes</Text>
                  <Text style={styles.schedulerHint}>
                    {agendaServidor.length > 0
                      ? `${agendaServidor.length} alertas guardadas en backend para el mes actual.`
                      : `${agendaMensual.length} alertas calculadas localmente para el mes actual usando los dias seleccionados.`}
                  </Text>

                  {(agendaServidor.length > 0 ? agendaServidor.length : agendaMensual.length) === 0 ? (
                    <View style={styles.emptyAgenda}>
                      <CalendarDays size={26} color={THEME.border} strokeWidth={1.8} />
                      <Text style={styles.emptyAgendaText}>No hay fechas validas para programar.</Text>
                    </View>
                  ) : (
                    (agendaServidor.length > 0
                      ? agendaServidor.slice(0, 10).map((item) => ({
                        id: item.id,
                        etiqueta: formatearFecha(new Date(item.fecha_programada)),
                        horaAlerta: new Date(item.fecha_programada).toLocaleTimeString('es-SV', {
                          hour: '2-digit',
                          minute: '2-digit',
                        }),
                      }))
                      : agendaMensual.slice(0, 10)
                    ).map((item) => (
                      <View key={item.id} style={styles.agendaRow}>
                        <View style={styles.agendaDate}>
                          <Text style={styles.agendaDateText}>{item.etiqueta}</Text>
                        </View>
                        <View style={styles.agendaTime}>
                          <Clock3 size={14} color={THEME.warning} strokeWidth={2} />
                          <Text style={styles.agendaTimeText}>{item.horaAlerta}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Acciones globales</Text>
            <TouchableOpacity style={styles.actionCard} onPress={() => setSeccionActiva('colegios')}>
              <View style={styles.actionIcon}>
                <Building2 size={20} color={THEME.secondary} strokeWidth={2} />
              </View>
              <View style={styles.actionText}>
                <Text style={styles.actionTitle}>Abrir colegios</Text>
                <Text style={styles.actionSubtitle}>Cambia a la pestaña donde puedes ver los colegios y generar codigos de administrador.</Text>
              </View>
              <ChevronRight size={18} color={THEME.textSecondary} strokeWidth={2} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Admin')}>
              <View style={styles.actionIcon}>
                <Settings2 size={20} color={THEME.primary} strokeWidth={2} />
              </View>
              <View style={styles.actionText}>
                <Text style={styles.actionTitle}>Abrir panel administrativo</Text>
                <Text style={styles.actionSubtitle}>Entrar al panel operativo actual para gestionar rutas, alumnos y conductores.</Text>
              </View>
              <ChevronRight size={18} color={THEME.textSecondary} strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.actionCard}>
              <View style={styles.actionIcon}>
                <Bell size={20} color={THEME.warning} strokeWidth={2} />
              </View>
              <View style={styles.actionText}>
                <Text style={styles.actionTitle}>Politicas de comunicacion</Text>
                <Text style={styles.actionSubtitle}>
                  Llamadas al conductor: {llamadasConductor ? 'habilitadas' : 'deshabilitadas'}.
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Capacidad instalada</Text>
            <View style={[styles.capacityRow, !isTablet && styles.capacityRowStack]}>
              <View style={styles.capacityCard}>
                <Route size={18} color={THEME.info} strokeWidth={2} />
                <Text style={styles.capacityValue}>{rutas.length}</Text>
                <Text style={styles.capacityLabel}>Rutas registradas</Text>
              </View>
              <View style={styles.capacityCard}>
                <Bus size={18} color={THEME.secondary} strokeWidth={2} />
                <Text style={styles.capacityValue}>{conductores.length}</Text>
                <Text style={styles.capacityLabel}>Conductores</Text>
              </View>
            </View>
            </>
            ) : (
              renderPestanaColegios()
            )}
          </View>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
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
    fontWeight: '600',
  },
  header: {
    backgroundColor: THEME.primaryDark,
    paddingTop: 48,
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  headerInner: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  logoBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  content: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 28 },
  pageWrap: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
  },
  pageWrapDesktop: {
    paddingHorizontal: 4,
  },
  errorText: {
    color: THEME.error,
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '600',
  },
  authWarning: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  authWarningText: {
    fontSize: 12,
    color: THEME.accent,
    lineHeight: 18,
    fontWeight: '600',
  },
  tabSwitcher: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    padding: 4,
    backgroundColor: THEME.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  tabSwitcherButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabSwitcherButtonActive: {
    backgroundColor: THEME.primary,
  },
  tabSwitcherText: {
    color: THEME.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  tabSwitcherTextActive: {
    color: '#fff',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metricCard: {
    width: '48.5%',
    backgroundColor: THEME.surface,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  metricCardTablet: {
    width: '23.8%',
  },
  metricCardDesktop: {
    padding: 16,
  },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  metricValue: {
    fontSize: 26,
    color: THEME.text,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 12,
    color: THEME.textSecondary,
    marginTop: 4,
    fontWeight: '600',
  },
  topGrid: {
    gap: 16,
  },
  topGridDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mainColumn: {
    gap: 0,
  },
  mainColumnDesktop: {
    flex: 1.1,
  },
  sideColumn: {
    gap: 16,
  },
  sideColumnDesktop: {
    flex: 0.9,
  },
  heroCard: {
    backgroundColor: THEME.surface,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    marginBottom: 18,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.background,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  refreshButtonText: {
    color: THEME.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  heroStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroStatsStack: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatValue: {
    fontSize: 21,
    color: THEME.primary,
    fontWeight: '800',
  },
  heroStatLabel: {
    fontSize: 11,
    color: THEME.textSecondary,
    marginTop: 4,
    fontWeight: '600',
  },
  heroDivider: {
    width: 1,
    height: 34,
    backgroundColor: THEME.border,
  },
  heroDividerHorizontal: {
    width: '100%',
    height: 1,
  },
  resumenColegiosCard: {
    marginTop: 10,
    backgroundColor: THEME.background,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  resumenColegiosHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  resumenColegiosTitulo: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.text,
  },
  resumenColegiosBadge: {
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  resumenColegiosBadgeText: {
    color: THEME.info,
    fontWeight: '800',
    fontSize: 12,
  },
  resumenColegiosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  resumenColegiosDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.secondary,
  },
  resumenColegiosDotActivo: {
    backgroundColor: THEME.info,
  },
  resumenColegiosNombreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  resumenColegiosNombre: {
    color: THEME.text,
    fontWeight: '700',
    fontSize: 12,
  },
  resumenColegiosMeta: {
    color: THEME.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  resumenColegiosTag: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  resumenColegiosTagText: {
    color: THEME.info,
    fontSize: 10,
    fontWeight: '800',
  },
  resumenColegiosVacio: {
    backgroundColor: THEME.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 10,
  },
  resumenColegiosVacioText: {
    fontSize: 11,
    color: THEME.textSecondary,
    lineHeight: 16,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.text,
    marginBottom: 8,
    marginTop: 4,
  },
  moduleCard: {
    backgroundColor: THEME.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  moduleText: { flex: 1 },
  moduleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.text,
  },
  moduleSubtitle: {
    fontSize: 13,
    color: THEME.primary,
    marginTop: 2,
    fontWeight: '600',
  },
  moduleMeta: {
    fontSize: 12,
    color: THEME.textSecondary,
    marginTop: 6,
    lineHeight: 18,
    fontWeight: '500',
  },
  moduleAside: {
    alignItems: 'flex-end',
  },
  moduleStatus: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  moduleStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  schedulerCard: {
    backgroundColor: THEME.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  schedulerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  schedulerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  webBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  webBadgeText: {
    fontSize: 11,
    color: THEME.info,
    fontWeight: '700',
  },
  schedulerHint: {
    fontSize: 12,
    color: THEME.textSecondary,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 12,
  },
  quickInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  quickInfoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.background,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  quickInfoText: {
    fontSize: 11,
    color: THEME.text,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 12,
    color: THEME.text,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    color: THEME.text,
    fontSize: 14,
  },
  textArea: {
    minHeight: 86,
    textAlignVertical: 'top',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.background,
    paddingVertical: 11,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  modeButtonText: {
    fontSize: 13,
    color: THEME.textSecondary,
    fontWeight: '700',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  dayChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayChipActive: {
    backgroundColor: THEME.secondary,
    borderColor: THEME.secondary,
  },
  dayChipText: {
    fontSize: 12,
    color: THEME.textSecondary,
    fontWeight: '700',
  },
  dayChipTextActive: {
    color: '#fff',
  },
  actionButtonsColumn: {
    gap: 10,
  },
  primaryAction: {
    backgroundColor: THEME.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryAction: {
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  secondaryActionText: {
    color: THEME.error,
    fontSize: 13,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  statusNote: {
    marginTop: 12,
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 12,
  },
  statusNoteText: {
    fontSize: 12,
    color: THEME.success,
    lineHeight: 18,
    fontWeight: '600',
  },
  emptyAgenda: {
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  emptyAgendaText: {
    marginTop: 8,
    fontSize: 12,
    color: THEME.textSecondary,
    fontWeight: '600',
  },
  agendaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  agendaDate: {
    flex: 1,
  },
  agendaDateText: {
    fontSize: 12,
    color: THEME.text,
    fontWeight: '700',
  },
  agendaTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF8E1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  agendaTimeText: {
    fontSize: 11,
    color: THEME.warning,
    fontWeight: '800',
  },
  actionCard: {
    backgroundColor: THEME.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: THEME.background,
  },
  actionText: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14,
    color: THEME.text,
    fontWeight: '700',
  },
  actionSubtitle: {
    fontSize: 12,
    color: THEME.textSecondary,
    marginTop: 4,
    lineHeight: 18,
    fontWeight: '500',
  },
  colegiosSection: {
    gap: 12,
  },
  colegiosHeader: {
    backgroundColor: THEME.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    gap: 12,
  },
  colegiosSubtitle: {
    fontSize: 12,
    color: THEME.textSecondary,
    lineHeight: 18,
    marginTop: 4,
  },
  colegiosSearch: {
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: THEME.text,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    paddingHorizontal: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    backgroundColor: THEME.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 12,
    color: THEME.textSecondary,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
  },
  btnCancelar: {
    flex: 1,
    backgroundColor: THEME.background,
    borderRadius: 14,
    minHeight: 48,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
    justifyContent: 'center',
  },
  btnCancelarText: {
    color: THEME.text,
    fontWeight: '800',
    fontSize: 14,
  },
  btnConfirmar: {
    flex: 1,
    backgroundColor: THEME.primary,
    borderRadius: 14,
    minHeight: 48,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnConfirmarText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  codigoText: {
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 4,
    marginVertical: 16,
  },
  codigoInfo: {
    textAlign: 'center',
    color: THEME.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  createCollegeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
  },
  createCollegeButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  colegiosCounterRow: {
    flexDirection: 'row',
    gap: 10,
  },
  colegiosCounterCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  colegiosCounterText: {
    color: THEME.text,
    fontWeight: '700',
    fontSize: 13,
  },
  colegioCard: {
    backgroundColor: THEME.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    gap: 10,
  },
  colegioCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  colegioTitleBlock: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  colegioIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colegioNombre: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.text,
    marginBottom: 2,
  },
  colegioInfo: {
    color: THEME.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  colegioEstado: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  colegioEstadoText: {
    fontSize: 12,
    fontWeight: '800',
  },
  colegioCodigoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  colegioCodigoButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  emptyColegioCard: {
    backgroundColor: THEME.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 18,
    alignItems: 'center',
  },
  emptyColegioTitle: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyColegioSubtitle: {
    color: THEME.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  capacityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  capacityRowStack: {
    flexDirection: 'column',
  },
  capacityCard: {
    flex: 1,
    backgroundColor: THEME.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
  },
  capacityValue: {
    fontSize: 24,
    fontWeight: '800',
    color: THEME.text,
    marginTop: 10,
  },
  capacityLabel: {
    fontSize: 12,
    color: THEME.textSecondary,
    marginTop: 4,
    fontWeight: '600',
  },
});
