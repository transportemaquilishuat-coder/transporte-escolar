import AsyncStorage from '@react-native-async-storage/async-storage';
import { BRANDING_DEFAULTS } from '../theme/kidgoTheme';

const BRANDING_KEY = '@kidgo_branding';

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

export const updateBranding = async (partialBranding) => {
  const currentBranding = await getBranding();
  const nextBranding = {
    ...currentBranding,
    ...(partialBranding || {}),
  };

  await AsyncStorage.setItem(BRANDING_KEY, JSON.stringify(nextBranding));
  return nextBranding;
};
