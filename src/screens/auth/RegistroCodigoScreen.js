import React, { useEffect, useMemo, useState } from 'react';
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

export default function RegistroCodigoScreen({ navigation, route }) {
  const { loading, error, infoCodigo, verificar, registrar } = useRegistroCodigo();
  const { branding } = useBranding();
  const [paso, setPaso] = useState(1);
  const [codigo, setCodigo] = useState('');
  const [tokenSesion, setTokenSesion] = useState('');
  const [vinculandoCuenta, setVinculandoCuenta] = useState(false);
  const [datos, setDatos] = useState({
    nombre: '',
    email: '',
    password: '',
    telefono: '',
    dui: '',
    licencia: '',
    placa: '',
  });

  const destino = route?.params?.destino || '';
  const mensaje = route?.params?.mensaje || 'Ingresa el codigo que recibiste para registrarte y vincularte.';
  const tituloPantalla = useMemo(
    () => TITULOS_POR_DESTINO[destino] || 'Registro con codigo',
    [destino]
  );
  const camposExtra = CAMPOS_EXTRA_POR_TIPO[infoCodigo?.tipo] || [];
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

  const navegarSegunRol = (usuario) => {
    const rol = (usuario?.rol || destino || '').toLowerCase();
    const pantalla = PANTALLA_POR_ROL[rol] || 'Login';
    navigation.reset({
      index: 0,
      routes: [{ name: pantalla }],
    });
  };

  const handleVerificarCodigo = async () => {
    const codigoNormalizado = codigo.trim().toUpperCase();
    if (!codigoNormalizado) {
      Alert.alert('Error', 'Ingresa un codigo valido.');
      return;
    }

    try {
      await verificar(codigoNormalizado);
      setPaso(2);
    } catch (err) {
      Alert.alert('Codigo invalido', err.message);
    }
  };

  const handleRegistro = async () => {
    if (!datos.nombre.trim() || !datos.email.trim() || !datos.password.trim()) {
      Alert.alert('Error', 'Nombre, correo y contrasena son obligatorios.');
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
      const resultado = await registrar({
        ...datos,
        codigo: codigo.trim().toUpperCase(),
        rolSolicitado: destino || undefined,
      });

      if (resultado?.token && resultado?.usuario) {
        guardarSesion({ token: resultado.token, usuario: resultado.usuario });
        await AsyncStorage.setItem('token', resultado.token);
        await AsyncStorage.setItem('usuario', JSON.stringify(resultado.usuario));
        await registrarNotificaciones(resultado.usuario.id, resultado.token);
      }

      Alert.alert('Registro completado', 'Tu cuenta fue creada y vinculada correctamente.', [
        { text: 'Continuar', onPress: () => navegarSegunRol(resultado?.usuario) },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  const manejarVincularCuentaExistente = async () => {
    const codigoNormalizado = codigo.trim().toUpperCase();

    if (!codigoNormalizado) {
      Alert.alert('Codigo requerido', 'Ingresa el codigo de invitacion.');
      return;
    }

    if (!tokenSesion) {
      Alert.alert('Sesion requerida', 'Primero inicia sesion para vincular una cuenta existente.');
      return;
    }

    try {
      setVinculandoCuenta(true);
      const resultado = await vincularConCodigo(codigoNormalizado, tokenSesion);

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

  if (paso === 1) {
    return (
      <View style={styles.container}>
        <View style={styles.hero}>
          <View style={[styles.logoWrap, { backgroundColor: brandColor }]}>
            {logoFuente ? <Image source={logoFuente} style={styles.logoImage} /> : <Text style={styles.logoText}>KG</Text>}
          </View>
          <Text style={styles.kicker}>{branding.appName || 'kidGo'}</Text>
          <Text style={styles.titulo}>{tituloPantalla}</Text>
          <Text style={styles.subtitulo}>{mensaje}</Text>
        </View>

        <TextInput
          style={[styles.inputCodigo, { borderColor: brandColor, color: KIDGO_THEME.text }]}
          placeholder="ABC12345"
          placeholderTextColor={KIDGO_THEME.textMuted}
          value={codigo}
          onChangeText={setCodigo}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
        />

        {error ? <Text style={styles.errorTexto}>{error}</Text> : null}

        {loading || vinculandoCuenta ? (
          <ActivityIndicator size="large" color={brandColor} />
        ) : (
          <TouchableOpacity style={[styles.btn, { backgroundColor: brandColor }]} onPress={handleVerificarCodigo}>
            <Text style={styles.btnText}>Verificar codigo</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.salirBtn}
          onPress={() => navigation.replace('Login')}
        >
          <Text style={styles.salirBtnText}>Cancelar y volver al login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.titulo}>Completa tu registro</Text>

      {infoCodigo ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>Tipo de vinculacion: {infoCodigo.tipo || 'No definido'}</Text>
          <Text style={styles.infoText}>
            Colegio: {infoCodigo.colegio || infoCodigo.colegio_nombre || 'No disponible'}
          </Text>
        </View>
      ) : null}

      <TextInput
        style={styles.input}
        placeholder="Nombre completo"
        value={datos.nombre}
        onChangeText={(valor) => actualizarDato('nombre', valor)}
        placeholderTextColor={KIDGO_THEME.textSecondary}
      />
      <TextInput
        style={styles.input}
        placeholder="Correo electronico"
        keyboardType="email-address"
        autoCapitalize="none"
        value={datos.email}
        onChangeText={(valor) => actualizarDato('email', valor)}
        placeholderTextColor={KIDGO_THEME.textSecondary}
      />
      <TextInput
        style={styles.input}
        placeholder="Contrasena"
        secureTextEntry
        value={datos.password}
        onChangeText={(valor) => actualizarDato('password', valor)}
        placeholderTextColor={KIDGO_THEME.textSecondary}
      />
      <TextInput
        style={styles.input}
        placeholder="Telefono"
        keyboardType="phone-pad"
        value={datos.telefono}
        onChangeText={(valor) => actualizarDato('telefono', valor)}
        placeholderTextColor={KIDGO_THEME.textSecondary}
      />
      <TextInput
        style={styles.input}
        placeholder="DUI"
        value={datos.dui}
        onChangeText={(valor) => actualizarDato('dui', valor)}
        placeholderTextColor={KIDGO_THEME.textSecondary}
      />

      {camposExtra.map(renderCampoExtra)}

      {error ? <Text style={styles.errorTexto}>{error}</Text> : null}

      {loading || vinculandoCuenta ? (
        <ActivityIndicator size="large" color={brandColor} style={styles.loader} />
      ) : (
        <>
          <TouchableOpacity style={[styles.btn, { backgroundColor: brandColor }]} onPress={handleRegistro}>
            <Text style={styles.btnText}>Registrarme y vincularme</Text>
          </TouchableOpacity>

          {tokenSesion ? (
            <TouchableOpacity onPress={manejarVincularCuentaExistente} style={[styles.secondaryButton, { borderColor: brandColor }]}>
              <Text style={[styles.secondaryButtonText, { color: brandColor }]}>Ya tengo cuenta, solo vincularme</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: KIDGO_THEME.background,
  },
  contentContainer: {
    paddingBottom: 32,
  },
  hero: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 18,
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  kicker: {
    fontSize: 12,
    color: KIDGO_THEME.textSecondary,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  titulo: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
    color: KIDGO_THEME.text,
  },
  subtitulo: {
    fontSize: 16,
    color: KIDGO_THEME.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  inputCodigo: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 16,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 4,
    fontWeight: '800',
    marginBottom: 24,
    backgroundColor: KIDGO_THEME.surface,
  },
  input: {
    borderWidth: 1,
    borderColor: KIDGO_THEME.border,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
    color: KIDGO_THEME.text,
    backgroundColor: KIDGO_THEME.surface,
  },
  btn: {
    padding: 16,
    borderRadius: 14,
    marginTop: 8,
  },
  btnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: KIDGO_THEME.surfaceElevated,
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: KIDGO_THEME.border,
  },
  infoText: {
    color: KIDGO_THEME.primary,
    fontWeight: '700',
    marginBottom: 4,
  },
  errorTexto: {
    color: KIDGO_THEME.error,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '700',
  },
  loader: {
    marginTop: 20,
  },
  secondaryButton: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    backgroundColor: KIDGO_THEME.surface,
  },
  secondaryButtonText: {
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'center',
  },
  salirBtn: {
    marginTop: 20,
    padding: 14,
    alignItems: 'center',
  },
  salirBtnText: {
    color: KIDGO_THEME.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
