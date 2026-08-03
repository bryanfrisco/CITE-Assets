/**
 * Maintenance — a log of what went to the shop, and when it came back.
 *
 * Client instruction, 2026-08-04: "pencatatan saja. dari tanggal berapa ke
 * berapa laptop ini di maintenance kan. tidak perlu status open sampai
 * cancelled."
 *
 * So there is no state to move a record through. Ongoing work is whatever has
 * no end date yet, and it sits at the top because it is the only part anybody
 * has to do something about.
 *
 * Nothing here changes an asset's status. Those were two ideas wearing one
 * name, and closing a ticket used to leave the asset stuck in Maintenance and
 * out of the assign picker for good.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Wrench } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { Badge, Card, Chip, ChipRow, EmptyState, Screen, Skeleton } from '@/components/ui';
import { fetchMaintenance, fetchMaintenanceStats, type MaintenanceRecord } from '@/api/maintenance';
import { formatDate } from '@/lib/dates';
import { useScopeStore } from '@/store/useScopeStore';

const FILTERS: { key: 'all' | 'ongoing' | 'finished'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ongoing', label: 'In the shop' },
  { key: 'finished', label: 'Finished' },
];

function money(value: string | number | null): string {
  const n = Number(value ?? 0);
  return n ? `Rp ${n.toLocaleString('id-ID')}` : 'Rp 0';
}

export default function MaintenanceScreen() {
  const t = useTheme();
  const router = useRouter();
  const scope = useScopeStore((s) => s.scope);

  const [filter, setFilter] = useState<'all' | 'ongoing' | 'finished'>('all');

  const stats = useQuery({
    queryKey: ['maintenanceStats', scope],
    queryFn: () => fetchMaintenanceStats(scope),
    enabled: scope.length > 0,
  });

  const list = useQuery({
    queryKey: ['maintenance', scope, filter],
    queryFn: () => fetchMaintenance(scope, filter === 'all' ? undefined : filter === 'ongoing'),
    enabled: scope.length > 0,
  });

  const rows = list.data ?? [];

  return (
    <Screen
      refreshing={list.isFetching || stats.isFetching}
      onRefresh={() => {
        void list.refetch();
        void stats.refetch();
      }}
    >
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
        A record of what went to the shop and when it came back
      </Text>

      <View style={styles.stats}>
        {(
          [
            ['In the shop', String(stats.data?.ongoing ?? 0)],
            ['Finished', String(stats.data?.finished ?? 0)],
            ['Days total', String(stats.data?.days ?? 0)],
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
        <Text style={[t.type.fieldLabel, { color: t.color.sub }]}>Spent on repairs</Text>
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
          title={filter === 'all' ? 'Nothing recorded yet' : 'Nothing here'}
          description="Record a repair from an asset's Maintenance tab."
        />
      ) : (
        <Card padding={0} radius="listContainer">
          {rows.map((row, i) => (
            <MaintenanceRow
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

function MaintenanceRow({
  row,
  last,
  onPress,
}: {
  row: MaintenanceRecord;
  last: boolean;
  onPress: () => void;
}) {
  const t = useTheme();

  // The date range IS the record. "12 Mar — 19 Mar · 7 days" says more than any
  // status word could, and it is what somebody is actually looking for.
  const range = row.ongoing
    ? `Since ${formatDate(row.started_at)} · ${row.days} day${row.days === 1 ? '' : 's'}`
    : `${formatDate(row.started_at)} — ${formatDate(row.completed_at)} · ${row.days} day${
        row.days === 1 ? '' : 's'
      }`;

  const meta = [row.asset_code, row.vendor_name ?? 'In-house', money(row.cost)]
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
        <Wrench size={16} color={row.ongoing ? t.color.amber : t.color.sub} strokeWidth={1.8} />
      </View>

      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[t.type.bodySmall, { color: t.color.text }]}>
          {row.title}
        </Text>
        <Text numberOfLines={1} style={[t.type.meta, styles.rowMeta, { color: t.color.sub }]}>
          {range}
        </Text>
        <Text numberOfLines={1} style={[t.type.meta, styles.rowMeta, { color: t.color.sub }]}>
          {meta}
        </Text>
      </View>

      <Badge
        label={row.ongoing ? 'In the shop' : 'Done'}
        tone={row.ongoing ? undefined : 'available'}
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
