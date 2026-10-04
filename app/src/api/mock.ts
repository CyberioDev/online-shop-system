/**
 * In-memory implementation of the API used until the Go backend is connected.
 * Data is seeded deterministically relative to "now" so every screen has
 * something realistic to show. Changes are lost on reload.
 */
import { createReviewMock } from './mock-review';
import { fail, newId, respond } from './mock-utils';
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
} from './types';

import { TEST_ACCOUNT } from '@/constants/config';
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
seedPreorderOrders();

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
      });
    }
  }
  orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

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
};

// ---------- Helpers ----------

const inRange = (iso: string, range: DateRange) => {
  const day = toDayKey(new Date(iso));
  return day >= range.from && day <= range.to;
};

const lastEventAt = (order: Order) => order.paidAt ?? order.createdAt;

const unitsOf = (productId: string, list: Order[], variantName?: string | null) =>
  list.reduce(
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
    if (phone !== TEST_ACCOUNT.phone || password !== TEST_ACCOUNT.password) {
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
      .filter((o) => o.items.some((i) => i.productId === id))
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
};
