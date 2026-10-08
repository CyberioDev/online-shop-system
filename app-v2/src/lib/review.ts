import { router } from 'expo-router';

import { api, type MatchCandidate, type ReviewCase } from '@/api';
import { formatMoney, formatTime } from '@/lib/format';

/** payment − order total for a candidate; positive = overpaid. */
export const differenceOf = (c: ReviewCase, candidate: MatchCandidate) =>
  c.payment.amount - candidate.order.total;

/** Short chip label for why a case needs review. */
export function reasonLabel(c: ReviewCase) {
  switch (c.reason) {
    case 'code_typo':
      return 'Код буруу';
    case 'no_code':
      return 'Код алга';
    case 'duplicate':
      return 'Давхар төлбөр';
    case 'amount_mismatch': {
      if (!c.suggestion) return 'Дүн зөрүүтэй';
      const diff = differenceOf(c, c.suggestion);
      return `${formatMoney(Math.abs(diff))} ${diff > 0 ? 'илүү' : 'дутуу'}`;
    }
  }
}

/** One-line explanation shown under the question on the case screen. */
export function reasonDescription(c: ReviewCase) {
  switch (c.reason) {
    case 'code_typo':
      return 'Гүйлгээний утган дахь код аль ч захиалгатай яг таарахгүй байна.';
    case 'no_code':
      return c.suggestion
        ? 'Гүйлгээний утгад захиалгын код бичээгүй байна.'
        : 'Код бичээгүй, нэр нь ч шууд таарахгүй байна.';
    case 'amount_mismatch':
      return 'Код таарч байгаа ч шилжүүлсэн дүн захиалгын дүнтэй зөрүүтэй байна.';
    case 'duplicate':
      return 'Энэ захиалга өмнө нь төлөгдсөн. Давхар шилжүүлсэн байж магадгүй.';
  }
}

export function resolutionLabel(c: ReviewCase) {
  const r = c.resolution;
  if (!r) return '';
  if (r.kind === 'no_order') {
    return r.category === 'refund' ? 'Захиалгагүй · Буцаан олгох' : 'Захиалгагүй · Бусад орлого';
  }
  return `${r.customerName} · ${r.orderCode} захиалгад тулгасан`;
}

/** Default chatbot message for asking a buyer about a payment. */
export function verifyMessage(c: ReviewCase, candidate: MatchCandidate) {
  const { order } = candidate;
  const p = c.payment;
  const at = `${formatTime(new Date(p.receivedAt))}-д`;
  const amount = formatMoney(p.amount);
  const hello = `Сайн байна уу, ${order.customerName}!`;
  const diff = differenceOf(c, candidate);

  if (c.reason === 'duplicate') {
    return `${hello} Таны ${order.code} захиалгын төлбөр өмнө нь орсон байсан бөгөөд ${at} дахин ${amount} орж ирлээ. Андуурч давхар шилжүүлсэн бол буцааж өгье.`;
  }
  if (diff > 0) {
    return `${hello} ${at} ${amount} шилжүүлсэн нь ${order.code} захиалгын дүнгээс (${formatMoney(order.total)}) ${formatMoney(diff)} илүү байна. Илүү төлбөрийг буцааж өгөх үү?`;
  }
  if (c.reason === 'code_typo' && p.note) {
    return `${hello} ${at} ${amount} шилжүүлсэн гүйлгээний утга дээр «${p.note}» гэж бичигдсэн байна. Таны захиалгын код ${order.code} мөн үү?`;
  }
  return `${hello} ${at} ${p.senderName} нэрээс ${amount} шилжүүлсэн нь таны ${order.code} захиалгын төлбөр мөн үү?`;
}

/** Chatbot message asking an underpaying buyer for the rest. */
export function remainingMessage(c: ReviewCase, candidate: MatchCandidate) {
  const { order } = candidate;
  const remaining = order.total - c.payment.amount;
  return `Сайн байна уу, ${order.customerName}! Таны ${order.code} захиалгын ${formatMoney(c.payment.amount)} төлбөр орж ирлээ. Нийт дүн ${formatMoney(order.total)} тул үлдэгдэл ${formatMoney(remaining)}-ийг гүйлгээний утга дээр ${order.code} гэж бичээд шилжүүлнэ үү.`;
}

/**
 * Opens the step-through review screen over all open cases, starting at
 * `startId` (or the first one). Goes to the inbox when nothing is open.
 */
export async function startReview(startId?: string, { replace = false } = {}) {
  const cases = await api.listReviewCases();
  const queue = cases.filter((c) => c.status === 'open').map((c) => c.id);
  const id = startId ?? queue[0];
  const navigate = replace ? router.replace : router.push;
  if (!id) {
    navigate('/review');
    return;
  }
  if (!queue.includes(id)) queue.unshift(id);
  navigate({ pathname: '/review/[id]', params: { id, queue: queue.join(',') } });
}

/** Opens one case on its own (no queue), e.g. a waiting or resolved case. */
export function openCase(id: string) {
  router.push({ pathname: '/review/[id]', params: { id } });
}
