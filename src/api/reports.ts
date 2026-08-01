/**
 * Reports and export — Phase 7.
 *
 * The report is its own query rather than a reuse of the register search: a
 * list on a phone wants display names and speed, a report wants every column
 * and does not care about latency. Sharing one shape would make every scroll
 * carry the purchase price for the sake of a button pressed once a month.
 */

import { supabase } from '@/lib/supabase';

export interface ReportRow {
  asset_code: string;
  name: string;
  category_name: string;
  brand_name: string | null;
  model_name: string | null;
  serial_number: string;
  status_name: string;
  condition_name: string;
  location_name: string;
  department_name: string | null;
  holder_name: string | null;
  holder_nik: string | null;
  vendor_name: string | null;
  purchase_date: string | null;
  purchase_price: string | number | null;
  warranty_start: string | null;
  warranty_end: string | null;
  warranty_days_left: number | null;
  notes: string | null;
  created_at: string;
}

export interface ReportFilters {
  statusId?: string | null;
  categoryId?: string | null;
  departmentId?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface ReportSummary {
  total: number;
  value: string | number;
  byStatus: Record<string, number>;
  byLocation: Record<string, number>;
  byCategory: Record<string, number>;
  warrantyExpiring: number;
  unassigned: number;
}

export async function fetchReport(scope: string[], filters: ReportFilters): Promise<ReportRow[]> {
  const { data, error } = await supabase.rpc('asset_report', {
    p_locations: scope,
    p_status: filters.statusId ?? null,
    p_category: filters.categoryId ?? null,
    p_department: filters.departmentId ?? null,
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as ReportRow[];
}

export async function fetchReportSummary(scope: string[]): Promise<ReportSummary> {
  const { data, error } = await supabase.rpc('report_summary', { p_locations: scope });
  if (error) throw new Error(error.message);
  return data as ReportSummary;
}

const COLUMNS: { key: keyof ReportRow; label: string }[] = [
  { key: 'asset_code', label: 'Asset Code' },
  { key: 'name', label: 'Name' },
  { key: 'category_name', label: 'Category' },
  { key: 'brand_name', label: 'Brand' },
  { key: 'model_name', label: 'Model' },
  { key: 'serial_number', label: 'Serial Number' },
  { key: 'status_name', label: 'Status' },
  { key: 'condition_name', label: 'Condition' },
  { key: 'location_name', label: 'Location' },
  { key: 'department_name', label: 'Department' },
  { key: 'holder_name', label: 'Holder' },
  { key: 'holder_nik', label: 'Holder NIK' },
  { key: 'vendor_name', label: 'Vendor' },
  { key: 'purchase_date', label: 'Purchase Date' },
  { key: 'purchase_price', label: 'Purchase Price' },
  { key: 'warranty_start', label: 'Warranty Start' },
  { key: 'warranty_end', label: 'Warranty End' },
  { key: 'warranty_days_left', label: 'Warranty Days Left' },
  { key: 'notes', label: 'Notes' },
];

/**
 * CSV, which is what Excel opens.
 *
 * Not .xlsx: that is a zip of XML schemas, and writing one by hand to avoid a
 * dependency would be a lot of code for a file Excel already reads. The
 * columns are named as they appear in the app so a person can match them
 * without a legend.
 */
export function buildReportCsv(rows: ReportRow[]): string {
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [COLUMNS.map((c) => escape(c.label)).join(',')];
  for (const row of rows) {
    lines.push(COLUMNS.map((c) => escape(row[c.key])).join(','));
  }
  // CRLF and a BOM: Excel on Windows guesses the encoding otherwise, and an
  // Indonesian name with an accent in it comes out wrong.
  return `﻿${lines.join('\r\n')}\r\n`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function money(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return n ? `Rp ${n.toLocaleString('id-ID')}` : '—';
}

/**
 * The printable report: a summary page and the register behind it.
 *
 * Landscape A4 because nineteen columns on portrait is unreadable, and a report
 * nobody can read is a report nobody checks.
 */
export function buildReportHtml(
  rows: ReportRow[],
  summary: ReportSummary,
  scopeLabel: string,
): string {
  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const breakdown = (title: string, counts: Record<string, number>) => `
    <div class="panel">
      <h3>${escapeHtml(title)}</h3>
      ${
        Object.keys(counts).length === 0
          ? '<p class="muted">Nothing yet</p>'
          : Object.entries(counts)
              .sort((a, b) => b[1] - a[1])
              .map(
                ([name, n]) =>
                  `<div class="line"><span>${escapeHtml(name)}</span><b>${n}</b></div>`,
              )
              .join('')
      }
    </div>`;

  const body = rows
    .map(
      (r) => `<tr>
        <td class="code">${escapeHtml(r.asset_code)}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.category_name)}</td>
        <td>${escapeHtml(r.serial_number)}</td>
        <td>${escapeHtml(r.status_name)}</td>
        <td>${escapeHtml(r.condition_name)}</td>
        <td>${escapeHtml(r.location_name)}</td>
        <td>${escapeHtml(r.holder_name ?? '—')}</td>
        <td>${escapeHtml(r.warranty_end ?? '—')}</td>
        <td class="right">${money(r.purchase_price)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @page { size: A4 landscape; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #0B1220; margin: 0; }
  header { border-bottom: 2px solid #00072D; padding-bottom: 8px; margin-bottom: 14px; }
  h1 { font-size: 15pt; margin: 0; letter-spacing: .3px; }
  .sub { font-size: 8.5pt; color: #5A6478; margin-top: 3px; }
  .kpis { display: flex; gap: 10px; margin-bottom: 14px; }
  .kpi { flex: 1; border: 1px solid #E6EAF2; border-radius: 6px; padding: 9px 11px; }
  .kpi b { display: block; font-size: 15pt; }
  .kpi span { font-size: 7.5pt; color: #5A6478; text-transform: uppercase; letter-spacing: .5px; }
  .panels { display: flex; gap: 10px; margin-bottom: 16px; }
  .panel { flex: 1; border: 1px solid #E6EAF2; border-radius: 6px; padding: 9px 11px; }
  .panel h3 { font-size: 8pt; margin: 0 0 6px; color: #5A6478; text-transform: uppercase;
              letter-spacing: .5px; }
  .line { display: flex; justify-content: space-between; font-size: 8.5pt; padding: 2px 0; }
  .muted { color: #5A6478; font-size: 8.5pt; margin: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 7.5pt; }
  th { text-align: left; background: #F6F8FB; color: #5A6478; font-weight: 600;
       padding: 5px 6px; border-bottom: 1px solid #E6EAF2; }
  td { padding: 4px 6px; border-bottom: 1px solid #F0F3F8; }
  .code { font-weight: 700; color: #2B57C4; white-space: nowrap; }
  .right { text-align: right; white-space: nowrap; }
  /* Repeat the header on every page — a table that loses its column names
     halfway through is a table people misread. */
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
</style></head>
<body>
  <header>
    <h1>CITE ASSETS — ASSET REGISTER</h1>
    <div class="sub">${escapeHtml(scopeLabel)} · ${rows.length} asset${rows.length === 1 ? '' : 's'} · ${today}</div>
  </header>

  <div class="kpis">
    <div class="kpi"><b>${summary.total}</b><span>Total assets</span></div>
    <div class="kpi"><b>${money(summary.value)}</b><span>Acquisition value</span></div>
    <div class="kpi"><b>${summary.unassigned}</b><span>Available</span></div>
    <div class="kpi"><b>${summary.warrantyExpiring}</b><span>Warranty ends in 90 days</span></div>
  </div>

  <div class="panels">
    ${breakdown('By status', summary.byStatus)}
    ${breakdown('By location', summary.byLocation)}
    ${breakdown('By category', summary.byCategory)}
  </div>

  <table>
    <thead><tr>
      <th>Code</th><th>Name</th><th>Category</th><th>Serial</th><th>Status</th>
      <th>Condition</th><th>Location</th><th>Holder</th><th>Warranty ends</th>
      <th class="right">Price</th>
    </tr></thead>
    <tbody>${body || '<tr><td colspan="10">No assets match these filters.</td></tr>'}</tbody>
  </table>
</body></html>`;
}
