import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api, type Integrations, type MetaPlatform } from '@/api';
import { useAuth, useUser } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { LoadState } from '@/components/ui/load-state';
import { Column, Columns, Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useReloadOnFocus, useResource } from '@/hooks/use-resource';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { formatRelative, formatShortDate } from '@/lib/format';

// On web, Meta OAuth runs in a popup that lands back on /integrations; this closes
// the popup and hands the result to the waiting openAuthSessionAsync call.
WebBrowser.maybeCompleteAuthSession();

export default function IntegrationsScreen() {
  const { data: integrations, error, reload, setData } = useResource(
    () => api.getIntegrations(),
    [],
  );
  useReloadOnFocus(reload);

  return (
    <Screen>
      <Text variant="display">Холболт</Text>
      <Text color={Colors.textSecondary} style={styles.intro}>
        Холболтуудыг манай баг таны дэлгүүрт ирж тохируулж өгнө. Энд тэдгээрийн төлөвийг харна.
      </Text>

      {!integrations ? (
        <LoadState error={error} onRetry={reload} />
      ) : (
        <Columns>
          <Column>
            <SmsListenerCard integrations={integrations} />
          </Column>
          <Column>
            <MetaCard integrations={integrations} onChange={setData} />
            <AccountCard />
          </Column>
        </Columns>
      )}
    </Screen>
  );
}

// ---------- Meta ----------

const META: Record<MetaPlatform, { label: string; icon: IconName; empty: string }> = {
  facebook: { label: 'Facebook хуудас', icon: 'facebook', empty: 'Хуудас холбогдоогүй' },
  instagram: { label: 'Instagram', icon: 'instagram', empty: 'Бүртгэл холбогдоогүй' },
};

function MetaCard({
  integrations,
  onChange,
}: {
  integrations: Integrations;
  onChange: (next: Integrations) => void;
}) {
  return (
    <Card padded={false}>
      <View style={styles.cardHeader}>
        <Text variant="title">Meta</Text>
        <Text variant="caption" color={Colors.textSecondary}>
          Чат, коммент дээрх захиалгыг автоматаар хүлээн авна.
        </Text>
      </View>
      {(['facebook', 'instagram'] as const).map((platform) => (
        <MetaRow
          key={platform}
          platform={platform}
          integrations={integrations}
          onChange={onChange}
        />
      ))}
    </Card>
  );
}

function MetaRow({
  platform,
  integrations,
  onChange,
}: {
  platform: MetaPlatform;
  integrations: Integrations;
  onChange: (next: Integrations) => void;
}) {
  const connection = integrations[platform];
  const meta = META[platform];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (connection.connected) {
      const ok = await confirm(
        `${meta.label} салгах`,
        'Салгавал энэ сувгаас ирэх захиалга автоматаар бүртгэгдэхгүй.',
        'Салгах',
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      if (connection.connected) {
        onChange(await api.disconnectMeta(platform));
      } else {
        // The backend returns Meta's consent page; after its callback it redirects to returnUrl.
        const returnUrl = Linking.createURL('/integrations');
        const { authUrl } = await api.connectMeta(platform, returnUrl);
        if (authUrl) await WebBrowser.openAuthSessionAsync(authUrl, returnUrl);
        onChange(await api.getIntegrations());
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.metaRow}>
      <View style={styles.metaIcon}>
        <Icon name={meta.icon} size={20} color={Colors.text} />
      </View>
      <View style={styles.flex}>
        <View style={styles.inline}>
          <Text variant="bodyMedium">{meta.label}</Text>
          <StatusPill active={connection.connected} />
        </View>
        <Text variant="caption" color={Colors.textSecondary} numberOfLines={2}>
          {connection.connected
            ? `${connection.accountName}${connection.connectedAt ? ` · ${formatShortDate(new Date(connection.connectedAt))}-нд холбосон` : ''}`
            : meta.empty}
        </Text>
        {error && (
          <Text variant="caption" color={Colors.danger}>
            {error}
          </Text>
        )}
      </View>
      <Button
        title={connection.connected ? 'Салгах' : 'Холбох'}
        variant={connection.connected ? 'outline' : 'primary'}
        size="sm"
        loading={busy}
        onPress={toggle}
      />
    </View>
  );
}

// ---------- SMS listener ----------

function SmsListenerCard({ integrations }: { integrations: Integrations }) {
  const sms = integrations.sms;
  const [showToken, setShowToken] = useState(false);
  const sender = sms.senderNumber ?? 'банкны дугаар';

  return (
    <Card style={styles.cardGap}>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text variant="title">Банкны мессеж сонсогч</Text>
          <Text variant="caption" color={Colors.textSecondary}>
            Утсанд ирсэн банкны SMS-ийг энэ хаяг руу дамжуулж, гүйлгээг захиалгатай тулгана.
          </Text>
        </View>
        <StatusPill active={sms.connected} activeLabel="Идэвхтэй" />
      </View>

      <View style={styles.facts}>
        <Fact label="Илгээгч" value={sms.senderNumber ?? '—'} />
        <Fact label="Төхөөрөмж" value={sms.deviceLabel ?? '—'} />
        <Fact
          label="Сүүлд хүлээн авсан"
          value={sms.lastReceivedAt ? formatRelative(sms.lastReceivedAt) : 'Хүлээн аваагүй'}
        />
      </View>

      <CopyField label="Webhook хаяг" value={sms.webhookUrl} />
      <CopyField
        label="Токен (X-Listener-Token)"
        value={sms.token}
        display={showToken ? sms.token : '•'.repeat(Math.min(sms.token.length, 20))}
        extra={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showToken ? 'Токен нуух' : 'Токен харах'}
            onPress={() => setShowToken((v) => !v)}
            hitSlop={8}
            style={styles.copyButton}>
            <Icon name={showToken ? 'eye-off' : 'eye'} size={18} color={Colors.textSecondary} />
          </Pressable>
        }
      />

      <Disclosure title="iPhone дээр тохируулах" icon="smartphone">
        <Steps
          steps={[
            'Shortcuts апп → Automation → Create Personal Automation → Message.',
            `Sender хэсэгт ${sender}-ийг сонгоод "Run Immediately"-г асаана.`,
            '"Get Contents of URL" үйлдэл нэмж дээрх Webhook хаягийг оруулна.',
            'Method: POST. Header: X-Listener-Token = токен. Request Body: мессежийн текст.',
          ]}
        />
      </Disclosure>
      <Disclosure title="Android дээр тохируулах" icon="smartphone">
        <Steps
          steps={[
            'SMS-ийг webhook руу дамжуулдаг апп суулгана.',
            `Шүүлтүүрт зөвхөн ${sender}-ээс ирсэн мессежийг сонгоно.`,
            'Хаягт дээрх Webhook хаягийг, header-т X-Listener-Token = токен-ийг оруулна.',
            'Апп-ыг батарей хэмнэлтээс чөлөөлж, байнга ажиллах эрх өгнө.',
          ]}
        />
      </Disclosure>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text color={Colors.textSecondary}>{label}</Text>
      <Text variant="bodyMedium" style={styles.factValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function CopyField({
  label,
  value,
  display = value,
  extra,
}: {
  label: string;
  value: string;
  display?: string;
  extra?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.copyField}>
      <Text variant="captionMedium" color={Colors.textSecondary}>
        {label}
      </Text>
      <View style={styles.copyBox}>
        <Text style={styles.mono} numberOfLines={1} selectable>
          {display}
        </Text>
        {extra}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} хуулах`}
          onPress={copy}
          hitSlop={8}
          style={styles.copyButton}>
          <Icon
            name={copied ? 'check' : 'copy'}
            size={18}
            color={copied ? Colors.primary : Colors.textSecondary}
          />
        </Pressable>
      </View>
    </View>
  );
}

function Disclosure({
  title,
  icon,
  children,
}: {
  title: string;
  icon: IconName;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.disclosure}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.disclosureHeader}>
        <Icon name={icon} size={18} color={Colors.textSecondary} />
        <Text variant="label" style={styles.flex}>
          {title}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textSecondary} />
      </Pressable>
      {open && <View style={styles.disclosureBody}>{children}</View>}
    </View>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <View style={styles.steps}>
      {steps.map((step, i) => (
        <View key={step} style={styles.step}>
          <View style={styles.stepNumber}>
            <Text variant="captionMedium" color={Colors.primary}>
              {i + 1}
            </Text>
          </View>
          <Text variant="caption" style={styles.flex}>
            {step}
          </Text>
        </View>
      ))}
    </View>
  );
}

function StatusPill({ active, activeLabel = 'Холбогдсон' }: { active: boolean; activeLabel?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: active ? Colors.primarySoft : Colors.surfaceMuted }]}>
      <View
        style={[styles.dot, { backgroundColor: active ? Colors.primary : Colors.textMuted }]}
      />
      <Text variant="captionMedium" color={active ? Colors.primary : Colors.textSecondary}>
        {active ? activeLabel : 'Холбогдоогүй'}
      </Text>
    </View>
  );
}

// ---------- Account ----------

function AccountCard() {
  const user = useUser();
  const { signOut } = useAuth();

  const logout = async () => {
    if (await confirm('Гарах', 'Бүртгэлээсээ гарах уу?', 'Гарах')) await signOut();
  };

  return (
    <Card style={styles.cardGap}>
      <Text variant="title">Бүртгэл</Text>
      <View style={styles.facts}>
        <Fact label="Дэлгүүр" value={user.shopName} />
        <Fact label="Нэр" value={user.name} />
        <Fact label="Утас" value={`+976 ${user.phone}`} />
      </View>
      <Button title="Гарах" variant="danger" icon="log-out" size="md" onPress={logout} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  intro: {
    marginTop: Spacing.two,
    marginBottom: Spacing.six,
    maxWidth: 640,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  cardGap: {
    gap: Spacing.five,
  },
  cardHeader: {
    padding: Spacing.five,
    gap: Spacing.one,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  metaIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  facts: {
    gap: Spacing.three,
  },
  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.four,
  },
  factValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  copyField: {
    gap: Spacing.two,
  },
  copyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingLeft: Spacing.four,
    paddingRight: Spacing.two,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
  },
  mono: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
  copyButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disclosure: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
  },
  disclosureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    minHeight: 50,
  },
  disclosureBody: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  steps: {
    gap: Spacing.three,
  },
  step: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
