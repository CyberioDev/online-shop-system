import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/api';
import { useAuth } from '@/auth/auth-context';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { FieldPrefix, TextField } from '@/components/ui/text-field';
import { APP_NAME, SUPPORT_PHONE, TEST_ACCOUNT } from '@/constants/config';
import { Fonts, FormMaxWidth, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/theme';
import { useIsWide } from '@/hooks/use-is-wide';
import { errorMessage } from '@/lib/errors';

const HEADLINE = 'Захиалга, төлбөрөө нэг дороос';
const TAGLINE = 'Чат болон шууд дамжуулалтын захиалгыг банкны гүйлгээтэй автоматаар тулгана.';

export default function LoginScreen() {
  const colors = useColors();
  const styles = useStyles();
  const isWide = useIsWide();
  const insets = useSafeAreaInsets();

  if (!isWide) {
    return (
      <Screen maxWidth={FormMaxWidth} fill contentStyle={styles.mobileContent}>
        <BrandMark />
        <View style={styles.intro}>
          <Text variant="display" style={styles.headline}>
            {HEADLINE}
          </Text>
          <Text color={colors.textSecondary} style={styles.tagline}>
            {TAGLINE}
          </Text>
        </View>
        <LoginForm />
      </Screen>
    );
  }

  return (
    <View style={styles.split}>
      <View style={[styles.brandPanel, { paddingTop: insets.top + Spacing.ten }]}>
        <View style={styles.brandRow}>
          <View style={styles.brandLogo}>
            <Icon name="check" size={24} color={colors.primary} />
          </View>
          <Text style={styles.brandName} color={colors.textOnPrimary}>
            {APP_NAME}
          </Text>
        </View>
        <View style={styles.brandCopy}>
          <Text variant="display" color={colors.textOnPrimary} style={styles.wideHeadline}>
            {HEADLINE}
          </Text>
          <Text color={colors.primaryOnDark} style={styles.tagline}>
            {TAGLINE}
          </Text>
        </View>
      </View>
      <View style={styles.formPanel}>
        <View style={styles.formBox}>
          <Text variant="display">Нэвтрэх</Text>
          <LoginForm />
        </View>
      </View>
    </View>
  );
}

function LoginForm() {
  const colors = useColors();
  const styles = useStyles();
  const auth = useAuth();
  const { signIn } = auth;
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ phone?: string; password?: string; form?: string }>({});

  const submit = async () => {
    const next: typeof errors = {};
    if (phone.length !== 8) next.phone = '8 оронтой утасны дугаар оруулна уу.';
    if (!password) next.password = 'Нууц үгээ оруулна уу.';
    setErrors(next);
    if (next.phone || next.password) return;

    setSubmitting(true);
    try {
      await signIn(phone, password);
    } catch (error) {
      setErrors({ form: errorMessage(error) });
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.form}>
      {auth.status === 'signedOut' && auth.expired && !errors.form && (
        <View style={styles.notice}>
          <Icon name="clock" size={18} color={colors.warningText} />
          <Text variant="caption" color={colors.warningText} style={styles.flex}>
            Нэвтрэх хугацаа дууссан тул дахин нэвтэрнэ үү.
          </Text>
        </View>
      )}
      <TextField
        label="Утасны дугаар"
        prefix={<FieldPrefix>+976</FieldPrefix>}
        placeholder="8800 0000"
        keyboardType="number-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        value={phone.length > 4 ? `${phone.slice(0, 4)} ${phone.slice(4)}` : phone}
        onChangeText={(text) => setPhone(text.replace(/\D/g, '').slice(0, 8))}
        maxLength={9}
        error={errors.phone}
        returnKeyType="next"
      />
      <TextField
        label="Нууц үг"
        placeholder="Нууц үгээ оруулна уу"
        secureTextEntry={!showPassword}
        textContentType="password"
        autoComplete="current-password"
        autoCapitalize="none"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        onSubmitEditing={submit}
        returnKeyType="go"
        suffix={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Нууц үг нуух' : 'Нууц үг харах'}
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={8}
            style={styles.eye}>
            <Icon name={showPassword ? 'eye-off' : 'eye'} color={colors.textSecondary} />
          </Pressable>
        }
      />

      {errors.form && (
        <View style={styles.formError}>
          <Icon name="alert-circle" size={18} color={colors.danger} />
          <Text variant="caption" color={colors.danger} style={styles.flex}>
            {errors.form}
          </Text>
        </View>
      )}

      <Pressable
        accessibilityRole="link"
        onPress={() => router.push({ pathname: '/reset-password', params: phone ? { phone } : {} })}
        hitSlop={8}
        style={styles.forgot}>
        <Text variant="captionMedium" color={colors.primary}>
          Нууц үг мартсан?
        </Text>
      </Pressable>

      <Button title="Нэвтрэх" onPress={submit} loading={submitting} />

      {/* TEMPORARY: remove with TEST_ACCOUNT once real accounts exist. */}
      {api.isMock && (
        <View style={styles.testAccount}>
          <View style={styles.flex}>
            <Text variant="captionMedium" color={colors.primary}>
              Туршилтын бүртгэл
            </Text>
            <Text variant="caption" color={colors.primary}>
              Утас: {TEST_ACCOUNT.phone.slice(0, 4)} {TEST_ACCOUNT.phone.slice(4)} · Нууц үг:{' '}
              {TEST_ACCOUNT.password}
            </Text>
          </View>
          <Button
            title="Бөглөх"
            variant="outline"
            size="sm"
            onPress={() => {
              setPhone(TEST_ACCOUNT.phone);
              setPassword(TEST_ACCOUNT.password);
              setErrors({});
            }}
          />
        </View>
      )}

      {SUPPORT_PHONE !== '' && (
        <Text variant="caption" color={colors.textSecondary} style={styles.center}>
          Тусламж хэрэгтэй юу?{' '}
          <Text
            variant="captionMedium"
            color={colors.primary}
            style={styles.link}
            onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)}>
            Зөвлөхтэйгөө ярих
          </Text>
        </Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  mobileContent: {
    gap: Spacing.ten,
  },
  intro: {
    flex: 1,
    gap: Spacing.four,
    paddingTop: Spacing.ten,
  },
  headline: {
    fontSize: 32,
    lineHeight: 40,
  },
  tagline: {
    fontSize: 17,
    lineHeight: 26,
  },
  form: {
    gap: Spacing.five,
  },
  eye: {
    paddingHorizontal: Spacing.four,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  formError: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 12,
    backgroundColor: colors.dangerSoft,
  },
  flex: {
    flex: 1,
  },
  center: {
    textAlign: 'center',
  },
  forgot: {
    alignSelf: 'flex-end',
    marginTop: -Spacing.two,
  },
  notice: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 12,
    backgroundColor: colors.warningSoft,
  },
  testAccount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
  },
  link: {
    textDecorationLine: 'underline',
  },
  split: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.background,
  },
  brandPanel: {
    flex: 1,
    maxWidth: 620,
    backgroundColor: colors.primary,
    paddingHorizontal: Spacing.ten + Spacing.four,
    paddingBottom: Spacing.ten,
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  brandLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontFamily: Fonts.display,
    fontSize: 20,
  },
  brandCopy: {
    gap: Spacing.five,
    maxWidth: 460,
  },
  wideHeadline: {
    fontSize: 44,
    lineHeight: 54,
  },
  formPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.ten,
  },
  formBox: {
    width: '100%',
    maxWidth: 400,
    gap: Spacing.eight,
  },
}));
