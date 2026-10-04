import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { api, type ReviewCase } from '@/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { LoadState } from '@/components/ui/load-state';
import { Column, Columns, Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Radius, Spacing, type Palette } from '@/constants/theme';
import { makeStyles, useColors } from '@/theme';
import { useReloadOnFocus, useResource } from '@/hooks/use-resource';
import { confirm } from '@/lib/confirm';
import { formatMoney, formatRelative } from '@/lib/format';
import { genitive } from '@/lib/mongolian';
import { openCase, reasonLabel, resolutionLabel, startReview } from '@/lib/review';

export default function ReviewInboxScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { data: cases, error, loading, reload } = useResource(() => api.listReviewCases(), []);
  useReloadOnFocus(reload);

  const open = (cases ?? []).filter((c) => c.status === 'open');
  const waiting = (cases ?? []).filter((c) => c.status === 'waiting_buyer');
  const refunds = (cases ?? []).filter((c) => c.refund?.status === 'pending');
  const resolved = (cases ?? []).filter((c) => c.status === 'resolved');

  return (
    <Screen>
      <View style={styles.titleRow}>
        <Text variant="display">Шалгах</Text>
        {loading && cases && <ActivityIndicator color={colors.primary} />}
      </View>
      <Text color={colors.textSecondary} style={styles.subtitle}>
        Автоматаар тулгагдаагүй төлбөрүүдийг энд шалгаж, захиалгатай нь холбоно.
      </Text>

      {!cases ? (
        <LoadState error={error} onRetry={reload} />
      ) : (
        <Columns>
          <Column>
            <StartCard count={open.length} />
            {open.length > 0 && (
              <Section title="Шалгах" count={open.length}>
                {open.map((c, i) => (
                  <CaseRow key={c.id} reviewCase={c} divider={i > 0} onPress={() => startReview(c.id)} />
                ))}
              </Section>
            )}
            {waiting.length > 0 && (
              <Section title="Хариу хүлээж буй" count={waiting.length}>
                {waiting.map((c, i) => (
                  <CaseRow key={c.id} reviewCase={c} divider={i > 0} onPress={() => openCase(c.id)} />
                ))}
              </Section>
            )}
          </Column>
          <Column>
            {refunds.length > 0 && (
              <Section title="Буцаалт хийх" count={refunds.length} tone="warning">
                {refunds.map((c, i) => (
                  <RefundRow key={c.id} reviewCase={c} divider={i > 0} onDone={reload} />
                ))}
              </Section>
            )}
            <Section title="Сүүлд шийдвэрлэсэн" empty="Сүүлийн 7 хоногт шийдвэрлэсэн зүйл алга.">
              {resolved.map((c, i) => (
                <CaseRow key={c.id} reviewCase={c} divider={i > 0} onPress={() => openCase(c.id)} />
              ))}
            </Section>
          </Column>
        </Columns>
      )}
    </Screen>
  );
}

function StartCard({ count }: { count: number }) {
  const colors = useColors();
  const styles = useStyles();
  if (count === 0) {
    return (
      <Card tone="info" style={styles.startRow}>
        <View style={[styles.startIcon, { backgroundColor: colors.surface }]}>
          <Icon name="check" size={22} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text variant="title" color={colors.primary}>
            Бүх төлбөр тулгагдсан
          </Text>
          <Text variant="caption" color={colors.primary}>
            Шинэ зөрүү гарвал энд харагдана
          </Text>
        </View>
      </Card>
    );
  }
  return (
    <Card tone="warning" style={styles.startCard}>
      <View style={styles.startRow}>
        <View style={styles.startIcon}>
          <Icon name="alert-circle" size={24} color={colors.warningText} />
        </View>
        <View style={styles.flex}>
          <Text variant="title" color={colors.warningText}>
            {count} төлбөр шалгах
          </Text>
          <Text variant="caption" color={colors.warningStrong}>
            Нэг нэгээр нь харж баталгаажуулна
          </Text>
        </View>
      </View>
      <Button title="Шалгаж эхлэх" variant="dark" iconRight="chevron-right" onPress={() => startReview()} />
    </Card>
  );
}

function Section({
  title,
  count,
  empty,
  tone = 'default',
  children,
}: {
  title: string;
  count?: number;
  empty?: string;
  tone?: 'default' | 'warning';
  children: ReactNode[];
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="heading">{title}</Text>
        {count !== undefined && count > 0 && (
          <View style={[styles.count, tone === 'warning' && { backgroundColor: colors.warningSoft }]}>
            <Text variant="captionMedium" color={tone === 'warning' ? colors.warningText : colors.textSecondary}>
              {count}
            </Text>
          </View>
        )}
      </View>
      {children.length === 0 ? (
        empty ? (
          <Text variant="caption" color={colors.textSecondary}>
            {empty}
          </Text>
        ) : null
      ) : (
        <Card tone={tone === 'warning' ? 'warning' : 'default'} padded={false}>
          {children}
        </Card>
      )}
    </View>
  );
}

const statusLook = (colors: Palette): Record<ReviewCase['status'], { icon: IconName; color: string; bg: string }> => ({
  open: { icon: 'alert-circle', color: colors.warningStrong, bg: colors.warningSoft },
  waiting_buyer: { icon: 'message-circle', color: colors.textSecondary, bg: colors.surfaceMuted },
  resolved: { icon: 'check', color: colors.primary, bg: colors.primarySoft },
});

function CaseRow({
  reviewCase: c,
  divider,
  onPress,
}: {
  reviewCase: ReviewCase;
  divider: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const look = statusLook(colors)[c.status];
  const detail =
    c.status === 'resolved'
      ? resolutionLabel(c)
      : c.status === 'waiting_buyer' && c.contact
        ? `${genitive(c.contact.customerName)} хариуг хүлээж байна · ${formatRelative(c.contact.sentAt)}`
        : c.suggestion
          ? `${c.suggestion.order.customerName} · ${c.suggestion.order.code} байж магадгүй`
          : `${c.candidates.length} ойролцоо захиалга`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatMoney(c.payment.amount)}, ${c.payment.senderName}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && styles.pressed]}>
      <View style={[styles.rowIcon, { backgroundColor: look.bg }]}>
        <Icon name={look.icon} size={18} color={look.color} />
      </View>
      <View style={styles.flex}>
        <View style={styles.rowTitle}>
          <Text variant="bodyMedium" numberOfLines={1} style={styles.shrink}>
            {formatMoney(c.payment.amount)} · {c.payment.senderName}
          </Text>
        </View>
        <Text variant="caption" color={colors.textSecondary} numberOfLines={2}>
          {detail}
        </Text>
        <View style={styles.rowMeta}>
          {c.status !== 'resolved' && (
            <View style={styles.reason}>
              <Text variant="captionMedium" color={colors.warningText} style={styles.reasonText}>
                {reasonLabel(c)}
              </Text>
            </View>
          )}
          <Text variant="caption" color={colors.textMuted} style={styles.reasonText}>
            {formatRelative(c.payment.receivedAt)}
          </Text>
        </View>
      </View>
      <Icon name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function RefundRow({
  reviewCase: c,
  divider,
  onDone,
}: {
  reviewCase: ReviewCase;
  divider: boolean;
  onDone: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [busy, setBusy] = useState(false);
  if (!c.refund) return null;
  const amount = c.refund.amount;

  const markDone = async () => {
    const ok = await confirm(
      'Буцаалт',
      `${formatMoney(amount)}-ийг ${c.payment.senderName} руу буцааж шилжүүлсэн үү?`,
      'Тийм',
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.markRefunded(c.id);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.row, divider && styles.warningDivider]}>
      <Pressable accessibilityRole="button" onPress={() => openCase(c.id)} style={styles.flex}>
        <Text variant="bodyMedium" color={colors.warningText}>
          {formatMoney(amount)} → {c.payment.senderName}
        </Text>
        <Text variant="caption" color={colors.warningStrong} numberOfLines={1}>
          {resolutionLabel(c)}
        </Text>
      </Pressable>
      <Button title="Буцаасан" variant="outline" size="sm" onPress={markDone} loading={busy} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  shrink: {
    flexShrink: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  subtitle: {
    marginTop: Spacing.two,
    marginBottom: Spacing.six,
    maxWidth: 640,
  },
  startCard: {
    gap: Spacing.five,
  },
  startRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  startIcon: {
    width: 52,
    height: 52,
    borderRadius: Radius.pill,
    backgroundColor: colors.warningIconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: Spacing.three,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  count: {
    minWidth: 24,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
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
  warningDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.warningBorder,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  reason: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderRadius: Radius.pill,
    backgroundColor: colors.warningSoft,
  },
  reasonText: {
    fontSize: 12,
    lineHeight: 16,
  },
}));
