/**
 * Session API — the only place the app talks to Supabase Auth.
 *
 * Working rule #2: all writes go through an RPC or this API layer. The scope
 * preference is written by `set_account_scope()`, never by a direct insert
 * into `account_scope_preferences` from the client.
 */

import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/store/useSessionStore';

export interface SessionAccount {
  id: string;
  fullName: string;
  email: string | null;
  nik: string | null;
  department: string | null;
  departmentId: string | null;
  locationId: string | null;
  locationCode: string | null;
  role: UserRole | null;
  canLogin: boolean;
}

export interface BootstrapResult {
  account: SessionAccount | null;
  /** Locations RLS permits — the ceiling for the scope selector. */
  allowedLocations: string[];
  /** The user's persisted scope, already intersected with allowedLocations. */
  scope: string[];
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error(mapAuthError(error.message));
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

/**
 * Loads the account, role and persisted scope in one round trip.
 * Returns `account: null` when the auth user has no active account row —
 * the app treats that as "signed in but not provisioned" and signs out.
 */
export async function bootstrapSession(): Promise<BootstrapResult> {
  const { data, error } = await supabase.rpc('bootstrap_session');
  if (error) throw new Error(error.message);

  const payload = (data ?? {}) as Partial<BootstrapResult>;
  return {
    account: payload.account ?? null,
    allowedLocations: payload.allowedLocations ?? [],
    scope: payload.scope ?? [],
  };
}

/** Persists the global data scope. Returns the scope the server actually kept. */
export async function setAccountScope(locationIds: string[]): Promise<string[]> {
  const { data, error } = await supabase.rpc('set_account_scope', {
    p_locations: locationIds,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as string[];
}

export async function fetchLocations() {
  const { data, error } = await supabase
    .from('locations')
    .select('id, code, name, city, kind')
    .eq('is_active', true)
    .order('code');
  if (error) throw new Error(error.message);
  return data;
}

/** Supabase's auth errors are terse; give the sign-in screen something usable. */
function mapAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect';
  if (/email not confirmed/i.test(message)) return 'This account has not been confirmed yet';
  if (/network|fetch/i.test(message)) return 'Cannot reach the server — check your connection';
  return message;
}
