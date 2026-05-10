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
import { Plus, Trash2, UsersRound } from 'lucide-react-native';
import { useAdminVinculacion } from '../../hooks/useAdminVinculacion';
import { useBranding } from '../../hooks/useBranding';
import { KIDGO_THEME } from '../../theme/kidgoTheme';

export default function AdminPadresScreen() {
  const { loading, listarPadres, vincularPadreDirecto, eliminarPadre } = useAdminVinculacion();
  const { branding } = useBranding();

  const [padres, setPadres] = useState([]);
  const [modalDirecto, setModalDirecto] = useState(false);
  const [nuevoPadre, setNuevoPadre] = useState({
    nombre: '',
    email: '',
    password: '',
    telefono: '',
    dui: '',
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

  const handleVincularDirecto = async () => {
    try {
      await vincularPadreDirecto(nuevoPadre);
      setModalDirecto(false);
      setNuevoPadre({ nombre: '', email: '', password: '', telefono: '', dui: '', fechaInicio: '', fechaFin: '' });
      await cargarPadres();
      Alert.alert('Exito', 'Padre vinculado al colegio correctamente.');
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  const handleEliminar = (padreId, nombre) => {
    Alert.alert('Confirmar', `Deseas desvincular a ${nombre} del colegio?`, [
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
        <TouchableOpacity style={styles.btnEliminar} onPress={() => handleEliminar(item.id, item.nombre)}>
          <Trash2 size={14} color={KIDGO_THEME.error} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>
      <Text style={styles.info}>Telefono: {item.telefono || 'Sin telefono'}</Text>
      <Text style={styles.info}>Conductor: {item.conductor_nombre || 'Sin conductor asignado'}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Padres del colegio</Text>
        <Text style={styles.heroSubtitle}>
          Vincula padres al colegio y revisa los que llegan desde conductores asociados.
        </Text>
      </View>

      <TouchableOpacity style={[styles.btnPrimario, { backgroundColor: brandColor }]} onPress={() => setModalDirecto(true)}>
        <Plus size={18} color="#fff" strokeWidth={2.3} />
        <Text style={styles.btnText}>Agregar padre</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator size="large" color={brandColor} style={{ marginTop: 12 }} />}

      <FlatList
        data={padres}
        renderItem={renderPadre}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No hay padres vinculados.</Text>}
      />

      <Modal visible={modalDirecto} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nuevo padre</Text>
            <TextInput style={styles.input} placeholder="Nombre" value={nuevoPadre.nombre} onChangeText={(t) => setNuevoPadre({ ...nuevoPadre, nombre: t })} placeholderTextColor={KIDGO_THEME.textSecondary} />
            <TextInput style={styles.input} placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={nuevoPadre.email} onChangeText={(t) => setNuevoPadre({ ...nuevoPadre, email: t })} placeholderTextColor={KIDGO_THEME.textSecondary} />
            <TextInput style={styles.input} placeholder="Contrasena" secureTextEntry value={nuevoPadre.password} onChangeText={(t) => setNuevoPadre({ ...nuevoPadre, password: t })} placeholderTextColor={KIDGO_THEME.textSecondary} />
            <TextInput style={styles.input} placeholder="Telefono" value={nuevoPadre.telefono} onChangeText={(t) => setNuevoPadre({ ...nuevoPadre, telefono: t })} placeholderTextColor={KIDGO_THEME.textSecondary} />
            <TextInput style={styles.input} placeholder="DUI" value={nuevoPadre.dui} onChangeText={(t) => setNuevoPadre({ ...nuevoPadre, dui: t })} placeholderTextColor={KIDGO_THEME.textSecondary} />

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
  btnPrimario: { padding: 14, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  btnText: { color: '#fff', fontWeight: '800', textAlign: 'center' },
  list: { paddingVertical: 16 },
  card: { backgroundColor: KIDGO_THEME.surface, padding: 16, borderRadius: 18, marginBottom: 12, borderWidth: 1, borderColor: KIDGO_THEME.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  cardTitleRow: { flexDirection: 'row', gap: 10, flex: 1 },
  avatar: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitleText: { flex: 1 },
  nombre: { fontSize: 18, fontWeight: '800', flex: 1, color: KIDGO_THEME.text },
  btnEliminar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
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
});
