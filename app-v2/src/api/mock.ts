/**
 * In-memory implementation of the API used until the Go backend is connected.
 * Data is seeded deterministically relative to "now" so every screen has
 * something realistic to show. Changes are lost on reload.
 */
import { createReviewMock } from './mock-review';
import { fail, newId, ORDER_DEFAULTS, respond } from './mock-utils';
import {
  ApiError,
  type ApiClient,
  type Channel,
  type DateRange,
  type Integrations,
  type MetaPlatform,
  type Order,
  type OrderItem,
  type OrderStatus,
  type PreorderInfo,
  type PreorderStatus,
  type Product,
  type ProductInput,
  type ReportSummary,
  type Session,
  type ShopSettings,
} from './types';

import { DEMO_RESET_CODE, TEST_ACCOUNT } from '@/constants/config';
import { addDays, fromDayKey, startOfDay, toDayKey } from '@/lib/format';

/** Small seeded PRNG so the demo data is stable between reloads. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Seed data ----------

const now = new Date();

let products: Product[] = [
  seedProduct('KTS', 'custom', 'Хар цамц', 35_000, [['S', 4], ['M', 6], ['L', 2]]),
  seedProduct('MLG', 'auto', 'Цагаан малгай', 17_000, [], 10),
  seedProduct('PUZ', 'auto', 'Цагаан пүүз', 89_000, [['38', 3], ['39', 4], ['40', 3]]),
  seedProduct('TOS', 'auto', 'Нүүрний тос', 25_000, [], 0),
  seedProduct('ORL', 'custom', 'Ноосон ороолт', 45_000, [['Саарал', 5], ['Бор', 3]]),
  seedPreorder('PUH', 'Солонгос пуховик', 189_000, ['S', 'M', 'L', 'XL'], 9, {
    status: 'open',
    closesOn: toDayKey(addDays(now, 5)),
    arrivalNote: 'Захиалга хаагдсанаас хойш 2–3 долоо хоногт ирнэ',
    limit: 60,
  }),
  seedPreorder('NAF', 'Nike Air Force 1', 245_000, ['37', '38', '39', '40', '41', '42'], 20, {
    status: 'closed',
    closesOn: toDayKey(addDays(now, -2)),
    arrivalNote: 'Ойролцоогоор 10 хоногийн дараа ирнэ',
    limit: null,
  }),
  seedPreorder('SUN', 'Япон нарны тос', 39_000, [], 30, {
    status: 'arrived',
    closesOn: toDayKey(addDays(now, -18)),
    arrivalNote: null,
    limit: null,
  }),
];

function seedProduct(
  code: string,
  codeSource: Product['codeSource'],
  name: string,
  price: number,
  variants: [string, number][],
  stock = 0,
): Product {
  return {
    id: newId('prd'),
    code,
    codeSource,
    saleType: 'stock',
    name,
    price,
    imageUrl: null,
    variants: variants.map(([variantName, quantity]) => ({
      id: newId('var'),
      name: variantName,
      quantity,
    })),
    stock,
    preorder: null,
    createdAt: addDays(now, -60).toISOString(),
  };
}

function seedPreorder(
  code: string,
  name: string,
  price: number,
  variants: string[],
  createdDaysAgo: number,
  preorder: Omit<PreorderInfo, 'ordered' | 'paid'>,
): Product {
  return {
    id: newId('prd'),
    code,
    codeSource: 'auto',
    saleType: 'preorder',
    name,
    price,
    imageUrl: null,
    variants: variants.map((variantName) => ({ id: newId('var'), name: variantName, quantity: 0 })),
    stock: 0,
    preorder: { ...preorder, ordered: 0, paid: 0 },
    createdAt: addDays(now, -createdDaysAgo).toISOString(),
  };
}

const CUSTOMERS = [
  'Туяа', 'Сараа', 'Мөнхөө', 'Болд', 'Оюука', 'Тэмүүлэн', 'Энхжин', 'Ганбат', 'Номин',
  'Анужин', 'Бат-Эрдэнэ', 'Золзаяа', 'Хулан', 'Төгөлдөр', 'Мишээл', 'Ариунаа', 'Билгүүн',
  'Наранцэцэг', 'Сэлэнгэ', 'Дөлгөөн',
];

function pickChannel(r: number): Channel {
  if (r < 0.42) return 'live';
  if (r < 0.74) return 'messenger';
  if (r < 0.93) return 'instagram';
  return 'facebook';
}

function generateHistory() {
  const rand = mulberry32(20260919);
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  // Preorders get their own orders below (seedPreorderOrders).
  const stockProducts = products.filter((p) => p.saleType === 'stock');
  const generated: Order[] = [];
  const unmatched: string[] = [];
  const today = startOfDay(now);

  for (let daysBack = 59; daysBack >= 0; daysBack--) {
    const isToday = daysBack === 0;
    const dayStart = addDays(today, -daysBack);
    // Today's orders fill the last 12 hours so the dashboard is never empty.
    const windowStart = isToday
      ? Math.max(dayStart.getTime(), now.getTime() - 12 * 3_600_000)
      : dayStart.getTime() + 8 * 3_600_000;
    const windowEnd = isToday ? now.getTime() : dayStart.getTime() + 23 * 3_600_000;
    const count = isToday ? 52 : 14 + Math.floor(rand() * 24);

    for (let i = 0; i < count; i++) {
      const createdAt = new Date(windowStart + rand() * (windowEnd - windowStart));
      const items: OrderItem[] = [];
      const lineCount = rand() < 0.75 ? 1 : 2;
      for (let l = 0; l < lineCount; l++) {
        const product = pick(stockProducts);
        items.push({
          productId: product.id,
          productName: product.name,
          variantName: product.variants.length ? pick(product.variants).name : null,
          quantity: rand() < 0.8 ? 1 : 2,
          unitPrice: product.price,
        });
      }

      const ageMinutes = (now.getTime() - createdAt.getTime()) / 60_000;
      const r = rand();
      let status: OrderStatus = 'paid';
      // Orders needing review come from the seeded review cases (mock-review.ts).
      if (ageMinutes < 180) status = r < 0.2 ? 'awaiting_payment' : 'paid';
      else if (isToday) status = r < 0.04 ? 'awaiting_payment' : 'paid';
      else if (r < 0.04) status = 'awaiting_payment';

      let paidAt: Date | null = null;
      if (status === 'paid') {
        paidAt = new Date(createdAt.getTime() + (2 + rand() * 38) * 60_000);
        if (paidAt > now) {
          paidAt = null;
          status = 'awaiting_payment';
        }
      }

      generated.push({
        id: newId('ord'),
        code: String(1000 + Math.floor(rand() * 9000)),
        customerName: pick(CUSTOMERS),
        channel: pickChannel(rand()),
        items,
        total: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
        status,
        createdAt: createdAt.toISOString(),
        paidAt: paidAt?.toISOString() ?? null,
        matchedBy: status === 'paid' ? (rand() < 0.06 ? 'manual' : 'auto') : null,
        ...ORDER_DEFAULTS,
      });
    }

    if (isToday || rand() < 0.3) {
      unmatched.push(new Date(windowStart + rand() * (windowEnd - windowStart)).toISOString());
    }
  }

  generated.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { orders: generated, unmatchedPayments: unmatched };
}

const { orders, unmatchedPayments } = generateHistory();
const review = createReviewMock(orders, products, now);
const DISTRICTS = ['БЗД', 'СБД', 'ХУД', 'СХД', 'ЧД', 'БГД'];

seedPreorderOrders();
decorateOrders();

/**
 * Fills the seller-side fields of the seeded orders: chat links, phones and addresses
 * the chatbot would have collected, deliveries done, and a few cancellations. Uses its
 * own random sequence so the rest of the demo data stays the same.
 */
function decorateOrders() {
  const rand = mulberry32(4242);
  const day = 24 * 3_600_000;
  for (const o of orders) {
    o.chatUrl =
      o.channel === 'instagram'
        ? 'https://www.instagram.com/direct/inbox/'
        : o.channel === 'live'
          ? null
          : 'https://business.facebook.com/latest/inbox/all';
    if (o.status !== 'paid') continue;
    if (rand() < 0.85) o.customerPhone = `8800${String(Math.floor(rand() * 10_000)).padStart(4, '0')}`;
    if (rand() < 0.8) {
      const district = DISTRICTS[Math.floor(rand() * DISTRICTS.length)];
      o.deliveryAddress = `${district}, ${1 + Math.floor(rand() * 30)}-р хороо, ${1 + Math.floor(rand() * 90)}-р байр, ${1 + Math.floor(rand() * 120)} тоот`;
    }
    // Paid more than 2 days ago: delivered by now. Some of the last two days too.
    const paidAge = now.getTime() - new Date(o.paidAt!).getTime();
    if (paidAge > 2 * day || (paidAge > day / 2 && rand() < 0.3)) {
      o.fulfilledAt = new Date(new Date(o.paidAt!).getTime() + Math.min(paidAge, day) * rand()).toISOString();
    }
  }
  // A few cancellations among older orders.
  const older = orders.filter((o) => o.status === 'paid' && now.getTime() - new Date(o.createdAt).getTime() > 3 * day);
  for (let i = 0; i < 4 && older.length; i++) {
    const o = older[Math.floor(rand() * older.length)];
    o.status = 'cancelled';
    o.fulfilledAt = null;
    o.cancelledAt = new Date(new Date(o.createdAt).getTime() + day).toISOString();
    o.cancelReason = i % 2 ? 'Худалдан авагч цуцалсан' : 'Хэмжээ дууссан';
  }
}

/** Orders for the seeded preorders, placed between each one's start and closing day. */
function seedPreorderOrders() {
  const rand = mulberry32(612645678);
  const counts: Record<PreorderStatus, number> = { open: 34, closed: 41, arrived: 18 };
  for (const product of products) {
    if (!product.preorder) continue;
    const { status, closesOn } = product.preorder;
    const start = new Date(product.createdAt).getTime();
    const end = Math.min(now.getTime(), closesOn ? addDays(fromDayKey(closesOn), 1).getTime() : now.getTime());
    for (let i = 0; i < counts[status]; i++) {
      const createdAt = new Date(start + rand() * (end - start));
      // Middle sizes sell best: mostly centre-weighted picks, some uniform.
      const v = product.variants;
      const r = rand() < 0.4 ? rand() : (rand() + rand()) / 2;
      const variant = v.length ? v[Math.floor(r * v.length)].name : null;
      const quantity = rand() < 0.1 ? 2 : 1;
      const recent = now.getTime() - createdAt.getTime() < 24 * 3_600_000;
      const paid = status !== 'open' ? rand() < 0.92 : rand() < (recent ? 0.65 : 0.85);
      orders.push({
        id: newId('ord'),
        code: String(1000 + Math.floor(rand() * 9000)),
        customerName: CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)],
        channel: pickChannel(rand()),
        items: [{ productId: product.id, productName: product.name, variantName: variant, quantity, unitPrice: product.price }],
        total: quantity * product.price,
        status: paid ? 'paid' : 'awaiting_payment',
        createdAt: createdAt.toISOString(),
        paidAt: paid ? new Date(Math.min(createdAt.getTime() + 20 * 60_000, now.getTime())).toISOString() : null,
        matchedBy: paid ? 'auto' : null,
        ...ORDER_DEFAULTS,
      });
    }
  }
  orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Demo password; starts as the test account's and changes with changePassword/reset. */
let mockPassword: string = TEST_ACCOUNT.password;

let shopSettings: ShopSettings = {
  bankAccount: { bank: 'Хаан банк', accountNumber: '1234567890', accountHolder: 'Б. Болор' },
};

let integrations: Integrations = {
  facebook: {
    connected: true,
    accountName: 'Hokage Shop',
    connectedAt: addDays(now, -21).toISOString(),
  },
  instagram: { connected: false, accountName: null, connectedAt: null },
  sms: {
    connected: true,
    webhookUrl: 'https://api.example.com/hooks/sms/shp_demo',
    token: 'lst_demo_7f2c9a41e8b3',
    senderNumber: 'KHANBANK',
    deviceLabel: 'iPhone',
    lastReceivedAt: new Date(now.getTime() - 7 * 60_000).toISOString(),
  },
  chatbot: { connected: false },
};

// ---------- Helpers ----------

const inRange = (iso: string, range: DateRange) => {
  const day = toDayKey(new Date(iso));
  return day >= range.from && day <= range.to;
};

const lastEventAt = (order: Order) => order.paidAt ?? order.createdAt;

const unitsOf = (productId: string, list: Order[], variantName?: string | null) =>
  list.filter((o) => o.status !== 'cancelled').reduce(
    (sum, o) =>
      sum +
      o.items
        .filter((i) => i.productId === productId && (variantName === undefined || i.variantName === variantName))
        .reduce((s, i) => s + i.quantity, 0),
    0,
  );

/** Product as the API returns it: preorder counts are computed from orders. */
function view(product: Product): Product {
  if (!product.preorder) return product;
  return {
    ...product,
    preorder: {
      ...product.preorder,
      ordered: unitsOf(product.id, orders),
      paid: unitsOf(product.id, orders.filter((o) => o.status === 'paid')),
    },
  };
}

const PREORDER_TRANSITIONS: Record<PreorderStatus, PreorderStatus[]> = {
  open: ['closed'],
  closed: ['open', 'arrived'],
  arrived: [],
};

function validateProduct(input: ProductInput, ignoreId?: string): ApiError | null {
  if (!input.name.trim() || !(input.price > 0)) return new ApiError('validation');
  const existing = products.find((p) => p.id === ignoreId);
  if (existing && existing.saleType !== input.saleType) {
    return new ApiError('validation', 'Борлуулалтын төрлийг өөрчлөх боломжгүй');
  }
  if (input.saleType === 'preorder') {
    const settings = input.preorder;
    if (!settings) return new ApiError('validation', 'Урьдчилсан захиалгын тохиргоо дутуу байна');
    if (settings.closesOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(settings.closesOn)) {
      return new ApiError('validation', 'Хаах огноо буруу байна');
    }
    if (settings.limit !== null && !(Number.isInteger(settings.limit) && settings.limit > 0)) {
      return new ApiError('validation', 'Дээд тоо 0-ээс их бүхэл тоо байна');
    }
  } else if (input.preorder !== null) {
    return new ApiError('validation');
  }
  if (input.code !== null) {
    if (!/^[A-Z]{3}$/.test(input.code)) {
      return new ApiError('validation', 'Код нь 3 латин том үсэг байна');
    }
    if (products.some((p) => p.code === input.code && p.id !== ignoreId)) {
      return new ApiError('code_taken');
    }
  }
  return null;
}

/** Letters for generated codes: no I or O, which buyers confuse with 1/l and 0. */
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateCode() {
  const taken = new Set(products.map((p) => p.code));
  // A code that reads like a size ("XXL") would be ambiguous in "XXL L 2ш".
  const sizes = new Set(products.flatMap((p) => p.variants.map((v) => v.name.toUpperCase())));
  for (let attempt = 0; attempt < 5000; attempt++) {
    const code = Array.from(
      { length: 3 },
      () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)],
    ).join('');
    if (!taken.has(code) && !sizes.has(code) && code !== 'XXL' && code !== 'XXS') return code;
  }
  throw new ApiError('validation', 'Чөлөөтэй код үлдсэнгүй');
}

function pickCode(input: ProductInput, base?: Product): Pick<Product, 'code' | 'codeSource'> {
  if (input.code !== null) return { code: input.code, codeSource: 'custom' };
  // Keep a code the system already picked; replace a custom one (or none) with a new one.
  if (base?.codeSource === 'auto') return { code: base.code, codeSource: 'auto' };
  return { code: generateCode(), codeSource: 'auto' };
}

function buildProduct(input: ProductInput, base?: Product): Product {
  return {
    id: base?.id ?? newId('prd'),
    createdAt: base?.createdAt ?? new Date().toISOString(),
    ...pickCode(input, base),
    saleType: input.saleType,
    name: input.name.trim(),
    price: input.price,
    imageUrl: input.imageUrl,
    variants: input.variants.map((v) => ({
      id: base?.variants.find((existing) => existing.name === v.name)?.id ?? newId('var'),
      name: v.name.trim(),
      quantity: input.saleType === 'preorder' ? 0 : v.quantity,
    })),
    stock: input.saleType === 'preorder' || input.variants.length ? 0 : input.stock,
    preorder:
      input.saleType === 'preorder' && input.preorder
        ? { ...input.preorder, status: base?.preorder?.status ?? 'open', ordered: 0, paid: 0 }
        : null,
  };
}

// ---------- Client ----------

export const mockApi: ApiClient = {
  isMock: true,
  setToken() {},
  setUnauthorizedHandler() {},

  login(phone, password) {
    if (phone !== TEST_ACCOUNT.phone || password !== mockPassword) {
      return fail('invalid_credentials');
    }
    const session: Session = {
      token: `mock_${phone}`,
      user: { id: 'usr_1', name: 'Болор', shopName: 'Hokage Shop', phone },
    };
    return respond(session);
  },

  logout() {
    return respond(undefined);
  },

  getTodaySummary() {
    const today = toDayKey(now);
    const todays = orders.filter((o) => inRange(o.createdAt, { from: today, to: today }));
    const paid = todays.filter((o) => o.status === 'paid');
    return respond({
      revenue: paid.reduce((sum, o) => sum + o.total, 0),
      paidCount: paid.length,
      awaitingCount: todays.filter((o) => o.status === 'awaiting_payment').length,
      reviewCount: review.openCount(),
      recent: [...orders].sort((a, b) => lastEventAt(b).localeCompare(lastEventAt(a))).slice(0, 6),
    });
  },

  async getProductsPage({ from, to, q, saleType, cursor, limit = 50 }) {
    const items = (await this.listProducts()).filter(p => (!from || p.createdAt >= from) && (!to || p.createdAt < to) && (!saleType || p.saleType === saleType) && (!q || `${p.name} ${p.code}`.toLowerCase().includes(q.toLowerCase())));
    const offset = Number(cursor || 0);
    return { products: items.slice(offset, offset + limit), total: items.length, nextCursor: offset + limit < items.length ? String(offset + limit) : null };
  },
  async getReviewCasesPage({ from, to, cursor, limit = 50 }) {
    const items = (await this.listReviewCases()).filter(c => (!from || c.payment.receivedAt >= from) && (!to || c.payment.receivedAt < to));
    const offset = Number(cursor || 0);
    return { cases: items.slice(offset, offset + limit), total: items.length, nextCursor: offset + limit < items.length ? String(offset + limit) : null };
  },
  async getTransactionsPage(query) {
    const page = await this.getReviewCasesPage(query);
    return { transactions: page.cases.map(c => c.payment), total: page.total, nextCursor: page.nextCursor };
  },
  listProducts() {
    return respond([...products].sort((a, b) => a.code.localeCompare(b.code)).map(view));
  },

  getProduct(id) {
    const product = products.find((p) => p.id === id);
    return product ? respond(view(product)) : fail('not_found');
  },

  createProduct(input) {
    const error = validateProduct(input);
    if (error) return fail(error.code, error.message);
    const product = buildProduct(input);
    products = [...products, product];
    return respond(view(product));
  },

  updateProduct(id, input) {
    const existing = products.find((p) => p.id === id);
    if (!existing) return fail('not_found');
    const error = validateProduct(input, id);
    if (error) return fail(error.code, error.message);
    const product = buildProduct(input, existing);
    products = products.map((p) => (p.id === id ? product : p));
    return respond(view(product));
  },

  updateProductPrice(id, price) {
    const existing = products.find((p) => p.id === id);
    if (!existing) return fail('not_found');
    if (!Number.isInteger(price) || price <= 0) return fail('validation', 'Үнэ буруу байна');
    const product = { ...existing, price };
    products = products.map((p) => (p.id === id ? product : p));
    return respond(view(product));
  },

  getPreorder(id) {
    const product = products.find((p) => p.id === id);
    if (!product?.preorder) return fail('not_found');
    const related = orders
      .filter((o) => o.status !== 'cancelled' && o.items.some((i) => i.productId === id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const paid = related.filter((o) => o.status === 'paid');
    const names: (string | null)[] = product.variants.length ? product.variants.map((v) => v.name) : [null];
    for (const o of related) {
      for (const i of o.items) if (i.productId === id && !names.includes(i.variantName)) names.push(i.variantName);
    }
    return respond({
      product: view(product),
      tally: names.map((variantName) => ({
        variantName,
        ordered: unitsOf(id, related, variantName),
        paid: unitsOf(id, paid, variantName),
      })),
      orders: related,
    });
  },

  setPreorderStatus(id, status) {
    const product = products.find((p) => p.id === id);
    if (!product?.preorder) return fail('not_found');
    if (!PREORDER_TRANSITIONS[product.preorder.status].includes(status)) {
      return fail('conflict', 'Энэ төлөв рүү шилжүүлэх боломжгүй');
    }
    const updated = { ...product, preorder: { ...product.preorder, status } };
    products = products.map((p) => (p.id === id ? updated : p));
    return respond(view(updated));
  },

  deleteProduct(id) {
    products = products.filter((p) => p.id !== id);
    return respond(undefined);
  },

  getReport(range) {
    const selected = orders.filter((o) => inRange(o.createdAt, range));
    const paid = selected.filter((o) => o.status === 'paid');

    const channelCounts = new Map<Channel, number>();
    const productTotals = new Map<string, ReportSummary['topProducts'][number]>();
    for (const order of paid) {
      channelCounts.set(order.channel, (channelCounts.get(order.channel) ?? 0) + 1);
      for (const item of order.items) {
        const entry = productTotals.get(item.productId) ?? {
          productId: item.productId,
          name: item.productName,
          quantity: 0,
          revenue: 0,
        };
        entry.quantity += item.quantity;
        entry.revenue += item.quantity * item.unitPrice;
        productTotals.set(item.productId, entry);
      }
    }

    const summary: ReportSummary = {
      ...range,
      revenue: paid.reduce((sum, o) => sum + o.total, 0),
      paidCount: paid.length,
      awaitingCount: selected.filter((o) => o.status === 'awaiting_payment').length,
      unmatchedPaymentCount: unmatchedPayments.filter((at) => inRange(at, range)).length,
      byChannel: [...channelCounts]
        .map(([channel, count]) => ({ channel, count }))
        .sort((a, b) => b.count - a.count),
      topProducts: [...productTotals.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    };
    return respond(summary);
  },

  listOrders(range) {
    return respond(orders.filter((o) => inRange(o.createdAt, range)));
  },

  getReviewSummary: review.getReviewSummary,
  listReviewCases: review.listReviewCases,
  getReviewCase: review.getReviewCase,
  searchCaseCandidates: review.searchCaseCandidates,
  resolveCase: review.resolveCase,
  contactBuyer: review.contactBuyer,
  markRefunded: review.markRefunded,
  reopenCase: review.reopenCase,

  changePassword(currentPassword, newPassword) {
    if (currentPassword !== mockPassword) return fail('validation', 'Одоогийн нууц үг буруу байна');
    if (newPassword.length < 8) return fail('validation', 'Шинэ нууц үг 8-аас дээш тэмдэгттэй байна');
    mockPassword = newPassword;
    return respond(undefined);
  },

  requestPasswordReset(phone) {
    // Same answer for any number, so the endpoint doesn't reveal which accounts exist.
    return respond({ sentTo: `+976 ${phone.slice(0, 2)}** **${phone.slice(-2)}` });
  },

  confirmPasswordReset(phone, code, newPassword) {
    if (phone !== TEST_ACCOUNT.phone || code !== DEMO_RESET_CODE) {
      return fail('validation', 'Код буруу эсвэл хугацаа нь дууссан байна');
    }
    if (newPassword.length < 8) return fail('validation', 'Шинэ нууц үг 8-аас дээш тэмдэгттэй байна');
    mockPassword = newPassword;
    return respond(undefined);
  },

  getShopSettings() {
    return respond(shopSettings);
  },

  updateBankAccount(account) {
    const accountNumber = account.accountNumber.replace(/\s/g, '').toUpperCase();
    if (!account.bank.trim() || !account.accountHolder.trim()) return fail('validation');
    if (!/^(MN\d{18}|\d{8,20})$/.test(accountNumber)) {
      return fail('validation', 'Дансны дугаар буруу байна');
    }
    shopSettings = {
      bankAccount: { bank: account.bank.trim(), accountNumber, accountHolder: account.accountHolder.trim() },
    };
    return respond(shopSettings);
  },

  searchOrders({ view, q, from, to, cursor, limit = 50 }) {
    const needle = q?.trim().toLowerCase() ?? '';
    const matches = orders.filter(o => (!from || o.createdAt >= from) && (!to || o.createdAt < to))
      .filter((o) =>
        view === 'all' ? true : view === 'awaiting_payment' || view === 'needs_review' ? o.status === view : view === 'cancelled'
          ? o.status === 'cancelled'
          : o.status === 'paid' && (view === 'fulfilled') === (o.fulfilledAt !== null),
      )
      .filter(
        (o) =>
          !needle ||
          o.code.includes(needle) ||
          o.customerName.toLowerCase().includes(needle) ||
          (o.customerPhone ?? '').includes(needle) ||
          o.items.some((i) => i.productName.toLowerCase().includes(needle)),
      )
      .sort((a, b) =>
        view === 'to_fulfill'
          ? (a.paidAt ?? '').localeCompare(b.paidAt ?? '')
          : view === 'fulfilled'
            ? (b.fulfilledAt ?? '').localeCompare(a.fulfilledAt ?? '')
            : (b.cancelledAt ?? '').localeCompare(a.cancelledAt ?? ''),
      );
    const offset = cursor ? Number(cursor) : 0;
    const page = matches.slice(offset, offset + limit);
    return respond({
      orders: page,
      total: matches.length,
      nextCursor: offset + limit < matches.length ? String(offset + limit) : null,
    });
  },

  getOrder(id) {
    const order = orders.find((o) => o.id === id);
    return order ? respond(order) : fail('not_found');
  },

  updateOrder(id, update) {
    const order = orders.find((o) => o.id === id);
    if (!order) return fail('not_found');
    if (update.customerPhone != null && !/^\d{8}$/.test(update.customerPhone)) {
      return fail('validation', 'Утасны дугаар 8 оронтой байна');
    }
    if (update.itemVariants) {
      if (update.itemVariants.length !== order.items.length) return fail('validation');
      for (const [i, variant] of update.itemVariants.entries()) {
        const product = products.find((p) => p.id === order.items[i].productId);
        if (product?.variants.length && !product.variants.some((v) => v.name === variant)) {
          return fail('validation', 'Ийм хэмжээ, төрөл алга');
        }
      }
      order.items = order.items.map((item, i) => ({ ...item, variantName: update.itemVariants![i] }));
    }
    if (update.customerPhone !== undefined) order.customerPhone = update.customerPhone;
    if (update.deliveryAddress !== undefined) order.deliveryAddress = update.deliveryAddress?.trim() || null;
    if (update.sellerNote !== undefined) order.sellerNote = update.sellerNote?.trim() || null;
    return respond(order);
  },

  setOrdersFulfilled(orderIds, fulfilled) {
    const selected = orders.filter((o) => orderIds.includes(o.id));
    if (selected.length !== orderIds.length) return fail('not_found');
    if (selected.some((o) => o.status !== 'paid')) {
      return fail('conflict', 'Зөвхөн төлөгдсөн захиалгыг хүргэсэн болгоно');
    }
    const at = new Date().toISOString();
    for (const o of selected) o.fulfilledAt = fulfilled ? (o.fulfilledAt ?? at) : null;
    return respond(selected);
  },

  cancelOrder(id, reason) {
    const order = orders.find((o) => o.id === id);
    if (!order) return fail('not_found');
    if (order.status === 'cancelled') return fail('conflict', 'Аль хэдийн цуцалсан байна');
    if (order.status === 'needs_review') {
      return fail('conflict', 'Энэ захиалгын төлбөрийг эхлээд “Шалгах” хэсэгт шийдвэрлэнэ үү');
    }
    order.status = 'cancelled';
    order.fulfilledAt = null;
    order.cancelledAt = new Date().toISOString();
    order.cancelReason = reason?.trim() || null;
    return respond(order);
  },

  restoreOrder(id) {
    const order = orders.find((o) => o.id === id);
    if (!order) return fail('not_found');
    if (order.status !== 'cancelled') return fail('conflict', 'Цуцлагдаагүй захиалга байна');
    order.status = order.paidAt ? 'paid' : 'awaiting_payment';
    order.cancelledAt = null;
    order.cancelReason = null;
    return respond(order);
  },

  rotateSmsToken() {
    return Promise.resolve({ token: "demo-token-not-valid-on-the-backend", webhookUrl: "https://example.invalid/hooks/sms/demo/raw" });
  },
  getIntegrations() {
    return respond(integrations);
  },

  connectMeta(platform: MetaPlatform) {
    // The real flow goes through Meta's OAuth consent screen during onboarding.
    integrations = {
      ...integrations,
      [platform]: {
        connected: true,
        accountName: platform === 'instagram' ? '@hokage.shop' : 'Hokage Shop',
        connectedAt: new Date().toISOString(),
      },
    };
    return respond({ authUrl: null });
  },

  disconnectMeta(platform: MetaPlatform) {
    integrations = {
      ...integrations,
      [platform]: { connected: false, accountName: null, connectedAt: null },
    };
    return respond(integrations);
  },

  configureChatbotWebhook() {
    integrations = { ...integrations, chatbot: { connected: true } };
    return respond({ connected: true });
  },

  disconnectChatbotWebhook() {
    integrations = { ...integrations, chatbot: { connected: false } };
    return respond(undefined);
  },
};
