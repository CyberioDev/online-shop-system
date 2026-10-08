import type { Channel, Order, PreorderStatus, Product } from '@/api/types';

export const PREORDER_STATUS_LABELS: Record<PreorderStatus, string> = {
  open: 'Захиалга авч байна',
  closed: 'Захиалга хаасан',
  arrived: 'Бараа ирсэн',
};

/** Compact versions for narrow places like product cards. */
export const PREORDER_STATUS_SHORT: Record<PreorderStatus, string> = {
  open: 'Нээлттэй',
  closed: 'Хаагдсан',
  arrived: 'Ирсэн',
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  live: 'Шууд худалдаа',
  messenger: 'Messenger',
  instagram: 'Instagram',
  facebook: 'Facebook',
};

export function orderStatusLabel(order: Order) {
  switch (order.status) {
    case 'paid':
      return order.matchedBy === 'manual' ? 'Гараар баталгаажсан' : 'Автоматаар баталгаажсан';
    case 'awaiting_payment':
      return 'Төлбөр хүлээж байна';
    case 'needs_review':
      return 'Шалгах шаардлагатай';
    case 'cancelled':
      return 'Цуцалсан';
  }
}

/** "Хар цамц L × 2, Цагаан малгай × 1" */
export function describeItems(order: Order) {
  return order.items
    .map((item) => {
      const name = item.variantName ? `${item.productName} ${item.variantName}` : item.productName;
      return `${name} × ${item.quantity}`;
    })
    .join(', ');
}

export function totalStock(product: Product) {
  return product.variants.length > 0
    ? product.variants.reduce((sum, v) => sum + v.quantity, 0)
    : product.stock;
}

/** "Үлдэгдэл: S 4 · M 6 · L 2" style breakdown (without the label). */
export function describeStock(product: Product) {
  if (product.variants.length === 0) return `${product.stock} ш`;
  return product.variants.map((v) => `${v.name} ${v.quantity}`).join(' · ');
}
