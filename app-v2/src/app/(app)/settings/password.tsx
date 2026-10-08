import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { api } from '@/api';
import { useUser } from '@/auth/auth-context';
import { MIN_PASSWORD_LENGTH, newPasswordError, PasswordField } from '@/components/password-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { FormMaxWidth, Spacing } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';
import { makeStyles, useColors } from '@/theme';

export default function ChangePasswordScreen() {
  const colors = useColors();
  const styles = useStyles();
  const user = useUser();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const save = async () => {
    const nextError = newPasswordError(next, confirmation);
    const found = { current: current ? undefined : 'Одоогийн нууц үгээ оруулна уу.', next: nextError ?? undefined };
    setErrors(found);
    if (found.current || found.next) return;
    setSaving(true);
    try {
      await api.changePassword(current, next);
      setDone(true);
    } catch (e) {
      // The server reports a wrong current password as a validation error.
      setErrors({ form: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const header = <ScreenHeader title="Нууц үг солих" fallbackHref="/settings" />;

  if (done) {
    return (
      <Screen maxWidth={FormMaxWidth} header={header}>
        <Card style={styles.done}>
          <Icon name="check-circle" size={32} color={colors.primary} />
          <Text variant="title">Нууц үг солигдлоо</Text>
          <Text color={colors.textSecondary} style={styles.center}>
            Дараагийн удаа шинэ нууц үгээрээ нэвтэрнэ.
          </Text>
          <Button
            title="Тохиргоо руу буцах"
            variant="outline"
            size="md"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      maxWidth={FormMaxWidth}
      header={header}
      footer={<Button title="Нууц үг солих" onPress={save} loading={saving} />}>
      <View style={styles.form}>
        <PasswordField
          label="Одоогийн нууц үг"
          value={current}
          onChangeText={setCurrent}
          autoComplete="current-password"
          textContentType="password"
          error={errors.current}
        />
        <PasswordField
          label="Шинэ нууц үг"
          value={next}
          onChangeText={setNext}
          autoComplete="new-password"
          textContentType="newPassword"
          hint={`${MIN_PASSWORD_LENGTH}-аас дээш тэмдэгт.`}
          error={errors.next}
        />
        <PasswordField
          label="Шинэ нууц үг (давтах)"
          value={confirmation}
          onChangeText={setConfirmation}
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={save}
        />
        {errors.form && (
          <Text variant="caption" color={colors.danger}>
            {errors.form}
          </Text>
        )}
        <Text variant="caption" color={colors.textSecondary}>
          Одоогийн нууц үгээ мартсан бол{' '}
          <Text
            variant="captionMedium"
            color={colors.primary}
            style={styles.link}
            onPress={() => router.push({ pathname: '/reset-password', params: { phone: user.phone } })}>
            кодоор шинэчилнэ үү
          </Text>
          .
        </Text>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  form: {
    gap: Spacing.five,
    paddingTop: Spacing.two,
  },
  center: {
    textAlign: 'center',
  },
  link: {
    textDecorationLine: 'underline',
  },
  done: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.ten,
  },
}));
