import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import type { DateRange } from '@/api';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/theme';
import {
  WEEKDAYS_SHORT_MON_FIRST,
  formatMonthYear,
  formatRangeShort,
  fromDayKey,
  toDayKey,
} from '@/lib/format';

/** Calendar modal for choosing an inclusive range of past days (up to today). */
export function DateRangePicker({
  visible,
  initial,
  maxDay,
  onCancel,
  onApply,
}: {
  visible: boolean;
  initial: DateRange;
  /** Latest day in the calling screen's timezone. */
  maxDay?: string;
  onCancel: () => void;
  onApply: (range: DateRange) => void;
}) {
  return (
    <CalendarModal visible={visible} onCancel={onCancel}>
      <Calendar
        mode="range"
        initial={initial}
        max={maxDay ?? toDayKey(new Date())}
        onCancel={onCancel}
        onApply={onApply}
      />
    </CalendarModal>
  );
}

/** Calendar modal for choosing one day on or after `min` (e.g. a future deadline). */
export function DatePicker({
  visible,
  value,
  min,
  maxDay,
  onCancel,
  onApply,
}: {
  visible: boolean;
  value: string | null;
  min?: string;
  maxDay?: string;
  onCancel: () => void;
  onApply: (day: string) => void;
}) {
  return (
    <CalendarModal visible={visible} onCancel={onCancel}>
      <Calendar
        mode="single"
        initial={value ? { from: value, to: value } : null}
        min={min}
        max={maxDay}
        onCancel={onCancel}
        onApply={(range) => onApply(range.from)}
      />
    </CalendarModal>
  );
}

function CalendarModal({
  visible,
  onCancel,
  children,
}: {
  visible: boolean;
  onCancel: () => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Хаах" />
        {/* Remounted on every open so it starts from the current selection. */}
        {visible && children}
      </View>
    </Modal>
  );
}

function Calendar({
  mode,
  initial,
  min,
  max,
  onCancel,
  onApply,
}: {
  mode: 'range' | 'single';
  initial: DateRange | null;
  /** Earliest / latest selectable day (`YYYY-MM-DD`). */
  min?: string;
  max?: string;
  onCancel: () => void;
  onApply: (range: DateRange) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [start, setStart] = useState<string | null>(initial?.from ?? null);
  const [end, setEnd] = useState<string | null>(initial?.to ?? null);
  const shown = fromDayKey(initial?.to ?? min ?? toDayKey(new Date()));
  const [view, setView] = useState({ year: shown.getFullYear(), month: shown.getMonth() });

  const monthStart = toDayKey(new Date(view.year, view.month, 1));
  const monthEnd = toDayKey(new Date(view.year, view.month + 1, 0));
  const isOutside = (key: string) => (!!min && key < min) || (!!max && key > max);

  const shiftMonth = (delta: number) =>
    setView(({ year, month }) => {
      const date = new Date(year, month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });

  const selectDay = (key: string) => {
    if (mode === 'single') {
      setStart(key);
      setEnd(key);
    } else if (!start || end) {
      setStart(key);
      setEnd(null);
    } else if (key < start) {
      setStart(key);
    } else {
      setEnd(key);
    }
  };

  // Monday-first grid with leading blanks.
  const firstWeekday = (new Date(view.year, view.month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDayKey(new Date(view.year, view.month, i + 1))),
  ];

  const rangeEnd = end ?? start;

  return (
    <View style={styles.sheet} accessibilityViewIsModal>
      <View style={styles.monthRow}>
        <IconButton
          icon="chevron-left"
          label="Өмнөх сар"
          onPress={() => shiftMonth(-1)}
          disabled={!!min && monthStart <= min}
        />
        <Text variant="heading">{formatMonthYear(view.year, view.month)}</Text>
        <IconButton
          icon="chevron-right"
          label="Дараагийн сар"
          onPress={() => shiftMonth(1)}
          disabled={!!max && monthEnd >= max}
        />
      </View>

      <View style={styles.grid}>
        {WEEKDAYS_SHORT_MON_FIRST.map((day) => (
          <View key={day} style={styles.cell}>
            <Text variant="captionMedium" color={colors.textMuted}>
              {day}
            </Text>
          </View>
        ))}
        {cells.map((key, index) => {
          if (!key) return <View key={`blank${index}`} style={styles.cell} />;
          const outside = isOutside(key);
          const isStart = key === start;
          const isEnd = key === rangeEnd;
          const inRange = !!start && !!rangeEnd && key >= start && key <= rangeEnd;
          const hasSpan = !!start && !!rangeEnd && start !== rangeEnd;

          return (
            <Pressable
              key={key}
              disabled={outside}
              onPress={() => selectDay(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: isStart || isEnd, disabled: outside }}
              style={[
                styles.cell,
                inRange && hasSpan && styles.band,
                isStart && hasSpan && styles.bandStart,
                isEnd && hasSpan && styles.bandEnd,
              ]}>
              <View style={[styles.day, (isStart || isEnd) && styles.dayEndpoint]}>
                <Text
                  variant={isStart || isEnd ? 'label' : 'body'}
                  color={
                    outside ? colors.border : isStart || isEnd ? colors.textOnPrimary : colors.text
                  }>
                  {fromDayKey(key).getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text variant="caption" color={colors.textSecondary} style={styles.summary}>
        {mode === 'single'
          ? start
            ? formatRangeShort(start, start)
            : 'Өдрөө сонгоно уу'
          : start
            ? formatRangeShort(start, rangeEnd ?? start)
            : 'Эхлэх өдрөө сонгоно уу'}
        {mode === 'range' && start && !end ? ' · дуусах өдрөө сонгоно уу' : ''}
      </Text>

      <View style={styles.actions}>
        <Button title="Болих" variant="outline" size="md" onPress={onCancel} style={styles.flex} />
        <Button
          title="Сонгох"
          size="md"
          disabled={!start}
          onPress={() => start && onApply({ from: start, to: end ?? start })}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: 'chevron-left' | 'chevron-right';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.surfaceMuted }]}>
      <Icon name={icon} size={22} color={disabled ? colors.border : colors.text} />
    </Pressable>
  );
}

const CELL = 44;

const useStyles = makeStyles((colors) => ({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.five,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.five,
    gap: Spacing.three,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.one,
  },
  cell: {
    width: `${100 / 7}%`,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  band: {
    backgroundColor: colors.primarySoft,
  },
  bandStart: {
    borderTopLeftRadius: CELL / 2,
    borderBottomLeftRadius: CELL / 2,
  },
  bandEnd: {
    borderTopRightRadius: CELL / 2,
    borderBottomRightRadius: CELL / 2,
  },
  day: {
    width: CELL - 4,
    height: CELL - 4,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayEndpoint: {
    backgroundColor: colors.primary,
  },
  summary: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
}));
