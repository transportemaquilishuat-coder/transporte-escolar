import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowRight,
  Bus,
  Clock3,
  Lock,
  Mail,
  MapPin,
  Route,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react-native';

// Pantallas existentes
import PantallaPadre from './src/screens/PantallaPadre';
import PantallaConductor from './src/screens/PantallaConductor';
import PantallaAdmin from './src/screens/PantallaAdmin';
import PantallaSuperAdmin from './src/screens/PantallaSuperAdmin';
import PantallaRegistro from './src/screens/auth/PantallaRegistro';
import PerfilConductor from './src/screens/conductor/PerfilConductor';
import ConductorPadresScreen from './src/screens/conductor/PadresScreen';
import AdminConductoresScreen from './src/screens/admin/ConductoresScreen';

// Pantallas de vinculación
import RegistroCodigoScreen from './src/screens/auth/RegistroCodigoScreen';

import { registrarNotificaciones } from './src/services/notificaciones';
import { cargarSesionPersistida, guardarSesion } from './src/services/session';
import { KIDGO_THEME } from './src/theme/kidgoTheme';

const Stack = createNativeStackNavigator();

const esRolSuperAdmin = (rol = '') => (
  ['superadmin', 'super_admin', 'super-administrador', 'super_administrador'].includes(String(rol).toLowerCase())
);

const obtenerPantallaPorRol = (rol = '') => {
  const rolNormalizado = String(rol).toLowerCase();

  if (esRolSuperAdmin(rolNormalizado)) return 'SuperAdmin';
  if (rolNormalizado === 'padre') return 'Padre';
  if (rolNormalizado === 'conductor') return 'Conductor';
  if (rolNormalizado === 'admin' || rolNormalizado === 'administrador') return 'Admin';

  return 'Login';
};

function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { width } = useWindowDimensions();
  const isDesktop = width >= 920;

  const floatA = useRef(new Animated.Value(0)).current;
  const floatB = useRef(new Animated.Value(0)).current;
  const routeTravel = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animacionA = Animated.loop(
      Animated.sequence([
        Animated.timing(floatA, {
          toValue: 1,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatA, {
          toValue: 0,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const animacionB = Animated.loop(
      Animated.sequence([
        Animated.timing(floatB, {
          toValue: 1,
          duration: 6800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatB, {
          toValue: 0,
          duration: 6800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const viajeRuta = Animated.loop(
      Animated.sequence([
        Animated.timing(routeTravel, {
          toValue: 1,
          duration: 4200,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(routeTravel, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );

    animacionA.start();
    animacionB.start();
    viajeRuta.start();

    return () => {
      animacionA.stop();
      animacionB.stop();
      viajeRuta.stop();
    };
  }, [floatA, floatB, routeTravel]);

  const handleLogin = async () => {
    setError('');
    if (!email || !password) {
      setError('Por favor ingresa tu correo y contraseña.');
      return;
    }

    setLoading(true);
    try {
      const respuesta = await fetch('https://transporte-backend-production.up.railway.app/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase(), password }),
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        setError(datos.error || 'Error al iniciar sesión');
      } else {
        guardarSesion({ token: datos.token, usuario: datos.usuario });

        const rol = datos.usuario.rol;
        const pantalla = obtenerPantallaPorRol(rol);

        await registrarNotificaciones(datos.usuario.id, datos.token);

        if (pantalla !== 'Login') {
          navigation.reset({
            index: 0,
            routes: [{ name: pantalla }],
          });
        }
      }
    } catch (_error) {
      setError('No se pudo conectar al servidor.');
    }
    setLoading(false);
  };

  const heroStats = [
    { label: 'Rutas', value: 'En movimiento', Icon: Route },
    { label: 'Seguridad', value: 'Acceso KidGo', Icon: ShieldCheck },
    { label: 'Comunidad', value: 'Familias y equipo', Icon: Users },
  ];

  const routeShiftX = routeTravel.interpolate({
    inputRange: [0, 1],
    outputRange: [0, isDesktop ? 230 : 150],
  });
  const routeShiftY = routeTravel.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });
  const floatAShift = floatA.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -14],
  });
  const floatBShift = floatB.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 12],
  });

  return (
    <LinearGradient
      colors={[KIDGO_THEME.secondaryDark, KIDGO_THEME.secondary, '#1A1A1A', KIDGO_THEME.background]}
      locations={[0, 0.25, 0.6, 1]}
      style={styles.screen}
    >
      <View style={styles.backgroundOrbs} pointerEvents="none">
        <Animated.View
          style={[
            styles.orb,
            styles.orbOne,
            {
              transform: [
                { translateY: floatAShift },
                { translateX: routeTravel.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.orb,
            styles.orbTwo,
            {
              transform: [
                { translateY: floatBShift },
                { translateX: routeTravel.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) },
              ],
            },
          ]}
        />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesktop]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.shell, isDesktop && styles.shellDesktop]}>
            <View style={[styles.heroPanel, isDesktop && styles.heroPanelDesktop]}>
              <Animated.View style={[styles.heroBadge, { transform: [{ translateY: floatAShift }] }]}>
                <Sparkles size={14} color={KIDGO_THEME.primary} strokeWidth={2.4} />
                <Text style={styles.heroBadgeText}>KidsGo! · Safe School Transport</Text>
              </Animated.View>

              <Text style={styles.heroTitle}>¡Bienvenido a KidsGo!</Text>
              <Text style={styles.heroSubtitle}>
                El transporte escolar más seguro y confiable. Porque cada niño merece llegar a casa con seguridad.
              </Text>

              <View style={styles.heroStats}>
                {heroStats.map(({ label, value, Icon }) => (
                  <View key={label} style={styles.heroStatCard}>
                    <View style={[styles.heroStatIcon, { backgroundColor: KIDGO_THEME.primary }]}>
                      <Icon size={16} color={KIDGO_THEME.secondaryDark} strokeWidth={2.2} />
                    </View>
                    <Text style={styles.heroStatValue}>{value}</Text>
                    <Text style={styles.heroStatLabel}>{label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.routeStage}>
                <View style={styles.routeTrack} />
                <View style={styles.routeStops}>
                  <View style={styles.routeStop} />
                  <View style={styles.routeStop} />
                  <View style={styles.routeStop} />
                </View>
                <Animated.View
                  style={[
                    styles.routeBus,
                    {
                      transform: [
                        { translateX: routeShiftX },
                        { translateY: routeShiftY },
                      ],
                    },
                  ]}
                >
                  <Bus size={18} color="#fff" strokeWidth={2.2} />
                </Animated.View>
              </View>

              <View style={styles.heroNote}>
                <Clock3 size={14} color={KIDGO_THEME.primary} strokeWidth={2.2} />
                <Text style={styles.heroNoteText}>
                  Seguridad garantizada para cada viaje escolar. Confianza para padres, tranquilidad para todos.
                </Text>
              </View>
            </View>

            <View style={styles.formPanel}>
              <View style={styles.formHeader}>
                <View style={styles.formKicker}>
                  <ShieldCheck size={14} color={KIDGO_THEME.secondary} strokeWidth={2.2} />
                  <Text style={styles.formKickerText}>Acceso seguro</Text>
                </View>
                <Text style={styles.formTitle}>Inicia sesión en KidGo</Text>
                <Text style={styles.formSubtitle}>
                  Usa tu correo y contraseña para entrar al panel que te corresponde.
                </Text>
              </View>

              <View style={styles.inputShell}>
                <Mail size={16} color={KIDGO_THEME.textSecondary} strokeWidth={2} />
                <TextInput
                  style={styles.input}
                  placeholder="Correo electrónico"
                  placeholderTextColor={KIDGO_THEME.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                />
              </View>

              <View style={styles.inputShell}>
                <Lock size={16} color={KIDGO_THEME.textSecondary} strokeWidth={2} />
                <TextInput
                  style={styles.input}
                  placeholder="Contraseña"
                  placeholderTextColor={KIDGO_THEME.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="password"
                  textContentType="password"
                />
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.error}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.boton, loading && styles.botonDeshabilitado]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={KIDGO_THEME.secondaryDark} />
                ) : (
                  <>
                    <Text style={styles.botonTexto}>Entrar a KidsGo!</Text>
                    <ArrowRight size={18} color={KIDGO_THEME.secondaryDark} strokeWidth={2.4} />
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.formLinks}>
                <TouchableOpacity
                  style={styles.linkChip}
                  onPress={() => navigation.navigate('Registro')}
                >
                  <Text style={styles.linkChipText}>Crear cuenta</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkChipAlt}
                  onPress={() => navigation.navigate('RegistroCodigo')}
                >
                  <Text style={styles.linkChipAltText}>Tengo un código de invitación</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formFooterCard}>
                <View style={styles.formFooterRow}>
                  <MapPin size={14} color={KIDGO_THEME.primary} strokeWidth={2.2} />
                  <Text style={styles.formFooterText}>
                    KidsGo! - Transporte escolar seguro. Cada viaje, una garantía de tranquilidad.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

export default function App() {
  const [pantallaInicial, setPantallaInicial] = useState(null);

  useEffect(() => {
    let activo = true;

    const hidratarSesion = async () => {
      const sesion = await cargarSesionPersistida();

      if (sesion?.usuario && sesion?.token) {
        await registrarNotificaciones(sesion.usuario.id, sesion.token);
      }

      if (activo) {
        setPantallaInicial(obtenerPantallaPorRol(sesion?.usuario?.rol));
      }
    };

    hidratarSesion();

    return () => {
      activo = false;
    };
  }, []);

  if (!pantallaInicial) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={KIDGO_THEME.primaryDark} />
        <Text style={styles.loadingText}>Cargando sesion...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={pantallaInicial} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Registro" component={PantallaRegistro} />
        <Stack.Screen name="RegistroCodigo" component={RegistroCodigoScreen} />
        <Stack.Screen name="SuperAdmin" component={PantallaSuperAdmin} />
        <Stack.Screen name="Admin" component={PantallaAdmin} />
        <Stack.Screen
          name="AdminConductores"
          component={AdminConductoresScreen}
          options={{ headerShown: true, title: 'Gestion de Conductores' }}
        />
        <Stack.Screen name="Conductor" component={PantallaConductor} />
        <Stack.Screen
          name="PerfilConductor"
          component={PerfilConductor}
          options={{ headerShown: true, title: 'Mi Perfil' }}
        />
        <Stack.Screen
          name="ConductorPadres"
          component={ConductorPadresScreen}
          options={{ headerShown: true, title: 'Gestión de Padres' }}
        />
        <Stack.Screen name="Padre" component={PantallaPadre} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: KIDGO_THEME.background,
  },
  loadingText: {
    marginTop: 12,
    color: KIDGO_THEME.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  screen: {
    flex: 1,
  },
  backgroundOrbs: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.28,
  },
  orbOne: {
    width: 320,
    height: 320,
    top: -100,
    right: -80,
    backgroundColor: '#FFD700',
    opacity: 0.15,
  },
  orbTwo: {
    width: 280,
    height: 280,
    bottom: 180,
    left: -100,
    backgroundColor: '#FFD700',
    opacity: 0.08,
  },
  keyboard: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingVertical: 22,
    justifyContent: 'center',
  },
  scrollContentDesktop: {
    paddingHorizontal: 28,
  },
  shell: {
    gap: 18,
  },
  shellDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    maxWidth: 1160,
    alignSelf: 'center',
    gap: 20,
  },
  heroPanel: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  heroPanelDesktop: {
    flex: 1.08,
    padding: 30,
    justifyContent: 'space-between',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 18,
  },
  heroBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    marginBottom: 12,
    maxWidth: 420,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 500,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
    flexWrap: 'wrap',
  },
  heroStatCard: {
    flexGrow: 1,
    minWidth: 150,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  heroStatIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    marginBottom: 12,
  },
  heroStatValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  heroStatLabel: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '700',
  },
  routeStage: {
    height: 92,
    marginTop: 24,
    marginBottom: 12,
    justifyContent: 'center',
  },
  routeTrack: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  routeStops: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  routeStop: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  routeBus: {
    position: 'absolute',
    left: 8,
    top: 30,
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: KIDGO_THEME.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  heroNote: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  heroNoteText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    flex: 1,
  },
  formPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(216,225,236,0.9)',
    shadowColor: '#0B1220',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  formHeader: {
    marginBottom: 18,
  },
  formKicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 14,
  },
  formKickerText: {
    color: KIDGO_THEME.secondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  formTitle: {
    color: KIDGO_THEME.text,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900',
    marginBottom: 8,
  },
  formSubtitle: {
    color: KIDGO_THEME.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: KIDGO_THEME.background,
    borderWidth: 1,
    borderColor: KIDGO_THEME.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    color: KIDGO_THEME.text,
    fontSize: 15,
    paddingVertical: 14,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 2,
  },
  error: {
    color: KIDGO_THEME.error,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  boton: {
    marginTop: 12,
    backgroundColor: KIDGO_THEME.primaryDark,
    borderRadius: 16,
    minHeight: 52,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  botonDeshabilitado: {
    opacity: 0.72,
  },
  botonTexto: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  formLinks: {
    marginTop: 14,
    gap: 10,
  },
  linkChip: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: KIDGO_THEME.border,
    backgroundColor: KIDGO_THEME.surface,
  },
  linkChipText: {
    color: KIDGO_THEME.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  linkChipAlt: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFE3D6',
    backgroundColor: '#EFFAF4',
  },
  linkChipAltText: {
    color: KIDGO_THEME.secondary,
    fontSize: 14,
    fontWeight: '800',
  },
  formFooterCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: KIDGO_THEME.border,
  },
  formFooterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  formFooterText: {
    flex: 1,
    color: KIDGO_THEME.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
});
