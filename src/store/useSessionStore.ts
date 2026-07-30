/**
 * Session — README § State Management: `session` (account + role + permissions).
 *
 * Phase 1: filled by `bootstrap_session()` after Supabase Auth sign-in.
 * `allowedLocations` is the RLS ceiling; the scope selector may never exceed it.
 */

import { create } from 'zustand';

import type { SessionAccount } from '@/api/session';

export type UserRole = 'super_admin' | 'corporate_it' | 'site_it' | 'viewer';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

/** Display label for the Settings role badge. */
export const roleLabels: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  corporate_it: 'Corporate IT',
  site_it: 'Site IT',
  viewer: 'Viewer',
};

interface SessionState {
  status: SessionStatus;
  account: SessionAccount | null;
  /** Location ids RLS allows this user to read. */
  allowedLocations: string[];
  setSession: (account: SessionAccount | null, allowedLocations: string[]) => void;
  setStatus: (status: SessionStatus) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'loading',
  account: null,
  allowedLocations: [],

  setSession: (account, allowedLocations) =>
    set({
      account,
      allowedLocations,
      status: account ? 'authenticated' : 'unauthenticated',
    }),

  setStatus: (status) => set({ status }),

  clear: () => set({ status: 'unauthenticated', account: null, allowedLocations: [] }),
}));

/** "Dewi Lestari" → "DL", for the header and list avatars. */
export function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** The greeting on Home — "Good morning, Dewi". */
export function greetingFor(fullName: string, now = new Date()): string {
  const hour = now.getHours();
  const partOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const firstName = fullName.split(/\s+/)[0] ?? fullName;
  return `Good ${partOfDay}, ${firstName}`;
}
