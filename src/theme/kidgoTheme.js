// KidsGo! - Safe School Transport
// Theme: Elegant Emerald Green - Professional, Modern, School-focused
// Colors: Emerald green (trust, safety, growth) with dark accents

export const KIDGO_THEME = {
  // Primary: Elegant emerald green - trust, safety, growth (perfect for schools)
  primary: '#10B981',           // Emerald green
  primaryLight: '#34D399',      // Bright emerald for highlights
  primaryDark: '#059669',       // Darker emerald for depth

  // Secondary: Black - modern, professional, bold
  secondary: '#1A1A1A',         // Rich black
  secondaryLight: '#333333',    // Lighter black for cards
  secondaryDark: '#000000',     // Pure black

  // Accent colors - Subtle gold for premium feel
  accent: '#F59E0B',            // Amber/gold accent
  accentOrange: '#F97316',      // Orange for warnings/highlights
  accentRed: '#EF4444',         // Red for errors/alerts

  // Backgrounds
  background: '#0D0D0D',        // Near black background
  backgroundLight: '#1A1A1A',   // Slightly lighter background
  surface: '#242424',           // Card surfaces
  surfaceElevated: '#2E2E2E',   // Elevated surfaces

  // Text colors
  text: '#FFFFFF',              // White text on dark
  textSecondary: '#A0A0A0',     // Gray for secondary text
  textMuted: '#666666',         // Muted text

  // Border & dividers
  border: '#3D3D3D',            // Subtle borders
  borderLight: '#4D4D4D',       // Lighter borders

  // Status colors
  success: '#10B981',           // Green for success (matches primary)
  error: '#EF4444',             // Red for errors
  warning: '#F59E0B',           // Amber for warnings
  info: '#3B82F6',              // Blue for info

  // Utility
  muted: '#1F1F1F',             // Muted backgrounds
  overlay: 'rgba(0,0,0,0.7)',   // Overlay for modals

  // Special effects
  glowYellow: 'rgba(245, 158, 11, 0.3)',   // Gold glow effect
  glowGreen: 'rgba(16, 185, 129, 0.3)',    // Emerald glow
  gradientStart: '#10B981',                 // Gradient start (emerald)
  gradientEnd: '#1A1A1A',                   // Gradient end
};

export const BRANDING_DEFAULTS = {
  appName: 'KidsGo!',
  schoolName: 'Tu colegio',
  logoUri: '',
  headerColor: KIDGO_THEME.primaryDark,
};
