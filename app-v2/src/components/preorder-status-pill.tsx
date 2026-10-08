import { StyleSheet, View } from 'react-native';

import type { PreorderStatus } from '@/api';
import { Text } from '@/components/ui/text';
import { Radius, Spacing, type Palette } from '@/constants/theme';
import { useColors } from '@/theme';
import { PREORDER_STATUS_LABELS, PREORDER_STATUS_SHORT } from '@/lib/labels';

const lookFor = (colors: Palette): Record<PreorderStatus, { bg: string; fg: string }> => ({
  open: { bg: colors.primarySoft, fg: colors.primary },
  closed: { bg: colors.warningSoft, fg: colors.warningText },
  arrived: { bg: colors.surfaceMuted, fg: colors.textSecondary },
});

export function PreorderStatusPill({
  status,
  prefix,
  short = false,
}: {
  status: PreorderStatus;
  prefix?: string;
  short?: boolean;
}) {
  const look = lookFor(useColors())[status];
  return (
    <View style={[styles.pill, { backgroundColor: look.bg }]}>
      <Text variant="captionMedium" color={look.fg} style={styles.text}>
        {prefix ? `${prefix} · ` : ''}
        {(short ? PREORDER_STATUS_SHORT : PREORDER_STATUS_LABELS)[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  text: {
    fontSize: 12,
    lineHeight: 16,
  },
});
