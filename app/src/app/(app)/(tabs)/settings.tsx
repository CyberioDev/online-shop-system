import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { api } from '@/api';
import { useAuth, useUser } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { Column, Columns, Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useReloadOnFocus, useResource } from '@/hooks/use-resource';
import { confirm } from '@/lib/confirm';
import { makeStyles, useColors, useTheme, type ThemePreference } from '@/theme';

export default function SettingsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const user = useUser();
  const { signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const settings = useResource(() => api.getShopSettings(), []);
  const integrations = useResource(() => api.getIntegrations(), []);
  useReloadOnFocus(settings.reload);
  useReloadOnFocus(integrations.reload);

  const bank = settings.data?.bankAccount;
  const connected = integrations.data
    ? [
        integrations.data.facebook.connected && 'Facebook',
        integrations.data.instagram.connected && 'Instagram',
        integrations.data.sms.connected && 'Банкны SMS',
      ].filter(Boolean)
    : null;

  const logout = async () => {
    if (await confirm('Гарах', 'Бүртгэлээсээ гарах уу?', 'Гарах')) await signOut();
  };

  return (
    <Screen>
      <Text variant="display" style={styles.title}>
        Тохиргоо
      </Text>

      <Columns>
        <Column>
          <Section title="Дэлгүүр">
            <Card padded={false}>
              <Row
                icon="credit-card"
                title="Банкны данс"
                subtitle={
                  settings.data
                    ? bank
                      ? `${bank.bank} · ${bank.accountNumber} · ${bank.accountHolder}`
                      : 'Бүртгээгүй — чатбот төлбөрийн мэдээлэл илгээж чадахгүй'
                    : 'Ачаалж байна…'
                }
                warning={settings.data !== undefined && !bank}
                href="/settings/bank-account"
              />
              <Row
                icon="link-2"
                title="Холболт"
                subtitle={
                  connected ? (connected.length ? connected.join(' · ') : 'Холболт алга') : 'Ачаалж байна…'
                }
                href="/integrations"
                divider
              />
            </Card>
          </Section>

          <Section title="Харагдах байдал">
            <Card style={styles.gap}>
              <SegmentedControl<ThemePreference>
                options={[
                  { value: 'system', label: 'Систем' },
                  { value: 'light', label: 'Цайвар' },
                  { value: 'dark', label: 'Бараан' },
                ]}
                value={preference}
                onChange={setPreference}
              />
              <Text variant="caption" color={colors.textSecondary}>
                “Систем” нь утас, компьютерийн тохиргоог дагана.
              </Text>
            </Card>
          </Section>
        </Column>

        <Column>
          <Section title="Нууц үг">
            <Card padded={false}>
              <Row icon="lock" title="Нууц үг солих" href="/settings/password" />
              <Row
                icon="help-circle"
                title="Нууц үгээ мартсан"
                subtitle="Утсанд ирэх кодоор шинэчилнэ"
                href={{ pathname: '/reset-password', params: { phone: user.phone } }}
                divider
              />
            </Card>
          </Section>

          <Section title="Бүртгэл">
            <Card style={styles.gap}>
              <Fact label="Дэлгүүр" value={user.shopName} />
              <Fact label="Нэр" value={user.name} />
              <Fact label="Утас" value={`+976 ${user.phone}`} />
              <Button title="Гарах" variant="danger" icon="log-out" size="md" onPress={logout} />
            </Card>
          </Section>
        </Column>
      </Columns>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text variant="heading">{title}</Text>
      {children}
    </View>
  );
}

function Row({
  icon,
  title,
  subtitle,
  href,
  warning,
  divider,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  href: Href;
  warning?: boolean;
  divider?: boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href)}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && { backgroundColor: colors.surfaceMuted }]}>
      <View style={[styles.rowIcon, warning && { backgroundColor: colors.warningSoft }]}>
        <Icon name={icon} size={18} color={warning ? colors.warningStrong : colors.text} />
      </View>
      <View style={styles.flex}>
        <Text variant="bodyMedium">{title}</Text>
        {subtitle && (
          <Text variant="caption" color={warning ? colors.warningText : colors.textSecondary} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      <Icon name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.fact}>
      <Text color={colors.textSecondary}>{label}</Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    marginBottom: Spacing.five,
  },
  section: {
    gap: Spacing.three,
  },
  gap: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.four,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.four,
  },
}));
