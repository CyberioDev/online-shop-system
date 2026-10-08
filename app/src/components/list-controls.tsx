import { useState } from 'react';
import { View } from 'react-native';
import type { DateRange, ListQuery } from '@/api';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { Chip } from '@/components/ui/chip';
import { DatePicker } from '@/components/date-range-picker';
import { makeStyles, useColors } from '@/theme';
import { formatRangeShort } from '@/lib/format';
import { customRange, presetRange, rangeSummary, shopDay, TIME_PRESETS, type TimePreset } from '@/lib/time-filter';

export function DateTimeFilter({ onChange, onRefresh }: {
  onChange: (range: ListQuery) => void;
  onRefresh?: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [active, setActive] = useState<TimePreset | 'custom'>('all');
  const [applied, setApplied] = useState<ListQuery>({});
  const [customOpen, setCustomOpen] = useState(false);
  const [calendar, setCalendar] = useState<'from' | 'to' | null>(null);
  const [days, setDays] = useState<DateRange>(() => ({ from: shopDay(), to: shopDay() }));
  const [preciseTime, setPreciseTime] = useState(false);
  const [fromTime, setFromTime] = useState('00:00');
  const [toTime, setToTime] = useState('23:59');
  const [error, setError] = useState('');

  const choosePreset = (preset: TimePreset) => {
    const range = presetRange(preset);
    setActive(preset);
    setApplied(range);
    setCustomOpen(false);
    setError('');
    onChange(range);
    if (preset === 'all') onRefresh?.();
  };
  const applyCustom = () => {
    try {
      const range = customRange(days, preciseTime ? fromTime : '00:00', preciseTime ? toTime : '23:59');
      setActive('custom');
      setApplied(range);
      setCustomOpen(false);
      setError('');
      onChange(range);
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.presets}>
        {TIME_PRESETS.map(preset => (
          <Chip key={preset.key} label={preset.label} selected={active === preset.key} onPress={() => choosePreset(preset.key)} />
        ))}
        <Chip label="Өөр хугацаа" icon="calendar" selected={active === 'custom'} onPress={() => { setCustomOpen(!customOpen); setError(''); }} />
      </View>
      <View style={styles.summaryRow}>
        {active !== 'all' ? <Text variant="caption" color={colors.textSecondary} style={styles.summary}>
          {rangeSummary(applied, active === 'custom')}
        </Text> : <View style={styles.flex} />}
        {(active !== 'all' || onRefresh) && <Button
          title="Шинэчлэх" icon="refresh-cw" size="sm" variant="ghost"
          onPress={() => active === 'custom' || active === 'all' ? onRefresh?.() : choosePreset(active)}
        />}
      </View>
      {customOpen && (
        <View style={styles.custom}>
          <View style={styles.dateRow}>
            <Button title={`Эхлэх · ${formatRangeShort(days.from, days.from)}`} icon="calendar" variant="outline" size="md" style={styles.dateButton} onPress={() => setCalendar('from')} />
            <Button title={`Дуусах · ${formatRangeShort(days.to, days.to)}`} icon="calendar" variant="outline" size="md" style={styles.dateButton} onPress={() => setCalendar('to')} />
          </View>
          <Chip label="Цаг нарийвчлах" selected={preciseTime} icon="clock" onPress={() => { setPreciseTime(!preciseTime); setError(''); }} />
          {preciseTime && <View style={styles.timeRow}>
            <TextField label="Эхлэх цаг" accessibilityLabel="Эхлэх цаг" placeholder="00:00" value={fromTime} onChangeText={setFromTime} autoCorrect={false} maxLength={5} containerStyle={styles.flex} />
            <TextField label="Дуусах цаг" accessibilityLabel="Дуусах цаг" placeholder="23:59" value={toTime} onChangeText={setToTime} autoCorrect={false} maxLength={5} containerStyle={styles.flex} />
          </View>}
          {!!error && <Text variant="caption" color={colors.danger} accessibilityLiveRegion="polite">{error}</Text>}
          <View style={styles.actions}>
            <Button title="Харах" size="md" onPress={applyCustom} />
            <Button title="Болих" size="md" variant="ghost" onPress={() => { setCustomOpen(false); setError(''); }} />
          </View>
        </View>
      )}
      <DatePicker visible={calendar === 'from'} value={days.from} maxDay={shopDay()}
        onCancel={() => setCalendar(null)}
        onApply={from => { setDays(current => ({ from, to: current.to < from ? from : current.to })); setCalendar(null); setError(''); }} />
      <DatePicker visible={calendar === 'to'} value={days.to} min={days.from} maxDay={shopDay()}
        onCancel={() => setCalendar(null)}
        onApply={to => { setDays(current => ({ ...current, to })); setCalendar(null); setError(''); }} />
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  container: { gap: Spacing.two, marginVertical: Spacing.three },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  summary: { flex: 1, minWidth: 180 },
  custom: { backgroundColor: colors.surfaceMuted, borderRadius: Radius.md, padding: Spacing.four, gap: Spacing.three },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  dateButton: { flexGrow: 1 },
  timeRow: { flexDirection: 'row', gap: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
}));

export function Pagination({ page, total, count, hasPrevious, hasNext, loading, previous, next }: {
  page: number; total: number; count: number; hasPrevious: boolean; hasNext: boolean; loading: boolean; previous: () => void; next: () => void;
}) {
  return <View style={{ gap: Spacing.two, marginVertical: Spacing.three }}>
    <Text variant="caption">Хуудас {page} · {count} / {total} илэрц</Text>
    <View style={{ flexDirection: 'row', gap: Spacing.two }}>
      <Button title="Өмнөх" size="md" variant="outline" disabled={loading || !hasPrevious} onPress={previous} />
      <Button title="Дараах" size="md" variant="outline" disabled={loading || !hasNext} onPress={next} />
    </View>
  </View>;
}
