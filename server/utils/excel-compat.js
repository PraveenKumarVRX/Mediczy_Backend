import fs from 'fs';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';

function columnNumberToName(columnNumber) {
  let n = columnNumber;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function columnNameToNumber(columnName) {
  let n = 0;
  const s = String(columnName || '').toUpperCase();
  for (let i = 0; i < s.length; i += 1) {
    n = (n * 26) + (s.charCodeAt(i) - 64);
  }
  return n;
}

function normalizeCellValue(value) {
  if (value == null) return null;
  if (typeof value === 'object') {
    if (value.text) return value.text;
    if (value.richText && Array.isArray(value.richText)) {
      return value.richText.map((part) => part?.text || '').join('');
    }
    if (Object.prototype.hasOwnProperty.call(value, 'result')) {
      return value.result;
    }
    if (value.hyperlink) return value.text || value.hyperlink;
  }
  return value;
}

function toSheetObject(worksheet) {
  const sheet = {};
  let minRow = null;
  let maxRow = 0;
  let minCol = null;
  let maxCol = 0;

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const value = normalizeCellValue(cell.value);
      if (value == null || value === '') return;
      const address = `${columnNumberToName(colNumber)}${rowNumber}`;
      sheet[address] = { v: value };

      minRow = minRow == null ? rowNumber : Math.min(minRow, rowNumber);
      maxRow = Math.max(maxRow, rowNumber);
      minCol = minCol == null ? colNumber : Math.min(minCol, colNumber);
      maxCol = Math.max(maxCol, colNumber);
    });
  });

  if (minRow == null || minCol == null) {
    sheet['!ref'] = 'A1';
  } else {
    sheet['!ref'] = `${columnNumberToName(minCol)}${minRow}:${columnNumberToName(maxCol)}${maxRow}`;
  }

  return sheet;
}

function getCellPrimitive(sheet, address) {
  const cell = sheet[address];
  if (cell == null) return undefined;
  if (typeof cell === 'object' && Object.prototype.hasOwnProperty.call(cell, 'v')) return cell.v;
  return cell;
}

function decodeCell(addr) {
  const m = String(addr || '').match(/^([A-Z]+)(\d+)$/i);
  if (!m) return { c: 0, r: 0 };
  return {
    c: columnNameToNumber(m[1]) - 1,
    r: Number(m[2]) - 1,
  };
}

function encodeCell({ r, c }) {
  return `${columnNumberToName(Number(c) + 1)}${Number(r) + 1}`;
}

function decodeRange(range) {
  const value = String(range || 'A1');
  if (!value.includes(':')) {
    const c = decodeCell(value);
    return { s: c, e: c };
  }
  const [start, end] = value.split(':');
  return { s: decodeCell(start), e: decodeCell(end) };
}

function sheetToJson(sheet, options = {}) {
  const defval = Object.prototype.hasOwnProperty.call(options, 'defval') ? options.defval : undefined;
  const ref = sheet['!ref'] || 'A1';
  const range = decodeRange(ref);

  const headerRow = range.s.r;
  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const raw = getCellPrimitive(sheet, encodeCell({ r: headerRow, c }));
    const trimmed = raw == null ? '' : String(raw).trim();
    headers.push(trimmed || `__EMPTY_${c - range.s.c}`);
  }

  const rows = [];
  for (let r = headerRow + 1; r <= range.e.r; r += 1) {
    const rowObj = {};
    let hasAny = false;
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const header = headers[c - range.s.c];
      let val = getCellPrimitive(sheet, encodeCell({ r, c }));
      if (val === undefined || val === null || val === '') {
        if (defval !== undefined) {
          val = defval;
        }
      } else {
        hasAny = true;
      }
      rowObj[header] = val;
    }
    if (hasAny || defval !== undefined) rows.push(rowObj);
  }

  return rows;
}

function jsonToSheet(data) {
  const rows = Array.isArray(data) ? data : [];
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
  const sheet = {};

  if (headers.length === 0) {
    sheet['!ref'] = 'A1';
    return sheet;
  }

  headers.forEach((h, index) => {
    sheet[encodeCell({ r: 0, c: index })] = { v: h };
  });

  rows.forEach((row, rowIndex) => {
    headers.forEach((h, colIndex) => {
      const val = row?.[h];
      if (val !== undefined && val !== null && val !== '') {
        sheet[encodeCell({ r: rowIndex + 1, c: colIndex })] = { v: val };
      }
    });
  });

  sheet['!ref'] = `A1:${encodeCell({ r: rows.length, c: headers.length - 1 })}`;
  return sheet;
}

function bookNew() {
  return { SheetNames: [], Sheets: {} };
}

function bookAppendSheet(workbook, worksheet, name) {
  workbook.SheetNames.push(name);
  workbook.Sheets[name] = worksheet;
}

async function readInternal(input, options = {}) {
  const workbook = new ExcelJS.Workbook();
  if (Buffer.isBuffer(input)) {
    if (options.fileType === 'csv') {
      await workbook.csv.read(Readable.from([input]), { map: value => value, parserOptions: { ignoreEmpty: true } });
    } else {
      await workbook.xlsx.load(input);
    }
  } else if (typeof input === 'string') {
    await workbook.xlsx.readFile(input);
  } else {
    throw new Error('Unsupported input for spreadsheet read');
  }

  const compat = { SheetNames: [], Sheets: {}, __exceljs: workbook };
  workbook.eachSheet((worksheet) => {
    compat.SheetNames.push(worksheet.name);
    compat.Sheets[worksheet.name] = toSheetObject(worksheet);
  });

  if (compat.SheetNames.length === 0) {
    compat.SheetNames.push('Sheet1');
    compat.Sheets.Sheet1 = { '!ref': 'A1' };
  }

  return compat;
}

async function writeFile(workbook, filePath) {
  const out = new ExcelJS.Workbook();
  for (const sheetName of workbook.SheetNames || []) {
    const sheet = workbook.Sheets[sheetName] || { '!ref': 'A1' };
    const ws = out.addWorksheet(sheetName);
    const range = decodeRange(sheet['!ref'] || 'A1');

    for (let r = range.s.r; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const addr = encodeCell({ r, c });
        const value = getCellPrimitive(sheet, addr);
        if (value !== undefined) ws.getCell(addr).value = value;
      }
    }
  }

  const buffer = await out.xlsx.writeBuffer();
  fs.writeFileSync(filePath, Buffer.from(buffer));
}

const XLSXCompat = {
  read(data, options = {}) {
    if (options?.type === 'buffer' || Buffer.isBuffer(data)) {
      return readInternal(Buffer.isBuffer(data) ? data : Buffer.from(data), options);
    }
    return readInternal(data, options);
  },
  readFile(filePath) {
    return readInternal(filePath, {});
  },
  async writeFile(workbook, filePath) {
    await writeFile(workbook, filePath);
  },
  utils: {
    sheet_to_json: sheetToJson,
    decode_range: decodeRange,
    encode_cell: encodeCell,
    json_to_sheet: jsonToSheet,
    book_new: bookNew,
    book_append_sheet: bookAppendSheet,
  },
};

export default XLSXCompat;
