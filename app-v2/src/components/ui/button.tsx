import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './icon';
import { Text } from './text';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import type { Palette } from '@/constants/theme';
import { useColors } from '@/theme';

type Variant = 'primary' | 'dark' | 'outline' | 'ghost' | 'danger';
type Size = 'lg' | 'md' | 'sm';

const variantColors = (
  colors: Palette,
): Record<Variant, { bg: string; pressed: string; fg: string; border?: string }> => ({
  primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: colors.textOnPrimary },
  dark: { bg: colors.dark, pressed: colors.darkPressed, fg: colors.textOnPrimary },
  outline: { bg: colors.surface, pressed: colors.surfaceMuted, fg: colors.text, border: colors.border },
  ghost: { bg: 'transparent', pressed: colors.surfaceMuted, fg: colors.primary },
  danger: { bg: colors.surface, pressed: colors.dangerSoft, fg: colors.danger, border: colors.border },
});

const heights: Record<Size, number> = { lg: 56, md: 46, sm: 38 };

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const tone = variantColors(useColors())[variant];
  const inactive = disabled || loading;
  const fontSize = size === 'lg' ? 17 : size === 'md' ? 15 : 14;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        {
          height: heights[size],
          backgroundColor: pressed ? tone.pressed : tone.bg,
          borderColor: tone.border ?? 'transparent',
          borderWidth: tone.border ? 1 : 0,
          paddingHorizontal: size === 'sm' ? Spacing.three : Spacing.five,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={tone.fg} />
      ) : (
        <View style={styles.content}>
          {icon && <Icon name={icon} size={fontSize + 2} color={tone.fg} />}
          <Text style={{ fontFamily: Fonts.bold, fontSize }} color={tone.fg} numberOfLines={1}>
            {title}
          </Text>
          {iconRight && <Icon name={iconRight} size={fontSize + 2} color={tone.fg} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
