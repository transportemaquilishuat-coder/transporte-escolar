import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { useBranding } from '../../hooks/useBranding';
import { KIDGO_THEME } from '../../theme/kidgoTheme';

const OPCIONES = [
  {
    key: 'admin',
    titulo: 'Administrador de colegio',
    descripcion: 'Crea tu cuenta administrativa. Podras vincular el colegio con codigo cuando lo tengas.',
  },
  {
    key: 'conductor',
    titulo: 'Conductor',
    descripcion: 'Crea tu perfil de conductor y genera codigos para padres, aun sin colegio vinculado.',
  },
  {
    key: 'padre',
    titulo: 'Padre de familia',
    descripcion: 'Crea tu cuenta y vincula a tus hijos con el codigo del conductor cuando este disponible.',
  },
];

export default function PantallaRegistro({ navigation }) {
  const { branding } = useBranding();
  const logoFuente = branding.logoUri ? { uri: branding.logoUri } : null;
  const brandColor = branding.headerColor || KIDGO_THEME.primary;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <View style={styles.hero}>
          <View style={[styles.logoWrap, { backgroundColor: brandColor, shadowColor: brandColor }]}>
            {logoFuente ? <Image source={logoFuente} style={styles.logoImage} /> : <Text style={styles.logoText}>KG</Text>}
          </View>
          <Text style={[styles.kicker, { color: brandColor }]}>{branding.appName || 'KidsGo!'}</Text>
          <Text style={styles.titulo}>Elige tu tipo de cuenta</Text>
          <Text style={styles.subtitulo}>
            El codigo de vinculacion es opcional. Primero puedes crear tu cuenta y entrar a tu panel.
          </Text>
        </View>

        {OPCIONES.map((opcion) => (
          <TouchableOpacity
            key={opcion.key}
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => {
              navigation.navigate('RegistroCodigo', {
                destino: opcion.key,
                iniciarConDatos: true,
              });
            }}
          >
            <View style={styles.cardContent}>
              <Text style={styles.cardTitulo}>{opcion.titulo}</Text>
              <Text style={styles.cardTexto}>{opcion.descripcion}</Text>
              <View style={styles.accionFila}>
                <Text style={[styles.cardAccion, { color: brandColor }]}>
                  Continuar con este rol
                </Text>
                <View style={[styles.dot, { backgroundColor: brandColor }]} />
              </View>
            </View>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.volverBtn} onPress={() => navigation.goBack()}>
          <Text style={[styles.volverTexto, { color: brandColor }]}>Ya tienes cuenta? Inicia sesion</Text>
        </TouchableOpacity>
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
    paddingTop: 60,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoWrap: {
    width: 80,
    height: 80,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
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
    fontSize: 28,
    fontWeight: '900',
  },
  kicker: {
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 10,
  },
  titulo: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitulo: {
    fontSize: 16,
    color: '#E0E0E0',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 10,
  },
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333333',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 5,
    overflow: 'hidden',
  },
  cardContent: {
    padding: 22,
  },
  cardTitulo: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  cardTexto: {
    fontSize: 14,
    color: '#B0B0B0',
    lineHeight: 21,
    marginBottom: 16,
  },
  accionFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardAccion: {
    fontSize: 14,
    fontWeight: '900',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  volverBtn: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 10,
  },
  volverTexto: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
