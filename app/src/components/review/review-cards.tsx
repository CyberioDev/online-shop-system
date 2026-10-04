import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { BankPayment, MatchCandidate, MatchSignal, Order } from '@/api';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Fonts, Radius, Spacing, type Palette } from '@/constants/theme';
import { makeStyles, useColors } from '@/theme';
import { formatMoney, formatRelative, formatTime } from '@/lib/format';
import { CHANNEL_LABELS, describeItems } from '@/lib/labels';

/** The bank transfer under review. */
export function PaymentCard({ payment }: { payment: BankPayment }) {
  const colors = useColors();
  const styles = useStyles();
  const [showRaw, setShowRaw] = useState(false);

  return (
    <Card style={styles.cardGap}>
      <View style={styles.spread}>
        <CardLabel icon="credit-card" text={`Банкнаас ирсэн · ${payment.bank}`} />
        <Text variant="caption" color={colors.textSecondary}>
          {formatTime(new Date(payment.receivedAt))}
        </Text>
      </View>
      <Text style={styles.amount}>{formatMoney(payment.amount)}</Text>
      <View style={styles.facts}>
        <Fact label="Илгээгч" value={payment.senderName} />
        <Fact label="Утга" value={payment.note ? `“${payment.note}”` : '(хоосон)'} muted={!payment.note} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showRaw }}
        onPress={() => setShowRaw((v) => !v)}
        style={styles.rawToggle}>
        <Text variant="captionMedium" color={colors.primary}>
          {showRaw ? 'Банкны мессеж нуух' : 'Банкны мессеж харах'}
        </Text>
        <Icon name={showRaw ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
      </Pressable>
      {showRaw && (
        <View style={styles.raw}>
          <Text variant="caption" selectable style={styles.rawText}>
            {payment.rawMessage}
          </Text>
        </View>
      )}
    </Card>
  );
}

/** An order as the buyer placed it through chat or live selling. */
export function OrderCard({ order }: { order: Order }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Card style={styles.cardGap}>
      <View style={styles.spread}>
        <CardLabel icon="message-square" text={`Захиалга · ${CHANNEL_LABELS[order.channel]}`} />
        <Text variant="caption" color={colors.textSecondary}>
          {formatTime(new Date(order.createdAt))}
        </Text>
      </View>
      <View style={styles.spread}>
        <Text variant="heading">{order.customerName}</Text>
        <Text color={colors.textSecondary}>Код {order.code}</Text>
      </View>
      <Text color={colors.text}>{describeItems(order)}</Text>
      {order.status === 'paid' && (
        <View style={styles.paidBadge}>
          <Icon name="check" size={14} color={colors.primary} />
          <Text variant="captionMedium" color={colors.primary}>
            Төлөгдсөн{order.paidAt ? ` · ${formatTime(new Date(order.paidAt))}` : ''}
          </Text>
        </View>
      )}
      <View style={[styles.spread, styles.totalRow]}>
        <Text variant="bodyMedium">Нийт</Text>
        <Text variant="bodyMedium">{formatMoney(order.total)}</Text>
      </View>
    </Card>
  );
}

const signalLook = (colors: Palette): Record<MatchSignal['level'], { icon: IconName; color: string; bg: string }> => ({
  ok: { icon: 'check', color: colors.primary, bg: colors.primarySoft },
  warn: { icon: 'alert-triangle', color: colors.warningStrong, bg: colors.warningSoft },
  bad: { icon: 'x', color: colors.danger, bg: colors.dangerSoft },
});

/** "Яагаад таарч байна" evidence list. */
export function SignalList({ signals, title }: { signals: MatchSignal[]; title?: string }) {
  const colors = useColors();
  const styles = useStyles();
  const heading =
    title ?? (signals.some((s) => s.level === 'bad') ? 'Анхаарах зүйл' : 'Яагаад таарч байна');
  return (
    <View style={styles.signals}>
      <Text variant="label">{heading}</Text>
      {signals.map((signal) => {
        const look = signalLook(colors)[signal.level];
        // Emphasise the detail after a colon: "Код буруу бичигдсэн: 4872 → 4827".
        const [lead, detail] = signal.text.split(/:\s(.+)/);
        return (
          <View key={signal.text} style={styles.signal}>
            <View style={[styles.signalIcon, { backgroundColor: look.bg }]}>
              <Icon name={look.icon} size={13} color={look.color} />
            </View>
            <Text style={styles.flex}>
              {detail ? (
                <>
                  {lead}: <Text variant="bodyMedium">{detail}</Text>
                </>
              ) : (
                signal.text
              )}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Radio option for one candidate order; shows its evidence when selected. */
export function CandidateOption({
  candidate,
  selected,
  onSelect,
}: {
  candidate: MatchCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const { order } = candidate;
  const meta = [CHANNEL_LABELS[order.channel], formatRelative(order.createdAt), candidate.summary]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${order.customerName}, ${formatMoney(order.total)}, код ${order.code}`}
      onPress={onSelect}
      style={[styles.option, selected && styles.optionSelected]}>
      <View style={styles.optionRow}>
        <Radio selected={selected} />
        <View style={styles.flex}>
          <Text variant="bodyMedium">
            {order.customerName} · {formatMoney(order.total)}
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            {meta}
          </Text>
        </View>
        <Text variant="caption" color={colors.textMuted}>
          {order.code}
        </Text>
      </View>
      {selected && (
        <View style={styles.optionDetail}>
          <Text variant="caption" color={colors.textSecondary}>
            {describeItems(order)}
          </Text>
          <SignalList signals={candidate.signals} />
        </View>
      )}
    </Pressable>
  );
}

/** Generic radio row used for difference handling and categories. */
export function ChoiceRow({
  title,
  description,
  selected,
  onPress,
}: {
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.option, selected && styles.optionSelected]}>
      <View style={styles.optionRow}>
        <Radio selected={selected} />
        <View style={styles.flex}>
          <Text variant="bodyMedium">{title}</Text>
          {description && (
            <Text variant="caption" color={colors.textSecondary}>
              {description}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function Radio({ selected }: { selected: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.radio, selected && styles.radioSelected]}>
      {selected && <View style={styles.radioDot} />}
    </View>
  );
}

function CardLabel({ icon, text }: { icon: IconName; text: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.cardLabel}>
      <Icon name={icon} size={15} color={colors.textSecondary} />
      <Text variant="captionMedium" color={colors.textSecondary}>
        {text}
      </Text>
    </View>
  );
}

function Fact({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.spread}>
      <Text color={colors.textSecondary}>{label}</Text>
      <Text
        variant={muted ? 'body' : 'bodyMedium'}
        color={muted ? colors.textMuted : colors.text}
        style={styles.factValue}
        selectable>
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  cardGap: {
    gap: Spacing.three,
  },
  spread: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  cardLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  amount: {
    fontFamily: Fonts.display,
    fontSize: 34,
    lineHeight: 42,
  },
  facts: {
    gap: Spacing.two,
  },
  factValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  rawToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
  },
  raw: {
    padding: Spacing.three,
    borderRadius: Radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  rawText: {
    fontFamily: Fonts.medium,
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
    backgroundColor: colors.primarySoft,
  },
  totalRow: {
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  signals: {
    gap: Spacing.three,
  },
  signal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  signalIcon: {
    width: 26,
    height: 26,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  option: {
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: Spacing.four,
  },
  optionSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaint,
    padding: Spacing.four - 1,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  optionDetail: {
    gap: Spacing.four,
    paddingLeft: Spacing.eight,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
}));
