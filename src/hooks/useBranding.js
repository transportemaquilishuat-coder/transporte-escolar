import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getBranding, updateBranding } from '../services/branding';
import { BRANDING_DEFAULTS } from '../theme/kidgoTheme';

export const useBranding = () => {
  const [branding, setBranding] = useState(BRANDING_DEFAULTS);
  const [brandingLoading, setBrandingLoading] = useState(true);

  const refreshBranding = useCallback(async () => {
    setBrandingLoading(true);
    try {
      const brandingData = await getBranding();
      setBranding(brandingData);
      return brandingData;
    } finally {
      setBrandingLoading(false);
    }
  }, []);

  const saveBrandingChanges = useCallback(async (partialBranding) => {
    const nextBranding = await updateBranding(partialBranding);
    setBranding(nextBranding);
    return nextBranding;
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshBranding();
    }, [refreshBranding])
  );

  return {
    branding,
    brandingLoading,
    refreshBranding,
    saveBrandingChanges,
  };
};
