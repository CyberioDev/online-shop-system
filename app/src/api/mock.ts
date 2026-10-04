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
  type Product,
  type ProductInput,
  type ReportSummary,
  type Session,
} from './types';

import { TEST_ACCOUNT } from '@/constants/config';
import { addDays, startOfDay, toDayKey } from '@/lib/format';

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
  seedProduct('154', 'custom', 'Хар цамц', 35_000, [['S', 4], ['M', 6], ['L', 2]]),
  seedProduct('287', 'auto', 'Цагаан малгай', 17_000, [], 10),
  seedProduct('309', 'auto', 'Цагаан пүүз', 89_000, [['38', 3], ['39', 4], ['40', 3]]),
  seedProduct('412', 'auto', 'Нүүрний тос', 25_000, [], 0),
  seedProduct('521', 'custom', 'Ноосон ороолт', 45_000, [['Саарал', 5], ['Бор', 3]]),
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
    name,
    price,
    imageUrl: null,
    variants: variants.map(([variantName, quantity]) => ({
      id: newId('var'),
      name: variantName,
      quantity,
    })),
    stock,
    createdAt: addDays(now, -60).toISOString(),
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
        const product = pick(products);
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

function validateProduct(input: ProductInput, ignoreId?: string): ApiError | null {
  if (!input.name.trim() || !(input.price > 0)) return new ApiError('validation');
  if (input.code !== null) {
    if (!/^\d{3}$/.test(input.code)) return new ApiError('validation', 'Код 3 оронтой тоо байна');
    if (products.some((p) => p.code === input.code && p.id !== ignoreId)) {
      return new ApiError('code_taken');
    }
  }
  return null;
}

function generateCode() {
  const taken = new Set(products.map((p) => p.code));
  const free: string[] = [];
  for (let n = 100; n <= 999; n++) if (!taken.has(String(n))) free.push(String(n));
  if (free.length === 0) throw new ApiError('validation', 'Чөлөөтэй код үлдсэнгүй');
  return free[Math.floor(Math.random() * free.length)];
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
    name: input.name.trim(),
    price: input.price,
    imageUrl: input.imageUrl,
    variants: input.variants.map((v) => ({
      id: base?.variants.find((existing) => existing.name === v.name)?.id ?? newId('var'),
      name: v.name.trim(),
      quantity: v.quantity,
    })),
    stock: input.variants.length ? 0 : input.stock,
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
    return respond([...products].sort((a, b) => a.code.localeCompare(b.code)));
  },

  getProduct(id) {
    const product = products.find((p) => p.id === id);
    return product ? respond(product) : fail('not_found');
  },

  createProduct(input) {
    const error = validateProduct(input);
    if (error) return fail(error.code, error.message);
    const product = buildProduct(input);
    products = [...products, product];
    return respond(product);
  },

  updateProduct(id, input) {
    const existing = products.find((p) => p.id === id);
    if (!existing) return fail('not_found');
    const error = validateProduct(input, id);
    if (error) return fail(error.code, error.message);
    const product = buildProduct(input, existing);
    products = products.map((p) => (p.id === id ? product : p));
    return respond(product);
  },

  updateProductPrice(id, price) {
    const existing = products.find((p) => p.id === id);
    if (!existing) return fail('not_found');
    if (!Number.isInteger(price) || price <= 0) return fail('validation', 'Үнэ буруу байна');
    const product = { ...existing, price };
    products = products.map((p) => (p.id === id ? product : p));
    return respond(product);
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
