import { saveFile } from './save-file';
import { buildXlsx, type Cell } from './xlsx';

import { api, type Order, type OrderView, type ListQuery } from '@/api';
import { formatDateTime, toDayKey } from '@/lib/format';
import { CHANNEL_LABELS, describeItems, orderStatusLabel } from '@/lib/labels';

export const ORDER_VIEW_LABELS: Record<OrderView, string> = {
  all: 'Бүгд', awaiting_payment: 'Төлбөр хүлээж буй', needs_review: 'Шалгах',
  to_fulfill: 'Хүргэх',
  fulfilled: 'Хүргэсэн',
  cancelled: 'Цуцалсан',
};

const HEADER = [
  'Захиалгын код',
  'Захиалсан',
  'Төлсөн',
  'Харилцагч',
  'Утас',
  'Хүргэлтийн хаяг',
  'Суваг',
  'Бараа',
  'Тоо ширхэг',
  'Дүн (₮)',
  'Төлөв',
  'Хүргэсэн',
  'Тэмдэглэл',
];

const dateOrNull = (iso: string | null) => (iso ? formatDateTime(new Date(iso)) : null);

function row(order: Order): Cell[] {
  return [
    order.code,
    formatDateTime(new Date(order.createdAt)),
    dateOrNull(order.paidAt),
    order.customerName,
    order.customerPhone,
    order.deliveryAddress,
    CHANNEL_LABELS[order.channel],
    describeItems(order),
    order.items.reduce((sum, item) => sum + item.quantity, 0),
    order.total,
    order.status === 'cancelled'
      ? `Цуцалсан${order.cancelReason ? `: ${order.cancelReason}` : ''}`
      : orderStatusLabel(order),
    dateOrNull(order.fulfilledAt),
    order.sellerNote,
  ];
}

/** Downloads every order in a view (all pages), e.g. as a delivery list. */
export async function exportOrderView(view: OrderView, q: string, range: ListQuery = {}) {
  const orders: Order[] = [];
  let cursor: string | null = null;
  do {
    const page = await api.searchOrders({ ...range, view, q: q || undefined, cursor, limit: 200 });
    orders.push(...page.orders);
    cursor = page.nextCursor;
  } while (cursor);

  const bytes = buildXlsx([
    { name: ORDER_VIEW_LABELS[view], header: HEADER, rows: orders.map(row), numberColumns: [9] },
  ]);
  await saveFile(
    `orders_${view}_${toDayKey(new Date())}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes,
  );
  return orders.length;
}
