import { useState } from 'react';
import { Pressable, type TextInputProps } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useColors } from '@/theme';

/** Text field for passwords with a show/hide toggle. */
export function PasswordField(
  props: TextInputProps & { label: string; error?: string | null; hint?: string },
) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      suffix={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Нууц үг нуух' : 'Нууц үг харах'}
          onPress={() => setVisible((v) => !v)}
          hitSlop={8}
          style={{ paddingHorizontal: Spacing.four, alignSelf: 'stretch', justifyContent: 'center' }}>
          <Icon name={visible ? 'eye-off' : 'eye'} color={colors.textSecondary} />
        </Pressable>
      }
    />
  );
}

export const MIN_PASSWORD_LENGTH = 8;

/** Mongolian error for a new password + confirmation, or null when they're fine. */
export function newPasswordError(password: string, confirmation: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Шинэ нууц үг ${MIN_PASSWORD_LENGTH}-аас дээш тэмдэгттэй байна.`;
  }
  if (password !== confirmation) return 'Давтан оруулсан нууц үг таарахгүй байна.';
  return null;
}
