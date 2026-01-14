export const colors = {
  primary: '#136dec',
  primaryLight: 'rgba(19, 109, 236, 0.1)',
  primaryShadow: 'rgba(19, 109, 236, 0.25)',

  backgroundLight: '#f6f7f8',
  backgroundDark: '#101822',

  white: '#ffffff',
  black: '#0d131b',

  textPrimary: '#0d131b',
  textSecondary: '#4c6c9a',
  textMuted: '#cfd9e7',

  success: '#22c55e',
  successLight: 'rgba(34, 197, 94, 0.1)',
  successSoft: '#e8f5e9',

  warning: '#f59e0b',
  warningLight: 'rgba(245, 158, 11, 0.1)',

  error: '#ef4444',
  errorLight: 'rgba(239, 68, 68, 0.1)',

  border: '#e2e8f0',
  borderLight: 'rgba(226, 232, 240, 0.5)',

  cardBackground: '#ffffff',
  orcaBlue: '#e0e7ff',

  // Dark mode variants
  dark: {
    background: '#101822',
    card: '#1e293b',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    border: '#334155',
  },
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
}

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
}

export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  display: 40,
}

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
}
