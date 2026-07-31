/**
 * Maintenance — Phase 6.
 *
 * Open work first, then everything else. A list sorted purely by date buries
 * the two jobs somebody is meant to be doing today under a year of finished
 * ones, so the ordering is state first and date second — and that ordering
 * lives in maintenance_list(), not here, so a report cannot disagree with the
 * screen.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Wrench } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { Badge, Card, Chip, ChipRow, EmptyState, Screen, Skeleton } from '@/components/ui';
import {
  MAINTENANCE_STATE_LABEL,
  fetchMaintenance,
  fetchMaintenanceStats,
  type MaintenanceListRow,
  type MaintenanceState,
} from '@/api/maintenance';
import { useScopeStore } from '@/store/useScopeStore';

const FILTERS: { key: MaintenanceState | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
];

function money(value: string | number | null): string {
  const n = Number(value ?? 0);
  if (!n) return 'Rp 0';
  return `Rp ${n.toLocaleString('id-ID')}`;
}

function shortDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function MaintenanceScreen() {
  const t = useTheme();
  const router = useRouter();
  const scope = useScopeStore((s) => s.scope);

  const [filter, setFilter] = useState<MaintenanceState | 'all'>('all');

  const stats = useQuery({
    queryKey: ['maintenanceStats', scope],
    queryFn: () => fetchMaintenanceStats(scope),
    enabled: scope.length > 0,
  });

  const list = useQuery({
    queryKey: ['maintenance', scope, filter],
    queryFn: () => fetchMaintenance(scope, filter === 'all' ? undefined : filter),
    enabled: scope.length > 0,
  });

  const rows = list.data ?? [];

  return (
    <Screen>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        style={styles.back}
      >
        <ChevronLeft size={15} color={t.color.royal} strokeWidth={2} />
        <Text style={[t.type.metaStrong, { color: t.color.royal }]}>Back</Text>
      </Pressable>

      <Text style={[t.type.screenTitle, { color: t.color.text }]}>Maintenance</Text>
      <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
        Open tickets and service records, across the locations you are viewing
      </Text>

      <View style={styles.stats}>
        {(
          [
            ['Open', stats.data?.open ?? 0],
            ['In progress', stats.data?.inProgress ?? 0],
            ['Completed', stats.data?.completed ?? 0],
          ] as const
        ).map(([label, value]) => (
          <Card key={label} radius="kpiTile" padding={12} style={styles.statTile}>
            <Text style={[t.type.kpiNumber, styles.statValue, { color: t.color.text }]}>
              {value}
            </Text>
            <Text style={[t.type.kpiLabel, styles.statLabel, { color: t.color.sub }]}>{label}</Text>
          </Card>
        ))}
      </View>

      <Card padding={13} style={styles.spendCard}>
        <Text style={[t.type.fieldLabel, { color: t.color.sub }]}>Spent on completed work</Text>
        <Text style={[t.type.detailTitle, styles.spend, { color: t.color.text }]}>
          {money(stats.data?.cost ?? 0)}
        </Text>
      </Card>

      <ChipRow style={styles.filters}>
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            active={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </ChipRow>

      {list.isPending ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={76} radius={t.radii.card} />
          ))}
        </View>
      ) : list.isError ? (
        <EmptyState
          variant="error"
          title="Could not load maintenance"
          description={(list.error as Error).message}
          actionLabel="Try again"
          onAction={() => list.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filter === 'all' ? 'No maintenance recorded' : 'Nothing in that state'}
          description="Open a job from an asset's Maintenance tab when something needs work."
        />
      ) : (
        <Card padding={0} radius="listContainer">
          {rows.map((row, i) => (
            <MaintenanceRowView
              key={row.id}
              row={row}
              last={i === rows.length - 1}
              onPress={() => router.push(`/maintenance-log?id=${row.id}`)}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}

function MaintenanceRowView({
  row,
  last,
  onPress,
}: {
  row: MaintenanceListRow;
  last: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const active = row.state === 'open' || row.state === 'in_progress';

  const meta = [
    row.asset_code,
    row.vendor_name ?? 'Internal',
    row.state === 'completed' ? shortDate(row.completed_at) : shortDate(row.started_at),
    Number(row.cost ?? 0) > 0 ? money(row.cost) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={row.title}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: t.color.line,
          backgroundColor: pressed ? t.color.soft : 'transparent',
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: t.color.soft }]}>
        <Wrench size={16} color={active ? t.color.amber : t.color.sub} strokeWidth={1.8} />
      </View>

      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[t.type.bodySmall, { color: t.color.text }]}>
          {row.title}
        </Text>
        <Text numberOfLines={1} style={[t.type.meta, styles.rowMeta, { color: t.color.sub }]}>
          {meta}
        </Text>
        {row.next_due_at ? (
          <Text style={[t.type.meta, styles.rowMeta, { color: t.color.sub }]}>
            {`Next due ${shortDate(row.next_due_at)}`}
          </Text>
        ) : null}
      </View>

      <Badge
        label={MAINTENANCE_STATE_LABEL[row.state]}
        tone={row.state === 'completed' ? 'available' : undefined}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 3, marginBottom: 14, lineHeight: 17 },
  stats: { flexDirection: 'row', gap: 9, marginBottom: 10 },
  statTile: { flex: 1 },
  statValue: { fontSize: 20 },
  statLabel: { marginTop: 3 },
  spendCard: { marginBottom: 16 },
  spend: { marginTop: 4 },
  filters: { marginBottom: 12 },
  skeletons: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0 },
  rowMeta: { marginTop: 3 },
});
