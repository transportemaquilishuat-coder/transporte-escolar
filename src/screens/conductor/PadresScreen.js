import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Modal,
  TextInput,
} from 'react-native';
import { HeartHandshake, KeyRound, Plus, UsersRound } from 'lucide-react-native';
import { useConductorVinculacion } from '../../hooks/useConductorVinculacion';
import { useBranding } from '../../hooks/useBranding';
import { KIDGO_THEME } from '../../theme/kidgoTheme';

export default function ConductorPadresScreen() {
  const { loading, listarPadres, generarCodigo, vincularDirecto, eliminarPadre } = useConductorVinculacion();
  const { branding } = useBranding();

  const [padres, setPadres] = useState([]);
  const [modalCodigo, setModalCodigo] = useState(false);
  const [modalDirecto, setModalDirecto] = useState(false);
  const [codigoGenerado, setCodigoGenerado] = useState(null);
  const [nuevoPadre, setNuevoPadre] = useState({
    nombre: '',
    email: '',
    password: '',
    telefono: '',
    dui: '',
    rutaId: '',
    fechaInicio: '',
    fechaFin: '',
  });

  const brandColor = branding.headerColor || KIDGO_THEME.primaryDark;

  useEffect(() => {
    cargarPadres();
  }, []);

  const cargarPadres = async () => {
    try {
      const data = await listarPadres();
      setPadres(data.padres || []);
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  const handleGenerarCodigo = async () => {
    try {
      const resultado = await generarCodigo({ maxUsos: 1, diasValidez: 7 });
      setCodigoGenerado(resultado);
      setModalCodigo(true);
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  const handleVincularDirecto = async () => {
    try {
      await vincularDirecto(nuevoPadre);
      setModalDirecto(false);
      setNuevoPadre({ nombre: '', email: '', password: '', telefono: '', dui: '', rutaId: '', fechaInicio: '', fechaFin: '' });
      await cargarPadres();
      Alert.alert('Exito', 'Padre vinculado correctamente.');
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  const handleEliminar = (padreId, nombre) => {
    Alert.alert('Confirmar', `Deseas desvincular a ${nombre}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desvincular',
        style: 'destructive',
        onPress: async () => {
          try {
            await eliminarPadre(padreId);
            await cargarPadres();
          } catch (err) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const renderPadre = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <View style={[styles.avatar, { backgroundColor: `${brandColor}14` }]}>
            <UsersRound size={18} color={brandColor} strokeWidth={2} />
          </View>
          <View style={styles.cardTitleText}>
            <Text style={styles.nombre} numberOfLines={1} ellipsizeMode="tail">{item.nombre}</Text>
            <Text style={styles.info}>{item.email}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => handleEliminar(item.id, item.nombre)}>
          <Text style={styles.btnEliminar}>Eliminar</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.info}>Telefono: {item.telefono || 'Sin telefono'}</Text>
      <Text style={styles.info}>
        Vinculado: {item.vinculado_en ? new Date(item.vinculado_en).toLocaleDateString() : 'Sin fecha'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Padres vinculados</Text>
        <Text style={styles.heroSubtitle}>
          El conductor crea codigos para los padres y tambien puede vincularlos manualmente, aun sin colegio ni ruta.
        </Text>
      </View>

      <View style={styles.botonesHeader}>
        <TouchableOpacity style={[styles.btnPrimario, { backgroundColor: brandColor }]} onPress={handleGenerarCodigo}>
          <KeyRound size={18} color="#fff" strokeWidth={2.3} />
          <Text style={styles.btnText}>Generar codigo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSecundario} onPress={() => setModalDirecto(true)}>
          <Plus size={18} color={brandColor} strokeWidth={2.3} />
          <Text style={[styles.btnTextSecundario, { color: brandColor }]}>Agregar directo</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator size="large" color={brandColor} />}

      <FlatList
        data={padres}
        renderItem={renderPadre}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No hay padres vinculados.</Text>}
      />

      <Modal visible={modalCodigo} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <HeartHandshake size={24} color={brandColor} strokeWidth={2.2} style={{ alignSelf: 'center', marginBottom: 8 }} />
            <Text style={styles.modalTitle}>Codigo para padre</Text>
            <Text style={[styles.codigoText, { color: brandColor }]}>{codigoGenerado?.codigo}</Text>
            <Text style={styles.codigoInfo}>
              Expira: {codigoGenerado?.expira_en ? new Date(codigoGenerado.expira_en).toLocaleDateString() : 'No disponible'}
            </Text>
            <TouchableOpacity style={[styles.btnCerrar, { backgroundColor: brandColor }]} onPress={() => setModalCodigo(false)}>
              <Text style={styles.btnText}>Compartir y cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={modalDirecto} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nuevo padre</Text>
            <TextInput style={styles.input} placeholder="Nombre" value={nuevoPadre.nombre} onChangeText={(t) => setNuevoPadre({ ...nuevoPadre, nombre: t })} placeholderTextColor={KIDGO_THEME.textSecondary} />
            <TextInput style={styles.input} placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={nuevoPadre.email} onChangeText={(t) => setNuevoPadre({ ...nuevoPadre, email: t })} placeholderTextColor={KIDGO_THEME.textSecondary} />
            <TextInput style={styles.input} placeholder="Contrasena" secureTextEntry value={nuevoPadre.password} onChangeText={(t) => setNuevoPadre({ ...nuevoPadre, password: t })} placeholderTextColor={KIDGO_THEME.textSecondary} />
            <TextInput style={styles.input} placeholder="Telefono" value={nuevoPadre.telefono} onChangeText={(t) => setNuevoPadre({ ...nuevoPadre, telefono: t })} placeholderTextColor={KIDGO_THEME.textSecondary} />
            <TextInput style={styles.input} placeholder="DUI" value={nuevoPadre.dui} onChangeText={(t) => setNuevoPadre({ ...nuevoPadre, dui: t })} placeholderTextColor={KIDGO_THEME.textSecondary} />
            <TextInput style={styles.input} placeholder="ID de ruta (opcional)" keyboardType="numeric" value={nuevoPadre.rutaId} onChangeText={(t) => setNuevoPadre({ ...nuevoPadre, rutaId: t })} placeholderTextColor={KIDGO_THEME.textSecondary} />
            
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Inicio: DD/MM" value={nuevoPadre.fechaInicio} onChangeText={(t) => setNuevoPadre({ ...nuevoPadre, fechaInicio: t })} placeholderTextColor={KIDGO_THEME.textSecondary} />
              <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Fin: DD/MM" value={nuevoPadre.fechaFin} onChangeText={(t) => setNuevoPadre({ ...nuevoPadre, fechaFin: t })} placeholderTextColor={KIDGO_THEME.textSecondary} />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.btnCancelar} onPress={() => setModalDirecto(false)}>
                <Text style={styles.btnCancelarText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnConfirmar, { backgroundColor: brandColor }]} onPress={handleVincularDirecto}>
                <Text style={styles.btnConfirmarText}>Vincular</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: KIDGO_THEME.background },
  hero: { marginBottom: 16 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: KIDGO_THEME.text, marginBottom: 8 },
  heroSubtitle: { fontSize: 14, color: KIDGO_THEME.textSecondary, lineHeight: 20 },
  botonesHeader: { flexDirection: 'row', marginBottom: 16, gap: 10 },
  btnPrimario: { padding: 14, borderRadius: 14, flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  btnSecundario: {
    backgroundColor: KIDGO_THEME.surface,
    padding: 14,
    borderRadius: 14,
    flex: 1,
    borderWidth: 1,
    borderColor: KIDGO_THEME.border,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  btnText: { color: '#fff', fontWeight: '800', textAlign: 'center' },
  btnTextSecundario: { fontWeight: '800', textAlign: 'center' },
  list: { paddingBottom: 20 },
  card: { backgroundColor: KIDGO_THEME.surface, padding: 16, borderRadius: 18, marginBottom: 12, borderWidth: 1, borderColor: KIDGO_THEME.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  cardTitleRow: { flexDirection: 'row', gap: 10, flex: 1 },
  avatar: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitleText: { flex: 1 },
  nombre: { fontSize: 18, fontWeight: '800', flex: 1, color: KIDGO_THEME.text },
  btnEliminar: { color: KIDGO_THEME.error, fontSize: 13, fontWeight: '800', paddingTop: 4 },
  info: { color: KIDGO_THEME.textSecondary, marginBottom: 4 },
  empty: { textAlign: 'center', color: KIDGO_THEME.textSecondary, marginTop: 40 },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(12, 20, 33, 0.45)' },
  modalContent: { backgroundColor: KIDGO_THEME.surface, padding: 24, borderRadius: 20, width: '90%', maxHeight: '85%', borderWidth: 1, borderColor: KIDGO_THEME.border },
  modalTitle: { fontSize: 22, fontWeight: '800', marginBottom: 16, textAlign: 'center', color: KIDGO_THEME.text },
  input: { borderWidth: 1, borderColor: KIDGO_THEME.border, borderRadius: 14, padding: 12, marginBottom: 10, backgroundColor: KIDGO_THEME.background, color: KIDGO_THEME.text },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 10 },
  btnCancelar: { padding: 14, borderRadius: 14, backgroundColor: KIDGO_THEME.background, flex: 1, alignItems: 'center', borderWidth: 1, borderColor: KIDGO_THEME.border },
  btnCancelarText: { color: KIDGO_THEME.textSecondary, fontWeight: '700' },
  btnConfirmar: { padding: 14, borderRadius: 14, flex: 1, alignItems: 'center' },
  btnConfirmarText: { color: '#fff', fontWeight: '800' },
  btnCerrar: { padding: 14, borderRadius: 14, marginTop: 16 },
  codigoText: { fontSize: 32, fontWeight: '900', textAlign: 'center', letterSpacing: 4, marginVertical: 16 },
  codigoInfo: { textAlign: 'center', color: KIDGO_THEME.textSecondary },
});
