/**
 * Accounts API — people, and which of them can sign in.
 *
 * Two kinds of record live in one table, which is right: a person who receives
 * a laptop and a person who uses this app are the same person more often than
 * not. `canLogin` is what separates them, and `hasCredentials` says whether the
 * sign-in behind it actually exists yet.
 *
 * Nothing here creates a password. That needs the service_role key, which the
 * app must never hold, so it goes through the manage-account Edge Function.
 */

import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/store/useSessionStore';

export interface AccountRow {
  /** The legal entity they belong to. Null until somebody sets it. */
  company_id?: string | null;
  company_name?: string | null;
  id: string;
  full_name: string;
  nik: string | null;
  email: string | null;
  phone: string | null;
  /** "Legal Officer" — what the BAST prints on the Jabatan line. */
  job_title: string | null;
  department_id: string | null;
  department_name: string | null;
  location_id: string | null;
  location_name: string | null;
  role: UserRole | null;
  can_login: boolean;
  /** True once an auth user exists — `can_login` alone only means "allowed to". */
  has_credentials: boolean;
  is_active: boolean;
  is_me: boolean;
}

export const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  corporate_it: 'Corporate IT',
  site_it: 'Site IT',
  viewer: 'Viewer',
};

/** What each role can actually do, in one line, shown next to the choice. */
export const ROLE_SUMMARY: Record<UserRole, string> = {
  super_admin: 'Everything, including accounts and deleting master data',
  corporate_it: 'All locations · assets, assignments, E-BAST, master data',
  site_it: 'Its own location only · assets, assignments, E-BAST',
  viewer: 'Read-only, its own location',
};

export async function fetchAccounts(search?: string): Promise<AccountRow[]> {
  const { data, error } = await supabase.rpc('accounts_list', { p_search: search ?? null });
  if (error) throw new Error(error.message);
  return (data ?? []) as AccountRow[];
}

export interface AccountInput {
  fullName: string;
  nik?: string | null;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  departmentId?: string | null;
  /** The legal entity. On update, null means leave it as it is. */
  companyId?: string | null;
  locationId?: string | null;
  role?: UserRole | null;
  canLogin?: boolean;
  isActive?: boolean;
}

export async function createAccount(input: AccountInput): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('create_account', {
    p_full_name: input.fullName,
    p_nik: input.nik ?? null,
    p_email: input.email ?? null,
    p_phone: input.phone ?? null,
    p_department: input.departmentId ?? null,
    p_company: input.companyId ?? null,
    p_location: input.locationId ?? null,
    p_role: input.role ?? null,
    // A brand new account never has credentials, so it is never created able to
    // log in. Issuing them is a separate, deliberate step.
    p_can_login: false,
    p_job_title: input.jobTitle ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { id: string };
}

export async function updateAccount(id: string, input: AccountInput): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('update_account', {
    p_id: id,
    p_full_name: input.fullName,
    p_nik: input.nik ?? null,
    p_email: input.email ?? null,
    p_phone: input.phone ?? null,
    p_department: input.departmentId ?? null,
    p_company: input.companyId ?? null,
    p_location: input.locationId ?? null,
    p_role: input.role ?? null,
    p_can_login: null,
    p_is_active: input.isActive ?? null,
    p_job_title: input.jobTitle ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { id: string };
}

export type CredentialAction = 'enable' | 'disable' | 'reset';

/**
 * Issues, revokes or resets a sign-in.
 *
 * The Edge Function checks the caller is a Super Admin using the caller's own
 * token before it reaches for the service role, and it reads the email and the
 * auth user id from the database rather than from anything sent here — so an id
 * is all this needs to pass.
 */
export async function manageCredentials(
  accountId: string,
  action: CredentialAction,
  password?: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('manage-account', {
    body: { accountId, action, password },
  });
  if (error) {
    const detail = (data as { error?: string } | null)?.error;
    throw new Error(detail ?? error.message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
}

/** The rule the Edge Function enforces; repeated so the button can say so. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * What one person is holding right now — both kinds.
 *
 * Opening a person used to answer "what is their role" but never "what do they
 * have", which is the question anybody actually opens a person to ask.
 *
 * Assets carry a `role`, because a shared handy-talkie has two holders and
 * "primary" or "secondary" is the difference between having it and being
 * answerable for it. Accessories list only what is still out; anything
 * returned lives in that accessory own history.
 */
export interface HeldAsset {
  id: string;
  assetCode: string;
  name: string;
  categoryName: string;
  statusName: string;
  locationName: string;
  role: 'primary' | 'secondary';
}

export interface HeldAccessory {
  id: string;
  accessoryId: string;
  name: string;
  qty: number;
  assignedDate: string;
  locationName: string;
  bastNumber: string | null;
}

export interface AccountHoldings {
  assets: HeldAsset[];
  accessories: HeldAccessory[];
}

export async function fetchAccountHoldings(accountId: string): Promise<AccountHoldings> {
  const { data, error } = await supabase.rpc('account_holdings', { p_account: accountId });
  if (error) throw new Error(error.message);
  return data as AccountHoldings;
}
