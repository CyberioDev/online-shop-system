/**
 * Minimal .xlsx writer: builds the Office Open XML parts by hand and zips them
 * with fflate. Supports multiple sheets, string/number cells, a bold frozen
 * header row and auto column widths — enough for report exports.
 */
import { strToU8, zipSync } from 'fflate';

export type Cell = string | number | null;

export type Sheet = {
  /** Max 31 characters; `[]:*?/\` are stripped. */
  name: string;
  header: string[];
  rows: Cell[][];
  /** Column indexes formatted with thousands separators (e.g. money). */
  numberColumns?: number[];
};

const STYLE_HEADER = 1;
const STYLE_THOUSANDS = 2;

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes(sheets.length)),
    '_rels/.rels': strToU8(ROOT_RELS),
    'xl/workbook.xml': strToU8(workbook(sheets)),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels(sheets.length)),
    'xl/styles.xml': strToU8(STYLES),
  };
  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(worksheet(sheet));
  });
  return zipSync(files);
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

function escapeXml(value: string) {
  return value
    // Control characters are not allowed in XML 1.0, even escaped.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columnName(index: number) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function sheetName(name: string, index: number) {
  const clean = name.replace(/[[\]:*?/\\]/g, '').slice(0, 31).trim();
  return clean || `Sheet${index + 1}`;
}

function contentTypes(sheetCount: number) {
  const sheets = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return (
    XML_HEADER +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets +
    '</Types>'
  );
}

const ROOT_RELS =
  XML_HEADER +
  `<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
  '</Relationships>';

function workbook(sheets: Sheet[]) {
  const entries = sheets
    .map(
      (sheet, i) =>
        `<sheet name="${escapeXml(sheetName(sheet.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join('');
  return XML_HEADER + `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>${entries}</sheets></workbook>`;
}

function workbookRels(sheetCount: number) {
  const sheets = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join('');
  return (
    XML_HEADER +
    `<Relationships xmlns="${NS_PKG_REL}">${sheets}` +
    `<Relationship Id="rId${sheetCount + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
    '</Relationships>'
  );
}

// cellXfs: 0 = default, 1 = bold header, 2 = "#,##0" (built-in numFmtId 3)
const STYLES =
  XML_HEADER +
  `<styleSheet xmlns="${NS_MAIN}">` +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function cellXml(ref: string, value: Cell, style: number) {
  const s = style ? ` s="${style}"` : '';
  if (value === null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

function worksheet(sheet: Sheet) {
  const numberColumns = new Set(sheet.numberColumns ?? []);
  const all: Cell[][] = [sheet.header, ...sheet.rows];

  const widths = sheet.header.map((_, col) => {
    const longest = Math.max(
      ...all.map((row) => {
        const value = row[col];
        return value === null || value === undefined ? 0 : String(value).length;
      }),
    );
    return Math.min(Math.max(longest + 2, 8), 60);
  });
  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  const rows = all
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const style = r === 0 ? STYLE_HEADER : numberColumns.has(c) ? STYLE_THOUSANDS : 0;
          return cellXml(`${columnName(c)}${r + 1}`, value, style);
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');

  return (
    XML_HEADER +
    `<worksheet xmlns="${NS_MAIN}">` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${cols}</cols>` +
    `<sheetData>${rows}</sheetData>` +
    '</worksheet>'
  );
}
