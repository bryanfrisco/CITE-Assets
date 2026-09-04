/**
 * Licenses — the third module after Assets and Accessories.
 *
 * An asset is held by one person. A licence has many SEATS, and each seat goes
 * to somebody. That is the whole difference, and the vocabulary follows it:
 * the screens say "seat", not "unit" or "copy".
 *
 * Two things are deliberately absent from every type in this file:
 *
 *   `status` — a seat is Used when somebody is in it and Standby when nobody
 *   is. It is computed in SQL and never stored, for the same reason
 *   `available` is never stored for accessories: a number kept in two places
 *   drifts apart.
 *
 *   `seat_secret` — the stored password is never returned by the list or the
 *   detail RPC. What comes back is `hasSecret`, a boolean. The value itself
 *   only ever arrives through revealSeatSecret(), which writes an audit row
 *   before it answers.
 */

import { supabase } from '@/lib/supabase';
import type { BadgeTone } from '@/theme';

/** How close a licence is to running out. Computed server-side, one definition. */
export type ExpiryState = 'none' | 'ok' | 'expiring' | 'expired';

export interface LicenseRow {
  id: string;
  software: string;
  license_number: string | null;
  category_id: string;
  category_name: string;
  vendor_name: string | null;
  purchase_year: number | null;
  expiry_date: string | null;
  expiry_state: ExpiryState;
  total_seats: number;
  used_seats: number;
  available_seats: number;
  is_active: boolean;
}

export interface LicenseSearch {
  query?: string | null;
  categoryId?: string | null;
  /** Narrows to licences with a free seat, or by how close expiry is. */
  status?: 'available' | 'expiring' | 'expired' | null;
}

export async function fetchLicenses(search: LicenseSearch = {}): Promise<LicenseRow[]> {
  const { data, error } = await supabase.rpc('licenses_list', {
    p_query: search.query ?? null,
    p_category: search.categoryId ?? null,
    p_status: search.status ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as LicenseRow[];
}

export interface SeatRow {
  id: string;
  /** The account the vendor issued for this seat — an email, or a username. */
  seat_account: string | null;
  /** Whether a password is stored. Never the password itself. */
  has_secret: boolean;
  account_id: string | null;
  holder_name: string | null;
  holder_nik: string | null;
  /** Read from the holder's own record, never stored on the seat. */
  department: string | null;
  assigned_date: string | null;
  notes: string | null;
  status: 'Used' | 'Standby';
}

export interface LicenseDetail {
  id: string;
  software: string;
  license_number: string | null;
  category_id: string;
  category_name: string;
  vendor_id: string | null;
  vendor_name: string | null;
  purchase_year: number | null;
  expiry_date: string | null;
  expiry_state: ExpiryState;
  notes: string | null;
  is_active: boolean;
  seats: SeatRow[];
}

export async function fetchLicense(id: string): Promise<LicenseDetail | null> {
  const { data, error } = await supabase.rpc('license_detail', { p_id: id });
  if (error) throw new Error(error.message);
  return (data as LicenseDetail | null) ?? null;
}

export interface LicenseInput {
  software: string;
  license_number?: string | null;
  category_id: string;
  vendor_id?: string | null;
  purchase_year?: number | null;
  expiry_date?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export async function createLicense(input: LicenseInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_license', { p_input: input });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function updateLicense(id: string, input: Partial<LicenseInput>): Promise<void> {
  const { error } = await supabase.rpc('update_license', { p_id: id, p_input: input });
  if (error) throw new Error(error.message);
}

/** Refused while any seat is still occupied; the reason is recorded either way. */
export async function deleteLicense(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('delete_license', { p_id: id, p_reason: reason });
  if (error) throw new Error(error.message);
}

/** Adds empty chairs, or removes empty ones. Never removes an occupied seat. */
export async function setLicenseSeats(licenseId: string, count: number): Promise<void> {
  const { error } = await supabase.rpc('set_license_seats', {
    p_license: licenseId,
    p_count: count,
  });
  if (error) throw new Error(error.message);
}

export async function assignSeat(
  seatId: string,
  accountId: string,
  date?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('assign_seat', {
    p_seat: seatId,
    p_account: accountId,
    p_date: date ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function returnSeat(seatId: string): Promise<void> {
  const { error } = await supabase.rpc('return_seat', { p_seat: seatId });
  if (error) throw new Error(error.message);
}

/**
 * Reads back a stored password. Super Admin only, and the audit row is written
 * before the value is returned — there is no way to read one quietly.
 */
export async function revealSeatSecret(seatId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('reveal_seat_secret', { p_seat: seatId });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

/** Wording for the expiry badge. Kept next to the type it describes. */
export function expiryLabel(state: ExpiryState, date: string | null): string {
  switch (state) {
    case 'expired':
      return 'Expired';
    case 'expiring':
      return 'Expiring soon';
    case 'ok':
      return date ? `Until ${date}` : 'Active';
    default:
      return 'No end date';
  }
}

/**
 * Badge tone, reusing the tones the app already defines in tokens.ts. No new
 * colour is introduced for licences — an expired licence reads with the same
 * red as a broken asset, and one running out reads amber like maintenance.
 */
export function expiryTone(state: ExpiryState): BadgeTone {
  switch (state) {
    case 'expired':
      return 'broken';
    case 'expiring':
      return 'maintenance';
    case 'ok':
      return 'available';
    default:
      return 'retired';
  }
}
