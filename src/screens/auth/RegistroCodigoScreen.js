import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRegistroCodigo } from '../../hooks/useRegistroCodigo';
import { vincularConCodigo } from '../../services/api';
import { guardarSesion, obtenerToken } from '../../services/session';
import { registrarNotificaciones } from '../../services/notificaciones';
import { useBranding } from '../../hooks/useBranding';
import { KIDGO_THEME } from '../../theme/kidgoTheme';

const TITULOS_POR_DESTINO = {
  admin: 'Registro de administrador',
  conductor: 'Registro de conductor',
  padre: 'Registro de padre',
};

const CAMPOS_EXTRA_POR_TIPO = {
  colegio_conductor: ['licencia', 'placa'],
};

const PANTALLA_POR_ROL = {
  admin: 'Admin',
  administrador: 'Admin',
  conductor: 'Conductor',
  padre: 'Padre',
  superadmin: 'SuperAdmin',
  super_admin: 'SuperAdmin',
};

const normalizarRolRegistro = (valor = '') => {
  const rol = String(valor).trim().toLowerCase();
  if (['padre', 'conductor', 'admin'].includes(rol)) return rol;
  if (rol.includes('padre')) return 'padre';
  if (rol.includes('conductor')) return 'conductor';
  if (rol.includes('admin')) return 'admin';
  return '';
};

const crearHijoVacio = () => ({
  nombre: '',
  grado: '',
  colegioNombre: '',
  direccion: '',
  codigoConductor: '',
});

export default function RegistroCodigoScreen({ navigation, route }) {
  const { loading, error, registrar } = useRegistroCodigo();
  const { branding } = useBranding();
  
  const destino = route?.params?.destino || '';
  
  const [codigo, setCodigo] = useState('');
  const [tokenSesion, setTokenSesion] = useState('');
  const [vinculandoCuenta, setVinculandoCuenta] = useState(false);
  const [datos, setDatos] = useState({
    nombre: '',
    email: '',
    password: '',
    telefono: '',
    dui: '',
    direccion: '',
    licencia: '',
    placa: '',
    fechaInicio: '',
    fechaFin: '',
  });
  const [hijosRegistro, setHijosRegistro] = useState([crearHijoVacio()]);

  const tituloPantalla = useMemo(
    () => TITULOS_POR_DESTINO[destino] || 'Registro de usuario',
    [destino]
  );

  const camposExtra = useMemo(() => {
    if (destino === 'conductor') return ['licencia', 'placa'];
    return [];
  }, [destino]);

  const logoFuente = branding.logoUri ? { uri: branding.logoUri } : null;
  const brandColor = branding.headerColor || KIDGO_THEME.primaryDark;

  useEffect(() => {
    const cargarTokenSesion = async () => {
      const tokenMemoria = obtenerToken();
      const tokenStorage = await AsyncStorage.getItem('token');
      setTokenSesion(tokenMemoria || tokenStorage || '');
    };

    cargarTokenSesion();
  }, []);

  const actualizarDato = (clave, valor) => {
    setDatos((prev) => ({ ...prev, [clave]: valor }));
  };

  const actualizarHijo = (indice, clave, valor) => {
    setHijosRegistro((prev) =>
      prev.map((hijo, i) => (i === indice ? { ...hijo, [clave]: valor } : hijo))
    );
  };

  const agregarHijo = () => {
    setHijosRegistro((prev) => [...prev, crearHijoVacio()]);
  };

  const eliminarHijo = (indice) => {
    setHijosRegistro((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== indice)));
  };

  const obtenerHijosNormalizados = () =>
    hijosRegistro
      .map((hijo) => ({
        nombre: hijo.nombre.trim(),
        grado: hijo.grado.trim(),
        colegioNombre: hijo.colegioNombre.trim(),
        direccion: hijo.direccion.trim() || datos.direccion.trim(),
        codigoConductor: hijo.codigoConductor.trim().toUpperCase(),
      }))
      .filter((hijo) => hijo.nombre || hijo.grado || hijo.colegioNombre || hijo.direccion || hijo.codigoConductor);

  const validarHijosPadre = () => {
    if (destino !== 'padre') return null;

    const hijos = obtenerHijosNormalizados();
    if (hijos.length === 0) return null;

    const hijoIncompleto = hijos.find((hijo) => !hijo.nombre || !hijo.grado || !hijo.colegioNombre);
    if (hijoIncompleto) {
      return 'Cada hijo necesita nombre, grado y colegio.';
    }

    return null;
  };

  const navegarSegunRol = (usuario) => {
    const rol = (usuario?.rol || destino || '').toLowerCase();
    const pantalla = PANTALLA_POR_ROL[rol] || 'Login';
    navigation.reset({
      index: 0,
      routes: [{ name: pantalla }],
    });
  };

  const handleRegistro = async () => {
    if (!datos.nombre.trim() || !datos.email.trim() || !datos.password.trim()) {
      Alert.alert('Error', 'Nombre, correo y contrasena son obligatorios.');
      return;
    }

    const errorHijos = validarHijosPadre();
    if (errorHijos) {
      Alert.alert('Error', errorHijos);
      return;
    }

    if (camposExtra.includes('licencia') && !datos.licencia.trim()) {
      Alert.alert('Error', 'La licencia es obligatoria para este registro.');
      return;
    }

    if (camposExtra.includes('placa') && !datos.placa.trim()) {
      Alert.alert('Error', 'La placa es obligatoria para este registro.');
      return;
    }

    try {
      const hijosNormalizados = obtenerHijosNormalizados();
      const rol = normalizarRolRegistro(destino);
      const payloadRegistro = {
        nombre: datos.nombre.trim(),
        email: datos.email.trim().toLowerCase(),
        password: datos.password,
        rol: rol || undefined,
        telefono: datos.telefono.trim() || undefined,
        dui: datos.dui.trim() || undefined,
        direccion: datos.direccion.trim() || undefined,
        licencia: datos.licencia.trim() || undefined,
        placa: datos.placa.trim().toUpperCase() || undefined,
      };

      if (destino === 'padre') {
        payloadRegistro.fechaInicio = datos.fechaInicio;
        payloadRegistro.fechaFin = datos.fechaFin;
        payloadRegistro.hijos = hijosNormalizados;
        payloadRegistro.alumnos = hijosNormalizados.map((hijo) => ({
          nombre: hijo.nombre,
          grado: hijo.grado,
          colegioNombre: hijo.colegioNombre,
          direccion: hijo.direccion,
          parada: hijo.direccion,
          codigoInvitacion: hijo.codigoConductor,
          codigoConductor: hijo.codigoConductor,
        }));
      }

      const resultado = await registrar(payloadRegistro);

      if (resultado?.token && resultado?.usuario) {
        const usuarioSesion = {
          ...resultado.usuario,
          direccion: resultado.usuario.direccion || datos.direccion,
        };
        guardarSesion({ token: resultado.token, usuario: usuarioSesion });
        await AsyncStorage.setItem('token', resultado.token);
        await AsyncStorage.setItem('usuario', JSON.stringify(usuarioSesion));
        await registrarNotificaciones(usuarioSesion.id, resultado.token);

        const codigosExtra = hijosNormalizados.filter((hijo) => hijo.codigoConductor);
        for (const hijo of codigosExtra) {
          await vincularConCodigo(hijo.codigoConductor, resultado.token, {
            hijo,
            alumno: {
              nombre: hijo.nombre,
              grado: hijo.grado,
              direccion: hijo.direccion,
              parada: hijo.direccion,
            },
          });
        }
      }

      const mensajeExito = hijosNormalizados.some((hijo) => hijo.codigoConductor)
        ? 'Tu cuenta fue creada y vinculada correctamente.'
        : 'Tu cuenta fue creada. Ahora puedes iniciar sesion y vincularte mas tarde.';

      Alert.alert('Registro completado', mensajeExito, [
        { text: 'Continuar', onPress: () => navegarSegunRol(resultado?.usuario) },
      ]);
    } catch (err) {
      Alert.alert('Error en registro', err.message);
    }
  };

  const manejarVincularCuentaExistente = async () => {
    const hijosNormalizados = obtenerHijosNormalizados();
    const vinculacionesHijos = destino === 'padre'
      ? hijosNormalizados.map((hijo) => ({ codigo: hijo.codigoConductor, hijo })).filter((item) => item.codigo)
      : [];
    
    const codigosHijos = vinculacionesHijos.map((item) => item.codigo);
    const vinculacionSuelta = codigo.trim().toUpperCase();
    
    const vinculacionesAVincular = [...vinculacionesHijos];
    if (vinculacionSuelta && !codigosHijos.includes(vinculacionSuelta)) {
      vinculacionesAVincular.push({ codigo: vinculacionSuelta, hijo: null });
    }

    if (vinculacionesAVincular.length === 0) {
      Alert.alert('Codigo requerido', 'Ingresa al menos un codigo de invitacion.');
      return;
    }

    const errorHijos = validarHijosPadre();
    if (destino === 'padre' && errorHijos) {
      Alert.alert('Error', errorHijos);
      return;
    }

    if (!tokenSesion) {
      Alert.alert('Sesion requerida', 'Primero inicia sesion para vincular una cuenta existente.');
      return;
    }

    try {
      setVinculandoCuenta(true);
      let resultado = null;

      for (const vinculacion of vinculacionesAVincular) {
        const hijo = vinculacion.hijo;
        resultado = await vincularConCodigo(vinculacion.codigo, resultado?.token || tokenSesion, hijo ? {
          hijo,
          alumno: {
            nombre: hijo.nombre,
            grado: hijo.grado,
            direccion: hijo.direccion,
            parada: hijo.direccion,
          },
        } : {});
      }

      if (resultado?.token && resultado?.usuario) {
        guardarSesion({ token: resultado.token, usuario: resultado.usuario });
        await AsyncStorage.setItem('token', resultado.token);
        await AsyncStorage.setItem('usuario', JSON.stringify(resultado.usuario));
        await registrarNotificaciones(resultado.usuario.id, resultado.token);
        setTokenSesion(resultado.token);
      }

      Alert.alert('Exito', 'Tu cuenta fue vinculada correctamente.', [
        { text: 'Continuar', onPress: () => navegarSegunRol(resultado?.usuario) },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message || 'No se pudo vincular la cuenta con el codigo.');
    } finally {
      setVinculandoCuenta(false);
    }
  };

  const renderCampoExtra = (campo) => {
    if (campo === 'licencia') {
      return (
        <TextInput
          key={campo}
          style={styles.input}
          placeholder="Licencia de conducir"
          value={datos.licencia}
          onChangeText={(valor) => actualizarDato('licencia', valor)}
          placeholderTextColor={KIDGO_THEME.textSecondary}
        />
      );
    }

    if (campo === 'placa') {
      return (
        <TextInput
          key={campo}
          style={styles.input}
          placeholder="Placa del vehiculo"
          value={datos.placa}
          onChangeText={(valor) => actualizarDato('placa', valor)}
          autoCapitalize="characters"
          placeholderTextColor={KIDGO_THEME.textSecondary}
        />
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.contentContainer} 
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        <View style={styles.headerRegistro}>
          <Text style={styles.tituloForm}>Completa tu registro</Text>
          <Text style={styles.subtituloForm}>
            {destino === 'padre'
              ? 'Ingresa tus datos. Puedes agregar hijos sin codigo y vincularlos despues desde tu panel.'
              : 'Ingresa tus datos personales. El codigo de vinculacion es opcional.'}
          </Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.labelField}>Nombre completo</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Juan Perez"
            value={datos.nombre}
            onChangeText={(valor) => actualizarDato('nombre', valor)}
            placeholderTextColor="#555555"
          />
          
          <Text style={styles.labelField}>Correo electronico</Text>
          <TextInput
            style={styles.input}
            placeholder="correo@ejemplo.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={datos.email}
            onChangeText={(valor) => actualizarDato('email', valor)}
            placeholderTextColor="#555555"
          />

          <Text style={styles.labelField}>Contrasena</Text>
          <TextInput
            style={styles.input}
            placeholder="Minimo 8 caracteres"
            secureTextEntry
            value={datos.password}
            onChangeText={(valor) => actualizarDato('password', valor)}
            placeholderTextColor="#555555"
          />

          <View style={styles.rowInputs}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.labelField}>Telefono</Text>
              <TextInput
                style={styles.input}
                placeholder="7777-7777"
                keyboardType="phone-pad"
                value={datos.telefono}
                onChangeText={(valor) => actualizarDato('telefono', valor)}
                placeholderTextColor="#555555"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.labelField}>DUI</Text>
              <TextInput
                style={styles.input}
                placeholder="00000000-0"
                value={datos.dui}
                onChangeText={(valor) => actualizarDato('dui', valor)}
                placeholderTextColor="#555555"
              />
            </View>
          </View>

          {destino === 'padre' ? (
            <>
              <Text style={styles.labelField}>Direccion de recogida</Text>
              <TextInput
                style={[styles.input, styles.inputMultilinea]}
                placeholder="Ej: Colonia, calle, numero de casa, municipio"
                value={datos.direccion}
                onChangeText={(valor) => actualizarDato('direccion', valor)}
                placeholderTextColor="#555555"
                multiline
                textAlignVertical="top"
              />

              <View style={styles.rowInputs}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.labelField}>Fecha inicio servicio</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="DD/MM/YYYY"
                    value={datos.fechaInicio}
                    onChangeText={(valor) => actualizarDato('fechaInicio', valor)}
                    placeholderTextColor="#555555"
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.labelField}>Fecha fin servicio</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="DD/MM/YYYY"
                    value={datos.fechaFin}
                    onChangeText={(valor) => actualizarDato('fechaFin', valor)}
                    placeholderTextColor="#555555"
                  />
                </View>
              </View>

              <View style={styles.hijosHeader}>
                <View style={styles.hijosHeaderTexto}>
                  <Text style={styles.hijosTitulo}>Hijos a vincular</Text>
                  <Text style={styles.hijosSubtitulo}>
                    Usa el mismo codigo si comparten conductor o uno distinto por cada ruta.
                  </Text>
                </View>
                <TouchableOpacity style={[styles.btnAgregarHijo, { borderColor: brandColor }]} onPress={agregarHijo}>
                  <Text style={[styles.btnAgregarHijoTexto, { color: brandColor }]}>Agregar</Text>
                </TouchableOpacity>
              </View>

              {hijosRegistro.map((hijo, indice) => (
                <View key={`hijo-${indice}`} style={styles.hijoCard}>
                  <View style={styles.hijoCardHeader}>
                    <Text style={styles.hijoCardTitulo}>Hijo {indice + 1}</Text>
                    {hijosRegistro.length > 1 ? (
                      <TouchableOpacity onPress={() => eliminarHijo(indice)}>
                        <Text style={styles.eliminarHijoTexto}>Quitar</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <Text style={styles.labelField}>Nombre del estudiante</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ej: Maria Perez"
                    value={hijo.nombre}
                    onChangeText={(valor) => actualizarHijo(indice, 'nombre', valor)}
                    placeholderTextColor="#555555"
                  />

                  <Text style={styles.labelField}>Grado</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ej: 3A"
                    value={hijo.grado}
                    onChangeText={(valor) => actualizarHijo(indice, 'grado', valor)}
                    placeholderTextColor="#555555"
                  />

                  <Text style={styles.labelField}>Nombre del colegio</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ej: Colegio San José"
                    value={hijo.colegioNombre}
                    onChangeText={(valor) => actualizarHijo(indice, 'colegioNombre', valor)}
                    placeholderTextColor="#555555"
                  />

                  <View style={styles.rowInputs}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.labelField}>Codigo conductor (opcional)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="ABC12345"
                        value={hijo.codigoConductor}
                        onChangeText={(valor) => actualizarHijo(indice, 'codigoConductor', valor)}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        placeholderTextColor="#555555"
                      />
                    </View>
                  </View>

                  <Text style={styles.labelField}>Punto de recogida de este hijo</Text>
                  <TextInput
                    style={[styles.input, styles.inputMultilineaCompacta]}
                    placeholder="Opcional si usa la direccion principal"
                    value={hijo.direccion}
                    onChangeText={(valor) => actualizarHijo(indice, 'direccion', valor)}
                    placeholderTextColor="#555555"
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              ))}
            </>
          ) : null}

          {camposExtra.map(renderCampoExtra)}

          {destino !== 'padre' ? (
            <>
              <View style={styles.separador} />

              <Text style={styles.labelOpcional}>Codigo de vinculacion (opcional)</Text>
              <TextInput
                style={[styles.input, styles.inputDestacado]}
                placeholder="Código (Ej: ABC12345)"
                value={codigo}
                onChangeText={setCodigo}
                autoCapitalize="characters"
                placeholderTextColor="#666666"
              />
            </>
          ) : null}

          {error ? <Text style={styles.errorTexto}>{error}</Text> : null}

          {loading || vinculandoCuenta ? (
            <ActivityIndicator size="large" color={brandColor} style={styles.loader} />
          ) : (
            <View style={styles.footerActions}>
              <TouchableOpacity style={[styles.btn, { backgroundColor: brandColor }]} onPress={handleRegistro}>
                <Text style={styles.btnText}>
                  {destino === 'padre'
                    ? 'Registrarme y vincular hijos'
                    : codigo.trim() ? 'Registrarme y vincularme' : 'Crear mi cuenta'}
                </Text>
              </TouchableOpacity>

              {tokenSesion ? (
                <TouchableOpacity onPress={manejarVincularCuentaExistente} style={[styles.secondaryButton, { borderColor: brandColor }]}>
                  <Text style={[styles.secondaryButtonText, { color: brandColor }]}>
                    {destino === 'padre' ? 'Vincular hijos a mi cuenta existente' : 'Solo vincular mi cuenta existente'}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity 
                style={styles.btnVolverAtras} 
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.btnVolverAtrasText}>Volver atras</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  contentContainer: {
    padding: 24,
    paddingTop: 50,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  logoWrap: {
    width: 80,
    height: 80,
    borderRadius: 22,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoText: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
  },
  kicker: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 10,
  },
  titulo: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitulo: {
    fontSize: 15,
    color: '#B0B0B0',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  formSection: {
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#333333',
  },
  labelInput: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  inputCodigo: {
    borderWidth: 2,
    borderRadius: 18,
    padding: 18,
    fontSize: 26,
    textAlign: 'center',
    letterSpacing: 6,
    fontWeight: '900',
    marginBottom: 20,
    backgroundColor: '#121212',
  },
  headerRegistro: {
    marginBottom: 24,
  },
  tituloForm: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtituloForm: {
    fontSize: 14,
    color: '#B0B0B0',
    lineHeight: 20,
  },
  formContainer: {
    marginTop: 10,
  },
  labelField: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E0E0E0',
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 16,
    padding: 15,
    fontSize: 15,
    marginBottom: 18,
    color: '#FFFFFF',
  },
  inputMultilinea: {
    minHeight: 86,
  },
  inputMultilineaCompacta: {
    minHeight: 68,
  },
  rowInputs: {
    flexDirection: 'row',
  },
  hijosHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 6,
    marginBottom: 14,
  },
  hijosHeaderTexto: {
    flex: 1,
  },
  hijosTitulo: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  hijosSubtitulo: {
    color: '#B0B0B0',
    fontSize: 13,
    lineHeight: 18,
  },
  btnAgregarHijo: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  btnAgregarHijoTexto: {
    fontSize: 13,
    fontWeight: '900',
  },
  hijoCard: {
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
  },
  hijoCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  hijoCardTitulo: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  eliminarHijoTexto: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '800',
  },
  inputDestacado: {
    backgroundColor: '#1A1D21',
    borderColor: '#3B82F640',
    borderWidth: 1.5,
  },
  labelOpcional: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
    marginTop: 5,
  },
  separador: {
    height: 1,
    backgroundColor: '#333333',
    marginVertical: 20,
  },
  infoBox: {
    backgroundColor: '#1E1E1E',
    padding: 20,
    borderRadius: 20,
    marginBottom: 24,
    borderWidth: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  infoIconText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },
  infoLabel: {
    fontSize: 11,
    color: '#888888',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#333333',
    marginVertical: 12,
    marginLeft: 46,
  },
  btn: {
    padding: 18,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  btnText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    marginTop: 14,
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 16,
  },
  secondaryButtonText: {
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
  },
  btnVolverAtras: {
    marginTop: 20,
    padding: 10,
    alignItems: 'center',
  },
  btnVolverAtrasText: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '700',
  },
  errorTexto: {
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '700',
    fontSize: 13,
  },
  loader: {
    marginVertical: 10,
  },
  salirBtn: {
    marginTop: 24,
    padding: 12,
    alignItems: 'center',
  },
  salirBtnText: {
    color: '#666666',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
