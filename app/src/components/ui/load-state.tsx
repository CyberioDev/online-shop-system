import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from './button';
import { Icon } from './icon';
import { Text } from './text';

import { Colors, Spacing } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';

/** Placeholder for a screen section whose data hasn't arrived (spinner) or failed (retry). */
export function LoadState({ error, onRetry }: { error?: Error; onRetry: () => void }) {
  return (
    <View style={styles.container}>
      {error ? (
        <>
          <Icon name="wifi-off" size={28} color={Colors.textSecondary} />
          <Text color={Colors.textSecondary} style={styles.message}>
            {errorMessage(error)}
          </Text>
          <Button title="Дахин ачаалах" variant="outline" size="md" onPress={onRetry} />
        </>
      ) : (
        <ActivityIndicator color={Colors.primary} size="large" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingVertical: Spacing.ten * 2,
  },
  message: {
    textAlign: 'center',
  },
});
