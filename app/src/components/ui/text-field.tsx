import { useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { Text } from './text';

import { Colors, Fonts, Radius, Spacing, webNoOutline } from '@/constants/theme';

export function TextField({
  label,
  hint,
  error,
  prefix,
  suffix,
  containerStyle,
  style,
  ...inputProps
}: TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  prefix?: ReactNode;
  suffix?: ReactNode;
  containerStyle?: ViewStyle;
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? Colors.danger : focused ? Colors.primary : Colors.borderStrong;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text variant="label">{label}</Text>}
      <View style={[styles.field, { borderColor }]}>
        {prefix}
        <TextInput
          placeholderTextColor={Colors.textMuted}
          {...inputProps}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          style={[styles.input, webNoOutline, style]}
        />
        {suffix}
      </View>
      {error ? (
        <Text variant="caption" color={Colors.danger}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color={Colors.textSecondary}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Fixed text shown at the start of a field, separated by a divider (e.g. "+976"). */
export function FieldPrefix({ children }: { children: string }) {
  return (
    <View style={styles.prefix}>
      <Text color={Colors.textSecondary}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    borderWidth: 1,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.four,
    fontFamily: Fonts.regular,
    fontSize: 17,
    color: Colors.text,
  },
  prefix: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
});
