/**
 * Home (Dashboard) — Phase 0 shell.
 *
 * The greeting, scope sentence and skeleton timing are final (README
 * § Dashboard). The KPI grid, warranty card, quick actions, charts and recent
 * activity arrive in Phase 3 once `dashboard_summary()` exists; until then the
 * screen resolves to its empty state.
 *
 * All three states required by working rule #4 are wired here: loading
 * (skeletons), empty, and error.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { LayoutDashboard } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { EmptyState, Screen, SkeletonKpiGrid } from '@/components/ui';
import { greetingFor, useSessionStore } from '@/store/useSessionStore';
import { useScopeSentence, useScopeStore } from '@/store/useScopeStore';

export default function HomeScreen() {
  const t = useTheme();
  const account = useSessionStore((s) => s.account);
  const scope = useScopeStore((s) => s.scope);
  const scopeSentence = useScopeSentence();

  const [refreshing, setRefreshing] = useState(false);
  // Phase 3 replaces this with the dashboard_summary() query's error.
  const [error] = useState<string | null>(null);

  // README § Interactions: "Navigating to Home or Assets → 620ms skeleton,
  // then content." Re-runs whenever the global scope changes.
  //
  // `loading` is derived rather than set inside the effect: the moment the
  // scope key changes it no longer matches `settledScope`, so skeletons appear
  // on the same render instead of one render later.
  const scopeKey = scope.join(',');
  const [settledScope, setSettledScope] = useState<string | null>(null);
  const loading = settledScope !== scopeKey;

  useEffect(() => {
    const timer = setTimeout(() => setSettledScope(scopeKey), t.durations.skeleton);
    return () => clearTimeout(timer);
  }, [scopeKey, t.durations.skeleton]);

  // README § Dashboard: pull-to-refresh re-runs the same queries and shows
  // skeletons only on a cold load.
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Text style={[t.type.screenTitle, { color: t.color.text }]}>
        {greetingFor(account?.fullName ?? 'there')}
      </Text>
      <Text style={[t.type.meta, styles.scopeLine, { color: t.color.sub }]}>{scopeSentence}</Text>

      {loading ? (
        <SkeletonKpiGrid />
      ) : error ? (
        <EmptyState
          variant="error"
          title="Could not load the dashboard"
          description={error}
          actionLabel="Try again"
          onAction={onRefresh}
        />
      ) : scope.length === 0 ? (
        // README § Interactions: zero locations selected → empty state.
        <EmptyState
          title="No locations in scope"
          description="Select at least one location in the scope chip to see dashboard figures."
        />
      ) : (
        <EmptyState
          icon={<LayoutDashboard size={24} color={t.color.sub} strokeWidth={1.7} />}
          title="Dashboard is not connected yet"
          description="KPI tiles, warranty card and charts land in Phase 3, once the assets register and dashboard_summary() are in place."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scopeLine: { marginTop: 5, marginBottom: 18 },
});
