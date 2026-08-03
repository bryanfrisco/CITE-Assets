/**
 * Dates, shown the way the phone shows dates.
 *
 * Client instruction, 2026-08-03: "tanggal ikuti tanggal global" — follow the
 * device rather than impose a format. So every date the user READS goes through
 * here and picks up the phone's locale and time zone, and a phone set to
 * Indonesian shows "3 Agu 2026" without the app knowing anything about
 * Indonesian.
 *
 * What does NOT follow the device is what the database stores. A date column is
 * `YYYY-MM-DD` and a timestamp is UTC, always, because "03/08/2026" means two
 * different days depending on who wrote it and that ambiguity has no place in a
 * record somebody will read back in an audit.
 *
 * So: `toIsoDate` on the way in, the formatters below on the way out, and the
 * two never meet.
 */

/** The device's own locale list, or a sane default when it cannot be read. */
function locales(): string[] | undefined {
  // Intl is present in Hermes with full-icu on both platforms; the guard is for
  // the web build, where a very old browser could be missing it.
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().locale;
    return resolved ? [resolved] : undefined;
  } catch {
    return undefined;
  }
}

function parse(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  // A bare `YYYY-MM-DD` is parsed as UTC midnight by the Date constructor,
  // which in any timezone west of Greenwich renders as the day before. Splitting
  // it and building a local date is what stops a warranty ending "yesterday".
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (bare) {
    return new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]));
  }

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "3 Aug 2026" — the default for anything a person reads. */
export function formatDate(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return '—';
  return d.toLocaleDateString(locales(), { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Monday, 3 August 2026" — for a single date that is the point of the screen. */
export function formatDateLong(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return '—';
  return d.toLocaleDateString(locales(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "3 Aug 2026, 14:05" — for log entries, where the time is what you are after. */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return '—';
  return d.toLocaleString(locales(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * "just now", "5m ago", "3 Aug" — for lists that are read top-down.
 *
 * Falls back to an absolute date after a week, because "23d ago" is a number
 * nobody converts in their head.
 */
export function formatRelative(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return '—';

  const minutes = Math.round((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return d.toLocaleDateString(locales(), { day: 'numeric', month: 'short' });
}

/** What the database wants: `YYYY-MM-DD`, in the user's own day, not UTC's. */
export function toIsoDate(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function fromIsoDate(value: string | null | undefined): Date | null {
  return parse(value ?? null);
}

/** Adds days without the month-end arithmetic going wrong. */
export function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}
