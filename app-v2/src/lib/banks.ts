/** Banks a shop can receive transfers in (Mongolian commercial banks). */
export const BANKS = [
  'Хаан банк',
  'Голомт банк',
  'Худалдаа хөгжлийн банк',
  'Хас банк',
  'Төрийн банк',
  'Капитрон банк',
  'Богд банк',
  'Ариг банк',
  'Тээвэр хөгжлийн банк',
  'Үндэсний хөрөнгө оруулалтын банк',
  'Чингис хаан банк',
  'М банк',
];

/** Strips spaces and uppercases an "MN…" IBAN; returns null if it isn't a valid account number. */
export function normalizeAccountNumber(text: string) {
  const value = text.replace(/\s/g, '').toUpperCase();
  return /^(MN\d{18}|\d{8,20})$/.test(value) ? value : null;
}
