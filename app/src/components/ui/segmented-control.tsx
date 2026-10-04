import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './text';

import { Colors, Radius, Spacing } from '@/constants/theme';

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.selected]}>
            <Text variant="label" color={selected ? Colors.text : Colors.textSecondary}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    padding: Spacing.one,
    gap: Spacing.one,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.sm,
  },
  selected: {
    backgroundColor: Colors.surface,
    boxShadow: '0 1px 2px rgba(28, 27, 24, 0.12)',
  },
});
