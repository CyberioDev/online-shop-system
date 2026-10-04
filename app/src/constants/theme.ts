import { Platform } from 'react-native';

/**
 * Design tokens taken from the Tulgagch UI mockup. The app ships a single light
 * palette for now; keep every color here so a dark palette can be added later.
 */
export const Colors = {
  background: '#F3EFE8',
  surface: '#FFFFFF',
  surfaceMuted: '#EEE8DE',
  border: '#E3DCCF',
  borderStrong: '#CFC6B6',

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
} as const;

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
