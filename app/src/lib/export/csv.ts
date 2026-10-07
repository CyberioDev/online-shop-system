import type { Cell } from './xlsx';

/**
 * CSV with a UTF-8 byte order mark so Excel detects the encoding and shows
 * Cyrillic text correctly. Uses CRLF line endings per RFC 4180.
 */
export function buildCsv(header: string[], rows: Cell[][]): string {
  const escape = (value: Cell) => {
    if (value === null) return '';
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [header, ...rows].map((row) => row.map(escape).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
