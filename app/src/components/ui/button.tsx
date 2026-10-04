import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './icon';
import { Text } from './text';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

type Variant = 'primary' | 'dark' | 'outline' | 'ghost' | 'danger';
type Size = 'lg' | 'md' | 'sm';

const palette: Record<Variant, { bg: string; pressed: string; fg: string; border?: string }> = {
  primary: { bg: Colors.primary, pressed: Colors.primaryPressed, fg: Colors.textOnPrimary },
  dark: { bg: Colors.dark, pressed: Colors.darkPressed, fg: Colors.textOnPrimary },
  outline: { bg: Colors.surface, pressed: Colors.surfaceMuted, fg: Colors.text, border: Colors.border },
  ghost: { bg: 'transparent', pressed: Colors.surfaceMuted, fg: Colors.primary },
  danger: { bg: Colors.surface, pressed: Colors.dangerSoft, fg: Colors.danger, border: Colors.border },
};

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
  const colors = palette[variant];
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
          backgroundColor: pressed ? colors.pressed : colors.bg,
          borderColor: colors.border ?? 'transparent',
          borderWidth: colors.border ? 1 : 0,
          paddingHorizontal: size === 'sm' ? Spacing.three : Spacing.five,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.fg} />
      ) : (
        <View style={styles.content}>
          {icon && <Icon name={icon} size={fontSize + 2} color={colors.fg} />}
          <Text style={{ fontFamily: Fonts.bold, fontSize }} color={colors.fg} numberOfLines={1}>
            {title}
          </Text>
          {iconRight && <Icon name={iconRight} size={fontSize + 2} color={colors.fg} />}
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
