import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { api, type Product, type SaleType, type ListQuery } from '@/api';
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
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/theme';
import { useIsWide } from '@/hooks/use-is-wide';
import { useReloadOnFocus } from '@/hooks/use-resource';
import { usePagedResource } from '@/hooks/use-paged-resource';
import { DateTimeFilter, Pagination } from '@/components/list-controls';
import { errorMessage } from '@/lib/errors';
import { formatMoney, formatNumber, formatShortDate, fromDayKey } from '@/lib/format';
import { describeStock, totalStock } from '@/lib/labels';

export default function ProductsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const isWide = useIsWide();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SaleType | 'all'>('all');
  const [range, setRange] = useState<ListQuery>({});
  const listQuery = { ...range, q: query.trim() || undefined, saleType: filter === 'all' ? undefined : filter, limit: 25 };
  const paging = usePagedResource(cursor => api.getProductsPage({ ...listQuery, cursor }), JSON.stringify(listQuery));
  const { data, error, reload } = paging;
  const products = data?.products;
  useReloadOnFocus(reload);
  const visible = products ?? [];
  const needle = query.trim();
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

      <DateTimeFilter onRefresh={reload} onChange={setRange} />
      <TextField placeholder="Бараа эсвэл код хайх" value={query} onChangeText={setQuery} autoCorrect={false} />
      {!products ? (
        <LoadState error={error} onRetry={reload} />
      ) : (
        <View style={styles.body}>
          <Text variant="caption" color={colors.textSecondary}>
            {data?.total} бараа
          </Text>

          <View style={styles.filters}>
            <Chip label="Бүгд" selected={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip label="Бэлэн бараа" selected={filter === 'stock'} onPress={() => setFilter('stock')} />
            <Chip label="Урьдчилсан захиалга" selected={filter === 'preorder'} onPress={() => setFilter('preorder')} />
          </View>
          {products.length === 0 ? (
            <Card style={styles.empty}>
              <Icon name="box" size={28} color={colors.textSecondary} />
              <Text variant="title">Одоогоор бараа алга</Text>
              <Text color={colors.textSecondary} style={styles.center}>
                Эхний бараагаа нэмээд код авна уу.
              </Text>
            </Card>
          ) : visible.length === 0 ? (
            <Text color={colors.textSecondary} style={[styles.center, styles.noResults]}>
              {needle ? `«${query.trim()}» илэрц олдсонгүй.` : 'Энэ төрлийн бараа алга.'}
            </Text>
          ) : (
            rows.map((row) => (
              <View key={row[0].id} style={styles.row}>
                {row.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onUpdated={() =>
                      reload()
                    }
                  />
                ))}
                {row.length < columns && <View style={styles.flex} />}
              </View>
            ))
          )}

          <Pagination {...paging} total={data?.total ?? 0} count={products.length} hasNext={!!data?.nextCursor} />

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
  const colors = useColors();
  const styles = useStyles();
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

          </View>
          {isPreorder ? (
            <PreorderLine product={product} />
          ) : (
            <StockLine product={product} soldOut={soldOut} />
          )}
        </View>
        <View style={styles.code}>
          <Text variant="caption" color={colors.textSecondary} style={styles.codeLabel}>
            Код
          </Text>
          <Text style={styles.codeValue}>{product.code}</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${product.name} үнэ засах`} onPress={() => setEditingPrice(true)} style={{ alignSelf: 'flex-end', padding: Spacing.three, marginRight: Spacing.two }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}><Icon name="edit-2" size={14} color={colors.primary} /><Text variant="caption" color={colors.primary}>Үнэ засах</Text></View>
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
  const colors = useColors();
  const styles = useStyles();
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
      <Text variant="captionMedium" color={colors.textSecondary}>
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
            <Text color={colors.textSecondary} style={styles.currency}>
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
          <Icon name="x" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
      {error && (
        <Text variant="caption" color={colors.danger}>
          {error}
        </Text>
      )}
    </View>
  );
}

/** Status and progress of a preorder instead of stock. */
function PreorderLine({ product }: { product: Product }) {
  const colors = useColors();
  const styles = useStyles();
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
      <Text variant="caption" color={colors.textSecondary}>
        {counts}
        {deadline}
      </Text>
    </View>
  );
}

function StockLine({ product, soldOut }: { product: Product; soldOut: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  return soldOut ? (
    <View style={styles.soldOut}>
      <Text variant="captionMedium" color={colors.danger}>
        Дууссан
      </Text>
    </View>
  ) : (
    <Text variant="caption" color={colors.textSecondary}>
      Үлдэгдэл: {describeStock(product)}
    </Text>
  );
}

const useStyles = makeStyles((colors) => ({
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
    borderColor: colors.border,
    backgroundColor: colors.surface,
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
    backgroundColor: colors.surfaceMuted,
  },
  priceEditPressed: {
    backgroundColor: colors.border,
  },
  priceEditor: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
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
    backgroundColor: colors.surfaceMuted,
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
    backgroundColor: colors.dangerSoft,
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
    backgroundColor: colors.surfaceMuted,
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
}));
