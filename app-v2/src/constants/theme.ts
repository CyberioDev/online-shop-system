import { Platform } from 'react-native';

/**
 * Studio color palettes: charcoal, white, mint actions, and burgundy attention states. Components read the active one with `useColors()`
 * or `makeStyles()` from `@/theme`, never directly.
 */
const light = {
  background: '#F7F8F8',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F2F2',
  border: '#E3E7E6',
  borderStrong: '#C6CECB',
  overlay: 'rgba(18, 24, 22, 0.45)',
  text: '#202725',
  textSecondary: '#58635F',
  textMuted: '#6E7874',
  textOnPrimary: '#FFFFFF',
  primary: '#087B69',
  primaryPressed: '#066251',
  primarySoft: '#DEF3EB',
  primaryFaint: '#F0FAF6',
  primaryOnDark: '#B7EDDC',
  dark: '#202725',
  darkPressed: '#333D39',
  warningSoft: '#F6DFE6',
  warningBorder: '#BA7186',
  warningIconBg: '#EBC0CD',
  warningText: '#70203C',
  warningStrong: '#932B50',
  dangerSoft: '#FBE1DE',
  danger: '#B3261E',
};

export type Palette = typeof light;
export type ColorScheme = 'light' | 'dark';

const dark: Palette = {
  background: '#151A18',
  surface: '#1E2522',
  surfaceMuted: '#29322E',
  border: '#36413B',
  borderStrong: '#536359',
  overlay: 'rgba(0, 0, 0, 0.6)',
  text: '#F0F5F2',
  textSecondary: '#B5C1BA',
  textMuted: '#94A59B',
  textOnPrimary: '#FFFFFF',
  primary: '#148A76',
  primaryPressed: '#107260',
  primarySoft: '#173D37',
  primaryFaint: '#142F2C',
  primaryOnDark: '#D3E9DD',
  dark: '#29332E',
  darkPressed: '#39463F',
  warningSoft: '#40232F',
  warningBorder: '#AF617D',
  warningIconBg: '#643247',
  warningText: '#FFD7E4',
  warningStrong: '#A33760',
  dangerSoft: '#3D211D',
  danger: '#F0907F',
};

export const Palettes: Record<ColorScheme, Palette> = { light, dark };

export const Fonts = {
  display: 'Inter_700Bold',
  displayBold: 'Inter_600SemiBold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 20,
  six: 24,
  eight: 32,
  ten: 40,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Window width at which the layout switches from bottom tabs to a sidebar. */
export const WideBreakpoint = 900;
/** Max width of a single-column page (forms, login). */
export const FormMaxWidth = 560;
/** Max width of the main content area on desktop. */
export const PageMaxWidth = 1280;

/** Removes the browser focus ring on web inputs; the wrapper draws its own. */
export const webNoOutline = Platform.select({ web: { outlineStyle: 'none' } as object, default: {} });
