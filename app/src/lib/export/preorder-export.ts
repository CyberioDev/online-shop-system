import { saveFile } from './save-file';
import { buildXlsx, type Cell } from './xlsx';

import type { PreorderDetail } from '@/api';
import { formatDateTime, toDayKey } from '@/lib/format';
import { CHANNEL_LABELS, orderStatusLabel } from '@/lib/labels';

/**
 * Excel file for placing the bulk order: a per-size summary sheet and a sheet
 * listing every buyer, so arrivals can be handed out.
 */
export async function exportPreorder(detail: PreorderDetail) {
  const { product, tally, orders } = detail;

  const summary: Cell[][] = tally.map((row) => [
    row.variantName ?? '—',
    row.ordered,
    row.paid,
    row.ordered - row.paid,
  ]);
  const totals = tally.reduce(
    (acc, row) => ({ ordered: acc.ordered + row.ordered, paid: acc.paid + row.paid }),
    { ordered: 0, paid: 0 },
  );
  summary.push(['Нийт', totals.ordered, totals.paid, totals.ordered - totals.paid]);

  const buyers: Cell[][] = orders.flatMap((order) =>
    order.items
      .filter((item) => item.productId === product.id)
      .map((item) => [
        formatDateTime(new Date(order.createdAt)),
        order.code,
        order.customerName,
        CHANNEL_LABELS[order.channel],
        item.variantName,
        item.quantity,
        item.quantity * item.unitPrice,
        orderStatusLabel(order),
      ]),
  );

  const bytes = buildXlsx([
    {
      name: 'Бөөний захиалга',
      header: ['Хэмжээ / төрөл', 'Захиалсан (ш)', 'Төлсөн (ш)', 'Төлбөр хүлээж буй (ш)'],
      rows: summary,
    },
    {
      name: 'Захиалагчид',
      header: ['Огноо', 'Захиалгын код', 'Харилцагч', 'Суваг', 'Хэмжээ / төрөл', 'Тоо', 'Дүн (₮)', 'Төлөв'],
      rows: buyers,
      numberColumns: [6],
    },
  ]);
  await saveFile(
    `preorder_${product.code}_${toDayKey(new Date())}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes,
  );
}
