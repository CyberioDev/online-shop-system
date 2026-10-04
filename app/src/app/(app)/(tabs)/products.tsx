import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api, type Product, type SaleType } from '@/api';
import { PreorderStatusPill } from '@/components/preorder-status-pill';
import { ProductThumb } from '@/components/product-thumb';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { LoadState } from '@/components/ui/load-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useIsWide } from '@/hooks/use-is-wide';
import { useReloadOnFocus, useResource } from '@/hooks/use-resource';
import { errorMessage } from '@/lib/errors';
import { formatMoney, formatNumber, formatShortDate, fromDayKey } from '@/lib/format';
import { describeStock, totalStock } from '@/lib/labels';

export default function ProductsScreen() {
  const isWide = useIsWide();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SaleType | 'all'>('all');
  const { data: products, error, reload, setData } = useResource(() => api.listProducts(), []);
  useReloadOnFocus(reload);

  const needle = query.trim().toLowerCase();
  const visible = (products ?? []).filter(
    (p) =>
      (filter === 'all' || p.saleType === filter) &&
      (!needle || p.name.toLowerCase().includes(needle) || p.code.toLowerCase().includes(needle)),
  );
  const preorderCount = (products ?? []).filter((p) => p.saleType === 'preorder').length;
  const columns = isWide ? 2 : 1;
  const rows: Product[][] = [];
  for (let i = 0; i < visible.length; i += columns) rows.push(visible.slice(i, i + columns));

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="display" style={styles.flex}>
          Бараа
        </Text>
        <Button
          title="Нэмэх"
          icon="plus"
          size="md"
          onPress={() => router.push('/product/new')}
        />
      </View>

      {!products ? (
        <LoadState error={error} onRetry={reload} />
      ) : (
        <View style={styles.body}>
          <Text variant="caption" color={Colors.textSecondary}>
            {products.length} бараа · Үнийг харандаа дээр дарж шууд засна
          </Text>

          {preorderCount > 0 && (
            <View style={styles.filters}>
              <Chip label="Бүгд" selected={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip
                label="Бэлэн бараа"
                selected={filter === 'stock'}
                onPress={() => setFilter('stock')}
              />
              <Chip
                label={`Урьдчилсан захиалга (${preorderCount})`}
                selected={filter === 'preorder'}
                onPress={() => setFilter('preorder')}
              />
            </View>
          )}

          {products.length > 0 && (
            <TextField
              placeholder="Бараа эсвэл код хайх"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              prefix={
                <View style={styles.searchIcon}>
                  <Icon name="search" size={18} color={Colors.textMuted} />
                </View>
              }
            />
          )}

          {products.length === 0 ? (
            <Card style={styles.empty}>
              <Icon name="box" size={28} color={Colors.textSecondary} />
              <Text variant="title">Одоогоор бараа алга</Text>
              <Text color={Colors.textSecondary} style={styles.center}>
                Эхний бараагаа нэмээд код авна уу.
              </Text>
            </Card>
          ) : visible.length === 0 ? (
            <Text color={Colors.textSecondary} style={[styles.center, styles.noResults]}>
              {needle ? `«${query.trim()}» илэрц олдсонгүй.` : 'Энэ төрлийн бараа алга.'}
            </Text>
          ) : (
            rows.map((row) => (
              <View key={row[0].id} style={styles.row}>
                {row.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onUpdated={(updated) =>
                      setData(products.map((p) => (p.id === updated.id ? updated : p)))
                    }
                  />
                ))}
                {row.length < columns && <View style={styles.flex} />}
              </View>
            ))
          )}

          <Card tone="info" style={styles.tip}>
            <Text variant="caption" color={Colors.primary} style={styles.tipText}>
              Шинэ бараа нэмэхэд нэр, үнэ л хангалттай. Зураг заавал биш, кодыг систем өөрөө өгч
              болно.
            </Text>
          </Card>
        </View>
      )}
    </Screen>
  );
}

function ProductCard({
  product,
  onUpdated,
}: {
  product: Product;
  onUpdated: (product: Product) => void;
}) {
  const isPreorder = product.saleType === 'preorder';
  const soldOut = !isPreorder && totalStock(product) === 0;
  const [editingPrice, setEditingPrice] = useState(false);

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${product.name}, код ${product.code}`}
        onPress={() =>
          isPreorder
            ? router.push({ pathname: '/preorder/[id]', params: { id: product.id } })
            : router.push({ pathname: '/product/[id]', params: { id: product.id } })
        }
        style={({ pressed }) => [styles.cardMain, pressed && styles.cardPressed]}>
        <ProductThumb uri={product.imageUrl} size={76} />
        <View style={styles.cardBody}>
          <Text variant="bodyMedium" numberOfLines={2}>
            {product.name}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatMoney(product.price)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${product.name} үнэ засах`}
              onPress={() => setEditingPrice(true)}
              hitSlop={10}
              style={({ pressed }) => [styles.priceEdit, pressed && styles.priceEditPressed]}>
              <Icon name="edit-2" size={14} color={Colors.textSecondary} />
            </Pressable>
          </View>
          {isPreorder ? (
            <PreorderLine product={product} />
          ) : (
            <StockLine product={product} soldOut={soldOut} />
          )}
        </View>
        <View style={styles.code}>
          <Text variant="caption" color={Colors.textSecondary} style={styles.codeLabel}>
            Код
          </Text>
          <Text style={styles.codeValue}>{product.code}</Text>
        </View>
      </Pressable>

      {editingPrice && (
        <PriceEditor
          product={product}
          onClose={() => setEditingPrice(false)}
          onSaved={(updated) => {
            setEditingPrice(false);
            onUpdated(updated);
          }}
        />
      )}
    </View>
  );
}

/** Inline price field shown under a product card. */
function PriceEditor({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: (product: Product) => void;
}) {
  const [price, setPrice] = useState(String(product.price));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const value = Number(price);
    if (!(value > 0)) {
      setError('Үнээ оруулна уу.');
      return;
    }
    if (value === product.price) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.updateProductPrice(product.id, value));
    } catch (e) {
      setSaving(false);
      setError(errorMessage(e));
    }
  };

  return (
    <View style={styles.priceEditor}>
      <Text variant="captionMedium" color={Colors.textSecondary}>
        Шинэ үнэ
      </Text>
      <View style={styles.priceEditorRow}>
        <TextField
          autoFocus
          keyboardType="number-pad"
          placeholder="0"
          value={price ? formatNumber(Number(price)) : ''}
          onChangeText={(text) => setPrice(text.replace(/\D/g, '').slice(0, 9))}
          onSubmitEditing={save}
          returnKeyType="done"
          accessibilityLabel={`${product.name} шинэ үнэ`}
          suffix={
            <Text color={Colors.textSecondary} style={styles.currency}>
              ₮
            </Text>
          }
          containerStyle={styles.flex}
        />
        <Button title="Хадгалах" size="md" onPress={save} loading={saving} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Болих"
          onPress={onClose}
          disabled={saving}
          hitSlop={6}
          style={styles.cancel}>
          <Icon name="x" size={20} color={Colors.textSecondary} />
        </Pressable>
      </View>
      {error && (
        <Text variant="caption" color={Colors.danger}>
          {error}
        </Text>
      )}
    </View>
  );
}

/** Status and progress of a preorder instead of stock. */
function PreorderLine({ product }: { product: Product }) {
  const preorder = product.preorder;
  if (!preorder) return null;
  const counts = `Захиалсан ${preorder.ordered}${preorder.limit ? ` / ${preorder.limit}` : ''} ш · төлсөн ${preorder.paid}`;
  const deadline =
    preorder.status === 'open' && preorder.closesOn
      ? ` · ${formatShortDate(fromDayKey(preorder.closesOn))} хүртэл`
      : '';
  return (
    <View style={styles.preorderLine}>
      <PreorderStatusPill status={preorder.status} prefix="Урьдчилсан" short />
      <Text variant="caption" color={Colors.textSecondary}>
        {counts}
        {deadline}
      </Text>
    </View>
  );
}

function StockLine({ product, soldOut }: { product: Product; soldOut: boolean }) {
  return soldOut ? (
    <View style={styles.soldOut}>
      <Text variant="captionMedium" color={Colors.danger}>
        Дууссан
      </Text>
    </View>
  ) : (
    <Text variant="caption" color={Colors.textSecondary}>
      Үлдэгдэл: {describeStock(product)}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    marginBottom: Spacing.two,
  },
  body: {
    gap: Spacing.four,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  preorderLine: {
    gap: Spacing.one,
    marginTop: Spacing.half,
  },
  searchIcon: {
    paddingLeft: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  card: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'flex-start',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  priceEdit: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceMuted,
  },
  priceEditPressed: {
    backgroundColor: Colors.border,
  },
  priceEditor: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  priceEditorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  currency: {
    paddingRight: Spacing.four,
  },
  cancel: {
    width: 36,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPressed: {
    backgroundColor: Colors.surfaceMuted,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  price: {
    fontFamily: Fonts.displayBold,
    fontSize: 17,
    lineHeight: 24,
  },
  soldOut: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.dangerSoft,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
    marginTop: Spacing.half,
  },
  code: {
    minWidth: 64,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
  },
  codeLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  codeValue: {
    fontFamily: Fonts.display,
    fontSize: 20,
    lineHeight: 26,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.ten,
  },
  center: {
    textAlign: 'center',
  },
  noResults: {
    paddingVertical: Spacing.eight,
  },
  tip: {
    marginTop: Spacing.two,
  },
  tipText: {
    fontSize: 15,
    lineHeight: 22,
  },
});
