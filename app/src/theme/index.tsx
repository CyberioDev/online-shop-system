import * as SystemUI from 'expo-system-ui';
import {
  createContext,
  use,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Platform, StyleSheet, useColorScheme } from 'react-native';

import { Palettes, type ColorScheme, type Palette } from '@/constants/theme';
import { storage } from '@/lib/storage';

/** What the user picked in settings; `system` follows the phone/browser. */
export type ThemePreference = 'system' | 'light' | 'dark';

const PREFERENCE_KEY = 'tulgagch.theme';

type ThemeValue = {
  scheme: ColorScheme;
  colors: Palette;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** False until the saved preference has been read (avoids a flash of the wrong theme). */
  ready: boolean;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storage.get(PREFERENCE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') setPreferenceState(saved);
      setReady(true);
    });
  }, []);

  const scheme: ColorScheme =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const colors = Palettes[scheme];

  // Keep the area outside the React tree (web page, native root view) in step.
  useEffect(() => {
    if (Platform.OS === 'web') {
      document.body.style.backgroundColor = colors.background;
      document.documentElement.style.colorScheme = scheme;
    } else {
      SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
    }
  }, [colors.background, scheme]);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    storage.set(PREFERENCE_KEY, next);
  };

  return (
    <ThemeContext value={{ scheme, colors, preference, setPreference, ready }}>
      {children}
    </ThemeContext>
  );
}

export function useTheme() {
  const value = use(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}

/** The active color palette. */
export function useColors() {
  return useTheme().colors;
}

/**
 * Like `StyleSheet.create`, but the styles can use the active palette. Returns a hook;
 * each scheme's stylesheet is built once and cached.
 *
 *   const useStyles = makeStyles((colors) => ({ card: { backgroundColor: colors.surface } }));
 *   function Card() { const styles = useStyles(); ... }
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: Palette) => T & StyleSheet.NamedStyles<any>,
) {
  const cache: Partial<Record<ColorScheme, T>> = {};
  return function useStyles(): T {
    const { scheme, colors } = useTheme();
    return (cache[scheme] ??= StyleSheet.create(factory(colors)));
  };
}
