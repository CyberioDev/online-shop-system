import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api, ApiError, type Product, type ProductInput, type SaleType } from '@/api';
import { DatePicker } from '@/components/date-range-picker';
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
import { addDays, formatNumber, formatShortDate, fromDayKey, toDayKey } from '@/lib/format';
import { normalizeProductCode, PRODUCT_CODE_PATTERN } from '@/lib/product-code';

type StockMode = 'single' | 'breakdown';
type CodeMode = 'auto' | 'custom';
type VariantRow = { key: string; name: string; quantity: string };
type Errors = Partial<
  Record<'name' | 'price' | 'stock' | 'variants' | 'code' | 'closesOn' | 'limit' | 'form', string>
>;

/** Quick deadlines for preorders, in days from today. */
const DEADLINE_PRESETS = [7, 14, 30];

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
  const todayKey = toDayKey(new Date());
  // The sale type is fixed once the product exists (orders depend on it).
  const [saleType, setSaleType] = useState<SaleType>(product?.saleType ?? 'stock');
  const isPreorder = saleType === 'preorder';
  const [closesOn, setClosesOn] = useState<string | null>(
    product ? (product.preorder?.closesOn ?? null) : toDayKey(addDays(new Date(), 7)),
  );
  const [arrivalNote, setArrivalNote] = useState(product?.preorder?.arrivalNote ?? '');
  const [limit, setLimit] = useState(product?.preorder?.limit ? String(product.preorder.limit) : '');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
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

  // Preorders have no stock, so only the names matter there.
  const filledRows = rows.filter((r) => r.name.trim() || (!isPreorder && r.quantity));
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
      if (!isPreorder && stock === '') next.stock = 'Тоо ширхэгээ оруулна уу.';
    } else {
      const names = filledRows.map((r) => r.name.trim().toLowerCase());
      if (filledRows.length === 0) next.variants = 'Дор хаяж нэг мөр бөглөнө үү.';
      else if (filledRows.some((r) => !r.name.trim())) next.variants = 'Мөр бүрт нэр бичнэ үү.';
      else if (!isPreorder && filledRows.some((r) => r.quantity === ''))
        next.variants = 'Мөр бүрт тоо ширхэг бичнэ үү.';
      else if (new Set(names).size !== names.length) next.variants = 'Нэр давхардсан байна.';
    }

    if (codeMode === 'custom' && !PRODUCT_CODE_PATTERN.test(code)) {
      next.code = '3 латин үсэг оруулна уу.';
    }

    if (isPreorder) {
      // A past date is fine if it was already saved (e.g. an order round that has closed).
      const unchanged = closesOn === (product?.preorder?.closesOn ?? undefined);
      if (closesOn && closesOn < todayKey && !unchanged) {
        next.closesOn = 'Өнгөрсөн огноо сонгох боломжгүй.';
      }
      if (limit !== '' && !(Number(limit) > 0)) next.limit = '0-ээс их тоо оруулна уу.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    return {
      saleType,
      name: name.trim(),
      price: Number(price),
      imageUrl: imageUri,
      code: codeMode === 'custom' ? code : null,
      variants:
        stockMode === 'breakdown'
          ? filledRows.map((r) => ({
              name: r.name.trim(),
              quantity: isPreorder ? 0 : Number(r.quantity),
            }))
          : [],
      stock: !isPreorder && stockMode === 'single' ? Number(stock) : 0,
      preorder: isPreorder
        ? {
            closesOn,
            arrivalNote: arrivalNote.trim() || null,
            limit: limit === '' ? null : Number(limit),
          }
        : null,
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

  const presetKeys = DEADLINE_PRESETS.map((days) => toDayKey(addDays(new Date(), days)));
  const customDeadline = closesOn !== null && !presetKeys.includes(closesOn);
  const keepsAutoCode = product?.codeSource === 'auto';
  const autoCodeMessage = !product
    ? 'Хадгалахад систем давхцахгүй 3 үсэгтэй код автоматаар өгнө.'
    : keepsAutoCode
      ? `Систем өгсөн ${product.code} код хэвээр үлдэнэ.`
      : `Хадгалахад систем шинэ 3 үсэгтэй код өгнө. Одоогийн ${product.code} код солигдох тул худалдан авагчдад шинэ кодоо мэдэгдээрэй.`;
  const exampleCode =
    codeMode === 'custom' ? code || 'ABC' : keepsAutoCode && product ? product.code : 'ABC';
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
        {/* Sale type */}
        <View style={styles.section}>
          <Text variant="label">Борлуулах хэлбэр</Text>
          {isEdit ? (
            <Text color={Colors.textSecondary}>
              {isPreorder ? 'Урьдчилсан захиалга' : 'Бэлэн бараа'} · үүсгэсний дараа солих боломжгүй
            </Text>
          ) : (
            <>
              <SegmentedControl
                options={[
                  { value: 'stock', label: 'Бэлэн бараа' },
                  { value: 'preorder', label: 'Урьдчилсан захиалга' },
                ]}
                value={saleType}
                onChange={setSaleType}
              />
              <Text variant="caption" color={Colors.textSecondary}>
                {isPreorder
                  ? 'Захиалга цуглуулаад, хаагдсаны дараа гаднаас бөөнөөр захиална. Үлдэгдэл бүртгэхгүй, захиалсан тоог систем тоолно.'
                  : 'Гарт байгаа барааг үлдэгдлээр нь зарна.'}
              </Text>
            </>
          )}
        </View>

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
          <Text variant="label">{isPreorder ? 'Хэмжээ, төрөл' : 'Үлдэгдэл'}</Text>
          <SegmentedControl
            options={[
              { value: 'single', label: 'Нэг төрөл' },
              { value: 'breakdown', label: 'Хэмжээ, төрлөөр' },
            ]}
            value={stockMode}
            onChange={setStockMode}
          />

          {stockMode === 'single' && isPreorder ? (
            <Text variant="caption" color={Colors.textSecondary}>
              Хэмжээ, төрөлгүй бараа. Захиалсан тоог систем тоолно.
            </Text>
          ) : stockMode === 'single' ? (
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
                {!isPreorder && (
                  <Text variant="captionMedium" color={Colors.textSecondary} style={styles.qtyCol}>
                    Тоо ширхэг
                  </Text>
                )}
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
                  {!isPreorder && (
                    <TextField
                      placeholder="0"
                      keyboardType="number-pad"
                      value={row.quantity}
                      onChangeText={(text) => updateRow(row.key, { quantity: digitsOnly(text, 5) })}
                      containerStyle={styles.qtyCol}
                      suffix={<Suffix>ш</Suffix>}
                    />
                  )}
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
                {!isPreorder && <Text variant="label">Нийт: {breakdownTotal} ш</Text>}
              </View>

              {errors.variants && (
                <Text variant="caption" color={Colors.danger}>
                  {errors.variants}
                </Text>
              )}
            </View>
          )}
        </View>

        {isPreorder && (
          <>
            <View style={styles.section}>
              <Text variant="label">Захиалга авах эцсийн өдөр</Text>
              <View style={styles.inlineWrap}>
                <Chip
                  label="Хугацаагүй"
                  selected={closesOn === null}
                  onPress={() => setClosesOn(null)}
                />
                {DEADLINE_PRESETS.map((days, i) => (
                  <Chip
                    key={days}
                    label={`${days} хоног`}
                    selected={closesOn === presetKeys[i]}
                    onPress={() => setClosesOn(presetKeys[i])}
                  />
                ))}
                <Chip
                  label={
                    customDeadline && closesOn
                      ? `${formatShortDate(fromDayKey(closesOn))} хүртэл`
                      : 'Огноо сонгох'
                  }
                  icon="calendar"
                  selected={customDeadline}
                  onPress={() => setDatePickerOpen(true)}
                />
              </View>
              {errors.closesOn ? (
                <Text variant="caption" color={Colors.danger}>
                  {errors.closesOn}
                </Text>
              ) : (
                <Text variant="caption" color={Colors.textSecondary}>
                  {closesOn
                    ? `${formatShortDate(fromDayKey(closesOn))}-ны өдрийн төгсгөл хүртэл чатбот захиалга авч, дараа нь автоматаар хаана.`
                    : 'Та өөрөө хаах хүртэл чатбот захиалга авна.'}
                </Text>
              )}
            </View>

            <TextField
              label="Хэзээ ирэх вэ (заавал биш)"
              placeholder="Жишээ: Захиалга хаагдсанаас хойш 2–3 долоо хоногт"
              value={arrivalNote}
              onChangeText={setArrivalNote}
              maxLength={120}
              hint="Чатбот захиалга авахдаа худалдан авагчид хэлнэ."
            />

            <TextField
              label="Дээд тоо (заавал биш)"
              placeholder="Хязгааргүй"
              keyboardType="number-pad"
              value={limit}
              onChangeText={(text) => setLimit(digitsOnly(text, 5))}
              error={errors.limit}
              hint="Нийт захиалга энэ тоонд хүрэхэд чатбот захиалга авахаа зогсооно."
              suffix={<Suffix>ш</Suffix>}
            />

            <DatePicker
              visible={datePickerOpen}
              value={closesOn}
              min={todayKey}
              onCancel={() => setDatePickerOpen(false)}
              onApply={(day) => {
                setDatePickerOpen(false);
                setClosesOn(day);
              }}
            />
          </>
        )}

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
              placeholder="ABC"
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              value={code}
              onChangeText={(text) => setCode(normalizeProductCode(text))}
              hint="Латин A–Z үсэг. Кирилл А, В, С… бичвэл латин болгон хувиргана."
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
