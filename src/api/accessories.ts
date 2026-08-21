/**
 * Accessories — the things that were previously only ever on paper.
 *
 * `assets.serial_number` is NOT NULL UNIQUE, so a mouse or a cable could never
 * be registered. These are counted instead of identified: a row is a KIND of
 * thing at one location with a quantity.
 *
 * `available` is never sent up from the client and never stored — it is
 * derived in SQL every time, so there is only one place it can be wrong.
 *
 * The verbs are `Assign to` and `Return`, matching the rest of the app.
 * Snipe-IT calls them check out and check in; two vocabularies for one idea is
 * a cost with no return.
 */

import { supabase } from '@/lib/supabase';

export interface AccessoryRow {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  brand_name: string | null;
  model_no: string | null;
  location_id: string;
  location_name: string;
  total_qty: number;
  assigned_qty: number;
  available_qty: number;
  min_qty: number;
  is_active: boolean;
}

export interface AccessorySearch {
  query?: string | null;
  categoryId?: string | null;
}

export async function fetchAccessories(
  locations: string[],
  search: AccessorySearch = {},
): Promise<AccessoryRow[]> {
  const { data, error } = await supabase.rpc('accessories_list', {
    p_locations: locations,
    p_query: search.query ?? null,
    p_category: search.categoryId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AccessoryRow[];
}

export interface AccessoryCheckoutRow {
  id: string;
  accountId: string;
  accountName: string;
  qty: number;
  assignedDate: string;
  returnedDate: string | null;
  state: 'active' | 'returned';
  bastId: string | null;
  bastNumber: string | null;
  notes: string | null;
}

export interface AccessoryDetail {
  accessory: {
    id: string;
    name: string;
    categoryId: string;
    categoryName: string;
    categoryIcon: string | null;
    brandId: string | null;
    brandName: string | null;
    modelNo: string | null;
    vendorId: string | null;
    vendorName: string | null;
    locationId: string;
    locationName: string;
    totalQty: number;
    availableQty: number;
    assignedQty: number;
    minQty: number;
    purchaseDate: string | null;
    purchasePrice: string | number | null;
    notes: string | null;
    isActive: boolean;
  };
  history: AccessoryCheckoutRow[];
}

export async function fetchAccessoryDetail(id: string): Promise<AccessoryDetail | null> {
  const { data, error } = await supabase.rpc('accessory_detail', { p_id: id });
  if (error) throw new Error(error.message);
  return (data ?? null) as AccessoryDetail | null;
}

export interface AccessoryInput {
  name: string;
  categoryId: string;
  locationId: string;
  totalQty: number;
  brandId?: string | null;
  modelNo?: string | null;
  vendorId?: string | null;
  minQty?: number;
  purchaseDate?: string | null;
  purchasePrice?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export async function createAccessory(input: AccessoryInput): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('create_accessory', { p_input: input });
  if (error) throw new Error(error.message);
  return data as { id: string };
}

export async function updateAccessory(
  id: string,
  input: Partial<AccessoryInput>,
): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('update_accessory', { p_id: id, p_input: input });
  if (error) throw new Error(error.message);
  return data as { id: string };
}

export interface AssignAccessoryResult {
  checkoutId: string;
  accessoryName: string;
  accountName: string;
  qty: number;
  availableQty: number;
}

export async function assignAccessory(
  accessoryId: string,
  accountId: string,
  qty: number,
  date?: string,
  notes?: string,
  bastId?: string | null,
): Promise<AssignAccessoryResult> {
  const { data, error } = await supabase.rpc('assign_accessory', {
    p_accessory: accessoryId,
    p_account: accountId,
    p_qty: qty,
    p_date: date ?? null,
    p_notes: notes ?? null,
    p_bast: bastId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as AssignAccessoryResult;
}

export interface ReturnAccessoryResult {
  checkoutId: string;
  accessoryName: string;
  qty: number;
  availableQty: number;
}

export async function returnAccessory(
  checkoutId: string,
  date?: string,
): Promise<ReturnAccessoryResult> {
  const { data, error } = await supabase.rpc('return_accessory', {
    p_checkout: checkoutId,
    p_date: date ?? null,
  });
  if (error) throw new Error(error.message);
  return data as ReturnAccessoryResult;
}

/**
 * Put a document around hand-outs that have already happened.
 *
 * Neither call moves stock — assignAccessory() did that — so a failure here can
 * never leave the shelf count disagreeing with the register.
 */
export interface AccessoryBastResult {
  bastId: string;
  bastNumber: string;
  lines: number;
}

/** A sheet of its own: for accessories given when no draft BAST is open. */
export async function createAccessoryBast(
  accountId: string,
  checkoutIds: string[],
): Promise<AccessoryBastResult> {
  const { data, error } = await supabase.rpc('create_accessory_bast', {
    p_account: accountId,
    p_checkouts: checkoutIds,
  });
  if (error) throw new Error(error.message);
  return data as AccessoryBastResult;
}

/**
 * Append to an existing draft — the laptop's own BAST, when the accessories
 * went out with it. Refused once that document is signed, which is exactly
 * when createAccessoryBast() becomes the right call instead.
 */
export async function attachAccessoriesToBast(
  bastId: string,
  checkoutIds: string[],
): Promise<{ bastId: string; added: number; items: number }> {
  const { data, error } = await supabase.rpc('attach_accessories_to_bast', {
    p_bast: bastId,
    p_checkouts: checkoutIds,
  });
  if (error) throw new Error(error.message);
  return data as { bastId: string; added: number; items: number };
}
