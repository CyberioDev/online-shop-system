import { useState, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { Text } from './text';

import { Fonts, Radius, Spacing, webNoOutline } from '@/constants/theme';
import { makeStyles, useColors } from '@/theme';

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
  const colors = useColors();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.borderStrong;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text variant="label">{label}</Text>}
      <View style={[styles.field, { borderColor }]}>
        {prefix}
        <TextInput
          placeholderTextColor={colors.textMuted}
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
        <Text variant="caption" color={colors.danger}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color={colors.textSecondary}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Fixed text shown at the start of a field, separated by a divider (e.g. "+976"). */
export function FieldPrefix({ children }: { children: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.prefix}>
      <Text color={colors.textSecondary}>{children}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    gap: Spacing.two,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    borderWidth: 1,
    borderRadius: Radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.four,
    fontFamily: Fonts.regular,
    fontSize: 17,
    color: colors.text,
  },
  prefix: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
}));
