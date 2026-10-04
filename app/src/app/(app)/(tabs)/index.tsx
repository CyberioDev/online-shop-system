import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { api, type Order } from '@/api';
import { useUser } from '@/auth/auth-context';
import { SummaryCard } from '@/components/summary-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { LoadState } from '@/components/ui/load-state';
import { Column, Columns, Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useReloadOnFocus, useResource } from '@/hooks/use-resource';
import { formatLongDate, formatMoney, formatRelative } from '@/lib/format';
import { CHANNEL_LABELS } from '@/lib/labels';
import { startReview } from '@/lib/review';

export default function HomeScreen() {
  const user = useUser();
  const { data, error, reload } = useResource(() => api.getTodaySummary(), []);
  useReloadOnFocus(reload);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="caption" color={Colors.textSecondary}>
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
              <StatTile value={data.paidCount} label="Баталгаажсан" color={Colors.primary} />
              <StatTile value={data.awaitingCount} label="Төлбөр хүлээж буй" color={Colors.text} />
              <StatTile value={data.reviewCount} label="Шалгах" color={Colors.warningStrong} />
            </View>
          </Column>
          <Column gap={Spacing.three}>
            <Text variant="heading">Сүүлийн үйлдэл</Text>
            <Card padded={false}>
              {data.recent.length === 0 ? (
                <Text color={Colors.textSecondary} style={styles.empty}>
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
  if (count === 0) {
    return (
      <Card tone="info" style={styles.reviewRow}>
        <View style={[styles.reviewIcon, { backgroundColor: Colors.surface }]}>
          <Icon name="check" size={22} color={Colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text variant="title" color={Colors.primary}>
            Бүх төлбөр тулгагдсан
          </Text>
          <Text variant="caption" color={Colors.primary}>
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
          <Icon name="alert-circle" size={24} color={Colors.warningText} />
        </View>
        <View style={styles.flex}>
          <Text variant="title" color={Colors.warningText}>
            {count} төлбөр шалгах
          </Text>
          <Text variant="caption" color={Colors.warningStrong}>
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
  return (
    <Card style={styles.stat}>
      <Text style={styles.statValue} color={color}>
        {value}
      </Text>
      <Text variant="caption" color={Colors.textSecondary} style={styles.statLabel}>
        {label}
      </Text>
    </Card>
  );
}

const activityIcons: Record<Order['status'], { icon: IconName; color: string; bg: string }> = {
  paid: { icon: 'check', color: Colors.primary, bg: Colors.primarySoft },
  awaiting_payment: { icon: 'clock', color: Colors.textSecondary, bg: Colors.surfaceMuted },
  needs_review: { icon: 'alert-circle', color: Colors.warningStrong, bg: Colors.warningSoft },
};

function ActivityRow({ order, divider }: { order: Order; divider: boolean }) {
  const look = activityIcons[order.status];
  const when = formatRelative(order.paidAt ?? order.createdAt);
  const detail =
    order.status === 'paid'
      ? `${CHANNEL_LABELS[order.channel]} · ${order.matchedBy === 'manual' ? 'гараар' : 'автоматаар'} баталгаажлаа · ${when}`
      : order.status === 'awaiting_payment'
        ? `Төлбөр хүлээж байна · ${when}`
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
        <Text variant="caption" color={Colors.textSecondary}>
          {detail}
        </Text>
      </View>
    </>
  );

  const rowStyle = [styles.activityRow, divider && styles.divider];
  if (order.status !== 'needs_review') return <View style={rowStyle}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/review')}
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: Colors.surfaceMuted }]}>
      {content}
      <Icon name="chevron-right" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: Colors.warningIconBg,
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
    borderTopColor: Colors.border,
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
});
