import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { api, type Channel, type DateRange, type ReportSummary } from '@/api';
import { DateRangePicker } from '@/components/date-range-picker';
import { SummaryCard } from '@/components/summary-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { LoadState } from '@/components/ui/load-state';
import { Column, Columns, Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/theme';
import { useReloadOnFocus, useResource } from '@/hooks/use-resource';
import { exportOrders, type ExportFormat } from '@/lib/export/report-export';
import { addDays, formatMoney, formatNumber, formatRangeShort, toDayKey } from '@/lib/format';
import { CHANNEL_LABELS } from '@/lib/labels';

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'thisMonth' | 'custom';

const PRESETS: { id: Exclude<Preset, 'custom'>; label: string }[] = [
  { id: 'today', label: 'Өнөөдөр' },
  { id: 'yesterday', label: 'Өчигдөр' },
  { id: 'week', label: '7 хоног' },
  { id: 'month', label: '30 хоног' },
  { id: 'thisMonth', label: 'Энэ сар' },
];

function presetRange(preset: Exclude<Preset, 'custom'>): DateRange {
  const today = new Date();
  const key = (daysBack: number) => toDayKey(addDays(today, -daysBack));
  switch (preset) {
    case 'today':
      return { from: key(0), to: key(0) };
    case 'yesterday':
      return { from: key(1), to: key(1) };
    case 'week':
      return { from: key(6), to: key(0) };
    case 'month':
      return { from: key(29), to: key(0) };
    case 'thisMonth':
      return { from: toDayKey(new Date(today.getFullYear(), today.getMonth(), 1)), to: key(0) };
  }
}

const ALL_CHANNELS: Channel[] = ['live', 'messenger', 'instagram', 'facebook'];

export default function ReportScreen() {
  const colors = useColors();
  const styles = useStyles();
  const [preset, setPreset] = useState<Preset>('today');
  const [range, setRange] = useState<DateRange>(() => presetRange('today'));
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data, error, loading, reload } = useResource(
    () => api.getReport(range),
    [range.from, range.to],
  );
  useReloadOnFocus(reload);

  const choosePreset = (id: Exclude<Preset, 'custom'>) => {
    setPreset(id);
    setRange(presetRange(id));
  };

  return (
    <Screen>
      <View style={styles.titleRow}>
        <Text variant="display">Тайлан</Text>
        {loading && data && <ActivityIndicator color={colors.primary} />}
      </View>

      <View style={styles.chips}>
        {PRESETS.map((p) => (
          <Chip
            key={p.id}
            label={p.label}
            selected={preset === p.id}
            onPress={() => choosePreset(p.id)}
          />
        ))}
        <Chip
          label={preset === 'custom' ? formatRangeShort(range.from, range.to) : 'Огноо сонгох'}
          icon="calendar"
          selected={preset === 'custom'}
          onPress={() => setPickerOpen(true)}
        />
      </View>

      {!data ? (
        <LoadState error={error} onRetry={reload} />
      ) : (
        <Columns>
          <Column>
            <SummaryCard
              label={`Нийт орлого · ${formatRangeShort(data.from, data.to)}`}
              amount={data.revenue}
              caption={`${data.paidCount} захиалга баталгаажсан`}
            />
            <ChannelCard summary={data} />
            <ExportCard range={range} />
          </Column>
          <Column>
            <TopProductsCard summary={data} />
            <PendingCard summary={data} />
          </Column>
        </Columns>
      )}

      <DateRangePicker
        visible={pickerOpen}
        initial={range}
        onCancel={() => setPickerOpen(false)}
        onApply={(next) => {
          setPickerOpen(false);
          setPreset('custom');
          setRange(next);
        }}
      />
    </Screen>
  );
}

function ChannelCard({ summary }: { summary: ReportSummary }) {
  const styles = useStyles();
  const counts = new Map(summary.byChannel.map((c) => [c.channel, c.count]));
  const channels = ALL_CHANNELS.map((channel) => ({ channel, count: counts.get(channel) ?? 0 })).sort(
    (a, b) => b.count - a.count,
  );
  const max = Math.max(1, ...channels.map((c) => c.count));

  return (
    <Card style={styles.cardGap}>
      <Text variant="heading">Хаанаас ирсэн</Text>
      {channels.map(({ channel, count }) => (
        <View key={channel} style={styles.channel}>
          <View style={styles.spread}>
            <Text>{CHANNEL_LABELS[channel]}</Text>
            <Text variant="bodyMedium">{count}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${(count / max) * 100}%` }]} />
          </View>
        </View>
      ))}
    </Card>
  );
}

function TopProductsCard({ summary }: { summary: ReportSummary }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Card padded={false}>
      <Text variant="heading" style={styles.cardTitle}>
        Шилдэг бараа
      </Text>
      {summary.topProducts.length === 0 ? (
        <Text color={colors.textSecondary} style={styles.emptyText}>
          Энэ хугацаанд борлуулалт алга.
        </Text>
      ) : (
        summary.topProducts.map((product) => (
          <View key={product.productId} style={[styles.productRow, styles.divider]}>
            <Text variant="bodyMedium" style={styles.flex} numberOfLines={1}>
              {product.name}
            </Text>
            <Text color={colors.textSecondary}>
              {formatNumber(product.quantity)} ш ·{' '}
              <Text variant="bodyMedium">{formatMoney(product.revenue)}</Text>
            </Text>
          </View>
        ))
      )}
    </Card>
  );
}

function PendingCard({ summary }: { summary: ReportSummary }) {
  const colors = useColors();
  const styles = useStyles();
  if (summary.awaitingCount === 0 && summary.unmatchedPaymentCount === 0) return null;
  return (
    <Card tone="warning" padded={false}>
      {summary.awaitingCount > 0 && (
        <View style={styles.pendingRow}>
          <Icon name="clock" size={18} color={colors.warningText} />
          <Text variant="label" color={colors.warningText} style={styles.flex}>
            {summary.awaitingCount} захиалгын төлбөр хүлээгдэж байна
          </Text>
        </View>
      )}
      {summary.unmatchedPaymentCount > 0 && (
        <View style={[styles.pendingRow, summary.awaitingCount > 0 && styles.warningDivider]}>
          <Icon name="help-circle" size={18} color={colors.warningText} />
          <Text variant="label" color={colors.warningText} style={styles.flex}>
            {summary.unmatchedPaymentCount} захиалгагүй төлбөр
          </Text>
        </View>
      )}
    </Card>
  );
}

function ExportCard({ range }: { range: DateRange }) {
  const colors = useColors();
  const styles = useStyles();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const runExport = async (format: ExportFormat) => {
    setBusy(format);
    setMessage(null);
    try {
      const orders = await api.listOrders(range);
      if (orders.length === 0) {
        setMessage('Энэ хугацаанд захиалга алга байна.');
      } else {
        await exportOrders(format, range, orders);
      }
    } catch {
      setMessage('Файл үүсгэж чадсангүй. Дахин оролдоно уу.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={styles.cardGap}>
      <View>
        <Text variant="heading">Тайлан татах</Text>
        <Text variant="caption" color={colors.textSecondary}>
          {formatRangeShort(range.from, range.to)} хугацааны бүх захиалга
        </Text>
      </View>
      <View style={styles.exportButtons}>
        <Button
          title="Excel татах"
          icon="download"
          variant="dark"
          size="md"
          loading={busy === 'xlsx'}
          disabled={busy !== null}
          onPress={() => runExport('xlsx')}
          style={styles.flex}
        />
        <Button
          title="CSV татах"
          icon="download"
          variant="outline"
          size="md"
          loading={busy === 'csv'}
          disabled={busy !== null}
          onPress={() => runExport('csv')}
          style={styles.flex}
        />
      </View>
      {message && (
        <Text variant="caption" color={colors.textSecondary}>
          {message}
        </Text>
      )}
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.four,
    marginBottom: Spacing.five,
  },
  cardGap: {
    gap: Spacing.four,
  },
  cardTitle: {
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.three,
  },
  channel: {
    gap: Spacing.two,
  },
  spread: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  track: {
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: Radius.pill,
    backgroundColor: colors.primary,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.four,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  emptyText: {
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.five,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.five,
  },
  warningDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.warningBorder,
  },
  exportButtons: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
}));
