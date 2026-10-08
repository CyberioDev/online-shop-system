import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { api, type Order, type OrderUpdate } from '@/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Icon, type IconName } from '@/components/ui/icon';
import { LoadState } from '@/components/ui/load-state';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing, type Palette } from '@/constants/theme';
import { useResource } from '@/hooks/use-resource';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatMoney } from '@/lib/format';
import { CHANNEL_LABELS } from '@/lib/labels';
import { makeStyles, useColors } from '@/theme';

const MAX_WIDTH = 640;

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, error, reload, setData } = useResource(() => api.getOrder(id), [id]);
  const header = <ScreenHeader title={order ? `Захиалга ${order.code}` : 'Захиалга'} fallbackHref="/orders" />;

  if (!order) {
    return (
      <Screen maxWidth={MAX_WIDTH} header={header}>
        <LoadState error={error} onRetry={reload} />
      </Screen>
    );
  }
  return <OrderDetail key={order.id} order={order} header={header} onChange={setData} />;
}

type Banner = { icon: IconName; text: string; bg: string; fg: string };

function statusBanner(order: Order, colors: Palette): Banner {
  if (order.status === 'cancelled') {
    return {
      icon: 'x-circle',
      text: `Цуцалсан${order.cancelledAt ? ` · ${formatDateTime(new Date(order.cancelledAt))}` : ''}${order.cancelReason ? ` · ${order.cancelReason}` : ''}`,
      bg: colors.surfaceMuted,
      fg: colors.textSecondary,
    };
  }
  if (order.status === 'awaiting_payment') {
    return { icon: 'clock', text: 'Төлбөр хүлээж байна', bg: colors.warningSoft, fg: colors.warningText };
  }
  if (order.status === 'needs_review') {
    return {
      icon: 'alert-circle',
      text: 'Төлбөр нь “Шалгах” хэсэгт хүлээгдэж байна',
      bg: colors.warningSoft,
      fg: colors.warningText,
    };
  }
  if (order.fulfilledAt) {
    return {
      icon: 'check-circle',
      text: `Хүргэсэн · ${formatDateTime(new Date(order.fulfilledAt))}`,
      bg: colors.primarySoft,
      fg: colors.primary,
    };
  }
  return { icon: 'package', text: 'Төлсөн · хүргэх', bg: colors.warningSoft, fg: colors.warningText };
}

function OrderDetail({
  order,
  header,
  onChange,
}: {
  order: Order;
  header: ReactNode;
  onChange: (order: Order) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [phone, setPhone] = useState(order.customerPhone ?? '');
  const [address, setAddress] = useState(order.deliveryAddress ?? '');
  const [note, setNote] = useState(order.sellerNote ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [swap, setSwap] = useState<{ index: number; options: string[] } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const isPaid = order.status === 'paid';
  const isCancelled = order.status === 'cancelled';
  const banner = statusBanner(order, colors);
  const dirty =
    phone !== (order.customerPhone ?? '') ||
    address !== (order.deliveryAddress ?? '') ||
    note !== (order.sellerNote ?? '');

  const act = async (key: string, action: () => Promise<Order>, after?: () => void) => {
    setBusy(key);
    setError(null);
    setSaved(false);
    try {
      onChange(await action());
      after?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const update = (key: string, patch: OrderUpdate, after?: () => void) =>
    act(key, () => api.updateOrder(order.id, patch), after);

  const saveDelivery = () => {
    if (phone && !/^\d{8}$/.test(phone)) {
      setError('Утасны дугаар 8 оронтой байна.');
      return;
    }
    update(
      'delivery',
      { customerPhone: phone || null, deliveryAddress: address || null, sellerNote: note || null },
      () => setSaved(true),
    );
  };

  const openSwap = async (index: number) => {
    setBusy(`swap${index}`);
    setError(null);
    try {
      const product = await api.getProduct(order.items[index].productId);
      setSwap({ index, options: product.variants.map((v) => v.name) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const chooseVariant = (variant: string) => {
    if (!swap) return;
    const itemVariants = order.items.map((item, i) => (i === swap.index ? variant : item.variantName));
    update('variant', { itemVariants }, () => setSwap(null));
  };

  const setFulfilled = (fulfilled: boolean) =>
    act('fulfill', async () => (await api.setOrdersFulfilled([order.id], fulfilled))[0]);

  const restore = async () => {
    if (await confirm('Сэргээх', 'Цуцалсан захиалгыг сэргээх үү?', 'Сэргээх')) {
      act('restore', () => api.restoreOrder(order.id));
    }
  };

  const footer = (
    <View style={styles.footer}>
      {error && !swap && !cancelOpen && (
        <Text variant="caption" color={colors.danger} style={styles.center}>
          {error}
        </Text>
      )}
      {isPaid && !order.fulfilledAt && (
        <Button
          title="Хүргэсэн гэж тэмдэглэх"
          icon="check"
          loading={busy === 'fulfill'}
          disabled={busy !== null}
          onPress={() => setFulfilled(true)}
        />
      )}
      <View style={styles.row}>
        {isPaid && order.fulfilledAt && (
          <Button
            title="Хүргээгүй болгох"
            icon="rotate-ccw"
            variant="outline"
            size="md"
            loading={busy === 'fulfill'}
            disabled={busy !== null}
            onPress={() => setFulfilled(false)}
            style={styles.flex}
          />
        )}
        {isCancelled ? (
          <Button
            title="Сэргээх"
            icon="rotate-ccw"
            variant="outline"
            size="md"
            loading={busy === 'restore'}
            disabled={busy !== null}
            onPress={restore}
            style={styles.flex}
          />
        ) : (
          <Button
            title="Цуцлах"
            icon="x"
            variant="danger"
            size="md"
            disabled={busy !== null}
            onPress={() => {
              setError(null);
              setCancelOpen(true);
            }}
            style={styles.flex}
          />
        )}
      </View>
    </View>
  );

  return (
    <>
      <Screen maxWidth={MAX_WIDTH} header={header} footer={footer}>
        <View style={styles.body}>
          <View style={[styles.banner, { backgroundColor: banner.bg }]}>
            <Icon name={banner.icon} size={18} color={banner.fg} />
            <Text variant="label" color={banner.fg} style={styles.flex}>
              {banner.text}
            </Text>
            {order.status === 'needs_review' && (
              <Pressable onPress={() => router.push('/review')} hitSlop={8}>
                <Text variant="captionMedium" color={banner.fg} style={styles.underline}>
                  Шалгах
                </Text>
              </Pressable>
            )}
          </View>

          {/* Buyer */}
          <Card style={styles.gap}>
            <View style={styles.spread}>
              <View style={styles.flex}>
                <Text variant="title">{order.customerName}</Text>
                <Text variant="caption" color={colors.textSecondary}>
                  {CHANNEL_LABELS[order.channel]} · {formatDateTime(new Date(order.createdAt))}-д захиалсан
                </Text>
              </View>
            </View>
            <View style={styles.row}>
              <Button
                title="Чат нээх"
                icon="message-circle"
                variant="outline"
                size="md"
                disabled={!order.chatUrl}
                onPress={() => order.chatUrl && Linking.openURL(order.chatUrl)}
                style={styles.flex}
              />
              <Button
                title="Залгах"
                icon="phone"
                variant="outline"
                size="md"
                disabled={!order.customerPhone}
                onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}
                style={styles.flex}
              />
            </View>
            {!order.chatUrl && (
              <Text variant="caption" color={colors.textSecondary}>
                Шууд худалдааны захиалга тул чат холбогдоогүй.
              </Text>
            )}
          </Card>

          {/* Items */}
          <Card style={styles.gap}>
            <Text variant="heading">Бараа</Text>
            {order.items.map((item, index) => (
              <View key={`${item.productId}-${index}`} style={styles.item}>
                <View style={styles.flex}>
                  <Text variant="bodyMedium">{item.productName}</Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    {item.variantName ? `${item.variantName} · ` : ''}
                    {item.quantity} × {formatMoney(item.unitPrice)}
                  </Text>
                </View>
                {item.variantName && !isCancelled && (
                  <Button
                    title="Хэмжээ солих"
                    variant="ghost"
                    size="sm"
                    loading={busy === `swap${index}`}
                    disabled={busy !== null}
                    onPress={() => openSwap(index)}
                  />
                )}
              </View>
            ))}
            <View style={[styles.spread, styles.total]}>
              <Text variant="bodyMedium">Нийт</Text>
              <Text variant="bodyMedium">{formatMoney(order.total)}</Text>
            </View>
          </Card>

          {/* Delivery */}
          <Card style={styles.gap}>
            <Text variant="heading">Хүргэлт</Text>
            <TextField
              label="Утас"
              placeholder="8 оронтой дугаар"
              keyboardType="number-pad"
              value={phone}
              onChangeText={(text) => {
                setPhone(text.replace(/\D/g, '').slice(0, 8));
                setSaved(false);
              }}
            />
            <TextField
              label="Хаяг"
              placeholder="Дүүрэг, хороо, байр, тоот"
              value={address}
              onChangeText={(text) => {
                setAddress(text);
                setSaved(false);
              }}
              multiline
              style={styles.multiline}
            />
            <TextField
              label="Тэмдэглэл (зөвхөн танд харагдана)"
              placeholder="Жишээ: Оройн 18 цагаас хойш хүргэх"
              value={note}
              onChangeText={(text) => {
                setNote(text);
                setSaved(false);
              }}
              multiline
              style={styles.multiline}
            />
            {(dirty || saved) && (
              <Button
                title={saved && !dirty ? 'Хадгалсан' : 'Хадгалах'}
                icon={saved && !dirty ? 'check' : undefined}
                variant={saved && !dirty ? 'outline' : 'primary'}
                size="md"
                loading={busy === 'delivery'}
                disabled={!dirty || busy !== null}
                onPress={saveDelivery}
              />
            )}
          </Card>

          {/* Payment */}
          <Card style={styles.gap}>
            <Text variant="heading">Төлбөр</Text>
            <Fact label="Төлсөн" value={order.paidAt ? formatDateTime(new Date(order.paidAt)) : '—'} />
            <Fact
              label="Тулгалт"
              value={order.matchedBy === 'auto' ? 'Автомат' : order.matchedBy === 'manual' ? 'Гараар' : '—'}
            />
            <Fact label="Захиалгын код" value={order.code} />
          </Card>
        </View>
      </Screen>

      {swap && (
        <Sheet visible title="Хэмжээ солих" onClose={() => setSwap(null)}>
          <Text color={colors.textSecondary}>
            {order.items[swap.index].productName} · одоогийн хэмжээ{' '}
            <Text variant="bodyMedium">{order.items[swap.index].variantName}</Text>
          </Text>
          <View style={styles.chips}>
            {swap.options.map((option) => (
              <Chip
                key={option}
                label={option}
                selected={option === order.items[swap.index].variantName}
                onPress={() => option !== order.items[swap.index].variantName && chooseVariant(option)}
              />
            ))}
          </View>
          {busy === 'variant' && (
            <Text variant="caption" color={colors.textSecondary}>
              Хадгалж байна…
            </Text>
          )}
          {error && (
            <Text variant="caption" color={colors.danger}>
              {error}
            </Text>
          )}
        </Sheet>
      )}

      {cancelOpen && (
        <Sheet
          visible
          title="Захиалга цуцлах"
          onClose={() => setCancelOpen(false)}
          footer={
            <Button
              title="Цуцлах"
              variant="danger"
              loading={busy === 'cancel'}
              onPress={() =>
                act('cancel', () => api.cancelOrder(order.id, cancelReason.trim() || null), () =>
                  setCancelOpen(false),
                )
              }
            />
          }>
          {isPaid && (
            <View style={[styles.banner, { backgroundColor: colors.warningSoft }]}>
              <Icon name="alert-triangle" size={18} color={colors.warningText} />
              <Text variant="caption" color={colors.warningText} style={styles.flex}>
                Энэ захиалга төлөгдсөн. {formatMoney(order.total)}-ийг банкны апп-аасаа буцааж
                шилжүүлэхээ мартуузай.
              </Text>
            </View>
          )}
          <TextField
            label="Шалтгаан (заавал биш)"
            placeholder="Жишээ: Худалдан авагч цуцалсан"
            value={cancelReason}
            onChangeText={setCancelReason}
            error={error}
          />
        </Sheet>
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.spread}>
      <Text color={colors.textSecondary}>{label}</Text>
      <Text variant="bodyMedium">{value}</Text>
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
  underline: {
    textDecorationLine: 'underline',
  },
  body: {
    gap: Spacing.four,
  },
  gap: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  spread: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  total: {
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  multiline: {
    minHeight: 72,
    paddingVertical: Spacing.three,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  footer: {
    gap: Spacing.three,
  },
}));
