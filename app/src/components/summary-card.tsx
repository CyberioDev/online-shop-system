import { StyleSheet } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Colors, Spacing } from '@/constants/theme';
import { formatMoney } from '@/lib/format';

/** Green revenue card from the top of the home and report screens. */
export function SummaryCard({
  label,
  amount,
  caption,
}: {
  label: string;
  amount: number;
  caption: string;
}) {
  return (
    <Card tone="primary" style={styles.card}>
      <Text variant="caption" color={Colors.primaryOnDark}>
        {label}
      </Text>
      <Text variant="hero" color={Colors.textOnPrimary} adjustsFontSizeToFit numberOfLines={1}>
        {formatMoney(amount)}
      </Text>
      <Text variant="caption" color={Colors.primaryOnDark}>
        {caption}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.one,
    paddingVertical: Spacing.six,
  },
});
