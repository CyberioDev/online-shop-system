import { Pressable } from 'react-native';

import { Icon, type IconName } from './icon';
import { Text } from './text';

import { Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/theme';

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
  const colors = useColors();
  const styles = useStyles();
  const fg = selected ? colors.textOnPrimary : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : styles.idle,
        pressed && !selected && { backgroundColor: colors.surfaceMuted },
      ]}>
      {icon && <Icon name={icon} size={15} color={fg} />}
      <Text variant="captionMedium" color={fg}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    minHeight: 40,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  idle: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  selected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
}));
