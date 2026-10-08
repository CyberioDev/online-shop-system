import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { api, type Order, type PreorderDetail, type PreorderStatus } from '@/api';
import { PreorderStatusPill } from '@/components/preorder-status-pill';
import { ProductThumb } from '@/components/product-thumb';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadState } from '@/components/ui/load-state';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Text } from '@/components/ui/text';
import { Fonts, Radius, Spacing, type Palette } from '@/constants/theme';
import { makeStyles, useColors } from '@/theme';
import { useReloadOnFocus, useResource } from '@/hooks/use-resource';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { exportPreorder } from '@/lib/export/preorder-export';
import { formatMoney, formatRelative, formatShortDate, fromDayKey } from '@/lib/format';
import { CHANNEL_LABELS } from '@/lib/labels';

const MAX_WIDTH = 720;
const STEPS: { status: PreorderStatus; label: string }[] = [
  { status: 'open', label: 'Захиалга авч байна' },
  { status: 'closed', label: 'Захиалга хаасан' },
  { status: 'arrived', label: 'Бараа ирсэн' },
];
const BUYERS_PREVIEW = 12;

/** Preorder overview: how many to order in bulk, who ordered, and the open → closed → arrived steps. */
export default function PreorderScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, reload, setData } = useResource(() => api.getPreorder(id), [id]);
  useReloadOnFocus(reload);

  const header = (
    <ScreenHeader
      title="Урьдчилсан захиалга"
      fallbackHref="/products"
      right={
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/product/[id]', params: { id } })}
          hitSlop={8}>
          <Text variant="captionMedium" color={colors.primary}>
            Засах
          </Text>
        </Pressable>
      }
    />
  );

  if (!data) {
    return (
      <Screen maxWidth={MAX_WIDTH} header={header}>
        <LoadState error={error} onRetry={reload} />
      </Screen>
    );
  }
  return (
    <PreorderView
      detail={data}
      header={header}
      onStatusChanged={(product) => setData({ ...data, product })}
    />
  );
}

function PreorderView({
  detail,
  header,
  onStatusChanged,
}: {
  detail: PreorderDetail;
  header: ReactNode;
  onStatusChanged: (product: PreorderDetail['product']) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const { product, tally, orders } = detail;
  const preorder = product.preorder!;
  const [busy, setBusy] = useState<'status' | 'export' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showAllBuyers, setShowAllBuyers] = useState(false);

  const totals = tally.reduce(
    (acc, row) => ({ ordered: acc.ordered + row.ordered, paid: acc.paid + row.paid }),
    { ordered: 0, paid: 0 },
  );
  const paidRevenue = orders
    .filter((o) => o.status === 'paid')
    .reduce(
      (sum, o) =>
        sum + o.items.filter((i) => i.productId === product.id).reduce((s, i) => s + i.quantity * i.unitPrice, 0),
      0,
    );
  const maxOrdered = Math.max(1, ...tally.map((row) => row.ordered));
  const stepIndex = STEPS.findIndex((s) => s.status === preorder.status);

  const changeStatus = async (status: PreorderStatus, title: string, text: string, action: string) => {
    if (!(await confirm(title, text, action))) return;
    setBusy('status');
    setMessage(null);
    try {
      onStatusChanged(await api.setPreorderStatus(product.id, status));
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setBusy('export');
    setMessage(null);
    try {
      await exportPreorder(detail);
    } catch {
      setMessage('Файл үүсгэж чадсангүй. Дахин оролдоно уу.');
    } finally {
      setBusy(null);
    }
  };

  const exportButton = (
    <Button
      title="Excel татах"
      icon="download"
      variant="outline"
      size="md"
      onPress={download}
      loading={busy === 'export'}
      disabled={busy !== null}
      style={styles.flex}
    />
  );

  const footer = (
    <View style={styles.footer}>
      {message && (
        <Text variant="caption" color={colors.danger} style={styles.center}>
          {message}
        </Text>
      )}
      {preorder.status === 'open' && (
        <>
          <Button
            title="Захиалга хаах"
            variant="dark"
            loading={busy === 'status'}
            disabled={busy !== null}
            onPress={() =>
              changeStatus(
                'closed',
                'Захиалга хаах',
                `Чатбот «${product.name}»-д шинэ захиалга авахаа зогсооно. Одоогийн ${totals.ordered} ш захиалга хэвээр үлдэнэ.`,
                'Хаах',
              )
            }
          />
          <View style={styles.row}>{exportButton}</View>
        </>
      )}
      {preorder.status === 'closed' && (
        <>
          <Button
            title="Бараа ирсэн гэж тэмдэглэх"
            loading={busy === 'status'}
            disabled={busy !== null}
            onPress={() =>
              changeStatus(
                'arrived',
                'Бараа ирсэн',
                'Төлбөрөө төлсөн худалдан авагчдад чатбот бараа ирснийг мэдэгдэнэ. Буцаах боломжгүй.',
                'Тэмдэглэх',
              )
            }
          />
          <View style={styles.row}>
            <Button
              title="Дахин нээх"
              icon="rotate-ccw"
              variant="outline"
              size="md"
              disabled={busy !== null}
              onPress={() =>
                changeStatus('open', 'Дахин нээх', 'Чатбот дахин захиалга авч эхэлнэ.', 'Нээх')
              }
              style={styles.flex}
            />
            {exportButton}
          </View>
        </>
      )}
      {preorder.status === 'arrived' && <View style={styles.row}>{exportButton}</View>}
    </View>
  );

  return (
    <Screen maxWidth={MAX_WIDTH} header={header} footer={footer}>
      <View style={styles.body}>
        <View style={styles.productRow}>
          <ProductThumb uri={product.imageUrl} size={72} />
          <View style={styles.productText}>
            <Text variant="title">{product.name}</Text>
            <Text color={colors.textSecondary}>
              {formatMoney(product.price)} · Код {product.code}
            </Text>
            <PreorderStatusPill status={preorder.status} />
          </View>
        </View>

        <Stepper current={stepIndex} />

        <Card style={styles.gap}>
          <Fact
            label="Захиалга авах"
            value={
              preorder.closesOn
                ? `${formatShortDate(fromDayKey(preorder.closesOn))} хүртэл`
                : 'Хугацаагүй'
            }
          />
          <Fact label="Ирэх хугацаа" value={preorder.arrivalNote ?? '—'} />
          <Fact
            label="Дээд тоо"
            value={preorder.limit ? `${totals.ordered} / ${preorder.limit} ш` : 'Хязгааргүй'}
          />
          {preorder.limit !== null && (
            <View style={styles.track}>
              <View
                style={[
                  styles.limitBar,
                  { width: `${Math.min(100, (totals.ordered / preorder.limit) * 100)}%` },
                ]}
              />
            </View>
          )}
        </Card>

        <View style={styles.stats}>
          <Stat value={`${totals.ordered} ш`} label="Нийт захиалсан" />
          <Stat value={`${totals.paid} ш`} label="Төлсөн" color={colors.primary} />
          <Stat
            value={`${totals.ordered - totals.paid} ш`}
            label="Төлбөр хүлээж буй"
            color={colors.warningStrong}
          />
        </View>

        <Card style={styles.gap}>
          <View>
            <Text variant="heading">Бөөнөөр захиалах тоо</Text>
            <Text variant="caption" color={colors.textSecondary}>
              Төлсөн тоо = баталгаатай захиалга. Төлсөн орлого {formatMoney(paidRevenue)}.
            </Text>
          </View>
          {tally.map((row) => (
            <View key={row.variantName ?? '—'} style={styles.tallyRow}>
              <Text variant="bodyMedium" style={styles.tallyName} numberOfLines={1}>
                {row.variantName ?? 'Бүгд'}
              </Text>
              <View style={[styles.track, styles.flex]}>
                <View
                  style={[styles.orderedBar, { width: `${(row.ordered / maxOrdered) * 100}%` }]}>
                  <View
                    style={[
                      styles.paidBar,
                      { width: row.ordered ? `${(row.paid / row.ordered) * 100}%` : '0%' },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.tallyNumbers}>
                <Text variant="bodyMedium">{row.ordered} ш</Text>
                <Text variant="caption" color={colors.textSecondary}>
                  төлсөн {row.paid}
                </Text>
              </View>
            </View>
          ))}
          <View style={[styles.spread, styles.totalRow]}>
            <Text variant="bodyMedium">Нийт</Text>
            <Text variant="bodyMedium">
              {totals.ordered} ш · төлсөн {totals.paid} ш
            </Text>
          </View>
        </Card>

        <View style={styles.gap}>
          <Text variant="heading">Захиалагчид ({orders.length})</Text>
          {orders.length === 0 ? (
            <Text color={colors.textSecondary}>Одоогоор захиалга ороогүй байна.</Text>
          ) : (
            <Card padded={false}>
              {(showAllBuyers ? orders : orders.slice(0, BUYERS_PREVIEW)).map((order, i) => (
                <BuyerRow key={order.id} order={order} productId={product.id} divider={i > 0} />
              ))}
            </Card>
          )}
          {!showAllBuyers && orders.length > BUYERS_PREVIEW && (
            <Button
              title={`Бүгдийг харах (${orders.length})`}
              variant="ghost"
              size="sm"
              onPress={() => setShowAllBuyers(true)}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

function Stepper({ current }: { current: number }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.stepper} accessibilityLabel={`Алхам ${current + 1} / ${STEPS.length}`}>
      {STEPS.map((step, i) => {
        const done = i <= current;
        return (
          <View key={step.status} style={styles.step}>
            <View style={[styles.stepBar, done && styles.stepBarDone]} />
            <Text
              variant={i === current ? 'captionMedium' : 'caption'}
              color={done ? colors.primary : colors.textMuted}
              style={styles.stepLabel}>
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.spread}>
      <Text color={colors.textSecondary}>{label}</Text>
      <Text variant="bodyMedium" style={styles.factValue}>
        {value}
      </Text>
    </View>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Card style={styles.stat}>
      <Text style={styles.statValue} color={color}>
        {value}
      </Text>
      <Text variant="caption" color={colors.textSecondary} style={styles.statLabel}>
        {label}
      </Text>
    </Card>
  );
}

const orderStatusLook = (colors: Palette): Record<Order['status'], { label: string; bg: string; fg: string }> => ({
  paid: { label: 'Төлсөн', bg: colors.primarySoft, fg: colors.primary },
  awaiting_payment: { label: 'Төлбөр хүлээж буй', bg: colors.warningSoft, fg: colors.warningText },
  needs_review: { label: 'Шалгах', bg: colors.warningSoft, fg: colors.warningText },
  cancelled: { label: 'Цуцалсан', bg: colors.surfaceMuted, fg: colors.textMuted },
});

function BuyerRow({ order, productId, divider }: { order: Order; productId: string; divider: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const items = order.items.filter((i) => i.productId === productId);
  const what = items.map((i) => `${i.variantName ? `${i.variantName} ` : ''}× ${i.quantity}`).join(', ');
  const look = orderStatusLook(colors)[order.status];
  return (
    <View style={[styles.buyer, divider && styles.divider]}>
      <View style={styles.flex}>
        <Text variant="bodyMedium">
          {order.customerName} · {what}
        </Text>
        <Text variant="caption" color={colors.textSecondary}>
          {CHANNEL_LABELS[order.channel]} · {order.code} · {formatRelative(order.createdAt)}
        </Text>
      </View>
      <View style={[styles.chip, { backgroundColor: look.bg }]}>
        <Text variant="captionMedium" color={look.fg} style={styles.chipText}>
          {look.label}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  body: {
    gap: Spacing.five,
  },
  gap: {
    gap: Spacing.three,
  },
  center: {
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  spread: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.four,
  },
  footer: {
    gap: Spacing.three,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  productText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  stepper: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  step: {
    flex: 1,
    gap: Spacing.two,
  },
  stepBar: {
    height: 6,
    borderRadius: Radius.pill,
    backgroundColor: colors.border,
  },
  stepBarDone: {
    backgroundColor: colors.primary,
  },
  stepLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  factValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  track: {
    height: 10,
    borderRadius: Radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  limitBar: {
    height: '100%',
    borderRadius: Radius.pill,
    backgroundColor: colors.primary,
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stat: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    gap: Spacing.one,
  },
  statValue: {
    fontFamily: Fonts.display,
    fontSize: 22,
    lineHeight: 28,
  },
  statLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  tallyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  tallyName: {
    width: 56,
  },
  orderedBar: {
    height: '100%',
    borderRadius: Radius.pill,
    backgroundColor: colors.primarySoft,
    overflow: 'hidden',
  },
  paidBar: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  tallyNumbers: {
    width: 76,
    alignItems: 'flex-end',
  },
  totalRow: {
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  buyer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  chipText: {
    fontSize: 12,
    lineHeight: 16,
  },
}));
