import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api, type ReviewCase } from '@/api';
import { useCaseWorkspace } from '@/components/review/case-workspace';
import { PaymentCard } from '@/components/review/review-cards';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { LoadState } from '@/components/ui/load-state';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useResource } from '@/hooks/use-resource';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { formatMoney, formatRelative, formatShortDate, formatTime } from '@/lib/format';
import { resolutionLabel, startReview } from '@/lib/review';

const MAX_WIDTH = 640;

/**
 * Step-through review of one payment. `queue` (comma-separated case ids) is the
 * set being reviewed in this session; it drives the progress bar and "next".
 */
export default function ReviewCaseScreen() {
  const { id, queue: queueParam } = useLocalSearchParams<{ id: string; queue?: string }>();
  const queue = queueParam ? queueParam.split(',').filter(Boolean) : [id];
  const position = Math.max(0, queue.indexOf(id));
  const { data, error, reload, setData } = useResource(() => api.getReviewCase(id), [id]);
  const [remaining, setRemaining] = useState<number | null>(null);

  const advance = async () => {
    const cases = await api.listReviewCases().catch(() => []);
    const open = new Set(cases.filter((c) => c.status === 'open').map((c) => c.id));
    const next = [...queue.slice(position + 1), ...queue.slice(0, position)].find((x) => open.has(x));
    if (next) {
      router.replace({ pathname: '/review/[id]', params: { id: next, queue: queue.join(',') } });
    } else {
      setRemaining(open.size);
    }
  };

  const done = remaining !== null;
  const header = (
    <View>
      <ScreenHeader
        title="Шалгах"
        fallbackHref="/review"
        right={
          queue.length > 1 && data?.status === 'open' && !done ? (
            <Pressable accessibilityRole="button" onPress={advance} hitSlop={8}>
              <Text variant="captionMedium" color={Colors.textSecondary}>
                Алгасах
              </Text>
            </Pressable>
          ) : undefined
        }
      />
      {queue.length > 1 && !done && <Progress current={position + 1} total={queue.length} />}
    </View>
  );

  if (done) {
    return (
      <Screen maxWidth={MAX_WIDTH} header={header}>
        <DoneView remaining={remaining} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen maxWidth={MAX_WIDTH} header={header}>
        <LoadState error={error} onRetry={reload} />
      </Screen>
    );
  }
  if (data.status === 'resolved') {
    return <ResolvedCase key={data.id} reviewCase={data} header={header} onChange={setData} />;
  }
  return <OpenCase key={data.id} reviewCase={data} header={header} onDone={advance} />;
}

function OpenCase({
  reviewCase,
  header,
  onDone,
}: {
  reviewCase: ReviewCase;
  header: ReactNode;
  onDone: () => void;
}) {
  const { body, footer, sheets } = useCaseWorkspace(reviewCase, onDone);
  return (
    <>
      <Screen maxWidth={MAX_WIDTH} header={header} footer={footer}>
        {body}
      </Screen>
      {sheets}
    </>
  );
}

function Progress({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.progress} accessibilityLabel={`${total}-аас ${current}`}>
      <View style={styles.bars}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.bar, i < current && styles.barDone]} />
        ))}
      </View>
      <Text variant="captionMedium" color={Colors.textSecondary}>
        {current} / {total}
      </Text>
    </View>
  );
}

function DoneView({ remaining }: { remaining: number }) {
  const back = () => (router.canGoBack() ? router.back() : router.replace('/review'));
  return (
    <Card style={styles.done}>
      <View style={styles.doneIcon}>
        <Icon name="check" size={30} color={Colors.primary} />
      </View>
      <Text variant="title">{remaining > 0 ? 'Шийдвэрлэлээ' : 'Бүгд шалгагдлаа'}</Text>
      <Text color={Colors.textSecondary} style={styles.center}>
        {remaining > 0
          ? `Өөр ${remaining} төлбөр шалгах үлдсэн байна.`
          : 'Шалгах төлбөр үлдсэнгүй. Шинэ зөрүү гарвал энд харагдана.'}
      </Text>
      <View style={styles.doneActions}>
        {remaining > 0 && (
          <Button title="Үргэлжлүүлэх" onPress={() => startReview(undefined, { replace: true })} />
        )}
        <Button title="Буцах" variant="outline" onPress={back} />
      </View>
    </Card>
  );
}

function ResolvedCase({
  reviewCase: c,
  header,
  onChange,
}: {
  reviewCase: ReviewCase;
  header: ReactNode;
  onChange: (next: ReviewCase) => void;
}) {
  const [busy, setBusy] = useState<'refund' | 'reopen' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const r = c.resolution;

  const act = async (kind: 'refund' | 'reopen', action: () => Promise<ReviewCase>) => {
    setBusy(kind);
    setError(null);
    try {
      onChange(await action());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const markRefunded = async () => {
    if (!c.refund) return;
    const ok = await confirm(
      'Буцаалт',
      `${formatMoney(c.refund.amount)}-ийг ${c.payment.senderName} руу буцааж шилжүүлсэн үү?`,
      'Тийм',
    );
    if (ok) act('refund', () => api.markRefunded(c.id));
  };

  const reopen = async () => {
    const ok = await confirm(
      'Дахин нээх',
      'Шийдвэрийг цуцалж дахин шалгах уу? Захиалгын төлөв өмнөх байдалдаа буцна.',
      'Дахин нээх',
    );
    if (ok) act('reopen', () => api.reopenCase(c.id));
  };

  const differenceText =
    r?.kind === 'matched' && r.difference !== 0
      ? r.difference > 0
        ? `${formatMoney(r.difference)} илүү төлсөн · ${r.differenceAction === 'refund' ? 'буцаана' : 'үлдээсэн'}`
        : `${formatMoney(-r.difference)} дутуу төлсөн · зөвшөөрсөн`
      : null;

  return (
    <Screen
      maxWidth={MAX_WIDTH}
      header={header}
      footer={
        <View style={styles.footer}>
          {error && (
            <Text variant="caption" color={Colors.danger} style={styles.center}>
              {error}
            </Text>
          )}
          <Button
            title="Дахин нээх"
            icon="rotate-ccw"
            variant="outline"
            onPress={reopen}
            loading={busy === 'reopen'}
            disabled={c.refund?.status === 'done' || busy !== null}
          />
          {c.refund?.status === 'done' && (
            <Text variant="caption" color={Colors.textSecondary} style={styles.center}>
              Буцаалт хийгдсэн тул дахин нээх боломжгүй.
            </Text>
          )}
        </View>
      }>
      <View style={styles.body}>
        <View style={styles.intro}>
          <Text variant="display">Шийдвэрлэсэн</Text>
          {r && (
            <Text color={Colors.textSecondary}>
              {formatShortDate(new Date(r.resolvedAt))} · {formatTime(new Date(r.resolvedAt))}
            </Text>
          )}
        </View>

        <Card tone="info" style={styles.gap}>
          <View style={styles.inline}>
            <Icon name="check-circle" size={18} color={Colors.primary} />
            <Text variant="bodyMedium" color={Colors.primary} style={styles.flex}>
              {resolutionLabel(c)}
            </Text>
          </View>
          {differenceText && (
            <Text variant="caption" color={Colors.primary}>
              {differenceText}
            </Text>
          )}
        </Card>

        {c.refund && (
          <Card tone={c.refund.status === 'pending' ? 'warning' : 'default'} style={styles.gap}>
            <Text variant="label" color={c.refund.status === 'pending' ? Colors.warningText : Colors.text}>
              Буцаалт: {formatMoney(c.refund.amount)} → {c.payment.senderName}
            </Text>
            {c.refund.status === 'pending' ? (
              <>
                <Text variant="caption" color={Colors.warningStrong}>
                  Банкны апп-аасаа буцааж шилжүүлээд энд тэмдэглэнэ үү.
                </Text>
                <Button
                  title="Буцаасан гэж тэмдэглэх"
                  variant="dark"
                  size="md"
                  onPress={markRefunded}
                  loading={busy === 'refund'}
                  disabled={busy !== null}
                />
              </>
            ) : (
              <Text variant="caption" color={Colors.textSecondary}>
                Буцаасан{c.refund.doneAt ? ` · ${formatRelative(c.refund.doneAt)}` : ''}
              </Text>
            )}
          </Card>
        )}

        <PaymentCard payment={c.payment} />

        {c.contact && (
          <Card style={styles.gap}>
            <Text variant="label">Илгээсэн мессеж · {c.contact.customerName}</Text>
            <Text variant="caption" color={Colors.textSecondary}>
              “{c.contact.message}”
            </Text>
          </Card>
        )}

        {c.note && (
          <Card style={styles.gap}>
            <Text variant="label">Тэмдэглэл</Text>
            <Text color={Colors.textSecondary}>{c.note}</Text>
          </Card>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  body: {
    gap: Spacing.five,
  },
  intro: {
    gap: Spacing.one,
  },
  gap: {
    gap: Spacing.three,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  center: {
    textAlign: 'center',
  },
  footer: {
    gap: Spacing.two,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  bars: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.one + 2,
  },
  bar: {
    flex: 1,
    height: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.border,
  },
  barDone: {
    backgroundColor: Colors.primary,
  },
  done: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.ten,
    marginTop: Spacing.five,
  },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneActions: {
    alignSelf: 'stretch',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
});
