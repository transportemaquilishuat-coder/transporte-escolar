import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { limpiarSesion } from '../services/session';

export default function PantallaAdminWeb({ navigation }) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.badge}>Web</Text>
        <Text style={styles.title}>Panel administrativo parcial en navegador</Text>
        <Text style={styles.text}>
          La version completa de administracion sigue dependiendo de componentes moviles, especialmente el mapa.
        </Text>
        <Text style={styles.text}>
          Para revisar y gestionar desde web, usa la pantalla de superadministrador que ya es responsive.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.replace('SuperAdmin')}
        >
          <Text style={styles.primaryButtonText}>Abrir SuperAdministrador</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={async () => {
            await limpiarSesion();
            navigation.replace('Login');
          }}
        >
          <Text style={styles.secondaryButtonText}>Volver al login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 26,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 14,
  },
  title: {
    fontSize: 25,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
    marginBottom: 10,
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '700',
  },
});
