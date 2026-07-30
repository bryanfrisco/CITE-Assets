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

  const load = useCallback(async () => {
    setStatus('loading');

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
      setScope(result.scope);
    } catch {
      // A bootstrap failure must not strand the user on a blank screen.
      clear();
    }
  }, [clear, setLocations, setScope, setSession, setStatus]);

  useEffect(() => {
    void load();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        void load();
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [load]);

  return <>{children}</>;
}
