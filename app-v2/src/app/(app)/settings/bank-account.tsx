import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { api, type BankAccount } from '@/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { LoadState } from '@/components/ui/load-state';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { FormMaxWidth, Radius, Spacing } from '@/constants/theme';
import { useResource } from '@/hooks/use-resource';
import { BANKS, normalizeAccountNumber } from '@/lib/banks';
import { errorMessage } from '@/lib/errors';
import { makeStyles, useColors } from '@/theme';

const header = <ScreenHeader title="Банкны данс" fallbackHref="/settings" />;

export default function BankAccountScreen() {
  const { data, error, reload } = useResource(() => api.getShopSettings(), []);
  if (!data) {
    return (
      <Screen maxWidth={FormMaxWidth} header={header}>
        <LoadState error={error} onRetry={reload} />
      </Screen>
    );
  }
  return <BankAccountForm initial={data.bankAccount} />;
}

function BankAccountForm({ initial }: { initial: BankAccount | null }) {
  const colors = useColors();
  const styles = useStyles();
  const [bank, setBank] = useState(initial?.bank ?? BANKS[0]);
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? '');
  const [holder, setHolder] = useState(initial?.accountHolder ?? '');
  const [errors, setErrors] = useState<{ number?: string; holder?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const number = normalizeAccountNumber(accountNumber);
    const next: typeof errors = {};
    if (!number) next.number = '8–20 оронтой дансны дугаар эсвэл MN-ээр эхэлсэн IBAN оруулна уу.';
    if (!holder.trim()) next.holder = 'Хүлээн авагчийн нэрийг оруулна уу.';
    setErrors(next);
    if (!number || next.holder) return;

    setSaving(true);
    try {
      await api.updateBankAccount({ bank, accountNumber: number, accountHolder: holder.trim() });
      if (router.canGoBack()) router.back();
      else router.replace('/settings');
    } catch (e) {
      setErrors({ form: errorMessage(e) });
      setSaving(false);
    }
  };

  return (
    <Screen
      maxWidth={FormMaxWidth}
      header={header}
      footer={<Button title="Хадгалах" onPress={save} loading={saving} />}>
      <View style={styles.form}>
        <Text color={colors.textSecondary}>
          Худалдан авагч захиалга өгөхөд чатбот энэ дансыг төлбөрийн мэдээлэлтэй хамт илгээнэ.
        </Text>

        <View style={styles.section}>
          <Text variant="label">Банк</Text>
          <View style={styles.chips}>
            {BANKS.map((name) => (
              <Chip key={name} label={name} selected={bank === name} onPress={() => setBank(name)} />
            ))}
          </View>
        </View>

        <TextField
          label="Дансны дугаар"
          placeholder="Жишээ: 5000123456"
          autoCapitalize="characters"
          autoCorrect={false}
          value={accountNumber}
          onChangeText={(text) => {
            setAccountNumber(text);
            setErrors((e) => ({ ...e, number: undefined }));
          }}
          error={errors.number}
          hint="IBAN (MN…) эсвэл ердийн дансны дугаар."
        />
        <TextField
          label="Хүлээн авагчийн нэр"
          placeholder="Банкинд бүртгэлтэй нэр"
          value={holder}
          onChangeText={(text) => {
            setHolder(text);
            setErrors((e) => ({ ...e, holder: undefined }));
          }}
          error={errors.holder}
          hint="Худалдан авагч шилжүүлэхдээ энэ нэрийг харж баталгаажуулна."
        />

        {/* Same layout as the chatbot's payment message in the mockup. */}
        <View style={styles.section}>
          <Text variant="label">Чатбот ингэж илгээнэ</Text>
          <Card style={styles.preview}>
            <Text variant="bodyMedium">Төлбөрөө шилжүүлнэ үү:</Text>
            <PreviewRow label="Банк" value={bank} />
            <PreviewRow label="Данс" value={accountNumber.replace(/\s/g, '') || '—'} />
            <PreviewRow label="Хүлээн авагч" value={holder.trim() || '—'} />
            <PreviewRow label="Дүн" value="87,000₮" bold />
            <Text variant="caption">
              Гүйлгээний утга дээр заавал <Text variant="captionMedium">4827</Text> гэж бичнэ үү.
            </Text>
          </Card>
          <Text variant="caption" color={colors.textSecondary}>
            Дүн болон кодыг захиалга бүрт чатбот өөрөө тавина.
          </Text>
        </View>

        {errors.form && (
          <Text variant="caption" color={colors.danger}>
            {errors.form}
          </Text>
        )}
      </View>
    </Screen>
  );
}

function PreviewRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.previewRow}>
      <Text color={colors.textSecondary}>{label}</Text>
      <Text variant={bold ? 'bodyMedium' : 'body'} style={styles.previewValue}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  form: {
    gap: Spacing.six,
    paddingTop: Spacing.two,
  },
  section: {
    gap: Spacing.three,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  preview: {
    gap: Spacing.two,
    borderRadius: Radius.xl,
    maxWidth: 420,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.four,
  },
  previewValue: {
    flexShrink: 1,
    textAlign: 'right',
    color: colors.text,
  },
}));
