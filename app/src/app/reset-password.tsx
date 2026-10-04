import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { api } from '@/api';
import { useAuth } from '@/auth/auth-context';
import { MIN_PASSWORD_LENGTH, newPasswordError, PasswordField } from '@/components/password-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { FieldPrefix, TextField } from '@/components/ui/text-field';
import { DEMO_RESET_CODE } from '@/constants/config';
import { FormMaxWidth, Spacing } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';
import { makeStyles, useColors } from '@/theme';

/**
 * Forgotten password: request a code to the account's phone, then set a new password.
 * Works signed out (from login) and signed in (from settings).
 */
export default function ResetPasswordScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const params = useLocalSearchParams<{ phone?: string }>();
  const [step, setStep] = useState<'phone' | 'code' | 'done'>('phone');
  const [phone, setPhone] = useState((params.phone ?? '').replace(/\D/g, '').slice(0, 8));
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<{ phone?: string; code?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const fallback = signedIn ? '/settings' : '/login';
  const leave = () => (router.canGoBack() ? router.back() : router.replace(fallback));

  const sendCode = async () => {
    if (phone.length !== 8) {
      setErrors({ phone: '8 оронтой утасны дугаар оруулна уу.' });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await api.requestPasswordReset(phone);
      setSentTo(result.sentTo);
      setStep('code');
    } catch (e) {
      setErrors({ form: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = async () => {
    const found = {
      code: code.length === 6 ? undefined : '6 оронтой кодоо оруулна уу.',
      password: newPasswordError(password, confirmation) ?? undefined,
    };
    setErrors(found);
    if (found.code || found.password) return;
    setBusy(true);
    try {
      await api.confirmPasswordReset(phone, code, password);
      setStep('done');
    } catch (e) {
      setErrors({ form: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const header = <ScreenHeader title="Нууц үг сэргээх" fallbackHref={fallback} />;

  if (step === 'done') {
    return (
      <Screen maxWidth={FormMaxWidth} header={header}>
        <Card style={styles.done}>
          <Icon name="check-circle" size={32} color={colors.primary} />
          <Text variant="title">Нууц үг шинэчлэгдлээ</Text>
          <Text color={colors.textSecondary} style={styles.center}>
            {signedIn ? 'Дараагийн удаа шинэ нууц үгээрээ нэвтэрнэ.' : 'Шинэ нууц үгээрээ нэвтэрнэ үү.'}
          </Text>
          {/* Back to where reset was opened (login or settings) rather than stacking a new screen. */}
          <Button title={signedIn ? 'Буцах' : 'Нэвтрэх'} size="md" onPress={leave} />
        </Card>
      </Screen>
    );
  }

  const footer =
    step === 'phone' ? (
      <Button title="Код авах" onPress={sendCode} loading={busy} />
    ) : (
      <Button title="Нууц үг шинэчлэх" onPress={confirmReset} loading={busy} />
    );

  return (
    <Screen maxWidth={FormMaxWidth} header={header} footer={footer}>
      <View style={styles.form}>
        {step === 'phone' ? (
          <>
            <Text color={colors.textSecondary}>
              Бүртгэлтэй утасны дугаараа оруулбал нууц үг сэргээх 6 оронтой код илгээнэ.
            </Text>
            <TextField
              label="Утасны дугаар"
              prefix={<FieldPrefix>+976</FieldPrefix>}
              placeholder="8800 0000"
              keyboardType="number-pad"
              value={phone.length > 4 ? `${phone.slice(0, 4)} ${phone.slice(4)}` : phone}
              onChangeText={(text) => setPhone(text.replace(/\D/g, '').slice(0, 8))}
              maxLength={9}
              error={errors.phone}
              onSubmitEditing={sendCode}
            />
          </>
        ) : (
          <>
            <Text color={colors.textSecondary}>
              {sentTo} дугаарт код илгээлээ. Код ирэхгүй бол хэдэн минутын дараа{' '}
              <Text
                variant="captionMedium"
                color={colors.primary}
                style={styles.link}
                onPress={() => {
                  setCode('');
                  setStep('phone');
                }}>
                дахин авна уу
              </Text>
              .
            </Text>
            <TextField
              label="Баталгаажуулах код"
              placeholder="000000"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              value={code}
              onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              error={errors.code}
              style={styles.code}
            />
            <PasswordField
              label="Шинэ нууц үг"
              value={password}
              onChangeText={setPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              hint={`${MIN_PASSWORD_LENGTH}-аас дээш тэмдэгт.`}
              error={errors.password}
            />
            <PasswordField
              label="Шинэ нууц үг (давтах)"
              value={confirmation}
              onChangeText={setConfirmation}
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={confirmReset}
            />
          </>
        )}

        {errors.form && (
          <Text variant="caption" color={colors.danger}>
            {errors.form}
          </Text>
        )}

        {/* TEMPORARY: remove with DEMO_RESET_CODE once SMS is sent for real. */}
        {api.isMock && step === 'code' && (
          <Card tone="info">
            <Text variant="caption" color={colors.primary}>
              Туршилтын горим: SMS илгээгдэхгүй. Код: {DEMO_RESET_CODE}
            </Text>
          </Card>
        )}
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
  code: {
    fontSize: 22,
    letterSpacing: 6,
  },
  done: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.ten,
  },
}));
