import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Colors, Radius } from '@/constants/theme';

export function ProductThumb({ uri, size = 88 }: { uri: string | null; size?: number }) {
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <Icon name="image" size={size * 0.3} color={Colors.textMuted} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
