import { StyleSheet, View, type ViewProps } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import type { Palette } from '@/constants/theme';
import { useColors } from '@/theme';

type Tone = 'default' | 'primary' | 'warning' | 'info';

const toneColors = (colors: Palette): Record<Tone, { backgroundColor: string; borderColor: string }> => ({
  default: { backgroundColor: colors.surface, borderColor: colors.border },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  warning: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  info: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
});

export function Card({
  tone = 'default',
  padded = true,
  style,
  ...rest
}: ViewProps & { tone?: Tone; padded?: boolean }) {
  const colors = toneColors(useColors())[tone];
  return <View style={[styles.card, colors, padded && styles.padded, style]} {...rest} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  padded: {
    padding: Spacing.five,
  },
});
