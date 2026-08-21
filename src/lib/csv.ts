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
  // The physical sticker. Optional: filled in it is attached during the
  // import, left blank the asset arrives unlabelled exactly as before.
  'label',
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Which ones cannot be left blank, mirrored from import_assets(). */
export const REQUIRED_COLUMNS: ImportColumn[] = ['name', 'category', 'serial_number', 'location'];

export type CsvRow = Partial<Record<string, string>>;

/**
 * What a given import expects to find in the file.
 *
 * There are two importers now — assets and employees — and they agree about no
 * column at all. Passing the shape in keeps one parser rather than two copies
 * that would drift apart the first time one of them learned something.
 */
export interface ImportSchema {
  columns: readonly string[];
  required: readonly string[];
  /**
   * Other header spellings that mean the same column, already normalised.
   * This is what lets the Odoo export and this app's own template be one file.
   */
  aliases?: Readonly<Record<string, string>>;
}

export const ASSET_IMPORT: ImportSchema = {
  columns: IMPORT_COLUMNS,
  required: REQUIRED_COLUMNS,
};

/**
 * Employees, named the way Odoo's `hr.employee` export names them.
 *
 * Odoo's headers are canonical here rather than the `accounts` column names,
 * because the export IS the file people will drop in — 527 rows of it. Asking
 * them to rename six columns first would be a step that exists only to satisfy
 * this app. The account-side names are accepted as aliases so the template
 * this screen hands out keeps working too.
 */
export const EMPLOYEE_COLUMNS = [
  'employee_name',
  'employee_id',
  'job_position',
  'company',
  'department',
  'work_email',
  'work_phone',
] as const;

export type EmployeeColumn = (typeof EMPLOYEE_COLUMNS)[number];

export const EMPLOYEE_IMPORT: ImportSchema = {
  columns: EMPLOYEE_COLUMNS,
  // The name, and nothing else. Somebody with no NIK, no email and no phone is
  // still somebody who can hold a laptop — 23 rows of the real export are
  // exactly that, the President Director among them.
  required: ['employee_name'],
  aliases: {
    full_name: 'employee_name',
    name: 'employee_name',
    nik: 'employee_id',
    employee_number: 'employee_id',
    job_title: 'job_position',
    jabatan: 'job_position',
    departemen: 'department',
    department_name: 'department',
    email: 'work_email',
    phone: 'work_phone',
  },
};

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
export function parseImportCsv(text: string, schema: ImportSchema = ASSET_IMPORT): ParsedCsv {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], unknownColumns: [], missingRequired: [] };

  const normalise = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
  // Aliases resolve once, here, so everything downstream — the unknown-column
  // warning, the required check and the row objects — sees one canonical name.
  const aliases = schema.aliases ?? {};
  const header = table[0]!.map((h) => {
    const key = normalise(h);
    return aliases[key] ?? key;
  });

  const known = new Set<string>(schema.columns);
  const unknownColumns = header.filter((h) => h && !known.has(h));
  const missingRequired = schema.required.filter((c) => !header.includes(c));

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
    label: '',
  };

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = IMPORT_COLUMNS.map(escape).join(',');
  const row = IMPORT_COLUMNS.map((c) => escape(example[c])).join(',');

  // CRLF: Excel on Windows is what will open this.
  return `${header}\r\n${row}\r\n`;
}

/**
 * The employee template.
 *
 * Headers print in Odoo's own spelling — "Employee Name", not "employee_name" —
 * so a file downloaded here and a file exported from Odoo are the same shape,
 * and somebody holding the two side by side has nothing to reconcile.
 *
 * `Department` is here even though the Odoo export does not carry it, because
 * a blank value never erases: a second, smaller file of just names and
 * departments updates the people the first import created, and a file without
 * the column leaves every department alone.
 */
export function buildEmployeeTemplate(): string {
  const headings: Record<EmployeeColumn, string> = {
    employee_name: 'Employee Name',
    employee_id: 'Employee ID',
    job_position: 'Job Position',
    company: 'Company',
    department: 'Department',
    work_email: 'Work Email',
    work_phone: 'Work Phone',
  };

  const example: Record<EmployeeColumn, string> = {
    employee_name: 'Achmad Taufik',
    employee_id: 'SP012603-0791',
    job_position: 'Tax Staff',
    company: 'PT Stargate Pasific Resources',
    department: 'Finance',
    work_email: 'achmad.taufik@aspire.id',
    work_phone: '082179467973',
  };

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = EMPLOYEE_COLUMNS.map((c) => escape(headings[c])).join(',');
  const row = EMPLOYEE_COLUMNS.map((c) => escape(example[c])).join(',');

  return `${header}\r\n${row}\r\n`;
}

export interface RowProblem {
  column: string;
  message: string;
}

export interface RowError {
  row: number;
  name: string;
  /** The second identifying column: a serial number for assets, a NIK for people. */
  serial: string;
  problems: RowProblem[];
}

/**
 * The error report, as a file somebody can open next to the original.
 *
 * `idColumn` names the second heading, so an employee report says `nik` rather
 * than `serial_number`. The report is meant to be read beside the source file,
 * and a heading naming nothing in that file is just noise.
 */
export function buildErrorReport(errors: RowError[], idColumn = 'serial_number'): string {
  const escape = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
  const lines = [['row', 'name', idColumn, 'column', 'problem'].map(escape).join(',')];

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
