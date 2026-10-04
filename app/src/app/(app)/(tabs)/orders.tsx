import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { api, type Order, type OrderView } from '@/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { LoadState } from '@/components/ui/load-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useIsWide } from '@/hooks/use-is-wide';
import { useReloadOnFocus, useResource } from '@/hooks/use-resource';
import { errorMessage } from '@/lib/errors';
import { exportOrderView, ORDER_VIEW_LABELS } from '@/lib/export/orders-export';
import { formatMoney, formatRelative, formatShortDate } from '@/lib/format';
import { CHANNEL_LABELS, describeItems } from '@/lib/labels';
import { makeStyles, useColors } from '@/theme';

const VIEWS: OrderView[] = ['to_fulfill', 'fulfilled', 'cancelled'];

const EMPTY: Record<OrderView, string> = {
  to_fulfill: 'Хүргэх захиалга алга. Төлбөр баталгаажсан захиалга энд орж ирнэ.',
  fulfilled: 'Хүргэсэн захиалга алга.',
  cancelled: 'Цуцалсан захиалга алга.',
};

/** Confirmed (paid) orders: deliver them, look them up, export them. */
export default function OrdersScreen() {
  const colors = useColors();
  const styles = useStyles();
  const isWide = useIsWide();
  const [view, setView] = useState<OrderView>('to_fulfill');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pages after the first, loaded with "Цааш үзэх".
  const [more, setMore] = useState<{ orders: Order[]; cursor: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'fulfill' | 'export' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, error, loading, reload } = useResource(
    () => api.searchOrders({ view, q: debouncedQuery || undefined }),
    [view, debouncedQuery],
  );
  useReloadOnFocus(reload);

  const resetList = () => {
    setMore(null);
    setSelected(new Set());
  };

  const chooseView = (next: OrderView) => {
    setView(next);
    setNotice(null);
    resetList();
  };

  const onQueryChange = (text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedQuery(text.trim());
      resetList();
    }, 300);
  };

  const orders = [...(data?.orders ?? []), ...(more?.orders ?? [])];
  const nextCursor = more ? more.cursor : (data?.nextCursor ?? null);
  const selectable = view === 'to_fulfill';

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await api.searchOrders({ view, q: debouncedQuery || undefined, cursor: nextCursor });
      setMore({ orders: [...(more?.orders ?? []), ...page.orders], cursor: page.nextCursor });
    } finally {
      setLoadingMore(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const markFulfilled = async () => {
    setBusy('fulfill');
    setNotice(null);
    try {
      const updated = await api.setOrdersFulfilled([...selected], true);
      setNotice(`${updated.length} захиалгыг хүргэсэн гэж тэмдэглэлээ.`);
      resetList();
      reload();
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setBusy('export');
    setNotice(null);
    try {
      const count = await exportOrderView(view, debouncedQuery);
      if (count === 0) setNotice('Татах захиалга алга.');
    } catch {
      setNotice('Файл үүсгэж чадсангүй. Дахин оролдоно уу.');
    } finally {
      setBusy(null);
    }
  };

  const footer =
    selected.size > 0 ? (
      <View style={styles.selectionBar}>
        <Text variant="label" style={styles.flex}>
          {selected.size} сонгосон
        </Text>
        <Button title="Болих" variant="outline" size="md" onPress={() => setSelected(new Set())} />
        <Button
          title="Хүргэсэн болгох"
          icon="check"
          size="md"
          loading={busy === 'fulfill'}
          onPress={markFulfilled}
        />
      </View>
    ) : undefined;

  return (
    <Screen footer={footer}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="display">Захиалга</Text>
          <Text color={colors.textSecondary}>Төлбөр нь баталгаажсан захиалгууд</Text>
        </View>
        <Button
          title="Excel"
          icon="download"
          variant="outline"
          size="md"
          loading={busy === 'export'}
          disabled={busy !== null}
          onPress={download}
        />
      </View>

      <View style={styles.controls}>
        <View style={styles.chips}>
          {VIEWS.map((v) => (
            <Chip
              key={v}
              label={v === view && data ? `${ORDER_VIEW_LABELS[v]} (${data.total})` : ORDER_VIEW_LABELS[v]}
              selected={v === view}
              onPress={() => chooseView(v)}
            />
          ))}
          {loading && data && <ActivityIndicator color={colors.primary} />}
        </View>
        <TextField
          placeholder="Нэр, код, утас эсвэл бараагаар хайх"
          value={query}
          onChangeText={onQueryChange}
          autoCorrect={false}
          containerStyle={isWide ? styles.searchWide : undefined}
          prefix={
            <View style={styles.searchIcon}>
              <Icon name="search" size={18} color={colors.textMuted} />
            </View>
          }
        />
      </View>

      {notice && (
        <Card tone="info" style={styles.notice}>
          <Text variant="caption" color={colors.primary}>
            {notice}
          </Text>
        </Card>
      )}

      {!data ? (
        <LoadState error={error} onRetry={reload} />
      ) : orders.length === 0 ? (
        <Card style={styles.empty}>
          <Icon name="shopping-bag" size={28} color={colors.textSecondary} />
          <Text color={colors.textSecondary} style={styles.center}>
            {debouncedQuery ? `«${debouncedQuery}» илэрц олдсонгүй.` : EMPTY[view]}
          </Text>
        </Card>
      ) : (
        <View style={styles.list}>
          {selectable && (
            <Text variant="caption" color={colors.textSecondary}>
              Хүргэсэн захиалгуудаа сонгоод доороос нэг дор тэмдэглэнэ. Эхэлж төлсөн нь эхэндээ.
            </Text>
          )}
          {orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              view={view}
              selected={selected.has(order.id)}
              onToggle={selectable ? () => toggle(order.id) : undefined}
            />
          ))}
          {nextCursor && (
            <Button
              title="Цааш үзэх"
              variant="ghost"
              size="md"
              loading={loadingMore}
              onPress={loadMore}
            />
          )}
        </View>
      )}
    </Screen>
  );
}

function OrderRow({
  order,
  view,
  selected,
  onToggle,
}: {
  order: Order;
  view: OrderView;
  selected: boolean;
  onToggle?: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();

  const status =
    view === 'to_fulfill'
      ? `Төлсөн ${order.paidAt ? formatRelative(order.paidAt) : ''}`
      : view === 'fulfilled'
        ? `Хүргэсэн ${order.fulfilledAt ? formatShortDate(new Date(order.fulfilledAt)) : ''}`
        : `Цуцалсан${order.cancelReason ? ` · ${order.cancelReason}` : ''}`;

  return (
    <View style={[styles.row, selected && styles.rowSelected]}>
      {onToggle && (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={`${order.code} сонгох`}
          onPress={onToggle}
          hitSlop={8}
          style={styles.checkboxHit}>
          <View style={[styles.checkbox, selected && styles.checkboxOn]}>
            {selected && <Icon name="check" size={14} color={colors.textOnPrimary} />}
          </View>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Захиалга ${order.code}, ${order.customerName}`}
        onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
        style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}>
        <View style={styles.rowTop}>
          <Text variant="bodyMedium" style={styles.flex} numberOfLines={1}>
            {order.code} · {order.customerName}
          </Text>
          <Text variant="bodyMedium">{formatMoney(order.total)}</Text>
        </View>
        <Text variant="caption" numberOfLines={1}>
          {describeItems(order)}
        </Text>
        <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
          {CHANNEL_LABELS[order.channel]} · {status}
        </Text>
        {view === 'to_fulfill' && (!order.deliveryAddress || !order.customerPhone) && (
          <View style={styles.missing}>
            <Icon name="alert-triangle" size={13} color={colors.warningStrong} />
            <Text variant="captionMedium" color={colors.warningText} style={styles.missingText}>
              {!order.deliveryAddress ? 'Хүргэлтийн хаяг алга' : 'Утасны дугаар алга'}
            </Text>
          </View>
        )}
      </Pressable>
      <Icon name="chevron-right" size={18} color={colors.textMuted} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  center: {
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.four,
  },
  controls: {
    gap: Spacing.three,
    marginTop: Spacing.five,
    marginBottom: Spacing.four,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  searchIcon: {
    paddingLeft: Spacing.four,
  },
  searchWide: {
    maxWidth: 480,
  },
  notice: {
    marginBottom: Spacing.four,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.ten,
  },
  list: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaint,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  checkboxHit: {
    padding: Spacing.one,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  missing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: colors.warningSoft,
  },
  missingText: {
    fontSize: 12,
    lineHeight: 16,
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
}));
