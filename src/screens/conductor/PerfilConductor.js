import { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, TextInput, ActivityIndicator,
    Alert, StatusBar, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { limpiarSesion, obtenerToken, obtenerUsuario } from '../../services/session';

const SERVIDOR = 'https://transporte-backend-production.up.railway.app';
const CONDUCTOR_ID_DEMO = 2;

const obtenerAuthHeaders = async () => {
    const token = obtenerToken() || await AsyncStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function PerfilConductor({ navigation }) {
    const [conductorId, setConductorId] = useState(obtenerUsuario()?.id || CONDUCTOR_ID_DEMO);
    const [loading, setLoading] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [editando, setEditando] = useState(false);
    const [fotoUri, setFotoUri] = useState(null);
    const [seccion, setSeccion] = useState('perfil');

    // Datos del conductor
    const [nombre, setNombre] = useState('');
    const [telefono, setTelefono] = useState('');
    const [dui, setDui] = useState('');
    const [licencia, setLicencia] = useState('');
    const [placa, setPlaca] = useState('');
    const [email, setEmail] = useState('');

    // Cambiar contraseña
    const [passActual, setPassActual] = useState('');
    const [passNueva, setPassNueva] = useState('');
    const [passConfirmar, setPassConfirmar] = useState('');

    // Estadísticas
    const [stats, setStats] = useState({
        rutasHoy: 0,
        alumnosHoy: 0,
        totalEventos: 0,
    });

    useEffect(() => {
        const cargarSesion = async () => {
            const usuarioMemoria = obtenerUsuario();
            if (usuarioMemoria?.id) {
                setConductorId(usuarioMemoria.id);
                return;
            }

            const rawUsuario = await AsyncStorage.getItem('usuario');
            if (!rawUsuario) return;

            try {
                const usuario = JSON.parse(rawUsuario);
                if (usuario?.id) {
                    setConductorId(usuario.id);
                }
            } catch (error) {
                console.log('No se pudo leer el usuario persistido', error);
            }
        };

        cargarSesion();
    }, []);

    useEffect(() => {
        if (!conductorId) return;

        cargarPerfil();
    }, [conductorId]);

    const cargarPerfil = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${SERVIDOR}/api/asignaciones/conductor/${conductorId || CONDUCTOR_ID_DEMO}`, {
                headers: await obtenerAuthHeaders(),
            });
            const datos = await res.json();

            if (datos.rutas && datos.rutas.length > 0) {
                const ruta = datos.rutas[0];
                setNombre(ruta.conductor_nombre || 'Conductor');
            }

            setStats({
                rutasHoy: datos.rutas?.length || 0,
                alumnosHoy: datos.totalAlumnos || 0,
                totalEventos: datos.alumnos?.filter(a => a.estado === 'abordado').length || 0,
            });

            // Cargar datos del usuario
            const resUser = await fetch(`${SERVIDOR}/api/auth/perfil/${conductorId || CONDUCTOR_ID_DEMO}`, {
                headers: await obtenerAuthHeaders(),
            });
            if (resUser.ok) {
                const user = await resUser.json();
                setNombre(user.nombre || '');
                setTelefono(user.telefono || '');
                setDui(user.dui || '');
                setLicencia(user.licencia || '');
                setPlaca(user.placa || '');
                setEmail(user.email || '');
            }
        } catch (e) {
            console.log('Error cargando perfil:', e);
        } finally {
            setLoading(false);
        }
    };

    const seleccionarFoto = async () => {
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
            setFotoUri(result.assets[0].uri);
        }
    };

    const tomarFoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso requerido', 'Necesitamos acceso a tu cámara.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });
        if (!result.canceled) {
            setFotoUri(result.assets[0].uri);
        }
    };

    const mostrarOpcionesFoto = () => {
        Alert.alert('Foto de perfil', '¿Cómo quieres agregar tu foto?', [
            { text: 'Cámara', onPress: tomarFoto },
            { text: 'Galería', onPress: seleccionarFoto },
            { text: 'Cancelar', style: 'cancel' },
        ]);
    };

    const guardarPerfil = async () => {
        if (!nombre.trim()) {
            Alert.alert('Error', 'El nombre es requerido');
            return;
        }
        setGuardando(true);
        try {
            await fetch(`${SERVIDOR}/api/auth/perfil/${conductorId || CONDUCTOR_ID_DEMO}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
                body: JSON.stringify({ nombre, telefono, dui, licencia, placa }),
            });
            setEditando(false);
            Alert.alert('✅ Listo', 'Perfil actualizado correctamente');
        } catch (e) {
            Alert.alert('Error', 'No se pudo guardar el perfil');
        } finally {
            setGuardando(false);
        }
    };

    const cambiarPassword = async () => {
        if (!passActual || !passNueva || !passConfirmar) {
            Alert.alert('Error', 'Completa todos los campos');
            return;
        }
        if (passNueva !== passConfirmar) {
            Alert.alert('Error', 'Las contraseñas nuevas no coinciden');
            return;
        }
        if (passNueva.length < 6) {
            Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
            return;
        }
        setGuardando(true);
        try {
            const res = await fetch(`${SERVIDOR}/api/auth/cambiar-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(await obtenerAuthHeaders()) },
                body: JSON.stringify({
                    usuarioId: conductorId || CONDUCTOR_ID_DEMO,
                    passwordActual: passActual,
                    passwordNueva: passNueva,
                }),
            });
            const datos = await res.json();
            if (res.ok) {
                setPassActual('');
                setPassNueva('');
                setPassConfirmar('');
                Alert.alert('✅ Listo', 'Contraseña actualizada correctamente');
            } else {
                Alert.alert('Error', datos.error || 'No se pudo cambiar la contraseña');
            }
        } catch (e) {
            Alert.alert('Error', 'No se pudo conectar al servidor');
        } finally {
            setGuardando(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1A56DB" />
                <Text style={styles.loadingTexto}>Cargando perfil...</Text>
            </View>
        );
    }

    return (
        <>
            <StatusBar barStyle="light-content" backgroundColor="#1A56DB" />
            <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

                {/* HEADER */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.btnVolver}>
                        <Text style={styles.btnVolverTexto}>← Volver</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitulo}>Mi perfil</Text>
                    <TouchableOpacity
                        onPress={() => setEditando(!editando)}
                        style={styles.btnEditar}
                    >
                        <Text style={styles.btnEditarTexto}>{editando ? 'Cancelar' : 'Editar'}</Text>
                    </TouchableOpacity>
                </View>

                {/* FOTO Y NOMBRE */}
                <View style={styles.fotoSeccion}>
                    <TouchableOpacity onPress={mostrarOpcionesFoto} style={styles.fotoContainer}>
                        {fotoUri ? (
                            <Image source={{ uri: fotoUri }} style={styles.foto} />
                        ) : (
                            <View style={styles.fotoPlaceholder}>
                                <Text style={styles.fotoInicial}>{nombre.charAt(0) || 'C'}</Text>
                            </View>
                        )}
                        <View style={styles.fotoCamara}>
                            <Text style={{ fontSize: 14 }}>📷</Text>
                        </View>
                    </TouchableOpacity>
                    <Text style={styles.fotoNombre}>{nombre}</Text>
                    <Text style={styles.fotoRol}>Conductor · ID {conductorId || CONDUCTOR_ID_DEMO}</Text>
                </View>

                {/* TABS */}
                <View style={styles.tabs}>
                    {[
                        { key: 'perfil', label: '👤 Perfil' },
                        { key: 'vehiculo', label: '🚌 Vehículo' },
                        { key: 'stats', label: '📊 Estadísticas' },
                        { key: 'seguridad', label: '🔒 Seguridad' },
                    ].map(tab => (
                        <TouchableOpacity
                            key={tab.key}
                            style={[styles.tab, seccion === tab.key && styles.tabActivo]}
                            onPress={() => setSeccion(tab.key)}
                        >
                            <Text style={[styles.tabTexto, seccion === tab.key && styles.tabTextoActivo]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* PERFIL */}
                {seccion === 'perfil' && (
                    <View style={styles.seccionContainer}>
                        <Text style={styles.seccionTitulo}>Información personal</Text>
                        <View style={styles.card}>

                            <Text style={styles.fieldLabel}>Nombre completo</Text>
                            {editando ? (
                                <TextInput style={styles.input} value={nombre} onChangeText={setNombre} />
                            ) : (
                                <Text style={styles.fieldValue}>{nombre || 'No registrado'}</Text>
                            )}

                            <View style={styles.divider} />

                            <Text style={styles.fieldLabel}>Correo electrónico</Text>
                            <Text style={styles.fieldValue}>{email || 'No registrado'}</Text>

                            <View style={styles.divider} />

                            <Text style={styles.fieldLabel}>Teléfono</Text>
                            {editando ? (
                                <TextInput style={styles.input} value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" placeholder="7000-0000" />
                            ) : (
                                <Text style={styles.fieldValue}>{telefono || 'No registrado'}</Text>
                            )}

                            <View style={styles.divider} />

                            <Text style={styles.fieldLabel}>DUI</Text>
                            {editando ? (
                                <TextInput style={styles.input} value={dui} onChangeText={setDui} placeholder="00000000-0" />
                            ) : (
                                <Text style={styles.fieldValue}>{dui || 'No registrado'}</Text>
                            )}

                        </View>

                        {editando && (
                            <TouchableOpacity
                                style={[styles.btnGuardar, guardando && { opacity: 0.7 }]}
                                onPress={guardarPerfil}
                                disabled={guardando}
                            >
                                {guardando
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={styles.btnGuardarTexto}>Guardar cambios</Text>
                                }
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* VEHÍCULO */}
                {seccion === 'vehiculo' && (
                    <View style={styles.seccionContainer}>
                        <Text style={styles.seccionTitulo}>Datos del vehículo</Text>
                        <View style={styles.card}>

                            <Text style={styles.fieldLabel}>Número de licencia</Text>
                            {editando ? (
                                <TextInput style={styles.input} value={licencia} onChangeText={setLicencia} placeholder="Ej: 000000000" />
                            ) : (
                                <View style={styles.fieldWithBadge}>
                                    <Text style={styles.fieldValue}>{licencia || 'No registrada'}</Text>
                                    {licencia ? (
                                        <View style={styles.badgeValido}>
                                            <Text style={styles.badgeValidoTexto}>✓ Registrada</Text>
                                        </View>
                                    ) : (
                                        <View style={styles.badgePendiente}>
                                            <Text style={styles.badgePendienteTexto}>Pendiente</Text>
                                        </View>
                                    )}
                                </View>
                            )}

                            <View style={styles.divider} />

                            <Text style={styles.fieldLabel}>Placa del vehículo</Text>
                            {editando ? (
                                <TextInput style={styles.input} value={placa} onChangeText={setPlaca} placeholder="Ej: P-000000" autoCapitalize="characters" />
                            ) : (
                                <View style={styles.fieldWithBadge}>
                                    <Text style={styles.fieldValue}>{placa || 'No registrada'}</Text>
                                    {placa ? (
                                        <View style={styles.badgeValido}>
                                            <Text style={styles.badgeValidoTexto}>✓ Registrada</Text>
                                        </View>
                                    ) : (
                                        <View style={styles.badgePendiente}>
                                            <Text style={styles.badgePendienteTexto}>Pendiente</Text>
                                        </View>
                                    )}
                                </View>
                            )}

                        </View>

                        <View style={styles.notaCard}>
                            <Text style={styles.notaIcono}>🔒</Text>
                            <Text style={styles.notaTexto}>
                                Tus documentos son verificados por el administrador. Mantén tu información actualizada para operar sin interrupciones.
                            </Text>
                        </View>

                        {editando && (
                            <TouchableOpacity
                                style={[styles.btnGuardar, guardando && { opacity: 0.7 }]}
                                onPress={guardarPerfil}
                                disabled={guardando}
                            >
                                {guardando
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={styles.btnGuardarTexto}>Guardar cambios</Text>
                                }
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* ESTADÍSTICAS */}
                {seccion === 'stats' && (
                    <View style={styles.seccionContainer}>
                        <Text style={styles.seccionTitulo}>Estadísticas de hoy</Text>

                        <View style={styles.statsGrid}>
                            <View style={[styles.statCard, { backgroundColor: '#E6F4EA' }]}>
                                <Text style={styles.statIcono}>🗺️</Text>
                                <Text style={[styles.statValor, { color: '#276749' }]}>{stats.rutasHoy}</Text>
                                <Text style={styles.statLabel}>Rutas activas</Text>
                            </View>
                            <View style={[styles.statCard, { backgroundColor: '#E8F0FE' }]}>
                                <Text style={styles.statIcono}>👦</Text>
                                <Text style={[styles.statValor, { color: '#1A56DB' }]}>{stats.alumnosHoy}</Text>
                                <Text style={styles.statLabel}>Alumnos en ruta</Text>
                            </View>
                            <View style={[styles.statCard, { backgroundColor: '#FFF8E1' }]}>
                                <Text style={styles.statIcono}>✅</Text>
                                <Text style={[styles.statValor, { color: '#BA7517' }]}>{stats.totalEventos}</Text>
                                <Text style={styles.statLabel}>Abordados hoy</Text>
                            </View>
                            <View style={[styles.statCard, { backgroundColor: '#FEECEC' }]}>
                                <Text style={styles.statIcono}>⭐</Text>
                                <Text style={[styles.statValor, { color: '#C53030' }]}>5.0</Text>
                                <Text style={styles.statLabel}>Calificación</Text>
                            </View>
                        </View>

                        <Text style={[styles.seccionTitulo, { marginTop: 16 }]}>Resumen del mes</Text>
                        <View style={styles.card}>
                            {[
                                { label: 'Rutas completadas', valor: '42' },
                                { label: 'Alumnos transportados', valor: '210' },
                                { label: 'Eventos registrados', valor: '18' },
                                { label: 'Ausencias reportadas', valor: '5' },
                                { label: 'Días trabajados', valor: '21' },
                            ].map((item, i) => (
                                <View key={i} style={[styles.statsRow, i > 0 && { borderTopWidth: 0.5, borderTopColor: '#F1F5F9' }]}>
                                    <Text style={styles.fieldLabel}>{item.label}</Text>
                                    <Text style={styles.statsValor}>{item.valor}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* SEGURIDAD */}
                {seccion === 'seguridad' && (
                    <View style={styles.seccionContainer}>
                        <Text style={styles.seccionTitulo}>Cambiar contraseña</Text>
                        <View style={styles.card}>

                            <Text style={styles.fieldLabel}>Contraseña actual</Text>
                            <TextInput
                                style={styles.input}
                                value={passActual}
                                onChangeText={setPassActual}
                                secureTextEntry
                                placeholder="••••••••"
                            />

                            <View style={styles.divider} />

                            <Text style={styles.fieldLabel}>Nueva contraseña</Text>
                            <TextInput
                                style={styles.input}
                                value={passNueva}
                                onChangeText={setPassNueva}
                                secureTextEntry
                                placeholder="Mínimo 6 caracteres"
                            />

                            <View style={styles.divider} />

                            <Text style={styles.fieldLabel}>Confirmar nueva contraseña</Text>
                            <TextInput
                                style={styles.input}
                                value={passConfirmar}
                                onChangeText={setPassConfirmar}
                                secureTextEntry
                                placeholder="Repite la contraseña"
                            />

                        </View>

                        <TouchableOpacity
                            style={[styles.btnGuardar, guardando && { opacity: 0.7 }]}
                            onPress={cambiarPassword}
                            disabled={guardando}
                        >
                            {guardando
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.btnGuardarTexto}>Cambiar contraseña</Text>
                            }
                        </TouchableOpacity>

                        <View style={styles.notaCard}>
                            <Text style={styles.notaIcono}>🔒</Text>
                            <Text style={styles.notaTexto}>
                                Usa una contraseña segura con letras y números. No la compartas con nadie.
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={styles.btnCerrarSesion}
                            onPress={() => {
                                Alert.alert('Cerrar sesión', '¿Estás seguro que deseas salir?', [
                                    { text: 'Cancelar', style: 'cancel' },
                                    {
                                        text: 'Salir',
                                        style: 'destructive',
                                        onPress: async () => {
                                            await limpiarSesion();
                                            navigation.replace('Login');
                                        },
                                    },
                                ]);
                            }}
                        >
                            <Text style={styles.btnCerrarSesionTexto}>Cerrar sesión</Text>
                        </TouchableOpacity>
                    </View>
                )}

            </ScrollView>
        </>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingTexto: { marginTop: 12, fontSize: 14, color: '#64748B' },

    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: '#1A56DB', paddingHorizontal: 20,
        paddingTop: 50, paddingBottom: 20,
    },
    btnVolver: { paddingHorizontal: 4 },
    btnVolverTexto: { color: '#fff', fontSize: 14 },
    headerTitulo: { fontSize: 17, fontWeight: '700', color: '#fff' },
    btnEditar: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
    btnEditarTexto: { color: '#fff', fontSize: 13, fontWeight: '600' },

    fotoSeccion: { alignItems: 'center', paddingVertical: 24, backgroundColor: '#1A56DB', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
    fotoContainer: { position: 'relative', marginBottom: 12 },
    foto: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#fff' },
    fotoPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff' },
    fotoInicial: { fontSize: 36, fontWeight: '700', color: '#fff' },
    fotoCamara: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#fff', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', elevation: 2 },
    fotoNombre: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 4 },
    fotoRol: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },

    tabs: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 8, gap: 4, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
    tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
    tabActivo: { backgroundColor: '#1A56DB' },
    tabTexto: { fontSize: 10, color: '#94A3B8', fontWeight: '600', textAlign: 'center' },
    tabTextoActivo: { color: '#fff' },

    seccionContainer: { padding: 16, paddingBottom: 40 },
    seccionTitulo: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 12 },

    card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 1, marginBottom: 12 },
    fieldLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '600', marginBottom: 4, marginTop: 4 },
    fieldValue: { fontSize: 15, color: '#1E293B', fontWeight: '500', paddingVertical: 4 },
    fieldWithBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    divider: { height: 0.5, backgroundColor: '#F1F5F9', marginVertical: 10 },
    input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#1E293B', marginBottom: 4 },

    badgeValido: { backgroundColor: '#E6F4EA', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    badgeValidoTexto: { fontSize: 11, color: '#276749', fontWeight: '600' },
    badgePendiente: { backgroundColor: '#FFF8E1', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    badgePendienteTexto: { fontSize: 11, color: '#BA7517', fontWeight: '600' },

    notaCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FFF8E1', borderRadius: 12, padding: 14, marginBottom: 12 },
    notaIcono: { fontSize: 18 },
    notaTexto: { fontSize: 12, color: '#744210', flex: 1, lineHeight: 18 },

    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    statCard: { borderRadius: 14, padding: 14, width: '47%', alignItems: 'center' },
    statIcono: { fontSize: 24, marginBottom: 6 },
    statValor: { fontSize: 26, fontWeight: '700' },
    statLabel: { fontSize: 11, color: '#64748B', marginTop: 2 },
    statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
    statsValor: { fontSize: 15, fontWeight: '700', color: '#1A56DB' },

    btnGuardar: { backgroundColor: '#1A56DB', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
    btnGuardarTexto: { color: '#fff', fontWeight: '700', fontSize: 15 },

    btnCerrarSesion: { backgroundColor: '#FEECEC', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
    btnCerrarSesionTexto: { color: '#C53030', fontWeight: '700', fontSize: 15 },
});
