import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api, ApiError, type Product, type ProductInput } from '@/api';
import { ProductThumb } from '@/components/product-thumb';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Colors, FormMaxWidth, Radius, Spacing } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { formatNumber } from '@/lib/format';

type StockMode = 'single' | 'breakdown';
type CodeMode = 'auto' | 'custom';
type VariantRow = { key: string; name: string; quantity: string };
type Errors = Partial<Record<'name' | 'price' | 'stock' | 'variants' | 'code' | 'form', string>>;

const PRESETS: { label: string; values: string[] }[] = [
  { label: 'S · M · L · XL', values: ['S', 'M', 'L', 'XL'] },
  { label: 'XS – XXL', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { label: '36 – 45 размер', values: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'] },
];

let rowKey = 0;
const newRow = (name = '', quantity = ''): VariantRow => ({ key: `row${++rowKey}`, name, quantity });
const digitsOnly = (text: string, max: number) => text.replace(/\D/g, '').slice(0, max);

/** Add/edit product page. Pass `product` to edit an existing one. */
export function ProductForm({ product }: { product?: Product }) {
  const isEdit = !!product;
  const [imageUri, setImageUri] = useState(product?.imageUrl ?? null);
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [stockMode, setStockMode] = useState<StockMode>(
    product?.variants.length ? 'breakdown' : 'single',
  );
  const [stock, setStock] = useState(product && !product.variants.length ? String(product.stock) : '');
  const [rows, setRows] = useState<VariantRow[]>(() =>
    product?.variants.length
      ? product.variants.map((v) => newRow(v.name, String(v.quantity)))
      : [newRow(), newRow()],
  );
  // Editing starts in the mode the current code came from; either mode can be chosen.
  const [codeMode, setCodeMode] = useState<CodeMode>(product?.codeSource ?? 'auto');
  const [code, setCode] = useState(product?.code ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filledRows = rows.filter((r) => r.name.trim() || r.quantity);
  const breakdownTotal = filledRows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  const updateRow = (key: string, patch: Partial<VariantRow>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const applyPreset = (values: string[]) =>
    setRows((current) =>
      values.map((value) => newRow(value, current.find((r) => r.name.trim() === value)?.quantity)),
    );

  const validate = (): ProductInput | null => {
    const next: Errors = {};
    if (!name.trim()) next.name = 'Барааны нэрээ оруулна уу.';
    if (!(Number(price) > 0)) next.price = 'Үнээ оруулна уу.';

    if (stockMode === 'single') {
      if (stock === '') next.stock = 'Тоо ширхэгээ оруулна уу.';
    } else {
      const names = filledRows.map((r) => r.name.trim().toLowerCase());
      if (filledRows.length === 0) next.variants = 'Дор хаяж нэг мөр бөглөнө үү.';
      else if (filledRows.some((r) => !r.name.trim())) next.variants = 'Мөр бүрт нэр бичнэ үү.';
      else if (filledRows.some((r) => r.quantity === ''))
        next.variants = 'Мөр бүрт тоо ширхэг бичнэ үү.';
      else if (new Set(names).size !== names.length) next.variants = 'Нэр давхардсан байна.';
    }

    if (codeMode === 'custom' && !/^\d{3}$/.test(code)) next.code = '3 оронтой тоо оруулна уу.';

    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    return {
      name: name.trim(),
      price: Number(price),
      imageUrl: imageUri,
      code: codeMode === 'custom' ? code : null,
      variants:
        stockMode === 'breakdown'
          ? filledRows.map((r) => ({ name: r.name.trim(), quantity: Number(r.quantity) }))
          : [],
      stock: stockMode === 'single' ? Number(stock) : 0,
    };
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/products'));

  const save = async () => {
    const input = validate();
    if (!input) return;
    setSaving(true);
    try {
      if (product) await api.updateProduct(product.id, input);
      else await api.createProduct(input);
      close();
    } catch (error) {
      setSaving(false);
      if (error instanceof ApiError && error.code === 'code_taken') {
        setErrors({ code: errorMessage(error) });
      } else {
        setErrors({ form: errorMessage(error) });
      }
    }
  };

  const remove = async () => {
    if (!product) return;
    const ok = await confirm(
      'Бараа устгах',
      `«${product.name}» (код ${product.code}) барааг устгах уу?`,
      'Устгах',
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await api.deleteProduct(product.id);
      close();
    } catch (error) {
      setDeleting(false);
      setErrors({ form: errorMessage(error) });
    }
  };

  const keepsAutoCode = product?.codeSource === 'auto';
  const autoCodeMessage = !product
    ? 'Хадгалахад систем давхцахгүй 3 оронтой код автоматаар өгнө.'
    : keepsAutoCode
      ? `Систем өгсөн ${product.code} код хэвээр үлдэнэ.`
      : `Хадгалахад систем шинэ 3 оронтой код өгнө. Одоогийн ${product.code} код солигдох тул худалдан авагчдад шинэ кодоо мэдэгдээрэй.`;
  const exampleCode =
    codeMode === 'custom' ? code || '123' : keepsAutoCode && product ? product.code : '123';
  const exampleVariant = stockMode === 'breakdown' ? `${filledRows[0]?.name.trim() || 'L'} ` : '';

  return (
    <Screen
      maxWidth={FormMaxWidth}
      header={
        <ScreenHeader
          title={isEdit ? 'Бараа засах' : 'Бараа нэмэх'}
          fallbackHref="/products"
        />
      }
      footer={
        <View style={styles.footer}>
          {isEdit && (
            <Button
              title="Устгах"
              variant="danger"
              icon="trash-2"
              onPress={remove}
              loading={deleting}
              disabled={saving}
              style={styles.deleteButton}
            />
          )}
          <Button
            title="Хадгалах"
            onPress={save}
            loading={saving}
            disabled={deleting}
            style={styles.flex}
          />
        </View>
      }>
      <View style={styles.form}>
        {/* Image */}
        <View style={styles.imageRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Зураг сонгох"
            onPress={pickImage}>
            <ProductThumb uri={imageUri} size={104} />
          </Pressable>
          <View style={styles.imageActions}>
            <Text variant="label">
              Зураг{' '}
              <Text variant="caption" color={Colors.textSecondary}>
                (заавал биш)
              </Text>
            </Text>
            <View style={styles.inline}>
              <Button
                title={imageUri ? 'Солих' : 'Зураг сонгох'}
                icon="upload"
                variant="outline"
                size="sm"
                onPress={pickImage}
              />
              {imageUri && (
                <Button
                  title="Арилгах"
                  variant="ghost"
                  size="sm"
                  onPress={() => setImageUri(null)}
                />
              )}
            </View>
          </View>
        </View>

        <TextField
          label="Нэр"
          placeholder="Жишээ: Хар цамц"
          value={name}
          onChangeText={setName}
          error={errors.name}
          maxLength={80}
        />

        <TextField
          label="Үнэ"
          placeholder="0"
          keyboardType="number-pad"
          value={price ? formatNumber(Number(price)) : ''}
          onChangeText={(text) => setPrice(digitsOnly(text, 9))}
          error={errors.price}
          suffix={<Suffix>₮</Suffix>}
        />

        {/* Stock */}
        <View style={styles.section}>
          <Text variant="label">Үлдэгдэл</Text>
          <SegmentedControl
            options={[
              { value: 'single', label: 'Нэг төрөл' },
              { value: 'breakdown', label: 'Хэмжээ, төрлөөр' },
            ]}
            value={stockMode}
            onChange={setStockMode}
          />

          {stockMode === 'single' ? (
            <TextField
              placeholder="Тоо ширхэг"
              keyboardType="number-pad"
              value={stock}
              onChangeText={(text) => setStock(digitsOnly(text, 6))}
              error={errors.stock}
              suffix={<Suffix>ш</Suffix>}
            />
          ) : (
            <View style={styles.breakdown}>
              <View style={styles.inlineWrap}>
                {PRESETS.map((preset) => (
                  <Chip
                    key={preset.label}
                    label={preset.label}
                    onPress={() => applyPreset(preset.values)}
                  />
                ))}
              </View>

              <View style={styles.variantHeader}>
                <Text variant="captionMedium" color={Colors.textSecondary} style={styles.flex}>
                  Хэмжээ / төрөл
                </Text>
                <Text variant="captionMedium" color={Colors.textSecondary} style={styles.qtyCol}>
                  Тоо ширхэг
                </Text>
                <View style={styles.removeCol} />
              </View>

              {rows.map((row) => (
                <View key={row.key} style={styles.variantRow}>
                  <TextField
                    placeholder="Жишээ: L"
                    value={row.name}
                    onChangeText={(text) => updateRow(row.key, { name: text })}
                    maxLength={20}
                    containerStyle={styles.flex}
                  />
                  <TextField
                    placeholder="0"
                    keyboardType="number-pad"
                    value={row.quantity}
                    onChangeText={(text) => updateRow(row.key, { quantity: digitsOnly(text, 5) })}
                    containerStyle={styles.qtyCol}
                    suffix={<Suffix>ш</Suffix>}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Мөр устгах"
                    onPress={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                    style={({ pressed }) => [styles.removeCol, pressed && { opacity: 0.5 }]}>
                    <Icon name="x" size={20} color={Colors.textSecondary} />
                  </Pressable>
                </View>
              ))}

              <View style={styles.breakdownFooter}>
                <Button
                  title="Мөр нэмэх"
                  icon="plus"
                  variant="ghost"
                  size="sm"
                  onPress={() => setRows((current) => [...current, newRow()])}
                />
                <Text variant="label">Нийт: {breakdownTotal} ш</Text>
              </View>

              {errors.variants && (
                <Text variant="caption" color={Colors.danger}>
                  {errors.variants}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Code */}
        <View style={styles.section}>
          <Text variant="label">Барааны код</Text>
          <SegmentedControl
            options={[
              { value: 'auto', label: 'Систем өгөх' },
              { value: 'custom', label: 'Өөрөө оруулах' },
            ]}
            value={codeMode}
            onChange={setCodeMode}
          />
          {codeMode === 'auto' ? (
            <View style={styles.autoCode}>
              <Icon name="zap" size={18} color={Colors.primary} />
              <Text variant="caption" color={Colors.primary} style={styles.flex}>
                {autoCodeMessage}
              </Text>
            </View>
          ) : (
            <TextField
              placeholder="000"
              keyboardType="number-pad"
              value={code}
              onChangeText={(text) => setCode(digitsOnly(text, 3))}
              maxLength={3}
              error={errors.code}
              style={styles.codeInput}
            />
          )}
          <Text variant="caption" color={Colors.textSecondary}>
            Худалдан авагч чатад «{exampleCode} {exampleVariant}2ш» гэж бичээд захиална.
          </Text>
        </View>

        {errors.form && (
          <View style={styles.formError}>
            <Icon name="alert-circle" size={18} color={Colors.danger} />
            <Text variant="caption" color={Colors.danger} style={styles.flex}>
              {errors.form}
            </Text>
          </View>
        )}
      </View>
    </Screen>
  );
}

function Suffix({ children }: { children: string }) {
  return (
    <Text color={Colors.textSecondary} style={styles.suffix}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  form: {
    gap: Spacing.six,
    paddingTop: Spacing.two,
  },
  imageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.five,
  },
  imageActions: {
    flex: 1,
    gap: Spacing.three,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  inlineWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.three,
  },
  breakdown: {
    gap: Spacing.three,
  },
  variantHeader: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  qtyCol: {
    width: 128,
  },
  removeCol: {
    width: 32,
    alignItems: 'center',
  },
  breakdownFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: Spacing.two,
  },
  suffix: {
    paddingRight: Spacing.four,
  },
  autoCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySoft,
  },
  codeInput: {
    fontSize: 22,
    letterSpacing: 6,
  },
  formError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.sm,
    backgroundColor: Colors.dangerSoft,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  deleteButton: {
    paddingHorizontal: Spacing.five,
  },
});
