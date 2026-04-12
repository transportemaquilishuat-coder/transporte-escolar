import { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, ActivityIndicator,
} from 'react-native';

const SERVIDOR = 'https://transporte-backend-production.up.railway.app';

export default function PantallaAdmin({ navigation }) {
    const [dashboard, setDashboard] = useState(null);
    const [rutas, setRutas] = useState([]);
    const [alumnos, setAlumnos] = useState([]);
    const [conductores, setConductores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [seccion, setSeccion] = useState('dashboard');

    useEffect(() => {
        cargarDatos();
    }, []);

    const cargarDatos = async () => {
        try {
            const [dash, rut, alum, cond] = await Promise.all([
                fetch(`${SERVIDOR}/api/admin/dashboard`).then(r => r.json()),
                fetch(`${SERVIDOR}/api/admin/rutas`).then(r => r.json()),
                fetch(`${SERVIDOR}/api/admin/alumnos`).then(r => r.json()),
                fetch(`${SERVIDOR}/api/admin/conductores`).then(r => r.json()),
            ]);
            setDashboard(dash);
            setRutas(rut.rutas || []);
            setAlumnos(alum.alumnos || []);
            setConductores(cond.conductores || []);
        } catch (e) {
            console.log('Error cargando datos:', e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1A56DB" />
                <Text style={styles.loadingTexto}>Cargando panel...</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>

            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.bienvenida}>Panel Admin</Text>
                    <Text style={styles.subtitulo}>Gestión de transporte escolar</Text>
                </View>
                <TouchableOpacity onPress={() => navigation.replace('Login')}>
                    <Text style={styles.cerrarSesion}>Salir</Text>
                </TouchableOpacity>
            </View>

            {/* Tabs de navegación */}
            <View style={styles.tabs}>
                {[
                    { key: 'dashboard', label: 'Dashboard' },
                    { key: 'rutas', label: 'Rutas' },
                    { key: 'alumnos', label: 'Alumnos' },
                    { key: 'conductores', label: 'Conductores' },
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

            {/* ── Dashboard ── */}
            {seccion === 'dashboard' && dashboard && (
                <View style={styles.seccionContainer}>
                    <View style={styles.statsGrid}>
                        {[
                            { label: 'Usuarios', valor: dashboard.totalUsuarios, icono: '👥' },
                            { label: 'Alumnos', valor: dashboard.totalAlumnos, icono: '👦' },
                            { label: 'Rutas', valor: dashboard.totalRutas, icono: '🗺️' },
                            { label: 'Ausencias', valor: dashboard.ausenciasHoy, icono: '📋' },
                        ].map((s, i) => (
                            <View key={i} style={styles.statCard}>
                                <Text style={styles.statIcono}>{s.icono}</Text>
                                <Text style={styles.statValor}>{s.valor}</Text>
                                <Text style={styles.statLabel}>{s.label}</Text>
                            </View>
                        ))}
                    </View>

                    <TouchableOpacity style={styles.btnRefresh} onPress={cargarDatos}>
                        <Text style={styles.btnRefreshTexto}>Actualizar datos</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* ── Rutas ── */}
            {seccion === 'rutas' && (
                <View style={styles.seccionContainer}>
                    <Text style={styles.seccionTitulo}>Rutas activas ({rutas.length})</Text>
                    {rutas.map((ruta, i) => (
                        <View key={i} style={styles.itemCard}>
                            <View style={styles.itemIndicador} />
                            <View style={styles.itemInfo}>
                                <Text style={styles.itemNombre}>{ruta.nombre}</Text>
                                <Text style={styles.itemSub}>Conductor: {ruta.conductor_nombre}</Text>
                                <Text style={styles.itemSub}>Alumnos: {ruta.total_alumnos}</Text>
                            </View>
                            <View style={[styles.badge, { backgroundColor: '#E6F4EA' }]}>
                                <Text style={[styles.badgeTexto, { color: '#276749' }]}>Activa</Text>
                            </View>
                        </View>
                    ))}
                </View>
            )}

            {/* ── Alumnos ── */}
            {seccion === 'alumnos' && (
                <View style={styles.seccionContainer}>
                    <Text style={styles.seccionTitulo}>Alumnos registrados ({alumnos.length})</Text>
                    {alumnos.map((alumno, i) => (
                        <View key={i} style={styles.itemCard}>
                            <View style={styles.alumnoAvatar}>
                                <Text style={styles.alumnoAvatarTexto}>
                                    {alumno.nombre.charAt(0)}
                                </Text>
                            </View>
                            <View style={styles.itemInfo}>
                                <Text style={styles.itemNombre}>{alumno.nombre}</Text>
                                <Text style={styles.itemSub}>{alumno.grado}</Text>
                                <Text style={styles.itemSub}>Ruta: {alumno.ruta_nombre}</Text>
                                <Text style={styles.itemSub}>Parada: {alumno.parada}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            )}

            {/* ── Conductores ── */}
            {seccion === 'conductores' && (
                <View style={styles.seccionContainer}>
                    <Text style={styles.seccionTitulo}>Conductores ({conductores.length})</Text>
                    {conductores.map((conductor, i) => (
                        <View key={i} style={styles.itemCard}>
                            <View style={[styles.alumnoAvatar, { backgroundColor: '#1A56DB' }]}>
                                <Text style={styles.alumnoAvatarTexto}>
                                    {conductor.nombre.charAt(0)}
                                </Text>
                            </View>
                            <View style={styles.itemInfo}>
                                <Text style={styles.itemNombre}>{conductor.nombre}</Text>
                                <Text style={styles.itemSub}>DUI: {conductor.dui}</Text>
                                <Text style={styles.itemSub}>Licencia: {conductor.licencia || 'No registrada'}</Text>
                                <Text style={styles.itemSub}>Placa: {conductor.placa || 'No registrada'}</Text>
                                <Text style={styles.itemSub}>Tel: {conductor.telefono}</Text>
                            </View>
                            <View style={[styles.badge, { backgroundColor: conductor.activo ? '#E6F4EA' : '#FEECEC' }]}>
                                <Text style={[styles.badgeTexto, { color: conductor.activo ? '#276749' : '#C53030' }]}>
                                    {conductor.activo ? 'Activo' : 'Inactivo'}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>
            )}

        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0F4FF' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingTexto: { marginTop: 12, fontSize: 14, color: '#666' },
    header: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', backgroundColor: '#1A1A2E',
        padding: 24, paddingTop: 50,
    },
    bienvenida: { fontSize: 20, fontWeight: '700', color: '#fff' },
    subtitulo: { fontSize: 13, color: '#aaa', marginTop: 4 },
    cerrarSesion: {
        fontSize: 13, color: '#fff',
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    },
    tabs: {
        flexDirection: 'row', backgroundColor: '#fff',
        paddingHorizontal: 8, paddingVertical: 8, gap: 4,
        borderBottomWidth: 0.5, borderBottomColor: '#E0E0E0',
    },
    tab: {
        flex: 1, paddingVertical: 8, borderRadius: 8,
        alignItems: 'center',
    },
    tabActivo: { backgroundColor: '#1A56DB' },
    tabTexto: { fontSize: 11, color: '#888', fontWeight: '600' },
    tabTextoActivo: { color: '#fff' },
    seccionContainer: { padding: 16 },
    seccionTitulo: {
        fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 12,
    },
    statsGrid: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16,
    },
    statCard: {
        backgroundColor: '#fff', borderRadius: 14,
        padding: 16, width: '47%', alignItems: 'center', elevation: 2,
    },
    statIcono: { fontSize: 28, marginBottom: 6 },
    statValor: { fontSize: 26, fontWeight: '700', color: '#1A1A2E' },
    statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
    btnRefresh: {
        backgroundColor: '#1A56DB', borderRadius: 10,
        paddingVertical: 12, alignItems: 'center',
    },
    btnRefreshTexto: { color: '#fff', fontWeight: '700', fontSize: 14 },
    itemCard: {
        backgroundColor: '#fff', borderRadius: 12,
        padding: 14, marginBottom: 8, flexDirection: 'row',
        alignItems: 'center', elevation: 1,
    },
    itemIndicador: {
        width: 4, height: 40, backgroundColor: '#1A56DB',
        borderRadius: 2, marginRight: 12,
    },
    itemInfo: { flex: 1 },
    itemNombre: { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
    itemSub: { fontSize: 12, color: '#888', marginTop: 2 },
    alumnoAvatar: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#E6F4EA', justifyContent: 'center',
        alignItems: 'center', marginRight: 12,
    },
    alumnoAvatarTexto: { fontSize: 18, fontWeight: '700', color: '#276749' },
    badge: {
        borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    },
    badgeTexto: { fontSize: 11, fontWeight: '600' },
});