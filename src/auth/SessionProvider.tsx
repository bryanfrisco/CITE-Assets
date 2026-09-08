/**
 * SessionProvider — bootstraps the session on mount and keeps it in step with
 * Supabase Auth state changes, then hands the scope store its real locations.
 *
 * Order on a cold start:
 *   1. Supabase restores the persisted session (AsyncStorage).
 *   2. bootstrap_session() returns account + role + allowed locations + scope.
 *   3. The scope store is seeded with the locations RLS permits.
 */

import React, { useCallback, useEffect, type ReactNode } from 'react';

import { bootstrapSession, fetchLocations, signOut } from '@/api/session';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useSessionStore } from '@/store/useSessionStore';
import { useScopeStore, type ScopeLocation } from '@/store/useScopeStore';
import { DEMO_LOCATIONS, DEMO_SESSION } from './demoSession';

export function SessionProvider({ children }: { children: ReactNode }) {
  const setSession = useSessionStore((s) => s.setSession);
  const setStatus = useSessionStore((s) => s.setStatus);
  const clear = useSessionStore((s) => s.clear);
  const setLocations = useScopeStore((s) => s.setLocations);
  const setScope = useScopeStore((s) => s.setScope);

  /**
   * `initial` is a cold start: nobody is known yet, so holding the screen is
   * right. `revalidate` is the library keeping a live session alive — and on
   * web, a tab regaining focus.
   *
   * The difference matters because `status === 'loading'` unmounts the whole
   * navigator in AppShell. Entering it mid-session throws away where somebody
   * was standing and drops them back on the dashboard, roughly once an hour on
   * a phone and every tab switch on the web.
   */
  const load = useCallback(
    async (mode: 'initial' | 'revalidate' = 'initial') => {
      if (mode === 'initial') setStatus('loading');

      // No backend wired yet (.env is empty). Render the chrome against the
      // prototype's signed-in user so Phase 0 can be reviewed before a Supabase
      // project exists. Never reachable in a release build.
      if (!isSupabaseConfigured && __DEV__) {
        setSession(DEMO_SESSION.account, DEMO_SESSION.allowedLocations);
        setLocations(DEMO_LOCATIONS);
        setScope(DEMO_SESSION.scope);
        return;
      }

      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          clear();
          return;
        }

        const result = await bootstrapSession();
        if (!result.account) {
          // Authenticated, but no active account row — not provisioned.
          await signOut();
          clear();
          return;
        }

        setSession(result.account, result.allowedLocations);

        const rows = await fetchLocations();
        const locations: ScopeLocation[] = (rows ?? [])
          .filter((l) => result.allowedLocations.includes(l.id))
          .map((l) => ({
            id: l.id,
            code: l.code,
            name: l.name,
            // Asset counts join in with Phase 3's dashboard query.
            meta: l.city ?? '',
          }));

        setLocations(locations);

        // Only seed the scope on a cold start. Every change to the chip is
        // written to the server already, so re-reading it mid-session either
        // changes nothing or — if a toggle is still in flight — quietly undoes
        // the location somebody just picked.
        if (mode === 'initial') setScope(result.scope);
      } catch {
        // A bootstrap failure must not strand the user on a blank screen.
        clear();
      }
    },
    [clear, setLocations, setScope, setSession, setStatus],
  );

  useEffect(() => {
    void load();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        void load('initial');
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Already authenticated means this is a token being kept alive, not
        // somebody arriving. Refresh what we know without tearing the
        // navigator down under them.
        const known = useSessionStore.getState().status === 'authenticated';
        void load(known ? 'revalidate' : 'initial');
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [load]);

  return <>{children}</>;
}
