/**
 * CSV parsing and the import template.
 *
 * Written by hand rather than pulled in, because the whole of CSV that matters
 * here is: fields separated by commas, quoted fields may contain commas and
 * newlines, and a doubled quote inside a quoted field means one quote. A
 * library would be several hundred kilobytes for those three rules.
 *
 * Parsing happens on the device on purpose. A CSV is a text format with
 * quoting, and Postgres is a poor place to discover a stray comma; everything
 * that decides whether a ROW IS ACCEPTABLE still happens in the database, in
 * import_assets().
 */

/** The template's columns, in the order they appear. */
export const IMPORT_COLUMNS = [
  'asset_code',
  'name',
  'category',
  'brand',
  'model',
  'serial_number',
  'status',
  'condition',
  'location',
  'department',
  'vendor',
  'purchase_date',
  'purchase_price',
  'warranty_start',
  'warranty_end',
  'notes',
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Which ones cannot be left blank, mirrored from import_assets(). */
export const REQUIRED_COLUMNS: ImportColumn[] = ['name', 'category', 'serial_number', 'location'];

export type CsvRow = Partial<Record<string, string>>;

/**
 * Splits a CSV into rows of fields.
 *
 * Handles CRLF and LF, quoted fields spanning newlines, and doubled quotes. A
 * trailing newline does not produce an empty final row — spreadsheets always
 * write one, and a phantom row at the end of every import would be reported as
 * a missing name.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;

  // A byte-order mark survives Excel's "Save as CSV" and would otherwise
  // become part of the first column's name, so the header never matches.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;

    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // Treat CRLF as one break.
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export interface ParsedCsv {
  rows: CsvRow[];
  /** Header names that are not part of the template — carried through as a warning. */
  unknownColumns: string[];
  missingRequired: string[];
}

/**
 * Turns a CSV into objects keyed by column name.
 *
 * Headers are matched case-insensitively with spaces and hyphens folded to
 * underscores, so "Serial Number", "serial-number" and "serial_number" are all
 * the same column. People export from Excel; insisting on one spelling would
 * fail most real files for no reason.
 */
export function parseImportCsv(text: string): ParsedCsv {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], unknownColumns: [], missingRequired: [] };

  const normalise = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
  const header = table[0]!.map(normalise);

  const known = new Set<string>(IMPORT_COLUMNS);
  const unknownColumns = header.filter((h) => h && !known.has(h));
  const missingRequired = REQUIRED_COLUMNS.filter((c) => !header.includes(c));

  const rows: CsvRow[] = table.slice(1).map((cells) => {
    const row: CsvRow = {};
    header.forEach((name, i) => {
      if (name && known.has(name)) row[name] = (cells[i] ?? '').trim();
    });
    return row;
  });

  return { rows, unknownColumns, missingRequired };
}

/**
 * The blank template, with one example row.
 *
 * The example is filled in rather than left as placeholder text because the
 * first thing anyone does is overwrite row 2 — and seeing a real date format
 * there prevents most of the errors the importer would otherwise report.
 */
export function buildImportTemplate(): string {
  const example: Record<ImportColumn, string> = {
    asset_code: '',
    name: 'Dell Latitude 5440',
    category: 'Laptop',
    brand: 'Dell',
    model: 'Latitude 5440',
    serial_number: 'PF3XK92L',
    status: 'Available',
    condition: 'Good',
    location: 'Head Office',
    department: 'Finance',
    vendor: '',
    purchase_date: '2024-03-18',
    purchase_price: '18500000',
    warranty_start: '2024-03-18',
    warranty_end: '2027-03-18',
    notes: 'Leave asset_code blank to have one generated',
  };

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = IMPORT_COLUMNS.map(escape).join(',');
  const row = IMPORT_COLUMNS.map((c) => escape(example[c])).join(',');

  // CRLF: Excel on Windows is what will open this.
  return `${header}\r\n${row}\r\n`;
}

export interface RowProblem {
  column: string;
  message: string;
}

export interface RowError {
  row: number;
  name: string;
  serial: string;
  problems: RowProblem[];
}

/** The error report, as a file somebody can open next to the original. */
export function buildErrorReport(errors: RowError[]): string {
  const escape = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
  const lines = [['row', 'name', 'serial_number', 'column', 'problem'].map(escape).join(',')];

  for (const error of errors) {
    for (const problem of error.problems) {
      lines.push(
        [String(error.row), error.name, error.serial, problem.column, problem.message]
          .map(escape)
          .join(','),
      );
    }
  }

  return `${lines.join('\r\n')}\r\n`;
}
