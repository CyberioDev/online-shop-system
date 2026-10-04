import { StyleSheet, View } from 'react-native';

import type { PreorderStatus } from '@/api';
import { Text } from '@/components/ui/text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { PREORDER_STATUS_LABELS, PREORDER_STATUS_SHORT } from '@/lib/labels';

const look: Record<PreorderStatus, { bg: string; fg: string }> = {
  open: { bg: Colors.primarySoft, fg: Colors.primary },
  closed: { bg: Colors.warningSoft, fg: Colors.warningText },
  arrived: { bg: Colors.surfaceMuted, fg: Colors.textSecondary },
};

export function PreorderStatusPill({
  status,
  prefix,
  short = false,
}: {
  status: PreorderStatus;
  prefix?: string;
  short?: boolean;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: look[status].bg }]}>
      <Text variant="captionMedium" color={look[status].fg} style={styles.text}>
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
