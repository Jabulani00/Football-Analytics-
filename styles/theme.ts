export const theme = {
  bg: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceHover: '#F8FAFC',
  surfaceMuted: '#E8EDF4',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  accentGreen: '#059669',
  accentOrange: '#EA580C',
  accentBlue: '#2563EB',
  accentPurple: '#7C3AED',
  textPrimary: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  win: '#059669',
  draw: '#64748B',
  loss: '#DC2626',
  live: '#059669',
  yellow: '#CA8A04',
  awayBar: '#CBD5E1',
  shadow: 'rgba(15, 23, 42, 0.08)',
} as const;

export const fonts = {
  display: 'Oswald_700Bold',
  displaySemi: 'Oswald_600SemiBold',
  displayRegular: 'Oswald_400Regular',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  page: 32,
} as const;

export const layout = {
  borderRadius: 12,
  borderWidth: 1,
  sectionLabelSpacing: 1.2,
  pagePaddingH: 32,
} as const;

/** @deprecated use theme */
export const colors = {
  background: theme.bg,
  surface: theme.surface,
  border: theme.border,
  accent: theme.accentGreen,
  accentSecondary: theme.accentOrange,
  text: theme.textPrimary,
  textMuted: theme.textMuted,
  yellow: theme.yellow,
  red: theme.loss,
  win: theme.win,
  draw: theme.draw,
  loss: theme.loss,
  awayBar: theme.awayBar,
} as const;
