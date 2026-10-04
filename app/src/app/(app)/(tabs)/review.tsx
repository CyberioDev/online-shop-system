import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { api, type ReviewCase } from '@/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { LoadState } from '@/components/ui/load-state';
import { Column, Columns, Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useReloadOnFocus, useResource } from '@/hooks/use-resource';
import { confirm } from '@/lib/confirm';
import { formatMoney, formatRelative } from '@/lib/format';
import { genitive } from '@/lib/mongolian';
import { openCase, reasonLabel, resolutionLabel, startReview } from '@/lib/review';

export default function ReviewInboxScreen() {
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
        {loading && cases && <ActivityIndicator color={Colors.primary} />}
      </View>
      <Text color={Colors.textSecondary} style={styles.subtitle}>
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
  if (count === 0) {
    return (
      <Card tone="info" style={styles.startRow}>
        <View style={[styles.startIcon, { backgroundColor: Colors.surface }]}>
          <Icon name="check" size={22} color={Colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text variant="title" color={Colors.primary}>
            Бүх төлбөр тулгагдсан
          </Text>
          <Text variant="caption" color={Colors.primary}>
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
          <Icon name="alert-circle" size={24} color={Colors.warningText} />
        </View>
        <View style={styles.flex}>
          <Text variant="title" color={Colors.warningText}>
            {count} төлбөр шалгах
          </Text>
          <Text variant="caption" color={Colors.warningStrong}>
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
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="heading">{title}</Text>
        {count !== undefined && count > 0 && (
          <View style={[styles.count, tone === 'warning' && { backgroundColor: Colors.warningSoft }]}>
            <Text variant="captionMedium" color={tone === 'warning' ? Colors.warningText : Colors.textSecondary}>
              {count}
            </Text>
          </View>
        )}
      </View>
      {children.length === 0 ? (
        empty ? (
          <Text variant="caption" color={Colors.textSecondary}>
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

const statusLook: Record<ReviewCase['status'], { icon: IconName; color: string; bg: string }> = {
  open: { icon: 'alert-circle', color: Colors.warningStrong, bg: Colors.warningSoft },
  waiting_buyer: { icon: 'message-circle', color: Colors.textSecondary, bg: Colors.surfaceMuted },
  resolved: { icon: 'check', color: Colors.primary, bg: Colors.primarySoft },
};

function CaseRow({
  reviewCase: c,
  divider,
  onPress,
}: {
  reviewCase: ReviewCase;
  divider: boolean;
  onPress: () => void;
}) {
  const look = statusLook[c.status];
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
        <Text variant="caption" color={Colors.textSecondary} numberOfLines={2}>
          {detail}
        </Text>
        <View style={styles.rowMeta}>
          {c.status !== 'resolved' && (
            <View style={styles.reason}>
              <Text variant="captionMedium" color={Colors.warningText} style={styles.reasonText}>
                {reasonLabel(c)}
              </Text>
            </View>
          )}
          <Text variant="caption" color={Colors.textMuted} style={styles.reasonText}>
            {formatRelative(c.payment.receivedAt)}
          </Text>
        </View>
      </View>
      <Icon name="chevron-right" size={18} color={Colors.textMuted} />
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
        <Text variant="bodyMedium" color={Colors.warningText}>
          {formatMoney(amount)} → {c.payment.senderName}
        </Text>
        <Text variant="caption" color={Colors.warningStrong} numberOfLines={1}>
          {resolutionLabel(c)}
        </Text>
      </Pressable>
      <Button title="Буцаасан" variant="outline" size="sm" onPress={markDone} loading={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: Colors.warningIconBg,
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
    backgroundColor: Colors.surfaceMuted,
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
    borderTopColor: Colors.border,
  },
  warningDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.warningBorder,
  },
  pressed: {
    backgroundColor: Colors.surfaceMuted,
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
    backgroundColor: Colors.warningSoft,
  },
  reasonText: {
    fontSize: 12,
    lineHeight: 16,
  },
});
