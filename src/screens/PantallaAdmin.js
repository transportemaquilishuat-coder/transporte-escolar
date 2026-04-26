import socket from '../config/socket';
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Switch, Modal,
  TextInput, Alert, Dimensions, StatusBar, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapView, { Marker, PROVIDER_GOOGLE } from '../components/MapaSeguro';
import * as ImagePicker from 'expo-image-picker';
import {
    Users, GraduationCap, Map as MapIcon, User, Settings,
    LogOut, Plus, Edit2, Trash2, Bus, MapPin,
    ChevronRight, X, Check, Camera, Link as LinkIcon,
    Bell, Activity, Route, School
} from 'lucide-react-native';
import { useBranding } from '../hooks/useBranding';
import { limpiarSesion, obtenerToken } from '../services/session';

const SERVIDOR = 'https://transporte-backend-production.up.railway.app';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Tema 
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
};

const obtenerAuthHeaders = async () => {
    const token = obtenerToken() || await AsyncStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function PantallaAdmin({ navigation }) {
    const mapRef = useRef(null);
    const { branding, saveBrandingChanges } = useBranding();

    // Data
    const [conductoresActivos, setConductoresActivos] = useState([]);
    const [dashboard, setDashboard] = useState(null);
    const [rutas, setRutas] = useState([]);
    const [alumnos, setAlumnos] = useState([]);
    const [conductores, setConductores] = useState([]);
    const [configuracion, setConfiguracion] = useState([]);


    // UI
    const [loading, setLoading] = useState(true);
    const [seccion, setSeccion] = useState('dashboard');
    const [colorHeader, setColorHeader] = useState(THEME.primaryDark);
    const [logoUri, setLogoUri] = useState(null);
    const [logoUrl, setLogoUrl] = useState('');
    const [schoolName, setSchoolName] = useState('');
    const [modalLogo, setModalLogo] = useState(false);
    const [inputLogoUrl, setInputLogoUrl] = useState('');

    // Modal alumno
    const [modalAlumno, setModalAlumno] = useState(false);
    const [alumnoEditando, setAlumnoEditando] = useState(null);
    const [formNombre, setFormNombre] = useState('');
    const [formGrado, setFormGrado] = useState('');
    const [formParada, setFormParada] = useState('');
    const [formRutaId, setFormRutaId] = useState('1');
    const [loadingForm, setLoadingForm] = useState(false);

    // Modal conductor en mapa
    const [conductorSeleccionado, setConductorSeleccionado] = useState(null);
    const [modalConductor, setModalConductor] = useState(false);
    const [alumnosBus, setAlumnosBus] = useState([]);

    useEffect(() => {
        cargarDatos();

        const manejarConductoresActivos = (conductores) => {
            if (!Array.isArray(conductores)) return;
            setConductoresActivos(conductores);
            ajustarMapa(conductores);
        };

        const manejarUbicacionBus = (ubicacion) => {
            if (!ubicacion?.conductorId) return;

            setConductoresActivos((prev) => {
                const existe = prev.find((c) => c.id === ubicacion.conductorId);
                const siguiente = existe
                    ? prev.map((c) =>
                        c.id === ubicacion.conductorId
                            ? { ...c, ...ubicacion, activo: true }
                            : c
                    )
                    : [...prev, { ...ubicacion, id: ubicacion.conductorId, activo: true }];

                ajustarMapa(siguiente);
                return siguiente;
            });

            if (mapRef.current && ubicacion.latitude && ubicacion.longitude) {
                mapRef.current.animateToRegion({
                    latitude: ubicacion.latitude,
                    longitude: ubicacion.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                }, 800);
            }
        };

        socket.connect();
        socket.on('admin:conductores_activos', manejarConductoresActivos);
        socket.on('bus:ubicacion', manejarUbicacionBus);
        socket.emit('admin:solicitar_conductores');

        const intervalo = setInterval(cargarConductoresActivos, 10000);

        return () => {
            clearInterval(intervalo);
            socket.off('admin:conductores_activos', manejarConductoresActivos);
            socket.off('bus:ubicacion', manejarUbicacionBus);
            socket.disconnect();
        };
    }, []);

    useEffect(() => {
        setColorHeader(branding.headerColor || THEME.primaryDark);
        setLogoUrl(branding.logoUri || '');
        setLogoUri(null);
        setSchoolName(branding.schoolName || 'Tu colegio');
    }, [branding]);

    const cargarDatos = async () => {
        setLoading(true);
        try {
            const authHeaders = await obtenerAuthHeaders();
            const [dash, rut, alum, cond, config] = await Promise.all([
                fetch(`${SERVIDOR}/api/admin/dashboard`, { headers: authHeaders }).then(r => r.json()),
                fetch(`${SERVIDOR}/api/admin/rutas`, { headers: authHeaders }).then(r => r.json()),
                fetch(`${SERVIDOR}/api/admin/alumnos`, { headers: authHeaders }).then(r => r.json()),
                fetch(`${SERVIDOR}/api/admin/conductores`, { headers: authHeaders }).then(r => r.json()),
                fetch(`${SERVIDOR}/api/admin/configuracion`, { headers: authHeaders }).then(r => r.json()),
            ]);
            setDashboard(dash);
            setRutas(rut.rutas || []);
            setAlumnos(alum.alumnos || []);
            setConductores(cond.conductores || []);
            setConfiguracion(config.configuracion || []);
        } catch (e) {
            console.log('Error:', e);
        } finally {
            setLoading(false);
        }
    };

    const cargarConductoresActivos = async () => {
        try {
            const authHeaders = await obtenerAuthHeaders();
            const res = await fetch(`${SERVIDOR}/api/admin/conductores-activos`, { headers: authHeaders });
            const datos = await res.json();
            setConductoresActivos(datos.conductores || []);
        } catch (e) { }
    };
    const ajustarMapa = (conductores) => {
        if (!mapRef.current || !conductores?.length) return;

        const coords = conductores
            .filter(c => c.latitude && c.longitude)
            .map(c => ({ latitude: c.latitude, longitude: c.longitude }));

        if (!coords.length) return;

        mapRef.current.fitToCoordinates(coords, {
            edgePadding: { top: 90, right: 48, bottom: 120, left: 48 },
            animated: true,
        });
    };
    const calcularDistancia = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;

        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };
    const calcularETA = (distanciaKm) => {
        const velocidadPromedio = 25; // km/h
        return Math.round((distanciaKm / velocidadPromedio) * 60);
    };
    const actualizarConfig = async (clave, nuevoValor) => {
        try {
            const authHeaders = await obtenerAuthHeaders();
            await fetch(`${SERVIDOR}/api/admin/configuracion/${clave}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ valor: nuevoValor.toString() }),
            });
            setConfiguracion(prev => prev.map(c =>
                c.clave === clave ? { ...c, valor: nuevoValor.toString() } : c
            ));
        } catch (e) { }
    };

    // ── Logo ──────────────────────────────────────────────────
    const seleccionarLogoGaleria = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });
        if (!result.canceled) {
            const selectedUri = result.assets[0].uri;
            setLogoUri(selectedUri);
            setLogoUrl('');
            setModalLogo(false);
            saveBrandingChanges({ logoUri: selectedUri });
        }
    };

    const guardarLogoUrl = () => {
        if (inputLogoUrl.trim()) {
            const nextLogo = inputLogoUrl.trim();
            setLogoUrl(nextLogo);
            setLogoUri(null);
            setModalLogo(false);
            saveBrandingChanges({ logoUri: nextLogo });
        }
    };

    const logoFuente = logoUri ? { uri: logoUri } : logoUrl ? { uri: logoUrl } : null;

    const aplicarColorMarca = (color) => {
        setColorHeader(color);
        saveBrandingChanges({ headerColor: color, appName: 'kidGo' });
    };

    const guardarNombreColegio = async () => {
        const nombre = schoolName.trim();
        if (!nombre) {
            Alert.alert('Dato requerido', 'Ingresa el nombre del colegio.');
            return;
        }

        await saveBrandingChanges({
            schoolName: nombre,
            appName: 'kidGo',
            headerColor: colorHeader,
            logoUri: logoUri || logoUrl || '',
        });

        Alert.alert('Listo', 'Se guardo el branding de kidGo para toda la app.');
    };

    // ── Alumnos CRUD ─────────────────────────────────────────
    const abrirModalNuevo = () => {
        setAlumnoEditando(null);
        setFormNombre(''); setFormGrado(''); setFormParada(''); setFormRutaId('1');
        setModalAlumno(true);
    };

    const abrirModalEditar = (alumno) => {
        setAlumnoEditando(alumno);
        setFormNombre(alumno.nombre);
        setFormGrado(alumno.grado || '');
        setFormParada(alumno.parada || '');
        setFormRutaId(alumno.ruta_id?.toString() || '1');
        setModalAlumno(true);
    };

    const guardarAlumno = async () => {
        if (!formNombre.trim()) { Alert.alert('Error', 'El nombre es requerido'); return; }
        setLoadingForm(true);
        try {
            if (alumnoEditando) {
                await fetch(`${SERVIDOR}/api/admin/alumnos/${alumnoEditando.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
                    body: JSON.stringify({ nombre: formNombre, grado: formGrado, parada: formParada, ruta_id: parseInt(formRutaId), orden: alumnoEditando.orden, activo: true }),
                });
                Alert.alert('Listo', 'Alumno actualizado');
            } else {
                await fetch(`${SERVIDOR}/api/admin/alumnos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
                    body: JSON.stringify({ nombre: formNombre, grado: formGrado, parada: formParada, ruta_id: parseInt(formRutaId), padre_id: 3, orden: alumnos.length + 1 }),
                });
                Alert.alert('Listo', 'Alumno agregado');
            }
            setModalAlumno(false);
            cargarDatos();
        } catch (e) {
            Alert.alert('Error', 'No se pudo guardar');
        } finally {
            setLoadingForm(false);
        }
    };

    const desactivarAlumno = (alumno) => {
        Alert.alert('Desactivar', `¿Desactivar a ${alumno.nombre}?`, [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Desactivar', style: 'destructive', onPress: async () => {
                    await fetch(`${SERVIDOR}/api/admin/alumnos/${alumno.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
                        body: JSON.stringify({ ...alumno, activo: false }),
                    });
                    cargarDatos();
                }
            }
        ]);
    };

    const verAlumnosEnBus = async (conductor) => {
        setConductorSeleccionado(conductor);
        let alumnosRuta = [];
        try {
            const res = await fetch(`${SERVIDOR}/api/asignaciones/conductor/${conductor.id}`, {
                headers: await obtenerAuthHeaders(),
            });
            const datos = await res.json();
            alumnosRuta = datos.alumnos || [];
        } catch (e) { }
        setModalConductor(true);
        const alumnosConETA = alumnosRuta.map(alumno => {
            if (!conductor?.latitude || !conductor?.longitude || !alumno.latitude || !alumno.longitude) {
                return alumno;
            }
            const distancia = calcularDistancia(
                conductor.latitude,
                conductor.longitude,
                alumno.latitude,
                alumno.longitude
            );
            const eta = calcularETA(distancia);
            return { ...alumno, eta };
        });

        setAlumnosBus(alumnosConETA);
    };

    const coloresDisponibles = [
        { nombre: 'Grafito', color: THEME.primaryDark },
        { nombre: 'Azul', color: THEME.secondary },
        { nombre: 'Verde', color: THEME.success },
        { nombre: 'Rojo', color: THEME.error },
        { nombre: 'Ambar', color: THEME.warning },
    ];

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={THEME.primary} />
                <Text style={styles.loadingTexto}>Cargando panel...</Text>
            </View>
        );
    }

    return (
        <>
            <StatusBar barStyle="light-content" backgroundColor={colorHeader} />
            <View style={styles.container}>

                {/* HEADER */}
                <View style={[styles.header, { backgroundColor: colorHeader }]}>
                    <View style={styles.headerLeft}>
                        <TouchableOpacity onPress={() => setModalLogo(true)} style={styles.logoContainer}>
                            {logoFuente ? (
                                <Image source={logoFuente} style={styles.logoImagen} />
                            ) : (
                                <View style={styles.logoPlaceholder}>
                                    <School size={24} color="#fff" strokeWidth={1.5} />
                                </View>
                            )}
                        </TouchableOpacity>
                        <View style={styles.headerTextContainer}>
                            <Text style={styles.bienvenida}>Panel Administrativo</Text>
                            <Text style={styles.nombreAdmin}>Centro de control</Text>
                            <View style={styles.adminBadge}>
                                <View style={[styles.statusDot, { backgroundColor: conductoresActivos.length > 0 ? THEME.success : THEME.textSecondary }]} />
                                <Text style={styles.adminBadgeTexto}>
                                    {conductoresActivos.length > 0
                                        ? `${conductoresActivos.length} unidad(es) activa(s)`
                                        : 'Sin unidades activas'}
                                </Text>
                            </View>
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

                {/* TABS */}
                <View style={styles.tabsContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                        {[
                            { key: 'dashboard', label: 'Resumen', Icon: Activity },
                            { key: 'mapa', label: 'Mapa', Icon: MapIcon },
                            { key: 'alumnos', label: 'Alumnos', Icon: GraduationCap },
                            { key: 'rutas', label: 'Rutas', Icon: Route },
                            { key: 'conductores', label: 'Conductores', Icon: User },
                            { key: 'config', label: 'Ajustes', Icon: Settings },
                        ].map(({ key, label, Icon }) => {
                            const isActive = seccion === key;
                            return (
                                <TouchableOpacity
                                    key={key}
                                    style={[styles.tab, isActive && { backgroundColor: colorHeader }]}
                                    onPress={() => setSeccion(key)}
                                >
                                    <Icon size={18} color={isActive ? '#fff' : THEME.textSecondary} strokeWidth={2} />
                                    <Text style={[styles.tabTexto, isActive && styles.tabTextoActivo]}>
                                        {label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* CONTENIDO */}
                {seccion === 'mapa' ? (
                    <View style={styles.mapaFullContainer}>
                        <MapView
                            ref={mapRef}
                            provider={PROVIDER_GOOGLE}
                            style={styles.mapaFull}
                            initialRegion={{
                                latitude: 13.6929, longitude: -89.2182,
                                latitudeDelta: 0.05, longitudeDelta: 0.05,
                            }}
                        >
                            {conductoresActivos
                                .filter((conductor) => conductor?.latitude && conductor?.longitude)
                                .map((conductor, i) => (
                                    <Marker
                                        key={i}
                                        coordinate={{ latitude: conductor.latitude, longitude: conductor.longitude }}
                                        title={conductor.nombre}
                                        description={conductor.ruta}
                                        onPress={() => {
                                            verAlumnosEnBus(conductor);
                                        }}
                                    >
                                        <View style={styles.marcadorConductor}>
                                            <Bus size={24} color={THEME.secondary} strokeWidth={2} fill={THEME.secondary + '20'} />
                                        </View>
                                    </Marker>
                                ))}
                        </MapView>

                        {/* Panel flotante sobre el mapa */}
                        <View style={styles.mapaPanelFlotante}>
                            <View style={styles.mapaPanelHeader}>
                                <Bus size={20} color={THEME.primary} strokeWidth={2} />
                                <Text style={styles.mapaPanelTitulo}>
                                    {conductoresActivos.length > 0
                                        ? `${conductoresActivos.length} unidad(es) en ruta`
                                        : 'Sin unidades activas'}
                                </Text>
                            </View>
                            <Text style={styles.mapaPanelSub}>Toca una unidad para ver detalles</Text>
                        </View>

                        {/* Lista flotante inferior */}
                        {conductoresActivos.length > 0 && (
                            <View style={styles.mapaListaFlotante}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    {conductoresActivos.map((c, i) => (
                                        <TouchableOpacity key={i} style={styles.mapaChip} onPress={() => verAlumnosEnBus(c)}>
                                            <View style={styles.mapaChipPunto} />
                                            <Text style={styles.mapaChipTexto}>{c.nombre}</Text>
                                            <ChevronRight size={14} color={THEME.textSecondary} />
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        {conductoresActivos.length === 0 && (
                            <View style={styles.mapaVacio}>
                                <Bus size={48} color={THEME.border} strokeWidth={1.5} />
                                <Text style={styles.mapaVacioTexto}>
                                    Cuando un conductor inicie su ruta aparecerá aquí
                                </Text>
                            </View>
                        )}
                    </View>
                ) : (
                    <ScrollView style={styles.contenido} showsVerticalScrollIndicator={false}>

                        {/* DASHBOARD */}
                        {seccion === 'dashboard' && dashboard && (
                            <View style={styles.seccionContainer}>
                                <View style={styles.statsGrid}>
                                    {[
                                        { label: 'Usuarios', valor: dashboard.totalUsuarios, Icon: Users, color: THEME.surface, accent: THEME.secondary },
                                        { label: 'Alumnos', valor: dashboard.totalAlumnos, Icon: GraduationCap, color: THEME.surface, accent: THEME.success },
                                        { label: 'Rutas', valor: dashboard.totalRutas, Icon: Route, color: THEME.surface, accent: THEME.primary },
                                        { label: 'Ausencias', valor: dashboard.ausenciasHoy, Icon: Bell, color: '#FFF5EB', accent: THEME.warning },
                                    ].map((s, i) => (
                                        <View key={i} style={[styles.statCard, { backgroundColor: s.color }]}>
                                            <s.Icon size={22} color={s.accent} strokeWidth={1.7} />
                                            <Text style={[styles.statValor, { color: s.accent }]}>{s.valor}</Text>
                                            <Text style={styles.statLabel}>{s.label}</Text>
                                        </View>
                                    ))}
                                </View>

                                <View style={styles.alertaCard}>
                                    <View style={styles.alertaHeader}>
                                        <Activity size={18} color={conductoresActivos.length > 0 ? THEME.success : THEME.textSecondary} strokeWidth={2} />
                                        <Text style={styles.alertaTitulo}>
                                            {conductoresActivos.length > 0
                                                ? `${conductoresActivos.length} conductor(es) activo(s)`
                                                : 'Sin conductores activos'}
                                        </Text>
                                    </View>
                                    {conductoresActivos.map((c, i) => (
                                        <View key={i} style={styles.alertaItem}>
                                            <View style={[styles.statusDotSmall, { backgroundColor: THEME.success }]} />
                                            <Text style={styles.alertaItemText}>{c.nombre} — {c.ruta}</Text>
                                        </View>
                                    ))}
                                </View>

                                <View style={styles.accionesGrid}>
                                    {[
                                        { Icon: MapIcon, label: 'Mapa', key: 'mapa' },
                                        { Icon: GraduationCap, label: 'Alumnos', key: 'alumnos' },
                                        { Icon: Route, label: 'Rutas', key: 'rutas' },
                                        { Icon: Settings, label: 'Ajustes', key: 'config' },
                                    ].map(({ Icon, label, key }, i) => (
                                        <TouchableOpacity key={i} style={styles.accionCard} onPress={() => setSeccion(key)}>
                                            <View style={styles.accionIconContainer}>
                                                <Icon size={28} color={THEME.primary} strokeWidth={1.5} />
                                            </View>
                                            <Text style={styles.accionLabel}>{label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <TouchableOpacity style={[styles.btnRefresh, { backgroundColor: colorHeader }]} onPress={cargarDatos}>
                                    <Text style={styles.btnRefreshTexto}>Actualizar datos</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* ALUMNOS */}
                        {seccion === 'alumnos' && (
                            <View style={styles.seccionContainer}>
                                <View style={styles.seccionHeader}>
                                    <Text style={styles.seccionTitulo}>Alumnos ({alumnos.length})</Text>
                                    <TouchableOpacity style={[styles.btnAgregar, { backgroundColor: colorHeader }]} onPress={abrirModalNuevo}>
                                        <Plus size={18} color="#fff" strokeWidth={2.5} />
                                        <Text style={styles.btnAgregarTexto}>Agregar</Text>
                                    </TouchableOpacity>
                                </View>
                                {alumnos.map((alumno, i) => (
                                    <View key={i} style={styles.alumnoCard}>
                                        <View style={[styles.alumnoAvatar, { backgroundColor: colorHeader }]}>
                                            <Text style={styles.alumnoAvatarTexto}>{alumno.nombre.charAt(0)}</Text>
                                        </View>
                                        <View style={styles.itemInfo}>
                                            <Text style={styles.itemNombre}>{alumno.nombre}</Text>
                                            <Text style={styles.itemSub}>{alumno.grado}</Text>
                                            <View style={styles.itemDetailRow}>
                                                <Route size={12} color={THEME.textSecondary} strokeWidth={2} />
                                                <Text style={styles.itemSub}>{alumno.ruta_nombre}</Text>
                                            </View>
                                            <View style={styles.itemDetailRow}>
                                                <MapPin size={12} color={THEME.textSecondary} strokeWidth={2} />
                                                <Text style={styles.itemSub}>{alumno.parada}</Text>
                                            </View>
                                        </View>
                                        <View style={styles.alumnoAcciones}>
                                            <TouchableOpacity style={styles.btnEditar} onPress={() => abrirModalEditar(alumno)}>
                                                <Edit2 size={16} color={THEME.secondary} strokeWidth={2} />
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.btnEliminar} onPress={() => desactivarAlumno(alumno)}>
                                                <Trash2 size={16} color={THEME.error} strokeWidth={2} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* RUTAS */}
                        {seccion === 'rutas' && (
                            <View style={styles.seccionContainer}>
                                <Text style={styles.seccionTitulo}>Rutas activas ({rutas.length})</Text>
                                {rutas.map((ruta, i) => (
                                    <View key={i} style={styles.itemCard}>
                                        <View style={[styles.itemIndicador, { backgroundColor: colorHeader }]} />
                                        <View style={styles.itemInfo}>
                                            <Text style={styles.itemNombre}>{ruta.nombre}</Text>
                                            <View style={styles.itemDetailRow}>
                                                <User size={12} color={THEME.textSecondary} strokeWidth={2} />
                                                <Text style={styles.itemSub}>{ruta.conductor_nombre}</Text>
                                            </View>
                                            <View style={styles.itemDetailRow}>
                                                <GraduationCap size={12} color={THEME.textSecondary} strokeWidth={2} />
                                                <Text style={styles.itemSub}>{ruta.total_alumnos} alumnos</Text>
                                            </View>
                                        </View>
                                        <View style={[styles.badge, { backgroundColor: '#E6F4EA' }]}>
                                            <Text style={[styles.badgeTexto, { color: THEME.success }]}>Activa</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* CONDUCTORES */}
                        {seccion === 'conductores' && (
                            <View style={styles.seccionContainer}>
                                <Text style={styles.seccionTitulo}>Conductores ({conductores.length})</Text>
                                <TouchableOpacity
                                    style={[styles.btnAgregar, { backgroundColor: colorHeader, justifyContent: 'center', marginBottom: 12 }]}
                                    onPress={() => navigation.navigate('AdminConductores')}
                                >
                                    <LinkIcon size={16} color="#fff" strokeWidth={2} />
                                    <Text style={styles.btnAgregarTexto}>Crear codigos y vincular conductores</Text>
                                </TouchableOpacity>
                                {conductores.map((conductor, i) => (
                                    <View key={i} style={styles.itemCard}>
                                        <View style={[styles.alumnoAvatar, { backgroundColor: colorHeader }]}>
                                            <Text style={styles.alumnoAvatarTexto}>{conductor.nombre.charAt(0)}</Text>
                                        </View>
                                        <View style={styles.itemInfo}>
                                            <Text style={styles.itemNombre}>{conductor.nombre}</Text>
                                            <Text style={styles.itemSub}>DUI: {conductor.dui}</Text>
                                            <Text style={styles.itemSub}>Licencia: {conductor.licencia || 'No registrada'}</Text>
                                            <Text style={styles.itemSub}>Placa: {conductor.placa || 'No registrada'}</Text>
                                            <Text style={styles.itemSub}>Tel: {conductor.telefono}</Text>
                                        </View>
                                        <View style={[styles.badge, { backgroundColor: conductor.activo ? '#E6F4EA' : '#FEECEC' }]}>
                                            <Text style={[styles.badgeTexto, { color: conductor.activo ? THEME.success : THEME.error }]}>
                                                {conductor.activo ? 'Activo' : 'Inactivo'}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* CONFIG */}
                        {seccion === 'config' && (
                            <View style={styles.seccionContainer}>

                                {/* Logo del colegio */}
                                <Text style={styles.seccionTitulo}>Logo institucional</Text>
                                <View style={styles.logoSeccion}>
                                    <TouchableOpacity style={styles.logoPreview} onPress={() => setModalLogo(true)}>
                                        {logoFuente ? (
                                            <Image source={logoFuente} style={styles.logoPreviewImagen} />
                                        ) : (
                                            <View style={styles.logoPreviewVacio}>
                                                <School size={40} color={THEME.textSecondary} strokeWidth={1.5} />
                                                <Text style={styles.logoPreviewTexto}>Toca para agregar logo</Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                    {logoFuente && (
                                        <TouchableOpacity
                                            style={styles.btnQuitarLogo}
                                            onPress={() => {
                                                setLogoUri(null);
                                                setLogoUrl('');
                                                saveBrandingChanges({ logoUri: '' });
                                            }}
                                        >
                                            <Trash2 size={16} color={THEME.error} strokeWidth={2} />
                                            <Text style={styles.btnQuitarLogoTexto}>Quitar logo</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>

                                <Text style={styles.seccionTitulo}>Identidad de la app</Text>
                                <Text style={styles.formLabel}>Nombre del colegio</Text>
                                <TextInput
                                    style={styles.formInput}
                                    placeholder="Ej: Colegio KidGo"
                                    value={schoolName}
                                    onChangeText={setSchoolName}
                                    placeholderTextColor={THEME.textSecondary}
                                />
                                <TouchableOpacity
                                    style={[styles.btnGuardarUrl, { backgroundColor: colorHeader, marginBottom: 20 }]}
                                    onPress={guardarNombreColegio}
                                >
                                    <Check size={18} color="#fff" strokeWidth={2} />
                                    <Text style={styles.btnGuardarUrlTexto}>Guardar branding kidGo</Text>
                                </TouchableOpacity>

                                {/* Color de la app */}
                                <Text style={styles.seccionTitulo}>Tema de la aplicación</Text>
                                <View style={styles.coloresRow}>
                                    {coloresDisponibles.map((c, i) => (
                                        <TouchableOpacity
                                            key={i}
                                            style={[styles.colorChip, colorHeader === c.color && styles.colorChipActivo]}
                                            onPress={() => aplicarColorMarca(c.color)}
                                        >
                                            <View style={[styles.colorSwatch, { backgroundColor: c.color }]} />
                                            <Text style={[styles.colorChipTexto, colorHeader === c.color && styles.colorChipTextoActivo]}>
                                                {c.nombre}
                                            </Text>
                                            {colorHeader === c.color && <Check size={14} color={c.color} strokeWidth={3} />}
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* Switches */}
                                <Text style={styles.seccionTitulo}>Permisos y funciones</Text>
                                <View style={styles.configCard}>
                                    {configuracion.map((config, i) => (
                                        <View key={i} style={[
                                            styles.configRow,
                                            i > 0 && { borderTopWidth: 1, borderTopColor: THEME.border }
                                        ]}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.configLabel}>{config.descripcion}</Text>
                                            </View>
                                            <View style={styles.switchCompacto}>
                                                <Switch
                                                    value={config.valor === 'true'}
                                                    onValueChange={(v) => actualizarConfig(config.clave, v)}
                                                    trackColor={{ false: '#D1D1D6', true: colorHeader }}
                                                    thumbColor="#fff"
                                                    style={styles.switchEscala}
                                                />
                                            </View>
                                        </View>
                                    ))}
                                </View>

                            </View>
                        )}

                    </ScrollView>
                )}

                {/* MODAL LOGO */}
                <Modal visible={modalLogo} transparent animationType="slide">
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalCard}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitulo}>Logo institucional</Text>
                                <TouchableOpacity onPress={() => setModalLogo(false)} style={styles.modalCloseBtn}>
                                    <X size={24} color={THEME.textSecondary} strokeWidth={2} />
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.modalSubtitulo}>Selecciona el origen de la imagen</Text>

                            <TouchableOpacity style={[styles.btnOpcionLogo, { backgroundColor: THEME.surface }]} onPress={seleccionarLogoGaleria}>
                                <View style={styles.btnOpcionIconContainer}>
                                    <Camera size={24} color={THEME.primary} strokeWidth={2} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.btnOpcionLogoTitulo}>Galería de fotos</Text>
                                    <Text style={styles.btnOpcionLogoSub}>Selecciona una imagen de tu dispositivo</Text>
                                </View>
                                <ChevronRight size={20} color={THEME.textSecondary} />
                            </TouchableOpacity>

                            <View style={styles.separador}>
                                <View style={styles.separadorLinea} />
                                <Text style={styles.separadorTexto}>o</Text>
                                <View style={styles.separadorLinea} />
                            </View>

                            <Text style={styles.formLabel}>URL de la imagen</Text>
                            <TextInput
                                style={styles.formInput}
                                placeholder="https://ejemplo.com/logo.png"
                                value={inputLogoUrl}
                                onChangeText={setInputLogoUrl}
                                autoCapitalize="none"
                                placeholderTextColor={THEME.textSecondary}
                            />
                            <TouchableOpacity
                                style={[styles.btnGuardarUrl, { backgroundColor: colorHeader }]}
                                onPress={guardarLogoUrl}
                            >
                                <LinkIcon size={18} color="#fff" strokeWidth={2} />
                                <Text style={styles.btnGuardarUrlTexto}>Guardar URL</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                {/* MODAL ALUMNO */}
                <Modal visible={modalAlumno} transparent animationType="slide">
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalCard}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitulo}>{alumnoEditando ? 'Editar alumno' : 'Nuevo alumno'}</Text>
                                <TouchableOpacity onPress={() => setModalAlumno(false)} style={styles.modalCloseBtn}>
                                    <X size={24} color={THEME.textSecondary} strokeWidth={2} />
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.formLabel}>Nombre completo *</Text>
                            <TextInput
                                style={styles.formInput}
                                value={formNombre}
                                onChangeText={setFormNombre}
                                placeholder="Ej: Pedro García"
                                placeholderTextColor={THEME.textSecondary}
                            />

                            <Text style={styles.formLabel}>Grado</Text>
                            <TextInput
                                style={styles.formInput}
                                value={formGrado}
                                onChangeText={setFormGrado}
                                placeholder="Ej: 3ro primaria"
                                placeholderTextColor={THEME.textSecondary}
                            />

                            <Text style={styles.formLabel}>Parada</Text>
                            <TextInput
                                style={styles.formInput}
                                value={formParada}
                                onChangeText={setFormParada}
                                placeholder="Ej: Col. San Benito"
                                placeholderTextColor={THEME.textSecondary}
                            />

                            <Text style={styles.formLabel}>Ruta</Text>
                            <View style={styles.rutaSelector}>
                                {rutas.map(ruta => (
                                    <TouchableOpacity
                                        key={ruta.id}
                                        style={[styles.rutaOpcion, formRutaId === ruta.id.toString() && { backgroundColor: colorHeader }]}
                                        onPress={() => setFormRutaId(ruta.id.toString())}
                                    >
                                        <Text style={[styles.rutaOpcionTexto, formRutaId === ruta.id.toString() && { color: '#fff' }]}>
                                            {ruta.nombre}
                                        </Text>
                                        {formRutaId === ruta.id.toString() && <Check size={16} color="#fff" strokeWidth={3} />}
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={styles.modalBotones}>
                                <TouchableOpacity style={styles.btnCancelar} onPress={() => setModalAlumno(false)}>
                                    <Text style={styles.btnCancelarTexto}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.btnConfirmar, { backgroundColor: colorHeader }, loadingForm && { opacity: 0.7 }]}
                                    onPress={guardarAlumno} disabled={loadingForm}
                                >
                                    {loadingForm ? <ActivityIndicator color="#fff" /> : (
                                        <>
                                            <Check size={18} color="#fff" strokeWidth={2.5} />
                                            <Text style={styles.btnConfirmarTexto}>{alumnoEditando ? 'Guardar' : 'Agregar'}</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* MODAL ALUMNOS EN BUS */}
                <Modal visible={modalConductor} transparent animationType="slide">
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalCard}>
                            <View style={styles.modalHeader}>
                                <View>
                                    <Text style={styles.modalTitulo}>{conductorSeleccionado?.nombre}</Text>
                                    <Text style={styles.modalSubtitulo}>{conductorSeleccionado?.ruta}</Text>
                                </View>
                                <TouchableOpacity onPress={() => setModalConductor(false)} style={styles.modalCloseBtn}>
                                    <X size={24} color={THEME.textSecondary} strokeWidth={2} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.alumnosBusHeader}>
                                <GraduationCap size={18} color={THEME.primary} strokeWidth={2} />
                                <Text style={styles.formLabel}>Alumnos en ruta ({alumnosBus.length})</Text>
                            </View>

                            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                                {alumnosBus.map((alumno, i) => (
                                    <View key={i} style={styles.alumnoEnBusRow}>
                                        <View style={[styles.alumnoEnBusPunto, {
                                            backgroundColor: alumno.ausente ? THEME.error : alumno.estado === 'abordado' ? THEME.success : THEME.textSecondary
                                        }]} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.alumnoEnBusNombre}>{alumno.nombre}</Text>
                                            <View style={styles.itemDetailRow}>
                                                <MapPin size={12} color={THEME.textSecondary} strokeWidth={2} />
                                                <Text style={styles.alumnoEnBusSub}>{alumno.parada}</Text>
                                            </View>
                                            {alumno.eta != null ? (
                                                <View style={styles.itemDetailRow}>
                                                    <Clock size={12} color={THEME.warning} strokeWidth={2} />
                                                    <Text style={styles.alumnoEnBusSub}>ETA estimado: {alumno.eta} min</Text>
                                                </View>
                                            ) : null}
                                        </View>
                                        <Text style={[styles.alumnoEnBusEstado, {
                                            color: alumno.ausente ? THEME.error : alumno.estado === 'abordado' ? THEME.success : THEME.textSecondary
                                        }]}>
                                            {alumno.ausente ? 'Ausente' : alumno.estado === 'abordado' ? 'A bordo' : 'Pendiente'}
                                        </Text>
                                    </View>
                                ))}
                            </ScrollView>

                            <TouchableOpacity style={[styles.btnConfirmar, { backgroundColor: colorHeader, marginTop: 16 }]} onPress={() => setModalConductor(false)}>
                                <Text style={styles.btnConfirmarTexto}>Cerrar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

            </View>
        </>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: THEME.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: THEME.background },
    loadingTexto: { marginTop: 16, fontSize: 15, color: THEME.textSecondary, fontWeight: '500' },

    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 44,
        paddingBottom: 16,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 10 },
    headerTextContainer: { gap: 2, flex: 1 },
    logoContainer: { marginRight: 4 },
    logoImagen: { width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.24)' },
    logoPlaceholder: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        borderStyle: 'dashed',
    },
    bienvenida: { fontSize: 10, color: 'rgba(255,255,255,0.64)', fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
    nombreAdmin: { fontSize: 17, fontWeight: '700', color: '#fff' },
    adminBadge: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: 6,
    },
    adminBadgeTexto: { fontSize: 11, color: '#fff', fontWeight: '600' },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    botonSalir: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        padding: 9,
        borderRadius: 10,
        marginTop: 2,
    },

    tabsContainer: {
        backgroundColor: THEME.background,
        borderBottomWidth: 1,
        borderBottomColor: THEME.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
        zIndex: 10,
    },
    tabs: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    tab: {
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: 18,
        alignItems: 'center',
        flexDirection: 'row',
        gap: 7,
        backgroundColor: THEME.surface,
    },
    tabTexto: { fontSize: 13, color: THEME.textSecondary, fontWeight: '600' },
    tabTextoActivo: { color: '#fff' },

    contenido: { flex: 1 },
    seccionContainer: { padding: 16, paddingBottom: 32 },
    seccionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    seccionTitulo: { fontSize: 18, fontWeight: '700', color: THEME.text, marginBottom: 14, marginTop: 8 },

    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
    statCard: {
        borderRadius: 14,
        padding: 16,
        width: '47%',
        alignItems: 'flex-start',
        gap: 6,
        borderWidth: 1,
        borderColor: THEME.border,
    },
    statValor: { fontSize: 30, fontWeight: '700', color: THEME.text },
    statLabel: { fontSize: 12, color: THEME.textSecondary, fontWeight: '600' },

    alertaCard: {
        backgroundColor: THEME.surface,
        borderRadius: 14,
        padding: 14,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: THEME.border,
        gap: 8,
    },
    alertaHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    alertaTitulo: { fontSize: 15, fontWeight: '700', color: THEME.text },
    alertaItem: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    alertaItemText: { fontSize: 14, color: THEME.textSecondary, fontWeight: '500' },
    statusDotSmall: { width: 6, height: 6, borderRadius: 3 },

    accionesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
    accionCard: {
        backgroundColor: THEME.background,
        borderRadius: 14,
        padding: 16,
        width: '47%',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: THEME.border,
        gap: 10,
    },
    accionIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: THEME.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    accionLabel: { fontSize: 13, fontWeight: '600', color: THEME.text },

    btnRefresh: {
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    btnRefreshTexto: { color: '#fff', fontWeight: '700', fontSize: 14 },

    mapaFullContainer: { flex: 1, position: 'relative' },
    mapaFull: { flex: 1 },
    mapaPanelFlotante: {
        position: 'absolute',
        top: 14,
        left: 14,
        right: 14,
        backgroundColor: 'rgba(255,255,255,0.94)',
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 6,
        borderWidth: 1,
        borderColor: THEME.border,
    },
    mapaPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
    mapaPanelTitulo: { fontSize: 14, fontWeight: '700', color: THEME.text },
    mapaPanelSub: { fontSize: 12, color: THEME.textSecondary, marginLeft: 28 },
    mapaListaFlotante: {
        position: 'absolute',
        bottom: 16,
        left: 14,
        right: 14,
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderRadius: 14,
        padding: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 6,
        borderWidth: 1,
        borderColor: THEME.border,
    },
    mapaChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: THEME.background,
        borderRadius: 18,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginRight: 8,
        gap: 6,
        borderWidth: 1,
        borderColor: THEME.border,
    },
    mapaChipPunto: { width: 8, height: 8, borderRadius: 4, backgroundColor: THEME.success },
    mapaChipTexto: { fontSize: 12, fontWeight: '600', color: THEME.text },
    mapaVacio: { position: 'absolute', top: '40%', left: 0, right: 0, alignItems: 'center', padding: 24 },
    mapaVacioTexto: { fontSize: 15, color: THEME.textSecondary, textAlign: 'center', marginTop: 12, fontWeight: '500' },
    marcadorConductor: {
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

    alumnoCard: {
        backgroundColor: THEME.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: THEME.border,
    },
    alumnoAvatar: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    alumnoAvatarTexto: { fontSize: 20, fontWeight: '700', color: '#fff' },
    alumnoAcciones: { flexDirection: 'column', gap: 8 },
    btnEditar: {
        backgroundColor: THEME.surface,
        borderRadius: 10,
        padding: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: THEME.border,
    },
    btnEliminar: {
        backgroundColor: '#FFF3F0',
        borderRadius: 10,
        padding: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#FFE5E0',
    },
    btnAgregar: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    btnAgregarTexto: { color: '#fff', fontWeight: '700', fontSize: 14 },

    itemCard: {
        backgroundColor: THEME.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: THEME.border,
    },
    itemIndicador: { width: 4, height: 48, borderRadius: 2, marginRight: 14 },
    itemInfo: { flex: 1, gap: 2 },
    itemNombre: { fontSize: 15, fontWeight: '700', color: THEME.text },
    itemSub: { fontSize: 13, color: THEME.textSecondary, fontWeight: '500' },
    itemDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    badge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
    badgeTexto: { fontSize: 12, fontWeight: '700' },

    logoSeccion: { alignItems: 'center', marginBottom: 24 },
    logoPreview: {
        width: 120,
        height: 120,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: THEME.surface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: THEME.border,
        borderStyle: 'dashed',
    },
    logoPreviewImagen: { width: 120, height: 120 },
    logoPreviewVacio: { alignItems: 'center', gap: 8 },
    logoPreviewTexto: { fontSize: 13, color: THEME.textSecondary, fontWeight: '500' },
    btnQuitarLogo: {
        marginTop: 12,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#FFF3F0',
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: '#FFE5E0',
    },
    btnQuitarLogoTexto: { fontSize: 13, color: THEME.error, fontWeight: '600' },

    coloresRow: { flexDirection: 'row', gap: 8, marginBottom: 24, paddingHorizontal: 2, flexWrap: 'wrap' },
    colorChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 14,
        backgroundColor: THEME.surface,
        borderWidth: 1,
        borderColor: THEME.border,
    },
    colorChipActivo: {
        borderColor: '#D1D1D6',
        backgroundColor: '#FAFAFC',
    },
    colorSwatch: {
        width: 14,
        height: 14,
        borderRadius: 7,
    },
    colorChipTexto: { fontSize: 12, fontWeight: '600', color: THEME.textSecondary },
    colorChipTextoActivo: { color: THEME.text },

    configCard: {
        backgroundColor: THEME.surface,
        borderRadius: 14,
        padding: 4,
        borderWidth: 1,
        borderColor: THEME.border,
        marginBottom: 16,
    },
    configRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    configLabel: { fontSize: 13, fontWeight: '600', color: THEME.text },
    switchCompacto: {
        marginLeft: 12,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    switchEscala: {
        transform: [{ scaleX: 0.86 }, { scaleY: 0.86 }],
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 8,
    },
    infoLabel: { fontSize: 14, color: THEME.textSecondary, fontWeight: '500' },
    infoValor: { fontSize: 14, fontWeight: '600', color: THEME.text },

    btnOpcionLogo: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: THEME.border,
    },
    btnOpcionIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: THEME.background,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    btnOpcionLogoTitulo: { fontSize: 15, fontWeight: '700', color: THEME.text },
    btnOpcionLogoSub: { fontSize: 13, color: THEME.textSecondary, marginTop: 2, fontWeight: '500' },
    separador: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 16,
        gap: 12,
    },
    separadorLinea: { flex: 1, height: 1, backgroundColor: THEME.border },
    separadorTexto: { fontSize: 13, color: THEME.textSecondary, fontWeight: '600' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: {
        backgroundColor: THEME.background,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        maxHeight: '90%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    modalCloseBtn: {
        padding: 4,
    },
    modalTitulo: { fontSize: 20, fontWeight: '700', color: THEME.text },
    modalSubtitulo: { fontSize: 14, color: THEME.textSecondary, marginBottom: 20, fontWeight: '500' },
    formLabel: { fontSize: 14, fontWeight: '600', color: THEME.text, marginBottom: 8, marginTop: 16 },
    formInput: {
        backgroundColor: THEME.surface,
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
        color: THEME.text,
        fontWeight: '500',
    },
    rutaSelector: { flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap' },
    rutaOpcion: {
        flex: 1,
        minWidth: '45%',
        backgroundColor: THEME.surface,
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: THEME.border,
        gap: 8,
    },
    rutaOpcionTexto: { fontSize: 14, fontWeight: '600', color: THEME.text },
    modalBotones: { flexDirection: 'row', gap: 12, marginTop: 24 },
    btnCancelar: {
        flex: 1,
        backgroundColor: THEME.surface,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: THEME.border,
    },
    btnCancelarTexto: { fontSize: 15, color: THEME.textSecondary, fontWeight: '600' },
    btnConfirmar: {
        flex: 1,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    btnConfirmarTexto: { fontSize: 15, color: '#fff', fontWeight: '700' },
    btnGuardarUrl: {
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 12,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    btnGuardarUrlTexto: { color: '#fff', fontWeight: '700', fontSize: 15 },

    alumnosBusHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    alumnoEnBusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: THEME.border,
    },
    alumnoEnBusPunto: { width: 10, height: 10, borderRadius: 5 },
    alumnoEnBusNombre: { fontSize: 15, fontWeight: '600', color: THEME.text },
    alumnoEnBusSub: { fontSize: 13, color: THEME.textSecondary, marginTop: 2, fontWeight: '500' },
    alumnoEnBusEstado: { fontSize: 13, fontWeight: '700' },
}); 
