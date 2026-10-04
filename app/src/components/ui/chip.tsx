import { Pressable, StyleSheet } from 'react-native';

import { Icon, type IconName } from './icon';
import { Text } from './text';

import { Colors, Radius, Spacing } from '@/constants/theme';

/** Pill-shaped toggle, used for date presets and quick fills. */
export function Chip({
  label,
  selected = false,
  icon,
  onPress,
}: {
  label: string;
  selected?: boolean;
  icon?: IconName;
  onPress: () => void;
}) {
  const fg = selected ? Colors.textOnPrimary : Colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : styles.idle,
        pressed && !selected && { backgroundColor: Colors.surfaceMuted },
      ]}>
      {icon && <Icon name={icon} size={15} color={fg} />}
      <Text variant="captionMedium" color={fg}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    minHeight: 40,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  idle: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  selected: {
    backgroundColor: Colors.dark,
    borderColor: Colors.dark,
  },
});
