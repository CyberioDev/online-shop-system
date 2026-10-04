/**
 * Demo data and logic for payment review (шалгах). Seeds one case for each kind
 * of discrepancy and scores payment ↔ order matches the way the backend should.
 */
import { fail, newId, respond } from './mock-utils';
import type {
  BankPayment,
  CaseResolution,
  Channel,
  DifferenceAction,
  MatchCandidate,
  MatchSignal,
  Order,
  OrderItem,
  Product,
  ResolveCaseInput,
  ReviewCase,
  ReviewReason,
} from './types';

import { formatNumber } from '@/lib/format';

type StoredCase = Omit<ReviewCase, 'suggestion' | 'candidates'> & {
  suggestionOrderId: string | null;
  /** Order fields changed by the resolution, restored on reopen. */
  undo: { orderId: string; status: Order['status']; paidAt: string | null; matchedBy: Order['matchedBy'] }[];
};

const MINUTE = 60_000;

export function createReviewMock(orders: Order[], products: Product[], now: Date) {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * MINUTE).toISOString();

  // ---------- Seed orders ----------

  const product = (name: string) => products.find((p) => p.name === name)!;
  const item = (name: string, variantName: string | null, quantity: number): OrderItem => {
    const p = product(name);
    return { productId: p.id, productName: p.name, variantName, quantity, unitPrice: p.price };
  };
  const order = (
    customerName: string,
    channel: Channel,
    code: string,
    items: OrderItem[],
    createdMinutesAgo: number,
    status: Order['status'],
    paidMinutesAgo: number | null = null,
    matchedBy: Order['matchedBy'] = null,
  ): Order => {
    const o: Order = {
      id: newId('ord'),
      code,
      customerName,
      channel,
      items,
      total: items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
      status,
      createdAt: ago(createdMinutesAgo),
      paidAt: paidMinutesAgo === null ? null : ago(paidMinutesAgo),
      matchedBy,
    };
    orders.push(o);
    return o;
  };

  const bold = order('Болд', 'messenger', '4827', [item('Хар цамц', 'L', 2), item('Цагаан малгай', null, 1)], 32, 'needs_review');
  order('Оюука', 'instagram', '5163', [item('Нүүрний тос', null, 2)], 130, 'awaiting_payment');
  order('Тэмүүлэн', 'facebook', '7702', [item('Нүүрний тос', null, 2)], 26 * 60, 'awaiting_payment');
  order('Мөнхөө', 'messenger', '3398', [item('Хар цамц', 'M', 1), item('Цагаан малгай', null, 1)], 25, 'awaiting_payment');
  const saraa = order('Сараа', 'instagram', '3315', [item('Хар цамц', 'M', 1)], 70, 'needs_review');
  const ganbat = order('Ганбат', 'live', '6120', [item('Цагаан пүүз', '39', 1)], 55, 'needs_review');
  const nomin = order('Номин', 'messenger', '2290', [item('Цагаан малгай', null, 1)], 300, 'paid', 290, 'auto');
  const khulan = order('Хулан', 'instagram', '8841', [item('Ноосон ороолт', 'Саарал', 1)], 180, 'awaiting_payment');
  const anujin = order('Анужин', 'messenger', '1457', [item('Хар цамц', 'S', 1)], 360, 'paid', 350, 'manual');
  const zolzaya = order('Золзаяа', 'live', '9034', [item('Ноосон ороолт', 'Бор', 1)], 420, 'paid', 410, 'manual');
  orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // ---------- Seed payments & cases ----------

  const payment = (amount: number, senderName: string, note: string, minutesAgo: number): BankPayment => {
    const receivedAt = ago(minutesAgo);
    const time = new Date(receivedAt);
    const hhmm = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
    return {
      id: newId('pay'),
      amount,
      senderName,
      note,
      bank: 'Хаан банк',
      receivedAt,
      rawMessage: `KHANBANK: ${hhmm} dansand ${formatNumber(amount)}.00MNT orlogo orloo. Ilgeegch: ${senderName}. Utga: ${note || '-'}`,
    };
  };

  const stored: StoredCase[] = [];
  const addCase = (
    p: BankPayment,
    reason: ReviewReason,
    suggestion: Order | null,
    extra: Partial<StoredCase> = {},
  ) => {
    stored.push({
      id: newId('case'),
      payment: p,
      reason,
      status: 'open',
      suggestionOrderId: suggestion?.id ?? null,
      contact: null,
      refund: null,
      resolution: null,
      note: null,
      undo: [],
      ...extra,
    });
  };

  addCase(payment(87_000, 'БОЛДБААТАР Г.', '4872 tsamts', 20), 'code_typo', bold);
  addCase(payment(50_000, 'ОЮУНЧИМЭГ Д.', 'tulbur', 15), 'no_code', null);
  addCase(payment(40_000, 'САРАНТУЯА Б.', '3315', 60), 'amount_mismatch', saraa);
  addCase(payment(80_000, 'ГАНБАТ Т.', '6120 puuz', 45), 'amount_mismatch', ganbat);
  addCase(payment(17_000, 'НОМИН Э.', '2290', 40), 'duplicate', nomin);
  addCase(payment(45_000, 'ХУЛАН Б.', '', 160), 'no_code', null, {
    status: 'waiting_buyer',
    contact: {
      orderId: khulan.id,
      customerName: khulan.customerName,
      message: 'Сайн байна уу! 45,000₮ шилжүүлсэн нь та мөн үү? Захиалгын кодоо бичнэ үү.',
      sentAt: ago(150),
    },
  });
  addCase(payment(45_000, 'АНУЖИН С.', '1457', 350), 'amount_mismatch', anujin, {
    status: 'resolved',
    refund: { amount: 10_000, status: 'pending', doneAt: null },
    resolution: matched(anujin, 10_000, 'refund', ago(340)),
  });
  addCase(payment(45_000, 'ЗОЛЗАЯА Н.', '9043', 410), 'code_typo', zolzaya, {
    status: 'resolved',
    resolution: matched(zolzaya, 0, null, ago(400)),
  });
  addCase(payment(120_000, 'ЭНХБАЯР Д.', 'zeel', 26 * 60), 'no_code', null, {
    status: 'resolved',
    resolution: { kind: 'no_order', category: 'other_income', resolvedAt: ago(25 * 60) },
    note: 'Ахын буцаасан зээл',
  });

  function matched(
    o: Order,
    difference: number,
    differenceAction: Extract<CaseResolution, { kind: 'matched' }>['differenceAction'],
    resolvedAt: string,
  ): CaseResolution {
    return {
      kind: 'matched',
      orderId: o.id,
      orderCode: o.code,
      customerName: o.customerName,
      difference,
      differenceAction,
      resolvedAt,
    };
  }

  // ---------- Scoring ----------

  const view = (c: StoredCase): ReviewCase => {
    const suggested = orders.find((o) => o.id === c.suggestionOrderId);
    return {
      id: c.id,
      payment: c.payment,
      reason: c.reason,
      status: c.status,
      contact: c.contact,
      refund: c.refund,
      resolution: c.resolution,
      note: c.note,
      suggestion: suggested ? evaluate(c.payment, suggested).candidate : null,
      candidates: findCandidates(c.payment, '', c.suggestionOrderId),
    };
  };

  function findCandidates(p: BankPayment, query: string, excludeId: string | null): MatchCandidate[] {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const windowStart = new Date(p.receivedAt).getTime() - 3 * 24 * 60 * MINUTE;

    return orders
      .filter((o) => o.id !== excludeId)
      .filter((o) =>
        q
          ? o.customerName.toLowerCase().includes(q) ||
            (digits.length > 0 && (o.code.includes(digits) || String(o.total).startsWith(digits)))
          : o.status !== 'paid' && new Date(o.createdAt).getTime() >= windowStart,
      )
      .map((o) => evaluate(p, o))
      .filter((scored) => q !== '' || scored.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, q ? 8 : 4)
      .map((scored) => scored.candidate);
  }

  // ---------- Client methods ----------

  const find = (id: string) => stored.find((c) => c.id === id);

  const releaseFlaggedOrder = (c: StoredCase, keepId: string | null) => {
    const flagged = orders.find((o) => o.id === c.suggestionOrderId);
    if (flagged && flagged.id !== keepId && flagged.status === 'needs_review') {
      c.undo.push({ orderId: flagged.id, status: flagged.status, paidAt: flagged.paidAt, matchedBy: flagged.matchedBy });
      flagged.status = 'awaiting_payment';
    }
  };

  return {
    openCount: () => stored.filter((c) => c.status === 'open').length,

    getReviewSummary() {
      return respond({
        open: stored.filter((c) => c.status === 'open').length,
        waiting: stored.filter((c) => c.status === 'waiting_buyer').length,
        refundsPending: stored.filter((c) => c.refund?.status === 'pending').length,
      });
    },

    listReviewCases() {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * MINUTE).toISOString();
      return respond(
        stored
          .filter((c) => c.status !== 'resolved' || (c.resolution?.resolvedAt ?? '') >= weekAgo)
          .sort((a, b) => b.payment.receivedAt.localeCompare(a.payment.receivedAt))
          .map(view),
      );
    },

    getReviewCase(id: string) {
      const c = find(id);
      return c ? respond(view(c)) : fail('not_found');
    },

    searchCaseCandidates(id: string, query: string) {
      const c = find(id);
      return c ? respond(findCandidates(c.payment, query, null)) : fail('not_found');
    },

    resolveCase(id: string, input: ResolveCaseInput) {
      const c = find(id);
      if (!c) return fail('not_found');
      if (c.status === 'resolved') return fail('conflict', 'Аль хэдийн шийдвэрлэсэн байна');
      const resolvedAt = new Date().toISOString();

      if (input.kind === 'matched') {
        const o = orders.find((x) => x.id === input.orderId);
        if (!o) return fail('not_found');
        if (o.status === 'paid') return fail('conflict', 'Энэ захиалга аль хэдийн төлөгдсөн байна');
        const difference = c.payment.amount - o.total;
        const allowed: (DifferenceAction | null)[] =
          difference > 0 ? ['refund', 'keep'] : difference < 0 ? ['accept_short'] : [null];
        if (!allowed.includes(input.differenceAction)) {
          return fail('validation', 'Дүнгийн зөрүүг яах вэ гэдгээ сонгоно уу');
        }
        releaseFlaggedOrder(c, o.id);
        c.undo.push({ orderId: o.id, status: o.status, paidAt: o.paidAt, matchedBy: o.matchedBy });
        o.status = 'paid';
        o.paidAt = c.payment.receivedAt;
        o.matchedBy = 'manual';
        c.resolution = matched(o, difference, input.differenceAction, resolvedAt);
        c.refund =
          input.differenceAction === 'refund'
            ? { amount: difference, status: 'pending', doneAt: null }
            : null;
      } else {
        releaseFlaggedOrder(c, null);
        c.resolution = { kind: 'no_order', category: input.category, resolvedAt };
        c.refund =
          input.category === 'refund'
            ? { amount: c.payment.amount, status: 'pending', doneAt: null }
            : null;
      }
      c.status = 'resolved';
      c.note = input.note ?? c.note;
      return respond(view(c));
    },

    contactBuyer(id: string, orderId: string, message: string) {
      const c = find(id);
      const o = orders.find((x) => x.id === orderId);
      if (!c || !o) return fail('not_found');
      if (!message.trim()) return fail('validation', 'Мессежээ бичнэ үү');
      c.contact = { orderId, customerName: o.customerName, message: message.trim(), sentAt: new Date().toISOString() };
      if (c.status === 'open') c.status = 'waiting_buyer';
      return respond(view(c));
    },

    markRefunded(id: string) {
      const c = find(id);
      if (!c?.refund) return fail('not_found');
      c.refund = { ...c.refund, status: 'done', doneAt: new Date().toISOString() };
      return respond(view(c));
    },

    reopenCase(id: string) {
      const c = find(id);
      if (!c) return fail('not_found');
      if (c.refund?.status === 'done') {
        return fail('conflict', 'Буцаалт хийгдсэн тул дахин нээх боломжгүй');
      }
      for (const change of c.undo.reverse()) {
        const o = orders.find((x) => x.id === change.orderId);
        if (o) Object.assign(o, { status: change.status, paidAt: change.paidAt, matchedBy: change.matchedBy });
      }
      c.undo = [];
      c.resolution = null;
      c.refund = null;
      c.status = c.contact ? 'waiting_buyer' : 'open';
      return respond(view(c));
    },
  };
}

// ---------- Match evaluation ----------

/** Longest word of a bank sender name, lowercased: "Х. ХУЛАН" → "хулан". */
const mainName = (name: string) =>
  name
    .toLowerCase()
    .split(/[\s.\-]+/)
    .reduce((a, b) => (b.length > a.length ? b : a), '');

function nameMatch(sender: string, customer: string): 'same' | 'similar' | 'none' {
  const s = mainName(sender);
  const c = mainName(customer);
  if (c.length >= 3 && s.startsWith(c)) return 'same';
  let common = 0;
  while (common < Math.min(s.length, c.length) && s[common] === c[common]) common++;
  return common >= 3 ? 'similar' : 'none';
}

/** One wrong digit or two swapped neighbours: "4872" vs "4827". */
function isNearCode(a: string, b: string) {
  if (a.length !== b.length) return false;
  const diff = [...a].map((ch, i) => (ch !== b[i] ? i : -1)).filter((i) => i >= 0);
  if (diff.length === 1) return true;
  return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
}

function formatDelay(minutes: number) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} минутын`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} цагийн`;
  return `${Math.round(minutes / (24 * 60))} өдрийн`;
}

function evaluate(p: BankPayment, o: Order): { score: number; candidate: MatchCandidate } {
  const signals: MatchSignal[] = [];
  const hints: string[] = [];
  let score = 0;

  // Amount
  const diff = p.amount - o.total;
  if (diff === 0) {
    signals.push({ level: 'ok', text: 'Дүн яг ижил' });
    score += 3;
  } else {
    const text = `${formatNumber(Math.abs(diff))}₮ ${diff > 0 ? 'илүү' : 'дутуу'} төлсөн`;
    signals.push({ level: 'warn', text: `Дүн зөрүүтэй: ${text}` });
    hints.push(`дүн ${formatNumber(Math.abs(diff))}₮ зөрүүтэй`);
    score += Math.abs(diff) / o.total <= 0.15 ? 1 : -2;
  }

  // Sender name
  const name = nameMatch(p.senderName, o.customerName);
  if (name === 'same') {
    signals.push({ level: 'ok', text: 'Илгээгчийн нэр таарч байна' });
    hints.unshift('нэр таарсан');
    score += 2;
  } else if (name === 'similar') {
    signals.push({ level: 'ok', text: 'Илгээгчийн нэр төстэй' });
    hints.unshift('нэр төстэй');
    score += 1;
  } else {
    signals.push({ level: 'warn', text: 'Илгээгчийн нэр өөр' });
  }

  // Timing
  const minutes = (new Date(p.receivedAt).getTime() - new Date(o.createdAt).getTime()) / MINUTE;
  if (minutes < 0) {
    signals.push({ level: 'bad', text: 'Захиалгаас өмнө төлсөн' });
    score -= 3;
  } else {
    const ok = minutes <= 180;
    signals.push({ level: ok ? 'ok' : 'warn', text: `Захиалгаас ${formatDelay(minutes)} дараа төлсөн` });
    if (ok) score += 1;
  }

  // Order code in the transaction note
  const codes: string[] = p.note.match(/\d{4}/g) ?? [];
  const near = codes.find((code) => isNearCode(code, o.code));
  if (codes.includes(o.code)) {
    signals.push({ level: 'ok', text: 'Код зөв бичигдсэн' });
    hints.unshift('код таарсан');
    score += 4;
  } else if (near) {
    signals.push({ level: 'warn', text: `Код буруу бичигдсэн: ${near} → ${o.code}` });
    hints.unshift('код ойролцоо');
    score += 2;
  } else if (codes.length === 0) {
    signals.push({ level: 'warn', text: 'Гүйлгээний утгад код алга' });
  } else {
    signals.push({ level: 'bad', text: `Өөр код бичсэн: ${codes[0]}` });
    score -= 1;
  }

  if (o.status === 'paid') {
    signals.push({ level: 'bad', text: 'Энэ захиалга аль хэдийн төлөгдсөн' });
    hints.unshift('аль хэдийн төлөгдсөн');
    score -= 2;
  }

  return { score, candidate: { order: o, signals, summary: hints.slice(0, 2).join(' · ') } };
}
