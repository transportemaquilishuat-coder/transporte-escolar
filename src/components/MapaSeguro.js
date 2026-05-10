import { Platform } from 'react-native';

// En web mostramos un placeholder, en móvil el mapa real
if (Platform.OS === 'web') {
    const { View, Text, StyleSheet } = require('react-native');

    const MapaSeguro = ({ style, children, ...props }) => (
        <View style={[styles.placeholder, style]}>
            <Text style={styles.icono}>🗺️</Text>
            <Text style={styles.texto}>Mapa disponible en la app móvil</Text>
        </View>
    );

    const Marker = () => null;
    const Polyline = () => null;
    const PROVIDER_GOOGLE = null;

    const styles = StyleSheet.create({
        placeholder: {
            backgroundColor: '#E8F0FE',
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 16,
        },
        icono: { fontSize: 48, marginBottom: 8 },
        texto: { fontSize: 13, color: '#1A56DB', fontWeight: '600' },
    });

    module.exports = { default: MapaSeguro, Marker, Polyline, PROVIDER_GOOGLE };
} else {
    module.exports = require('react-native-maps');
}