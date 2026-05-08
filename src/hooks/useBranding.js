import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { updateBranding, resetBranding as resetBrandingSrv, syncBranding } from '../services/branding';
import { BRANDING_DEFAULTS } from '../theme/kidgoTheme';

export const useBranding = () => {
  const [branding, setBranding] = useState(BRANDING_DEFAULTS);
  const [brandingLoading, setBrandingLoading] = useState(true);

  const refreshBranding = useCallback(async (colegioId = null) => {
    setBrandingLoading(true);
    try {
      const brandingData = await syncBranding(colegioId);
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

  const resetToFactoryBranding = useCallback(async () => {
    const defaults = await resetBrandingSrv();
    setBranding(defaults);
    return defaults;
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
    resetToFactoryBranding,
  };
};
