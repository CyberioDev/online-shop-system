import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './icon';
import { Text } from './text';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useIsWide } from '@/hooks/use-is-wide';

/** Modal panel: a bottom sheet on phones, a centered dialog on wide screens. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const isWide = useIsWide();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.backdrop, isWide ? styles.center : styles.bottom]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Хаах" />
        <View
          accessibilityViewIsModal
          style={[
            styles.panel,
            isWide ? styles.panelWide : { paddingBottom: Math.max(insets.bottom, Spacing.five) },
          ]}>
          <View style={styles.header}>
            <Text variant="title" style={styles.flex}>
              {title}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Хаах" onPress={onClose} hitSlop={8}>
              <Icon name="x" size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28, 27, 24, 0.45)',
  },
  bottom: {
    justifyContent: 'flex-end',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.six,
  },
  panel: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.five,
    gap: Spacing.four,
    maxHeight: '90%',
  },
  panelWide: {
    width: '100%',
    maxWidth: 480,
    borderRadius: Radius.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    gap: Spacing.four,
  },
});
