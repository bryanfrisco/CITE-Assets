/**
 * Global Data Scope — README § Global Chrome.
 *
 * "Dashboard, Assets, BAST, Documents and Reports all follow this scope."
 * Multi-select, persisted per user in `account_scope_preferences` through the
 * `set_account_scope()` RPC (working rule #2 — no direct client writes).
 *
 * IMPORTANT (DATABASE.md §10, note): this selector is a FILTER, not a security
 * boundary. RLS restricts Site IT and Viewer. `locations` here is already the
 * intersection with what RLS allows, seeded by SessionProvider.
 */

import { create } from 'zustand';

import { setAccountScope } from '@/api/session';

export interface ScopeLocation {
  id: string;
  code: string;
  name: string;
  /** "Jakarta · 812 assets" — the asset count joins in with Phase 3. */
  meta: string;
}

interface ScopeState {
  locations: ScopeLocation[];
  /** Selected location ids. */
  scope: string[];
  setLocations: (locations: ScopeLocation[]) => void;
  toggle: (id: string) => void;
  setScope: (scope: string[]) => void;
  /** Assets empty state offers "restore both scope locations". */
  reset: () => void;
}

export const useScopeStore = create<ScopeState>((set, get) => ({
  locations: [],
  scope: [],

  setLocations: (locations) => set({ locations }),

  toggle: (id) => {
    const current = get().scope;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    // Optimistic: the chip and every scoped query update immediately, then the
    // preference is persisted. A failure rolls the selection back.
    set({ scope: next });
    void setAccountScope(next).catch(() => set({ scope: current }));
  },

  setScope: (scope) => set({ scope }),

  reset: () => {
    const all = get().locations.map((l) => l.id);
    set({ scope: all });
    void setAccountScope(all).catch(() => undefined);
  },
}));

/**
 * Chip label — README § Global Chrome:
 * `HO + Site` when both selected, `Head Office` / `Site` when one,
 * `None` when zero.
 */
export function useScopeLabel(): string {
  const locations = useScopeStore((s) => s.locations);
  const scope = useScopeStore((s) => s.scope);

  if (scope.length === 0) return 'None';
  if (scope.length === locations.length && locations.length > 1) return 'HO + Site';

  const first = locations.find((l) => l.id === scope[0]);
  return first?.name ?? 'None';
}

/**
 * The sentence under the dashboard greeting, e.g.
 * "Scope · Head Office and Site · 7 assets".
 */
export function useScopeSentence(assetCount?: number): string {
  const locations = useScopeStore((s) => s.locations);
  const scope = useScopeStore((s) => s.scope);

  const names = locations.filter((l) => scope.includes(l.id)).map((l) => l.name);
  const where =
    names.length === 0
      ? 'No locations selected'
      : names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  return assetCount == null ? `Scope · ${where}` : `Scope · ${where} · ${assetCount} assets`;
}
