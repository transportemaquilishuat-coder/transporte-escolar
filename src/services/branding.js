import AsyncStorage from '@react-native-async-storage/async-storage';
import { BRANDING_DEFAULTS } from '../theme/kidgoTheme';

const BRANDING_KEY = '@kidsgo_branding';

export const getBranding = async () => {
  try {
    const rawValue = await AsyncStorage.getItem(BRANDING_KEY);
    if (!rawValue) {
      return BRANDING_DEFAULTS;
    }

    const parsed = JSON.parse(rawValue);
    return {
      ...BRANDING_DEFAULTS,
      ...(parsed || {}),
    };
  } catch (error) {
    return BRANDING_DEFAULTS;
  }
};

export const saveBranding = async (branding) => {
  const nextBranding = {
    ...BRANDING_DEFAULTS,
    ...(branding || {}),
  };

  await AsyncStorage.setItem(BRANDING_KEY, JSON.stringify(nextBranding));
  return nextBranding;
};

export const resetBranding = async () => {
  await AsyncStorage.removeItem(BRANDING_KEY);
  return BRANDING_DEFAULTS;
};

/**
 * Intenta sincronizar el branding con el servidor.
 * Si no hay token o colegioId, puede intentar un branding global.
 */
export const syncBranding = async (colegioId = null) => {
  try {
    // Aquí se podría hacer un fetch a un endpoint público o autenticado
    // const res = await fetch(`${API_URL}/branding/${colegioId || 'default'}`);
    // const data = await res.json();
    // if (data) return await updateBranding(data);
    return await getBranding();
  } catch (error) {
    return await getBranding();
  }
};
