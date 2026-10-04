import { StyleSheet, View, type ViewProps } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

type Tone = 'default' | 'primary' | 'warning' | 'info';

const tones: Record<Tone, { backgroundColor: string; borderColor: string }> = {
  default: { backgroundColor: Colors.surface, borderColor: Colors.border },
  primary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  warning: { backgroundColor: Colors.warningSoft, borderColor: Colors.warningBorder },
  info: { backgroundColor: Colors.primarySoft, borderColor: Colors.primarySoft },
};

export function Card({
  tone = 'default',
  padded = true,
  style,
  ...rest
}: ViewProps & { tone?: Tone; padded?: boolean }) {
  return <View style={[styles.card, tones[tone], padded && styles.padded, style]} {...rest} />;
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
