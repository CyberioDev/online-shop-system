import { Platform } from 'react-native';

/**
 * Color palettes. The light palette comes from the Tulgagch UI mockup; the dark one keeps
 * the same warm hue and green accent. Components read the active one with `useColors()`
 * or `makeStyles()` from `@/theme`, never directly.
 */
const light = {
  background: '#F3EFE8',
  surface: '#FFFFFF',
  surfaceMuted: '#EEE8DE',
  border: '#E3DCCF',
  borderStrong: '#CFC6B6',
  /** Dimmed layer behind modals and sheets. */
  overlay: 'rgba(28, 27, 24, 0.45)',

  text: '#1C1B18',
  textSecondary: '#6B665C',
  textMuted: '#9A9488',
  textOnPrimary: '#FFFFFF',

  primary: '#1F5E48',
  primaryPressed: '#184B39',
  primarySoft: '#E3EEE8',
  primaryFaint: '#F1F6F3',
  primaryOnDark: '#CFE3D8',

  dark: '#1E1C19',
  darkPressed: '#35322D',

  warningSoft: '#FBEEDA',
  warningBorder: '#EED3A2',
  warningIconBg: '#F2D9A8',
  warningText: '#5A3A00',
  warningStrong: '#8A5A14',

  dangerSoft: '#FBE1DE',
  danger: '#B3261E',
};

export type Palette = typeof light;
export type ColorScheme = 'light' | 'dark';

const dark: Palette = {
  background: '#141513',
  surface: '#1D1F1B',
  surfaceMuted: '#2A2D27',
  border: '#33372F',
  borderStrong: '#4A4F45',
  overlay: 'rgba(0, 0, 0, 0.6)',

  text: '#EDEAE3',
  textSecondary: '#ABA699',
  textMuted: '#7D796F',
  textOnPrimary: '#FFFFFF',

  // Lighter than the light-mode green so it reads as text on dark surfaces,
  // while white button labels on it stay legible.
  primary: '#3E9472',
  primaryPressed: '#347E61',
  primarySoft: '#1F3A2F',
  primaryFaint: '#192A22',
  primaryOnDark: '#D3E9DD',

  dark: '#2F322C',
  darkPressed: '#3B3F37',

  warningSoft: '#3A2E18',
  warningBorder: '#5C4720',
  warningIconBg: '#4E3B19',
  warningText: '#F2D29A',
  warningStrong: '#E6B35F',

  dangerSoft: '#3D211D',
  danger: '#F0907F',
};

export const Palettes: Record<ColorScheme, Palette> = { light, dark };

export const Fonts = {
  display: 'Montserrat_800ExtraBold',
  displayBold: 'Montserrat_700Bold',
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
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/** Window width at which the layout switches from bottom tabs to a sidebar. */
export const WideBreakpoint = 900;
/** Max width of a single-column page (forms, login). */
export const FormMaxWidth = 560;
/** Max width of the main content area on desktop. */
export const PageMaxWidth = 1040;

/** Removes the browser focus ring on web inputs; the wrapper draws its own. */
export const webNoOutline = Platform.select({ web: { outlineStyle: 'none' } as object, default: {} });
