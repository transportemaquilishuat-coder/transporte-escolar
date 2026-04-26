import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { limpiarSesion } from '../services/session';

export default function PantallaPadreWeb({ navigation }) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Vista Padre no disponible en web</Text>
        <Text style={styles.text}>
          Esta pantalla sigue pensada para la app movil porque usa funciones de mapa y seguimiento en tiempo real.
        </Text>
        <Text style={styles.text}>
          La consola de superadministrador si se puede usar desde navegador.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.replace('SuperAdmin')}
        >
          <Text style={styles.primaryButtonText}>Ir a SuperAdministrador</Text>
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
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  title: {
    fontSize: 24,
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
    marginTop: 16,
    backgroundColor: '#0F172A',
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
