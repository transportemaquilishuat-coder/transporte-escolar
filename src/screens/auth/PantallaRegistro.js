import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { useBranding } from '../../hooks/useBranding';
import { KIDGO_THEME } from '../../theme/kidgoTheme';

const OPCIONES = [
  {
    key: 'admin',
    titulo: 'Administrador de colegio',
    descripcion: 'Usa el codigo generado por el superadministrador para activar tu colegio.',
  },
  {
    key: 'conductor',
    titulo: 'Conductor',
    descripcion: 'Usa el codigo entregado por el administrador para unirte a la operacion.',
  },
  {
    key: 'conductor_creds',
    titulo: 'Conductor registrado',
    descripcion: 'Ya tienes cuenta? Ingresa con tu correo y contraseña.',
    esLoginDirecto: true,
  },
  {
    key: 'padre',
    titulo: 'Padre de familia',
    descripcion: 'Usa el codigo compartido por tu conductor para vincularte.',
  },
];

export default function PantallaRegistro({ navigation }) {
  const { branding } = useBranding();
  const logoFuente = branding.logoUri ? { uri: branding.logoUri } : null;
  const brandColor = branding.headerColor || KIDGO_THEME.primaryDark;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.hero}>
        <View style={[styles.logoWrap, { backgroundColor: brandColor }]}>
          {logoFuente ? <Image source={logoFuente} style={styles.logoImage} /> : <Text style={styles.logoText}>KG</Text>}
        </View>
        <Text style={styles.kicker}>{branding.appName || 'kidGo'}</Text>
        <Text style={styles.titulo}>Elige como te vas a vincular</Text>
        <Text style={styles.subtitulo}>
          Cada rol entra con un codigo distinto. Desde aqui puedes continuar con el flujo correcto.
        </Text>
      </View>

      {OPCIONES.map((opcion) => (
        <TouchableOpacity
          key={opcion.key}
          style={styles.card}
          onPress={() => {
            if (opcion.esLoginDirecto) {
              // Conductor con cuenta existente va al login principal
              navigation.navigate('Login');
            } else {
              navigation.navigate('RegistroCodigo', { destino: opcion.key });
            }
          }}
        >
          <Text style={styles.cardTitulo}>{opcion.titulo}</Text>
          <Text style={styles.cardTexto}>{opcion.descripcion}</Text>
          <Text style={[styles.cardAccion, { color: brandColor }]}>
            {opcion.esLoginDirecto ? 'Ingresar con mis credenciales' : 'Continuar con este rol'}
          </Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.volverBtn} onPress={() => navigation.goBack()}>
        <Text style={[styles.volverTexto, { color: brandColor }]}>Volver al inicio de sesion</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: KIDGO_THEME.background,
  },
  contentContainer: {
    padding: 24,
    paddingTop: 48,
    paddingBottom: 36,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoWrap: {
    width: 76,
    height: 76,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 12,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoText: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    color: KIDGO_THEME.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  titulo: {
    fontSize: 28,
    fontWeight: '800',
    color: KIDGO_THEME.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitulo: {
    fontSize: 15,
    color: KIDGO_THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  card: {
    backgroundColor: KIDGO_THEME.surface,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: KIDGO_THEME.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTitulo: {
    fontSize: 17,
    fontWeight: '800',
    color: KIDGO_THEME.text,
    marginBottom: 8,
  },
  cardTexto: {
    fontSize: 14,
    color: KIDGO_THEME.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
  },
  cardAccion: {
    fontSize: 13,
    fontWeight: '800',
  },
  volverBtn: {
    marginTop: 10,
    alignItems: 'center',
  },
  volverTexto: {
    fontSize: 14,
    fontWeight: '700',
  },
});
