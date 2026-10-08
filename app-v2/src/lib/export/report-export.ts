import { buildCsv } from './csv';
import { saveFile } from './save-file';
import { buildXlsx, type Cell, type Sheet } from './xlsx';

import type { DateRange, Order } from '@/api';
import { formatDateTime } from '@/lib/format';
import { CHANNEL_LABELS, describeItems, orderStatusLabel } from '@/lib/labels';

export type ExportFormat = 'xlsx' | 'csv';

const ORDER_HEADER = [
  'Огноо',
  'Захиалгын код',
  'Харилцагч',
  'Суваг',
  'Бараа',
  'Тоо ширхэг',
  'Дүн (₮)',
  'Төлөв',
  'Төлсөн огноо',
  'Тулгалт',
];

function orderRows(orders: Order[]): Cell[][] {
  return orders.map((order) => [
    formatDateTime(new Date(order.createdAt)),
    order.code,
    order.customerName,
    CHANNEL_LABELS[order.channel],
    describeItems(order),
    order.items.reduce((sum, item) => sum + item.quantity, 0),
    order.total,
    orderStatusLabel(order),
    order.paidAt ? formatDateTime(new Date(order.paidAt)) : null,
    order.matchedBy === 'auto' ? 'Автомат' : order.matchedBy === 'manual' ? 'Гараар' : null,
  ]);
}

/** Units sold and revenue per product/variant, from paid orders only. */
function productSheet(orders: Order[]): Sheet {
  const totals = new Map<string, { name: string; variant: string; quantity: number; revenue: number }>();
  for (const order of orders) {
    if (order.status !== 'paid') continue;
    for (const item of order.items) {
      const key = `${item.productId}\u0000${item.variantName ?? ''}`;
      const entry = totals.get(key) ?? {
        name: item.productName,
        variant: item.variantName ?? '',
        quantity: 0,
        revenue: 0,
      };
      entry.quantity += item.quantity;
      entry.revenue += item.quantity * item.unitPrice;
      totals.set(key, entry);
    }
  }
  const rows = [...totals.values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.variant.localeCompare(b.variant))
    .map((t) => [t.name, t.variant || null, t.quantity, t.revenue]);

  return {
    name: 'Бараа',
    header: ['Бараа', 'Хэмжээ / төрөл', 'Зарагдсан (ш)', 'Орлого (₮)'],
    rows,
    numberColumns: [3],
  };
}

export async function exportOrders(format: ExportFormat, range: DateRange, orders: Order[]) {
  const base = range.from === range.to ? `tulgagch_${range.from}` : `tulgagch_${range.from}_${range.to}`;

  if (format === 'csv') {
    await saveFile(`${base}.csv`, 'text/csv;charset=utf-8', buildCsv(ORDER_HEADER, orderRows(orders)));
    return;
  }

  const bytes = buildXlsx([
    { name: 'Захиалга', header: ORDER_HEADER, rows: orderRows(orders), numberColumns: [6] },
    productSheet(orders),
  ]);
  await saveFile(
    `${base}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes,
  );
}
