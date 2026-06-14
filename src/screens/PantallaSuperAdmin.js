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
  CalendarDays, Clock3, MonitorSmartphone, Check, X, Plus, KeyRound, MessageSquare, Trash2,
  UserPlus, Edit3, Power, LogIn
} from 'lucide-react-native';
import {
  cancelarNotificacionesPorTipo,
  programarNotificacionDiaria,
  programarNotificacionFecha,
} from '../services/notificaciones';
import { obtenerToken, limpiarSesion, guardarSesion } from '../services/session';
import { useSuperAdminVinculacion } from '../hooks/useSuperAdminVinculacion';

import { API_BASE_URL } from '../services/apiConfig';

const SERVIDOR = API_BASE_URL;
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
  const {
    loading: loadingColegios,
    listarColegios,
    crearNuevoColegio,
    eliminarColegio,
    generarCodigo: generarCodigoColegio,
    listarCodigos,
    listarUsuariosColegio,
    restablecerPasswordAdmin,
    entrarComoAdmin,
    asignarAdministrador,
    desvincularAdministrador,
    editarColegio,
    toggleEstadoColegio,
  } = useSuperAdminVinculacion();
  const { width } = useWindowDimensions();
  const isTablet = width >= 720;
  const isDesktop = width >= 1080;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [rutas, setRutas] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [conductores, setConductores] = useState([]);
  const [conductoresIndependientes, setConductoresIndependientes] = useState([]);
  const [configuracion, setConfiguracion] = useState([]);
  const [error, setError] = useState('');

  const [horaRecogida, setHoraRecogida] = useState('06:45');
  const [mensajeAlerta, setMensajeAlerta] = useState('El transporte escolar pasara en aproximadamente 5 minutos por tu punto de recogida.');
  const [mensajesDiarios, setMensajesDiarios] = useState([]);
  const [mostrarEditorMensajes, setMostrarEditorMensajes] = useState(false);
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
  const [eliminandoColegioId, setEliminandoColegioId] = useState(null);
  const [busquedaColegioUsuarios, setBusquedaColegioUsuarios] = useState('');
  const [busquedaUsuario, setBusquedaUsuario] = useState('');
  const [busquedaConductorIndependiente, setBusquedaConductorIndependiente] = useState('');
  const [colegioUsuariosSeleccionado, setColegioUsuariosSeleccionado] = useState(null);
  const [usuariosColegio, setUsuariosColegio] = useState([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);
  const [modalPasswordTemporal, setModalPasswordTemporal] = useState(false);
  const [passwordTemporal, setPasswordTemporal] = useState('');
  const [usuarioReset, setUsuarioReset] = useState(null);

  const [modalEditarColegio, setModalEditarColegio] = useState(false);
  const [colegioEditar, setColegioEditar] = useState(null);
  const [modalAsignarAdmin, setModalAsignarAdmin] = useState(false);
  const [emailAdminNuevo, setEmailAdminNuevo] = useState('');
  const [colegioAsignarAdmin, setColegioAsignarAdmin] = useState(null);
  const [loadingAccion, setLoadingAccion] = useState(false);

  const handleImpersonate = async (colegio) => {
    try {
      setLoadingAccion(true);
      const resultado = await entrarComoAdmin(colegio.id);
      if (resultado.token) {
        guardarSesion({
          token: resultado.token,
          usuario: resultado.usuario || { rol: 'admin', colegio_id: colegio.id, nombre: `Admin (${colegio.nombre})` },
        });
        Alert.alert('Exito', `Has entrado al panel de ${colegio.nombre}`, [
          { text: 'Ir al Panel Admin', onPress: () => navigation.navigate('Admin') }
        ]);
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo realizar la suplantacion.');
    } finally {
      setLoadingAccion(false);
    }
  };

  const handleToggleEstado = async (colegio) => {
    try {
      const nuevoEstado = !colegio.activo;
      await toggleEstadoColegio(colegio.id, nuevoEstado);
      await refrescarVista(true);
      Alert.alert('Listo', `Colegio ${nuevoEstado ? 'activado' : 'desactivado'} correctamente.`);
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo cambiar el estado.');
    }
  };

  const handleAsignarAdmin = async () => {
    if (!emailAdminNuevo.trim() || !colegioAsignarAdmin) {
      Alert.alert('Error', 'Ingresa un correo electronico valido.');
      return;
    }

    try {
      setLoadingAccion(true);
      const resultado = await asignarAdministrador(colegioAsignarAdmin.id, emailAdminNuevo.trim());
      setModalAsignarAdmin(false);
      setEmailAdminNuevo('');
      await refrescarVista(true);
      const passwordTemporal = resultado?.credenciales?.passwordTemporal;
      Alert.alert(
        'Exito',
        passwordTemporal
          ? `Administrador creado y asignado correctamente.\n\nPassword temporal: ${passwordTemporal}`
          : 'Administrador asignado correctamente.'
      );
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo asignar el administrador.');
    } finally {
      setLoadingAccion(false);
    }
  };

  const handleDesvincularAdmin = async (colegio) => {
    const nombre = colegio?.nombre || 'este colegio';

    Alert.alert(
      'Desvincular Administrador',
      `Se quitara el acceso administrativo actual de ${nombre}. El usuario seguira existiendo pero ya no estara vinculado como jefe de este colegio.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desvincular',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoadingAccion(true);
              await desvincularAdministrador(colegio.id);
              await refrescarVista(true);
              Alert.alert('Exito', 'Administrador desvinculado correctamente.');
            } catch (e) {
              Alert.alert('Error', e.message || 'No se pudo desvincular el administrador.');
            } finally {
              setLoadingAccion(false);
            }
          },
        },
      ]
    );
  };

  const handleEditarColegio = async () => {
    if (!colegioEditar.nombre.trim()) {
      Alert.alert('Error', 'El nombre es requerido.');
      return;
    }

    try {
      setLoadingAccion(true);
      await editarColegio(colegioEditar.id, {
        nombre: colegioEditar.nombre,
        plan: colegioEditar.plan,
        dias_prueba_restantes: Number(colegioEditar.dias_prueba_restantes),
        dias_prueba: Number(colegioEditar.dias_prueba_restantes),
      });
      setModalEditarColegio(false);
      await refrescarVista(true);
      Alert.alert('Exito', 'Colegio actualizado correctamente.');
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo actualizar el colegio.');
    } finally {
      setLoadingAccion(false);
    }
  };

  const token = tokenSesion;
  const authHeaders = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();
  const obtenerDiasDelMes = (mes, anio) => new Date(anio, mes, 0).getDate();
  const diasDelMesActual = obtenerDiasDelMes(mesActual, anioActual);

  // Inicializar mensajes diarios con la cantidad correcta de días del mes
  useEffect(() => {
    if (mensajesDiarios.length !== diasDelMesActual) {
      setMensajesDiarios(Array(diasDelMesActual).fill(''));
    }
  }, [diasDelMesActual]);

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
      const [dash, rut, alum, cond, config, superConfig, agenda, conductoresInd] = await Promise.all([
        fetchJsonSeguro(`${SERVIDOR}/api/admin/dashboard`, {}, null),
        fetchJsonSeguro(`${SERVIDOR}/api/admin/rutas`, {}, { rutas: [] }),
        fetchJsonSeguro(`${SERVIDOR}/api/admin/alumnos`, {}, { alumnos: [] }),
        fetchJsonSeguro(`${SERVIDOR}/api/admin/conductores`, {}, { conductores: [] }),
        fetchJsonSeguro(`${SERVIDOR}/api/admin/configuracion`, {}, { configuracion: [] }),
        token ? fetchSuperAdmin('/api/super-admin/alertas/recogida-5min').catch(() => ({ configuracion: null })) : Promise.resolve({ configuracion: null }),
        token
          ? fetchSuperAdmin(`/api/super-admin/alertas/recogida-5min/agenda?mes=${mesActual}&anio=${anioActual}`).catch(() => ({ alertas: [] }))
          : Promise.resolve({ alertas: [] }),
        token
          ? fetchSuperAdmin('/api/super-admin/conductores-independientes').catch(() => ({ conductores: [] }))
          : Promise.resolve({ conductores: [] }),
      ]);

      setDashboard(dash);
      setRutas(rut?.rutas || []);
      setAlumnos(alum?.alumnos || []);
      setConductores(cond?.conductores || []);
      setConductoresIndependientes(conductoresInd?.conductores || []);
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

  useEffect(() => {
    if (seccionActiva !== 'usuarios' || colegios.length === 0) return;

    const seleccionadoExiste = colegioUsuariosSeleccionado
      ? colegios.some((colegio) => String(colegio.id) === String(colegioUsuariosSeleccionado.id))
      : false;

    if (!colegioUsuariosSeleccionado || !seleccionadoExiste) {
      cargarUsuariosColegio(colegios[0]);
    }
  }, [colegios, colegioUsuariosSeleccionado, seccionActiva]);

  useEffect(() => {
    const cargarMensajesDiarios = async () => {
      try {
        const data = await fetchSuperAdmin(`/api/super-admin/mensajes-diarios?mes=${mesActual}&anio=${anioActual}`);
        if (data?.mensajes && Array.isArray(data.mensajes)) {
          setMensajesDiarios(data.mensajes);
        }
      } catch (error) {
        console.log('No se pudieron cargar los mensajes diarios:', error.message);
      }
    };

    cargarMensajesDiarios();
  }, [mesActual, anioActual]);

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
    { label: 'Independientes', value: conductoresIndependientes.length, color: THEME.accent, Icon: Route },
    { label: 'Alumnos activos', value: alumnosActivos, color: THEME.success, Icon: Users },
  ];
  const colegiosRecientes = colegios.slice(0, 3);
  const conductoresIndependientesActivos = conductoresIndependientes.filter((item) => item.activo !== false).length;
  const alumnosIndependientes = conductoresIndependientes.reduce((total, item) => total + (Number(item.total_alumnos ?? item.totalAlumnos) || 0), 0);

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

  const handleEliminarColegio = (colegio) => {
    const nombre = colegio?.nombre || 'este colegio';

    Alert.alert(
      'Eliminar colegio',
      `Se eliminara ${nombre}. Esta accion puede desvincular usuarios, codigos y datos asociados al colegio.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              setEliminandoColegioId(colegio.id);
              await eliminarColegio(colegio.id);

              if (String(colegioUsuariosSeleccionado?.id) === String(colegio.id)) {
                setColegioUsuariosSeleccionado(null);
                setUsuariosColegio([]);
              }

              await refrescarVista(true);
              Alert.alert('Listo', 'Colegio eliminado correctamente.');
            } catch (e) {
              Alert.alert('Error', e.message || 'No se pudo eliminar el colegio.');
            } finally {
              setEliminandoColegioId(null);
            }
          },
        },
      ]
    );
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

  const usuariosFiltrados = usuariosColegio.filter((usuario) => {
    const texto = busquedaUsuario.trim().toLowerCase();
    if (!texto) return true;

    return [
      usuario.nombre,
      usuario.email,
      usuario.rol,
      usuario.telefono,
    ]
      .filter(Boolean)
      .some((valor) => valor.toLowerCase().includes(texto));
  });

  const conductoresIndependientesFiltrados = conductoresIndependientes.filter((conductor) => {
    const texto = busquedaConductorIndependiente.trim().toLowerCase();
    if (!texto) return true;

    const rutasConductor = Array.isArray(conductor.rutas) ? conductor.rutas : [];

    return [
      conductor.nombre,
      conductor.email,
      conductor.telefono,
      conductor.placa,
      conductor.ruta_nombre,
      ...rutasConductor.map((ruta) => ruta.nombre),
    ]
      .filter(Boolean)
      .some((valor) => String(valor).toLowerCase().includes(texto));
  });

  const colegiosParaUsuarios = colegios.filter((colegio) => {
    const texto = busquedaColegioUsuarios.trim().toLowerCase();
    if (!texto) return true;

    return [
      colegio.nombre,
      colegio.plan,
      colegio.admin_nombre,
    ]
      .filter(Boolean)
      .some((valor) => valor.toLowerCase().includes(texto));
  });

  const esUsuarioAdmin = (usuario) => {
    const rol = String(usuario?.rol || usuario?.role || usuario?.tipo || '').trim().toLowerCase();
    return ['admin', 'administrator', 'administrador'].includes(rol);
  };

  const extraerPasswordTemporal = (resultado) => (
    resultado?.passwordTemporal
    || resultado?.password_temporal
    || resultado?.tempPassword
    || resultado?.temp_password
    || resultado?.password
    || ''
  );

  const cargarUsuariosColegio = async (colegio, opciones = {}) => {
    if (!colegio?.id) return;

    const { limpiarBusqueda = true } = opciones;
    setColegioUsuariosSeleccionado(colegio);
    setLoadingUsuarios(true);
    if (limpiarBusqueda) {
      setBusquedaUsuario('');
    }

    try {
      const resultado = await listarUsuariosColegio(colegio.id);
      setUsuariosColegio(
        resultado?.usuarios
        || resultado?.users
        || resultado?.usuarios_colegio
        || resultado?.data
        || []
      );
    } catch (e) {
      // Mensaje de error más claro para el usuario
      const mensajeError = e.message?.includes('404')
        ? 'El servicio de usuarios no está disponible. Verifica que el backend esté configurado correctamente.'
        : e.message?.includes('500')
          ? 'Error del servidor al cargar usuarios. Intenta más tarde.'
          : e.message || 'Error al cargar usuarios del colegio.';

      Alert.alert('Error al cargar usuarios', mensajeError);
      setUsuariosColegio([]);
    } finally {
      setLoadingUsuarios(false);
    }
  };

  const handleRestablecerPassword = (usuario) => {
    const nombre = usuario?.nombre || usuario?.email || 'este usuario';
    const colegioNombre = colegioUsuariosSeleccionado?.nombre || 'el colegio seleccionado';

    Alert.alert(
      'Restablecer contraseña',
      `Se generara una nueva contraseña temporal para ${nombre} en ${colegioNombre}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restablecer',
          style: 'destructive',
          onPress: async () => {
            if (!colegioUsuariosSeleccionado?.id) return;

            try {
              const resultado = await restablecerPasswordAdmin(colegioUsuariosSeleccionado.id);
              const claveTemporal = extraerPasswordTemporal(resultado);

              if (!claveTemporal) {
                throw new Error('El servidor no devolvio una contraseña temporal.');
              }

              setUsuarioReset(usuario);
              setPasswordTemporal(claveTemporal);
              setModalPasswordTemporal(true);
              await cargarUsuariosColegio(colegioUsuariosSeleccionado, { limpiarBusqueda: false });
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const renderPestanaColegios = () => (
    <View style={styles.colegiosSection}>
      <View style={styles.colegiosHeader}>
        <View>
          <Text style={styles.sectionTitle}>Colegios vinculados</Text>
          <Text style={styles.colegiosSubtitle}>
            Administra los colegios creados, revisa su estado y gestiona el acceso administrativo total.
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

      {(loadingColegios || loadingAccion) ? <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 16 }} /> : null}

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
          <View key={item.id} style={[styles.colegioCard, !item.activo && { opacity: 0.8 }]}>
            <View style={styles.colegioCardHeader}>
              <View style={styles.colegioTitleBlock}>
                <View style={[styles.colegioIcon, { backgroundColor: item.activo ? `${THEME.secondary}14` : `${THEME.error}14` }]}>
                  <Building2 size={18} color={item.activo ? THEME.secondary : THEME.error} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.colegioNombre} numberOfLines={1} ellipsizeMode="tail">{item.nombre}</Text>
                  <Text style={styles.colegioInfo}>Plan: {item.plan || 'trial'}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.colegioEstado, { backgroundColor: item.activo ? '#E8F8EE' : '#FEECEC' }]}
                onPress={() => handleToggleEstado(item)}
              >
                <Power size={14} color={item.activo ? THEME.success : THEME.error} style={{ marginRight: 6 }} />
                <Text style={[styles.colegioEstadoText, { color: item.activo ? THEME.success : THEME.error }]}>
                  {item.activo ? 'Activo' : 'Inactivo'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.colegioMetadataRow}>
              <View style={styles.colegioMetaItem}>
                <Users size={14} color={THEME.textSecondary} />
                <Text style={styles.colegioInfo}> {item.admin_nombre || 'Sin administrador'}</Text>
              </View>
              <View style={styles.colegioMetaItem}>
                <CalendarDays size={14} color={THEME.textSecondary} />
                <Text style={styles.colegioInfo}> {item.dias_prueba_restantes || '0'} dias rest.</Text>
              </View>
            </View>

            <View style={styles.colegioActionsRow}>
              <TouchableOpacity
                style={[styles.colegioActionButton, styles.btnImpersonate]}
                onPress={() => handleImpersonate(item)}
                disabled={!item.activo}
              >
                <LogIn size={16} color="#fff" strokeWidth={2.2} />
                <Text style={styles.colegioActionButtonText}>Entrar como Admin</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.colegioActionButton, styles.btnAsignar]}
                onPress={() => {
                  setColegioAsignarAdmin(item);
                  setModalAsignarAdmin(true);
                }}
              >
                <UserPlus size={16} color={THEME.primary} strokeWidth={2.2} />
                <Text style={[styles.colegioActionButtonText, { color: THEME.primary }]}>Asignar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.colegioActionsRowSecondary}>
              <TouchableOpacity
                style={[styles.colegioActionButtonSmall, { backgroundColor: THEME.info + '15' }]}
                onPress={() => handleGenerarCodigoColegio(item)}
              >
                <KeyRound size={14} color={THEME.info} />
                <Text style={[styles.btnSmallText, { color: THEME.info }]}>Codigo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.colegioActionButtonSmall, { backgroundColor: THEME.warning + '15' }]}
                onPress={() => {
                  setColegioEditar(item);
                  setModalEditarColegio(true);
                }}
              >
                <Edit3 size={14} color={THEME.warning} />
                <Text style={[styles.btnSmallText, { color: THEME.warning }]}>Editar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.colegioActionButtonSmall, { backgroundColor: THEME.error + '15' }]}
                onPress={() => handleDesvincularAdmin(item)}
              >
                <X size={14} color={THEME.error} />
                <Text style={[styles.btnSmallText, { color: THEME.error }]}>Desvincular Admin</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.colegioActionButtonSmall, { backgroundColor: THEME.error + '15' }]}
                onPress={() => handleEliminarColegio(item)}
                disabled={eliminandoColegioId === item.id}
              >
                <Trash2 size={14} color={THEME.error} />
                <Text style={[styles.btnSmallText, { color: THEME.error }]}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* Modal Crear Colegio (Ya existía) */}
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

      {/* Modal Editar Colegio (Nuevo) */}
      <Modal visible={modalEditarColegio} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Editar colegio</Text>
            <Text style={styles.modalSubtitle}>Actualiza los detalles básicos del colegio.</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre del colegio"
              value={colegioEditar?.nombre || ''}
              onChangeText={(text) => setColegioEditar({ ...colegioEditar, nombre: text })}
              placeholderTextColor={THEME.textSecondary}
            />
            <TextInput
              style={styles.input}
              placeholder="Plan (trial, premium, etc)"
              value={colegioEditar?.plan || ''}
              onChangeText={(text) => setColegioEditar({ ...colegioEditar, plan: text })}
              placeholderTextColor={THEME.textSecondary}
            />
            <TextInput
              style={styles.input}
              placeholder="Dias de prueba"
              keyboardType="numeric"
              value={String(colegioEditar?.dias_prueba_restantes ?? '0')}
              onChangeText={(text) => setColegioEditar({ ...colegioEditar, dias_prueba_restantes: text })}
              placeholderTextColor={THEME.textSecondary}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.btnCancelar} onPress={() => setModalEditarColegio(false)}>
                <Text style={styles.btnCancelarText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnConfirmar, { backgroundColor: THEME.primary }]} onPress={handleEditarColegio}>
                <Text style={styles.btnConfirmarText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Asignar Administrador (Nuevo) */}
      <Modal visible={modalAsignarAdmin} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Asignar Administrador</Text>
            <Text style={styles.modalSubtitle}>Vincula una cuenta de correo directamente como admin de {colegioAsignarAdmin?.nombre}.</Text>
            <TextInput
              style={styles.input}
              placeholder="Email del nuevo administrador"
              value={emailAdminNuevo}
              onChangeText={setEmailAdminNuevo}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor={THEME.textSecondary}
            />
            <Text style={styles.schedulerHint}>
              * Si el correo no existe, se creara un administrador con password temporal.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.btnCancelar} onPress={() => setModalAsignarAdmin(false)}>
                <Text style={styles.btnCancelarText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnConfirmar, { backgroundColor: THEME.secondary }]} onPress={handleAsignarAdmin}>
                <Text style={styles.btnConfirmarText}>Asignar</Text>
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

  const renderPestanaConductoresIndependientes = () => (
    <View style={styles.usuariosSection}>
      <View style={styles.usuariosHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Conductores independientes</Text>
          <Text style={styles.usuariosSubtitle}>
            Conductores sin colegio asignado, con sus rutas propias y alumnos activos.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.usuariosRefreshButton}
          onPress={() => refrescarVista(true)}
        >
          <RefreshCw size={16} color={THEME.primary} strokeWidth={2} />
          <Text style={styles.usuariosRefreshButtonText}>Actualizar</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.colegiosSearch}
        value={busquedaConductorIndependiente}
        onChangeText={setBusquedaConductorIndependiente}
        placeholder="Buscar conductor, correo, placa o ruta"
        placeholderTextColor={THEME.textSecondary}
      />

      <View style={[styles.colegiosCounterRow, styles.conductoresCountersRow]}>
        <View style={styles.colegiosCounterCard}>
          <Bus size={18} color={THEME.accent} strokeWidth={2} />
          <Text style={styles.colegiosCounterText}>{conductoresIndependientes.length} conductores</Text>
        </View>
        <View style={styles.colegiosCounterCard}>
          <Check size={18} color={THEME.success} strokeWidth={2} />
          <Text style={styles.colegiosCounterText}>{conductoresIndependientesActivos} activos</Text>
        </View>
        <View style={styles.colegiosCounterCard}>
          <Users size={18} color={THEME.info} strokeWidth={2} />
          <Text style={styles.colegiosCounterText}>{alumnosIndependientes} alumnos</Text>
        </View>
      </View>

      {conductoresIndependientesFiltrados.length === 0 ? (
        <View style={styles.usuariosEmptyCard}>
          <Text style={styles.usuariosEmptyTitle}>
            {conductoresIndependientes.length === 0 ? 'No hay conductores independientes.' : 'No hay coincidencias.'}
          </Text>
          <Text style={styles.usuariosEmptyText}>
            {conductoresIndependientes.length === 0
              ? 'Cuando un conductor no tenga colegio asignado aparecera en esta vista.'
              : 'Prueba con otro nombre, correo, placa o ruta.'}
          </Text>
        </View>
      ) : (
        conductoresIndependientesFiltrados.map((conductor) => {
          const rutasConductor = Array.isArray(conductor.rutas) ? conductor.rutas : [];
          const totalAlumnos = Number(conductor.total_alumnos ?? conductor.totalAlumnos) || 0;

          return (
            <View key={conductor.id} style={[styles.usuarioCard, conductor.activo === false && { opacity: 0.78 }]}>
              <View style={styles.usuarioCardHeader}>
                <View style={[styles.usuarioAvatar, { backgroundColor: `${THEME.accent}16` }]}>
                  <Bus size={18} color={THEME.accent} strokeWidth={2} />
                </View>
                <View style={styles.usuarioInfoBlock}>
                  <Text style={styles.usuarioNombre}>{conductor.nombre || 'Conductor sin nombre'}</Text>
                  <Text style={styles.usuarioMeta}>{conductor.email || 'Sin correo registrado'}</Text>
                </View>
                <View style={[styles.usuarioRolBadge, { backgroundColor: conductor.activo === false ? '#FEF2F2' : '#ECFDF5' }]}>
                  <Text style={[styles.usuarioRolBadgeText, { color: conductor.activo === false ? THEME.error : THEME.success }]}>
                    {conductor.activo === false ? 'Inactivo' : 'Activo'}
                  </Text>
                </View>
              </View>

              <View style={styles.conductorMetaGrid}>
                <Text style={styles.usuarioMeta}>Telefono: {conductor.telefono || 'Sin telefono'}</Text>
                <Text style={styles.usuarioMeta}>Placa: {conductor.placa || 'Sin placa'}</Text>
                <Text style={styles.usuarioMeta}>Alumnos activos: {totalAlumnos}</Text>
              </View>

              <View style={styles.conductorRutasBlock}>
                <Text style={styles.conductorRutasTitle}>Rutas propias</Text>
                {rutasConductor.length > 0 ? (
                  rutasConductor.map((ruta) => (
                    <View key={ruta.id} style={styles.conductorRutaChip}>
                      <Route size={14} color={THEME.info} strokeWidth={2} />
                      <Text style={styles.conductorRutaText}>{ruta.nombre || `Ruta ${ruta.id}`}</Text>
                    </View>
                  ))
                ) : conductor.ruta_nombre ? (
                  <View style={styles.conductorRutaChip}>
                    <Route size={14} color={THEME.info} strokeWidth={2} />
                    <Text style={styles.conductorRutaText}>{conductor.ruta_nombre}</Text>
                  </View>
                ) : (
                  <Text style={styles.usuarioMeta}>Sin ruta activa asignada.</Text>
                )}
              </View>
            </View>
          );
        })
      )}
    </View>
  );

  const renderPestanaUsuarios = () => (
    <View style={styles.usuariosSection}>
      <View style={styles.usuariosHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Usuarios del colegio</Text>
          <Text style={styles.usuariosSubtitle}>
            Selecciona un colegio para revisar sus usuarios y restablecer la contraseña temporal del administrador.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.usuariosRefreshButton}
          onPress={() => {
            if (colegioUsuariosSeleccionado) {
              cargarUsuariosColegio(colegioUsuariosSeleccionado);
            } else if (colegiosParaUsuarios[0]) {
              cargarUsuariosColegio(colegiosParaUsuarios[0]);
            }
          }}
        >
          <RefreshCw size={16} color={THEME.primary} strokeWidth={2} />
          <Text style={styles.usuariosRefreshButtonText}>Actualizar</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.usuariosFilters, isDesktop && styles.usuariosFiltersDesktop]}>
        <TextInput
          style={[styles.colegiosSearch, isDesktop && styles.usuariosFilterInput]}
          value={busquedaColegioUsuarios}
          onChangeText={setBusquedaColegioUsuarios}
          placeholder="Buscar colegio"
          placeholderTextColor={THEME.textSecondary}
        />

        <TextInput
          style={[styles.colegiosSearch, isDesktop && styles.usuariosFilterInput]}
          value={busquedaUsuario}
          onChangeText={setBusquedaUsuario}
          placeholder="Buscar usuario, correo o rol"
          placeholderTextColor={THEME.textSecondary}
        />
      </View>

      <View style={[styles.usuariosGrid, isDesktop && styles.usuariosGridDesktop]}>
        <View style={[styles.usuariosPanel, isDesktop && styles.usuariosPanelDesktop, isDesktop && styles.usuariosSidebarPanel]}>
          <View style={styles.usuariosPanelHeader}>
            <Text style={styles.usuariosColumnTitle}>Colegios</Text>
            <Text style={styles.usuariosColumnMeta}>{colegiosParaUsuarios.length} resultados</Text>
          </View>

          {colegiosParaUsuarios.length === 0 ? (
            <View style={styles.usuariosEmptyCard}>
              <Text style={styles.usuariosEmptyTitle}>No hay colegios para mostrar.</Text>
              <Text style={styles.usuariosEmptyText}>
                Prueba con otra busqueda o crea un colegio desde la pestaña Colegios.
              </Text>
            </View>
          ) : (
            colegiosParaUsuarios.map((colegio) => {
              const isSelected = String(colegioUsuariosSeleccionado?.id) === String(colegio.id);

              return (
                <TouchableOpacity
                  key={colegio.id}
                  style={[
                    styles.usuarioCollegeCard,
                    isSelected && styles.usuarioCollegeCardActive,
                  ]}
                  onPress={() => cargarUsuariosColegio(colegio)}
                >
                  <View style={[styles.usuarioCollegeIcon, { backgroundColor: isSelected ? `${THEME.secondary}16` : `${THEME.primary}10` }]}>
                    <Building2 size={18} color={isSelected ? THEME.secondary : THEME.primary} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.usuarioCollegeName}>{colegio.nombre}</Text>
                    <Text style={styles.usuarioCollegeMeta}>
                      {colegio.admin_nombre || 'Sin administrador'}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={isSelected ? THEME.secondary : THEME.textSecondary} strokeWidth={2} />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={[styles.usuariosPanel, isDesktop && styles.usuariosPanelDesktop, isDesktop && styles.usuariosMainPanel]}>
          <View style={styles.usuariosPanelHeader}>
            <Text style={styles.usuariosColumnTitle}>Usuarios</Text>
            <Text style={styles.usuariosColumnMeta}>
              {colegioUsuariosSeleccionado ? colegioUsuariosSeleccionado.nombre : 'Ningun colegio seleccionado'}
            </Text>
          </View>

          {!colegioUsuariosSeleccionado ? (
            <View style={styles.usuariosEmptyCard}>
              <Text style={styles.usuariosEmptyTitle}>Selecciona un colegio.</Text>
              <Text style={styles.usuariosEmptyText}>
                Al abrir un colegio veras sus usuarios y las acciones disponibles para administracion.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.usuariosResumenCard}>
                <View style={styles.usuariosResumenHeader}>
                  <View>
                    <Text style={styles.usuariosResumenTitle}>{colegioUsuariosSeleccionado.nombre}</Text>
                    <Text style={styles.usuariosResumenText}>
                      {usuariosColegio.length} usuarios cargados
                    </Text>
                  </View>
                  <View style={styles.usuariosResumenBadge}>
                    <Users size={14} color={THEME.info} strokeWidth={2} />
                    <Text style={styles.usuariosResumenBadgeText}>{usuariosFiltrados.length}</Text>
                  </View>
                </View>
                <Text style={styles.usuariosResumenHint}>
                  La contraseña temporal se muestra una sola vez despues de confirmar el reset.
                </Text>
              </View>

              {loadingUsuarios ? (
                <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 16 }} />
              ) : usuariosFiltrados.length === 0 ? (
                <View style={styles.usuariosEmptyCard}>
                  <Text style={styles.usuariosEmptyTitle}>
                    {usuariosColegio.length === 0 ? 'Todavia no hay usuarios.' : 'No hay coincidencias.'}
                  </Text>
                  <Text style={styles.usuariosEmptyText}>
                    {usuariosColegio.length === 0
                      ? 'Este colegio aun no tiene usuarios registrados.'
                      : 'Prueba con otro nombre, correo o rol.'}
                  </Text>
                </View>
              ) : (
                usuariosFiltrados.map((usuario) => {
                  const puedeRestablecer = esUsuarioAdmin(usuario);

                  return (
                    <View key={usuario.id} style={styles.usuarioCard}>
                      <View style={styles.usuarioCardHeader}>
                        <View style={[styles.usuarioAvatar, { backgroundColor: puedeRestablecer ? `${THEME.warning}16` : `${THEME.primary}10` }]}>
                          <Users size={18} color={puedeRestablecer ? THEME.warning : THEME.primary} strokeWidth={2} />
                        </View>
                        <View style={styles.usuarioInfoBlock}>
                          <Text style={styles.usuarioNombre}>{usuario.nombre || usuario.email || 'Usuario sin nombre'}</Text>
                          <Text style={styles.usuarioMeta}>{usuario.email || 'Sin correo registrado'}</Text>
                        </View>
                        <View style={[styles.usuarioRolBadge, { backgroundColor: puedeRestablecer ? '#FFF7ED' : '#EFF6FF' }]}>
                          <Text style={[styles.usuarioRolBadgeText, { color: puedeRestablecer ? THEME.warning : THEME.info }]}>
                            {usuario.rol || usuario.role || 'Usuario'}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.usuarioMeta}>
                        Telefono: {usuario.telefono || 'Sin telefono'}
                      </Text>
                      <Text style={styles.usuarioMeta}>
                        Estado: {usuario.activo === false ? 'Inactivo' : 'Activo'}
                      </Text>

                      <View style={styles.usuarioActionsRow}>
                        {puedeRestablecer ? (
                          <TouchableOpacity
                            style={[styles.usuarioActionButton, styles.usuarioActionButtonWarn]}
                            onPress={() => handleRestablecerPassword(usuario)}
                          >
                            <KeyRound size={16} color={THEME.warning} strokeWidth={2.2} />
                            <Text style={styles.usuarioActionButtonWarnText}>Restablecer contraseña</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.usuarioActionHint}>
                            <Text style={styles.usuarioActionHintText}>
                              Solo el administrador del colegio puede restablecer contraseña desde esta vista.
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </>
          )}
        </View>
      </View>

      <Modal visible={modalPasswordTemporal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Contraseña temporal</Text>
            <Text style={styles.modalSubtitle}>
              Esta clave se genero una sola vez para {usuarioReset?.nombre || usuarioReset?.email || 'el administrador'}.
            </Text>
            <Text style={styles.tempPasswordLabel}>Clave temporal</Text>
            <Text style={styles.tempPasswordValue} selectable>
              {passwordTemporal}
            </Text>
            <Text style={styles.tempPasswordHint}>
              Guarda o comparte esta contraseña ahora. No se volvera a mostrar.
            </Text>
            <TouchableOpacity
              style={[styles.btnConfirmar, { backgroundColor: THEME.primary, marginTop: 12 }]}
              onPress={() => {
                setModalPasswordTemporal(false);
                setPasswordTemporal('');
                setUsuarioReset(null);
              }}
            >
              <Text style={styles.btnConfirmarText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={mostrarEditorMensajes} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <Text style={styles.modalTitle}>Mensajes diarios del mes</Text>
            <Text style={styles.modalSubtitle}>
              Ingresa un mensaje personalizado para cada dia del mes ({diasDelMesActual} dias para {mesActual}/{anioActual}).
              Deja en blanco los dias que no quieras usar.
            </Text>

            <ScrollView style={styles.mensajesDiariosContainer} showsVerticalScrollIndicator={false}>
              {mensajesDiarios.map((mensaje, index) => (
                <View key={index} style={[styles.mensajeDiaRow, index + 1 > diasDelMesActual && styles.mensajeDiaRowDisabled]}>
                  <Text style={[styles.mensajeDiaLabel, index + 1 > diasDelMesActual && styles.mensajeDiaLabelDisabled]}>
                    Dia {index + 1}{index + 1 > diasDelMesActual ? ' (no existe)' : ''}:
                  </Text>
                  <TextInput
                    style={[styles.input, styles.mensajeDiaInput]}
                    value={mensaje}
                    onChangeText={(text) => {
                      const nuevos = [...mensajesDiarios];
                      nuevos[index] = text;
                      setMensajesDiarios(nuevos);
                    }}
                    placeholder={index + 1 <= diasDelMesActual ? `Mensaje para el dia ${index + 1}` : `Dia ${index + 1} no existe en este mes`}
                    placeholderTextColor={THEME.textSecondary}
                    multiline
                  />
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.btnCancelar}
                onPress={() => setMostrarEditorMensajes(false)}
              >
                <Text style={styles.btnCancelarText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnConfirmar, { backgroundColor: THEME.primary }]}
                onPress={async () => {
                  try {
                    await fetchSuperAdmin('/api/super-admin/mensajes-diarios', {
                      method: 'PUT',
                      body: JSON.stringify({ mensajes: mensajesDiarios, mes: mesActual, anio: anioActual }),
                    });
                    Alert.alert('Guardado', 'Los mensajes diarios se han guardado correctamente.');
                    setMostrarEditorMensajes(false);
                  } catch (e) {
                    Alert.alert('Error', 'No se pudieron guardar los mensajes.');
                  }
                }}
              >
                <Text style={styles.btnConfirmarText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

  const renderPestanaAnuncios = () => (
    <View style={styles.anunciosSection}>
      <View style={styles.anunciosHeader}>
        <View style={styles.schedulerTitleWrap}>
          <CalendarDays size={18} color={THEME.primary} strokeWidth={2} />
          <Text style={styles.sectionTitle}>Programacion de anuncios</Text>
        </View>
        <View style={styles.webBadge}>
          <MonitorSmartphone size={14} color={THEME.info} strokeWidth={2} />
          <Text style={styles.webBadgeText}>{Platform.OS === 'web' ? 'Web responsive' : 'Movil + web'}</Text>
        </View>
      </View>

      <View style={[styles.anunciosGrid, isDesktop && styles.anunciosGridDesktop]}>
        <View style={[styles.schedulerCard, isDesktop && styles.anunciosMainCard]}>
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
            placeholder="Escribe el mensaje que recibiran los padres"
            placeholderTextColor={THEME.textSecondary}
          />

          <TouchableOpacity
            style={styles.secondaryAction}
            onPress={() => setMostrarEditorMensajes(true)}
          >
            <MessageSquare size={16} color={THEME.primary} strokeWidth={2.3} />
            <Text style={styles.secondaryActionText}>
              Programar mensajes diarios ({mensajesDiarios.filter(m => m.trim()).length}/31)
            </Text>
          </TouchableOpacity>

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

        <View style={[styles.schedulerCard, isDesktop && styles.anunciosPreviewCard]}>
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

      <Modal visible={mostrarEditorMensajes} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <Text style={styles.modalTitle}>Mensajes diarios del mes</Text>
            <Text style={styles.modalSubtitle}>
              Ingresa un mensaje personalizado para cada dia del mes ({diasDelMesActual} dias para {mesActual}/{anioActual}).
              Deja en blanco los dias que no quieras usar.
            </Text>

            <ScrollView style={styles.mensajesDiariosContainer} showsVerticalScrollIndicator={false}>
              {mensajesDiarios.map((mensaje, index) => (
                <View key={index} style={[styles.mensajeDiaRow, index + 1 > diasDelMesActual && styles.mensajeDiaRowDisabled]}>
                  <Text style={[styles.mensajeDiaLabel, index + 1 > diasDelMesActual && styles.mensajeDiaLabelDisabled]}>
                    Dia {index + 1}{index + 1 > diasDelMesActual ? ' (no existe)' : ''}:
                  </Text>
                  <TextInput
                    style={[styles.input, styles.mensajeDiaInput]}
                    value={mensaje}
                    onChangeText={(text) => {
                      const nuevos = [...mensajesDiarios];
                      nuevos[index] = text;
                      setMensajesDiarios(nuevos);
                    }}
                    placeholder={index + 1 <= diasDelMesActual ? `Mensaje para el dia ${index + 1}` : `Dia ${index + 1} no existe en este mes`}
                    placeholderTextColor={THEME.textSecondary}
                    multiline
                  />
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.btnCancelar}
                onPress={() => setMostrarEditorMensajes(false)}
              >
                <Text style={styles.btnCancelarText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnConfirmar, { backgroundColor: THEME.primary }]}
                onPress={async () => {
                  try {
                    await fetchSuperAdmin('/api/super-admin/mensajes-diarios', {
                      method: 'PUT',
                      body: JSON.stringify({ mensajes: mensajesDiarios, mes: mesActual, anio: anioActual }),
                    });
                    Alert.alert('Guardado', 'Los mensajes diarios se han guardado correctamente.');
                    setMostrarEditorMensajes(false);
                  } catch (e) {
                    Alert.alert('Error', 'No se pudieron guardar los mensajes.');
                  }
                }}
              >
                <Text style={styles.btnConfirmarText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

  const modulos = [
    {
      title: 'Instancia principal',
      subtitle: 'KidsGo!',
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
      title: 'Sincronizacion GPS',
      subtitle: 'Calidad de datos',
      meta: `${alumnosInactivos} alumnos inactivos registrados`,
      status: 'En desarrollo',
      statusColor: THEME.info,
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
                onPress={async () => {
                  await limpiarSesion();
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
              <TouchableOpacity
                style={[styles.tabSwitcherButton, seccionActiva === 'anuncios' && styles.tabSwitcherButtonActive]}
                onPress={() => setSeccionActiva('anuncios')}
              >
                <Text style={[styles.tabSwitcherText, seccionActiva === 'anuncios' && styles.tabSwitcherTextActive]}>Anuncios</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabSwitcherButton, seccionActiva === 'independientes' && styles.tabSwitcherButtonActive]}
                onPress={() => setSeccionActiva('independientes')}
              >
                <Text style={[styles.tabSwitcherText, seccionActiva === 'independientes' && styles.tabSwitcherTextActive]}>Independientes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabSwitcherButton, seccionActiva === 'usuarios' && styles.tabSwitcherButtonActive]}
                onPress={() => setSeccionActiva('usuarios')}
              >
                <Text style={[styles.tabSwitcherText, seccionActiva === 'usuarios' && styles.tabSwitcherTextActive]}>Usuarios</Text>
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
                                  {colegio.admin_nombre || 'Sin administrador'}
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

                <TouchableOpacity style={styles.actionCard} onPress={() => setSeccionActiva('anuncios')}>
                  <View style={styles.actionIcon}>
                    <Bell size={20} color={THEME.warning} strokeWidth={2} />
                  </View>
                  <View style={styles.actionText}>
                    <Text style={styles.actionTitle}>Abrir anuncios</Text>
                    <Text style={styles.actionSubtitle}>Cambia a la pestaña donde se programa la comunicacion y las alertas de recogida.</Text>
                  </View>
                  <ChevronRight size={18} color={THEME.textSecondary} strokeWidth={2} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionCard} onPress={() => setSeccionActiva('independientes')}>
                  <View style={styles.actionIcon}>
                    <Bus size={20} color={THEME.accent} strokeWidth={2} />
                  </View>
                  <View style={styles.actionText}>
                    <Text style={styles.actionTitle}>Ver conductores independientes</Text>
                    <Text style={styles.actionSubtitle}>Revisa conductores sin colegio asignado, sus rutas propias y alumnos activos.</Text>
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
                  <View style={styles.capacityCard}>
                    <Bus size={18} color={THEME.accent} strokeWidth={2} />
                    <Text style={styles.capacityValue}>{conductoresIndependientes.length}</Text>
                    <Text style={styles.capacityLabel}>Independientes</Text>
                  </View>
                </View>
              </>
            ) : seccionActiva === 'colegios' ? (
              renderPestanaColegios()
            ) : seccionActiva === 'anuncios' ? (
              renderPestanaAnuncios()
            ) : seccionActiva === 'independientes' ? (
              renderPestanaConductoresIndependientes()
            ) : (
              renderPestanaUsuarios()
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
    paddingTop: 28,
    paddingHorizontal: 18,
    paddingBottom: 12,
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
    marginBottom: 8,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutButton: {
    width: 38,
    height: 38,
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
    marginBottom: 3,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    lineHeight: 16,
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
    flexWrap: 'wrap',
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
    minWidth: 74,
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
  anunciosSection: {
    gap: 14,
  },
  anunciosHeader: {
    backgroundColor: THEME.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  anunciosGrid: {
    gap: 14,
  },
  anunciosGridDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  anunciosMainCard: {
    flex: 1.1,
  },
  anunciosPreviewCard: {
    flex: 0.9,
  },
  usuariosSection: {
    gap: 12,
  },
  usuariosHeader: {
    backgroundColor: THEME.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    gap: 12,
  },
  usuariosSubtitle: {
    fontSize: 12,
    color: THEME.textSecondary,
    lineHeight: 18,
    marginTop: 4,
  },
  usuariosRefreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: THEME.background,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  usuariosRefreshButtonText: {
    color: THEME.primary,
    fontWeight: '800',
    fontSize: 14,
  },
  usuariosFilters: {
    gap: 10,
  },
  usuariosFiltersDesktop: {
    flexDirection: 'row',
  },
  usuariosFilterInput: {
    flex: 1,
    marginBottom: 0,
  },
  usuariosGrid: {
    gap: 12,
  },
  usuariosGridDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  usuariosPanel: {
    backgroundColor: THEME.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    gap: 10,
  },
  usuariosPanelDesktop: {
    flex: 1,
  },
  usuariosSidebarPanel: {
    flex: 0.82,
    maxWidth: 360,
  },
  usuariosMainPanel: {
    flex: 1.18,
  },
  usuariosPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  usuariosColumnTitle: {
    fontSize: 15,
    color: THEME.text,
    fontWeight: '800',
  },
  usuariosColumnMeta: {
    fontSize: 12,
    color: THEME.textSecondary,
    fontWeight: '600',
    textAlign: 'right',
  },
  usuariosEmptyCard: {
    backgroundColor: THEME.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 16,
    alignItems: 'center',
  },
  usuariosEmptyTitle: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  usuariosEmptyText: {
    color: THEME.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  usuarioCollegeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.background,
  },
  usuarioCollegeCardActive: {
    borderColor: THEME.secondary,
    backgroundColor: '#F0FDF4',
  },
  usuarioCollegeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  usuarioCollegeName: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: '800',
  },
  usuarioCollegeMeta: {
    color: THEME.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  usuariosResumenCard: {
    backgroundColor: THEME.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 14,
  },
  usuariosResumenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  usuariosResumenTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.text,
  },
  usuariosResumenText: {
    fontSize: 12,
    color: THEME.textSecondary,
    marginTop: 4,
  },
  usuariosResumenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  usuariosResumenBadgeText: {
    color: THEME.info,
    fontWeight: '800',
    fontSize: 12,
  },
  usuariosResumenHint: {
    marginTop: 10,
    color: THEME.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  usuarioCard: {
    backgroundColor: THEME.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 14,
    gap: 10,
  },
  usuarioCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  usuarioAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  usuarioNombre: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.text,
  },
  usuarioInfoBlock: {
    flex: 1,
    gap: 2,
  },
  usuarioMeta: {
    fontSize: 12,
    color: THEME.textSecondary,
    lineHeight: 18,
  },
  usuarioRolBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  usuarioRolBadgeText: {
    fontWeight: '800',
    fontSize: 12,
  },
  usuarioActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  usuarioActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.background,
  },
  usuarioActionButtonWarn: {
    borderColor: '#FED7AA',
    backgroundColor: '#FFF7ED',
  },
  usuarioActionButtonWarnText: {
    color: THEME.warning,
    fontWeight: '800',
    fontSize: 13,
  },
  usuarioActionHint: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  usuarioActionHintText: {
    color: THEME.info,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  conductorMetaGrid: {
    gap: 4,
  },
  conductorRutasBlock: {
    gap: 8,
    backgroundColor: THEME.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 12,
  },
  conductorRutasTitle: {
    color: THEME.text,
    fontSize: 13,
    fontWeight: '800',
  },
  conductorRutaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  conductorRutaText: {
    color: THEME.info,
    fontSize: 12,
    fontWeight: '800',
  },
  tempPasswordLabel: {
    fontSize: 12,
    color: THEME.textSecondary,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tempPasswordValue: {
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    color: THEME.secondary,
    letterSpacing: 2.5,
    marginVertical: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: THEME.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  tempPasswordHint: {
    textAlign: 'center',
    color: THEME.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  mensajesDiariosContainer: {
    maxHeight: 400,
    marginVertical: 12,
  },
  mensajeDiaRow: {
    marginBottom: 12,
  },
  mensajeDiaLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.text,
    marginBottom: 4,
  },
  mensajeDiaInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  mensajeDiaRowDisabled: {
    opacity: 0.4,
  },
  mensajeDiaLabelDisabled: {
    color: THEME.textSecondary,
    textDecorationLine: 'line-through',
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
    flexWrap: 'wrap',
    gap: 10,
  },
  conductoresCountersRow: {
    alignItems: 'stretch',
  },
  colegiosCounterCard: {
    flex: 1,
    minWidth: 150,
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
  colegioActionsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  colegioCodigoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  colegioActionButton: {
    flex: 1,
  },
  colegioCodigoButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  colegioEliminarButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  colegioMetadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginVertical: 4,
  },
  colegioMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  btnImpersonate: {
    backgroundColor: THEME.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
  },
  btnAsignar: {
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
  },
  colegioActionButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  colegioActionsRowSecondary: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    justifyContent: 'flex-start',
  },
  colegioActionButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  btnSmallText: {
    fontSize: 11,
    fontWeight: '700',
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
