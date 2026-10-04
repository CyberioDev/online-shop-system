import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { APP_NAME } from '@/constants/config';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

export function BrandMark({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const box = size === 'lg' ? 48 : 36;
  return (
    <View style={styles.row}>
      <View style={[styles.logo, { width: box, height: box, borderRadius: box * 0.28 }]}>
        <Icon name="check" size={box * 0.5} color={Colors.textOnPrimary} />
      </View>
      <Text style={{ fontFamily: Fonts.display, fontSize: size === 'lg' ? 22 : 17 }}>
        {APP_NAME}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  logo: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
});
