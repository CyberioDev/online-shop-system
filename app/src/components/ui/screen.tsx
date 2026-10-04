import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, PageMaxWidth, Spacing } from '@/constants/theme';
import { useIsWide } from '@/hooks/use-is-wide';

/**
 * Page wrapper: scrollable content centered at `maxWidth`, with an optional footer
 * pinned to the bottom (used for primary actions on forms).
 */
export function Screen({
  children,
  header,
  footer,
  maxWidth = PageMaxWidth,
  fill = false,
  contentStyle,
}: {
  children: ReactNode;
  /** Rendered above the scroll area and not scrolled (e.g. a back-button header). */
  header?: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  /** Stretch content to at least the screen height (to push content to the bottom). */
  fill?: boolean;
  contentStyle?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const isWide = useIsWide();
  const horizontal = isWide ? Spacing.ten : Spacing.five;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header && (
        <View style={{ paddingTop: insets.top, paddingHorizontal: horizontal }}>
          <View style={[styles.inner, { maxWidth }]}>{header}</View>
        </View>
      )}
      <ScrollView
        style={styles.root}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: fill ? 1 : undefined,
          paddingTop: header ? Spacing.two : insets.top + (isWide ? Spacing.ten : Spacing.five),
          // Without a footer, keep the last content clear of the home indicator.
          paddingBottom: Spacing.ten + (footer ? 0 : insets.bottom),
          paddingHorizontal: horizontal,
        }}>
        <View style={[styles.inner, { maxWidth }, fill && styles.flex, contentStyle]}>
          {children}
        </View>
      </ScrollView>
      {footer && (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, Spacing.four), paddingHorizontal: horizontal },
          ]}>
          <View style={[styles.inner, { maxWidth }]}>{footer}</View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/** Lays children out side by side on wide screens and stacked on phones. */
export function Columns({ children, gap = Spacing.four }: { children: ReactNode; gap?: number }) {
  const isWide = useIsWide();
  return (
    <View style={isWide ? [styles.columns, { gap: gap + Spacing.two }] : { gap }}>{children}</View>
  );
}

/** One column inside `Columns`. */
export function Column({ children, gap = Spacing.four }: { children: ReactNode; gap?: number }) {
  const isWide = useIsWide();
  // Only flex side by side; stacked columns must size to their content.
  return <View style={[isWide && styles.column, { gap }]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  inner: {
    width: '100%',
    alignSelf: 'center',
  },
  flex: {
    flex: 1,
  },
  footer: {
    paddingTop: Spacing.three,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  column: {
    flex: 1,
    minWidth: 0,
  },
});
