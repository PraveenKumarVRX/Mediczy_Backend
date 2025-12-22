import ExcelJS from 'exceljs';
import { downloadArrayBuffer } from './downloadFile';

export interface ExcelRow {
  [key: string]: any;
}

const MAX_EXCEL_BYTES = 10 * 1024 * 1024;
const MAX_EXCEL_ROWS = 5000;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const sanitizeRow = (row: ExcelRow): ExcelRow => {
  const safe: ExcelRow = Object.create(null);
  for (const [key, value] of Object.entries(row || {})) {
    if (UNSAFE_KEYS.has(key)) continue;
    safe[key] = value;
  }
  return safe;
};

export const parseExcelFile = async (file: File): Promise<ExcelRow[]> => {
  if (file.size > MAX_EXCEL_BYTES) {
    throw new Error(
      `Excel file too large (${Math.ceil(file.size / (1024 * 1024))}MB). Please upload a file under ${Math.ceil(MAX_EXCEL_BYTES / (1024 * 1024))}MB.`
    );
  }

  const lowerName = (file.name || '').toLowerCase();
  if (lowerName && !lowerName.endsWith('.xlsx')) {
    throw new Error('Unsupported file type. Please upload a .xlsx file.');
  }

  const data = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headerRow = worksheet.getRow(1);
  const headerValues = headerRow.values as any[];
  const headers = (headerValues || [])
    .slice(1)
    .map((h) => (h == null ? '' : String(h)).trim());

  const rows: ExcelRow[] = [];
  const lastRow = Math.min(worksheet.rowCount, MAX_EXCEL_ROWS);
  for (let rowIndex = 2; rowIndex <= lastRow; rowIndex++) {
    const row = worksheet.getRow(rowIndex);
    const values = (row.values as any[]) || [];
    const record: ExcelRow = Object.create(null);
    for (let colIndex = 1; colIndex <= headers.length; colIndex++) {
      const key = headers[colIndex - 1];
      if (!key || UNSAFE_KEYS.has(key)) continue;
      const cellValue = values[colIndex];
      if (cellValue && typeof cellValue === 'object' && 'text' in (cellValue as any)) {
        record[key] = (cellValue as any).text;
      } else {
        record[key] = cellValue ?? '';
      }
    }
    if (Object.keys(record).length > 0) rows.push(sanitizeRow(record));
  }
  return rows;
};

export const downloadExcelTemplate = (
  columns: string[],
  fileName: string,
  sampleData?: any[],
  columnWidths?: Array<number | undefined>
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Template');

  worksheet.columns = columns.map((header, idx) => ({
    header,
    key: header,
    width: columnWidths?.[idx] ?? Math.min(60, Math.max(12, header.length + 4))
  }));

  const rows = (sampleData && sampleData.length > 0) ? sampleData : [Object.create(null)];
  for (const row of rows) {
    const rowObj: Record<string, any> = {};
    for (const col of columns) rowObj[col] = row?.[col] ?? '';
    worksheet.addRow(rowObj);
  }

  workbook.xlsx.writeBuffer().then((buffer) => {
    downloadArrayBuffer(
      buffer as ArrayBuffer,
      `${fileName}_template.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  });
};
