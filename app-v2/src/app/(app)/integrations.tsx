import * as Clipboard from 'expo-clipboard';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { api, type Integrations } from '@/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { LoadState } from '@/components/ui/load-state';
import { Column, Columns, Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { TextField } from '@/components/ui/text-field';
import { Text } from '@/components/ui/text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/theme';
import { useReloadOnFocus, useResource } from '@/hooks/use-resource';
import { errorMessage } from '@/lib/errors';
import { confirm } from '@/lib/confirm';
import { formatRelative } from '@/lib/format';

export default function IntegrationsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { data: integrations, error, reload, setData } = useResource(
    () => api.getIntegrations(),
    [],
  );
  useReloadOnFocus(reload);

  return (
    <Screen header={<ScreenHeader title="Холболт" fallbackHref="/settings" />}>
      <Text color={colors.textSecondary} style={styles.intro}>
        Холболтуудыг манай баг таны дэлгүүрт ирж тохируулж өгнө. Энд тэдгээрийн төлөвийг харна.
      </Text>

      {!integrations ? (
        <LoadState error={error} onRetry={reload} />
      ) : (
        <Columns>
          <Column>
            <SmsListenerCard integrations={integrations} onChange={setData} />
          </Column>
          <Column>
            <ChatbotWebhookCard integrations={integrations} onChange={setData} />
            <MetaCard />
          </Column>
        </Columns>
      )}
    </Screen>
  );
}

// ---------- Chatbot webhook ----------

function ChatbotWebhookCard({
  integrations,
  onChange,
}: {
  integrations: Integrations;
  onChange: (next: Integrations) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = integrations.chatbot?.connected ?? false;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.configureChatbotWebhook(url.trim(), secret);
      setSecret('');
      onChange({ ...integrations, chatbot: { connected: true } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.disconnectChatbotWebhook();
      onChange({ ...integrations, chatbot: { connected: false } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.cardGap}>
      <View style={styles.cardHeader}>
        <View style={styles.titleRow}>
          <Text variant="title">Make / Zapier чатбот</Text>
          <StatusPill active={connected} activeLabel="Идэвхтэй" />
        </View>
        <Text variant="caption" color={colors.textSecondary}>
          Чатбот backend-ээс бараа, төлбөрийн мэдээлэл авч захиалга үүсгэнэ. Төлбөр батлагдсан
          зэрэг үйл явдлыг энэ HTTPS webhook руу илгээнэ.
        </Text>
      </View>
      <TextField label="Webhook URL" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="https://hook.make.com/..." />
      <TextField label="Webhook secret" value={secret} onChangeText={setSecret} autoCapitalize="none" secureTextEntry hint="Хамгийн багадаа 32 тэмдэгт. Өмнөх secret-ийг дахин харуулахгүй." />
      {error && <Text variant="caption" color={colors.danger}>{error}</Text>}
      <View style={styles.buttonRow}>
        <Button title="Webhook хадгалах" size="md" loading={busy} disabled={!url.trim() || secret.length < 32} onPress={save} />
        {connected && <Button title="Салгах" size="md" variant="outline" loading={busy} onPress={disconnect} />}
      </View>
    </Card>
  );
}

function MetaCard() {
  const colors = useColors();
  return (
    <Card>
      <Text variant="title">Facebook / Instagram</Text>
      <Text variant="caption" color={colors.textSecondary}>
        Сувгийн Meta холболтыг Make эсвэл Zapier дээр тохируулна. Энэ систем Meta OAuth нэвтрэлт
        ашиглахгүй.
      </Text>
    </Card>
  );
}

// ---------- SMS listener ----------

function SmsListenerCard({ integrations, onChange }: { integrations: Integrations; onChange: (next: Integrations) => void }) {
  const colors = useColors();
  const styles = useStyles();
  const sms = integrations.sms;
  const [showToken, setShowToken] = useState(false);
  const sender = sms.senderNumber ?? 'банкны дугаар';
  const [busy, setBusy] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [revealedToken, setRevealedToken] = useState('');
  const rotate = async () => {
    if (sms.connected && !(await confirm('Токен шинэчлэх', 'Өмнөх shortcut токен хүчингүй болно. Утсан дээр шинэ токен тохируулна уу.', 'Шинэчлэх'))) return;
    setBusy(true);
    setSetupError(null);
    try {
      const result = await api.rotateSmsToken();
      setRevealedToken(result.token);
      setShowToken(true);
      onChange({ ...integrations, sms: { ...sms, connected: true, webhookUrl: result.webhookUrl, token: '' } });
    } catch (e) { setSetupError(errorMessage(e)); }
    finally { setBusy(false); }
  };


  return (
    <Card style={styles.cardGap}>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text variant="title">Банкны мессеж сонсогч</Text>
          <Text variant="caption" color={colors.textSecondary}>
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
        value={revealedToken}
        display={showToken ? revealedToken : '•'.repeat(Math.min(revealedToken.length, 20))}
        extra={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showToken ? 'Токен нуух' : 'Токен харах'}
            onPress={() => setShowToken((v) => !v)}
            hitSlop={8}
            style={styles.copyButton}>
            <Icon name={showToken ? 'eye-off' : 'eye'} size={18} color={colors.textSecondary} />
          </Pressable>
        }
      />

      <Button title={sms.connected ? 'Шинэ токен үүсгэх' : 'SMS холболт үүсгэх'} onPress={rotate} loading={busy} />
      <Text variant="caption">Токеныг зөвхөн үүсгэх үед харуулна. Шинэ токен үүсгэхэд өмнөх SMS shortcut холболт хүчингүй болно.</Text>
      {setupError && <Text color={colors.textSecondary}>{setupError}</Text>}
      {!sms.webhookUrl.startsWith('https://') && <Text variant="caption">Утаснаас холбогдохын тулд backend-д нийтийн HTTPS хаяг тохируулах шаардлагатай.</Text>}
      {(sms.failures ?? []).length > 0 && <View style={styles.facts}>
        <Text variant="title">Уншиж чадаагүй SMS</Text>
        {(sms.failures ?? []).map((receipt) => <View key={receipt.id}>
          <Text variant="caption">{formatRelative(receipt.receivedAt)} · {({ 'unrecognized message': 'Мессежийн бүтэц танигдсангүй', 'account mismatch': 'Хүлээн авах данс таарсангүй', 'bank account not configured': 'Банкны данс тохируулаагүй', 'bank mismatch': 'Банк таарсангүй', 'invalid amount': 'Гүйлгээний дүн танигдсангүй' } as Record<string, string>)[receipt.reason] ?? 'Мессежийг шалгана уу'}</Text>
          <Text>{receipt.message}</Text>
        </View>)}
      </View>}
      <Disclosure title="iPhone дээр тохируулах" icon="smartphone">
        <Steps
          steps={[
            'Shortcuts апп → Automation → Create Personal Automation → Message.',
            `Sender хэсэгт ${sender}-ийг сонгоод "Run Immediately"-г асаана.`,
            '"Get Contents of URL" үйлдэл нэмж дээрх Webhook хаягийг оруулна.',
            'Method: POST. Header: X-Listener-Token = токен. Request Body: JSON.',
            'JSON: sender = 131917; message = Shortcut Input-ийн мессежийн текст; id = нэг удаа үүсгэсэн огноо + Random Number.',
            'Дахин илгээхдээ ижил id ашиглана. Get Contents of URL-ийн өмнө ID ба текстийг хадгална.',
          ]}
        />
      </Disclosure>
      <Disclosure title="Android дээр тохируулах" icon="smartphone">
        <Steps
          steps={[
            'SMS-ийг webhook руу дамжуулдаг апп суулгана.',
            `Шүүлтүүрт зөвхөн ${sender}-ээс ирсэн мессежийг сонгоно.`,
            'Webhook хаяг, X-Listener-Token header тохируулна. JSON: id, sender, message.',
            'Апп-ыг батарей хэмнэлтээс чөлөөлж, байнга ажиллах эрх өгнө.',
          ]}
        />
      </Disclosure>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.fact}>
      <Text color={colors.textSecondary}>{label}</Text>
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
  const colors = useColors();
  const styles = useStyles();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.copyField}>
      <Text variant="captionMedium" color={colors.textSecondary}>
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
            color={copied ? colors.primary : colors.textSecondary}
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
  const colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.disclosure}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.disclosureHeader}>
        <Icon name={icon} size={18} color={colors.textSecondary} />
        <Text variant="label" style={styles.flex}>
          {title}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
      </Pressable>
      {open && <View style={styles.disclosureBody}>{children}</View>}
    </View>
  );
}

function Steps({ steps }: { steps: string[] }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.steps}>
      {steps.map((step, i) => (
        <View key={step} style={styles.step}>
          <View style={styles.stepNumber}>
            <Text variant="captionMedium" color={colors.primary}>
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
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.pill, { backgroundColor: active ? colors.primarySoft : colors.surfaceMuted }]}>
      <View
        style={[styles.dot, { backgroundColor: active ? colors.primary : colors.textMuted }]}
      />
      <Text variant="captionMedium" color={active ? colors.primary : colors.textSecondary}>
        {active ? activeLabel : 'Холбогдоогүй'}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
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
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metaIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: colors.surfaceMuted,
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
    backgroundColor: colors.surfaceMuted,
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
    borderColor: colors.border,
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
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
