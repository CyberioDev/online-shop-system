import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Radius } from '@/constants/theme';
import { makeStyles, useColors } from '@/theme';

export function ProductThumb({ uri, size = 88 }: { uri: string | null; size?: number }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <Icon name="image" size={size * 0.3} color={colors.textMuted} />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: {
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
}));
