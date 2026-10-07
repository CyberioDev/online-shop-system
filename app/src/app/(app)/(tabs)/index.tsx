import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { api, type Order } from '@/api';
import { useUser } from '@/auth/auth-context';
import { SummaryCard } from '@/components/summary-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { LoadState } from '@/components/ui/load-state';
import { Column, Columns, Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Fonts, Radius, Spacing, type Palette } from '@/constants/theme';
import { makeStyles, useColors } from '@/theme';
import { useReloadOnFocus, useResource } from '@/hooks/use-resource';
import { formatLongDate, formatMoney, formatRelative } from '@/lib/format';
import { CHANNEL_LABELS } from '@/lib/labels';
import { startReview } from '@/lib/review';

export default function HomeScreen() {
  const colors = useColors();
  const styles = useStyles();
  const user = useUser();
  const { data, error, reload } = useResource(() => api.getTodaySummary(), []);
  useReloadOnFocus(reload);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="caption" color={colors.textSecondary}>
            {formatLongDate(new Date())}
          </Text>
          <Text variant="title" style={styles.greeting}>
            Сайн байна уу, {user.name}
          </Text>
        </View>
        {/* Notifications aren't built yet; the bell is a placeholder from the mockup. */}
        <View style={styles.bell} accessibilityLabel="Мэдэгдэл">
          <Icon name="bell" size={20} />
        </View>
      </View>

      {!data ? (
        <LoadState error={error} onRetry={reload} />
      ) : (
        <Columns>
          <Column>
            <SummaryCard
              label="Өнөөдрийн орлого"
              amount={data.revenue}
              caption={`${data.paidCount} захиалга баталгаажсан`}
            />
            <ReviewCard count={data.reviewCount} />
            <View style={styles.stats}>
              <StatTile value={data.paidCount} label="Баталгаажсан" color={colors.primary} />
              <StatTile value={data.awaitingCount} label="Төлбөр хүлээж буй" color={colors.text} />
              <StatTile value={data.reviewCount} label="Шалгах" color={colors.warningStrong} />
            </View>
          </Column>
          <Column gap={Spacing.three}>
            <Text variant="heading">Сүүлийн үйлдэл</Text>
            <Card padded={false}>
              {data.recent.length === 0 ? (
                <Text color={colors.textSecondary} style={styles.empty}>
                  Өнөөдөр захиалга ороогүй байна.
                </Text>
              ) : (
                data.recent.map((order, index) => (
                  <ActivityRow key={order.id} order={order} divider={index > 0} />
                ))
              )}
            </Card>
          </Column>
        </Columns>
      )}
    </Screen>
  );
}

function ReviewCard({ count }: { count: number }) {
  const colors = useColors();
  const styles = useStyles();
  if (count === 0) {
    return (
      <Card tone="info" style={styles.reviewRow}>
        <View style={[styles.reviewIcon, { backgroundColor: colors.surface }]}>
          <Icon name="check" size={22} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text variant="title" color={colors.primary}>
            Бүх төлбөр тулгагдсан
          </Text>
          <Text variant="caption" color={colors.primary}>
            Шалгах төлбөр алга байна
          </Text>
        </View>
      </Card>
    );
  }

  return (
    <Card tone="warning" style={styles.reviewCard}>
      <View style={styles.reviewRow}>
        <View style={styles.reviewIcon}>
          <Icon name="alert-circle" size={24} color={colors.warningText} />
        </View>
        <View style={styles.flex}>
          <Text variant="title" color={colors.warningText}>
            {count} төлбөр шалгах
          </Text>
          <Text variant="caption" color={colors.warningStrong}>
            Бусад нь автоматаар тулгагдсан
          </Text>
        </View>
      </View>
      <Button
        title="Одоо шалгах"
        variant="dark"
        iconRight="chevron-right"
        onPress={() => startReview()}
      />
    </Card>
  );
}

function StatTile({ value, label, color }: { value: number; label: string; color: string }) {
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

const activityIcons = (colors: Palette): Record<Order['status'], { icon: IconName; color: string; bg: string }> => ({
  paid: { icon: 'check', color: colors.primary, bg: colors.primarySoft },
  awaiting_payment: { icon: 'clock', color: colors.textSecondary, bg: colors.surfaceMuted },
  needs_review: { icon: 'alert-circle', color: colors.warningStrong, bg: colors.warningSoft },
  cancelled: { icon: 'x', color: colors.textMuted, bg: colors.surfaceMuted },
});

function ActivityRow({ order, divider }: { order: Order; divider: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const look = activityIcons(colors)[order.status];
  const when = formatRelative(order.paidAt ?? order.createdAt);
  const detail =
    order.status === 'paid'
      ? `${CHANNEL_LABELS[order.channel]} · ${order.matchedBy === 'manual' ? 'гараар' : 'автоматаар'} баталгаажлаа · ${when}`
      : order.status === 'awaiting_payment'
        ? `Төлбөр хүлээж байна · ${when}`
        : order.status === 'cancelled'
          ? `Цуцалсан · ${when}`
          : `Шалгах шаардлагатай · ${when}`;

  const content = (
    <>
      <View style={[styles.activityIcon, { backgroundColor: look.bg }]}>
        <Icon name={look.icon} size={18} color={look.color} />
      </View>
      <View style={styles.flex}>
        <Text variant="bodyMedium">
          {order.customerName} · {formatMoney(order.total)}
        </Text>
        <Text variant="caption" color={colors.textSecondary}>
          {detail}
        </Text>
      </View>
    </>
  );

  const rowStyle = [styles.activityRow, divider && styles.divider];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        order.status === 'needs_review'
          ? router.push('/review')
          : router.push({ pathname: '/order/[id]', params: { id: order.id } })
      }
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: colors.surfaceMuted }]}>
      {content}
      <Icon name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    marginBottom: Spacing.five,
  },
  greeting: {
    fontFamily: Fonts.display,
    fontSize: 22,
    lineHeight: 30,
  },
  bell: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewCard: {
    gap: Spacing.five,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  reviewIcon: {
    width: 52,
    height: 52,
    borderRadius: Radius.pill,
    backgroundColor: colors.warningIconBg,
    alignItems: 'center',
    justifyContent: 'center',
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
  statLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  statValue: {
    fontFamily: Fonts.display,
    fontSize: 30,
    lineHeight: 36,
  },
  activityRow: {
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
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    padding: Spacing.five,
    textAlign: 'center',
  },
}));
