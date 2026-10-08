import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { Text } from './text';

import { Spacing } from '@/constants/theme';

/** Back chevron + centered title, as on the "Шалгах" mockup screens. */
export function ScreenHeader({
  title,
  fallbackHref = '/',
  right,
}: {
  title: string;
  /** Where "back" goes when there is no history (e.g. the page was opened directly on web). */
  fallbackHref?: Href;
  right?: ReactNode;
}) {
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallbackHref);
  };

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Буцах"
        onPress={goBack}
        hitSlop={8}
        style={({ pressed }) => [styles.side, pressed && { opacity: 0.5 }]}>
        <Icon name="chevron-left" size={26} />
      </Pressable>
      <Text variant="heading" style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    gap: Spacing.two,
  },
  side: {
    width: 64,
    justifyContent: 'center',
  },
  right: {
    alignItems: 'flex-end',
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
});
