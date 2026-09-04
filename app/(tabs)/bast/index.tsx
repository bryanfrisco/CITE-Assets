/**
 * BAST list — README § Screens 5.
 *
 * "title + `4 documents · HO + Site`, three stat tiles (`Signed 2`,
 *  `Awaiting 1`, `Draft 1`), then record cards: BAST number (royal, tabular),
 *  status badge, date right-aligned, asset name,
 *  `Employee · Department · Location`."
 *
 * Two document kinds share this list — Serah Terima and Penarikan — because
 * they share a numbering sequence and a signing flow, and an IT officer looking
 * for "the paperwork on that laptop" wants both. The chips split them when the
 * question is narrower than that.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Search, X } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import {
  Badge,
  Card,
  Chip,
  ChipRow,
  DataTable,
  EmptyState,
  Input,
  Screen,
  Skeleton,
} from '@/components/ui';
import {
  BAST_KIND_LABEL,
  BAST_STATUS_LABEL,
  fetchBastList,
  fetchBastStats,
  type BastKind,
  type BastListRow,
} from '@/api/bast';
import { queryKeys } from '@/lib/queryClient';
import { useScopeLabel, useScopeStore } from '@/store/useScopeStore';
import { useIsDesktop } from '@/lib/useBreakpoint';

/** "24 Jul 2026" — the right-aligned date on each record card. */
function shortDate(value: string): string {
  const d = new Date(`${value}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function BastListScreen() {
  const t = useTheme();
  const router = useRouter();
  const scope = useScopeStore((s) => s.scope);
  const isDesktop = useIsDesktop();
  const scopeLabel = useScopeLabel();

  const [kind, setKind] = useState<BastKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  // The same 220ms as every other register in the app, so typing feels the same
  // here as it does in Assets.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 220);
    return () => clearTimeout(id);
  }, [query]);

  const list = useQuery({
    queryKey: [...queryKeys.bast(scope), kind, debounced],
    queryFn: () => fetchBastList(scope, kind === 'all' ? undefined : kind, debounced),
    enabled: scope.length > 0,
  });
  const stats = useQuery({
    queryKey: ['bastStats', scope],
    queryFn: () => fetchBastStats(scope),
    enabled: scope.length > 0,
  });

  const total = stats.data?.total ?? list.data?.length ?? 0;

  return (
    <Screen>
      <Text style={[t.type.screenTitle, { color: t.color.text }]}>E-BAST</Text>
      <Text style={[t.type.bodySmall, styles.countLine, { color: t.color.sub }]}>
        {`${total} document${total === 1 ? '' : 's'} · ${scopeLabel}`}
      </Text>

      <View style={styles.stats}>
        {(
          [
            ['Signed', stats.data?.signed],
            ['Awaiting', stats.data?.awaiting],
            ['Draft', stats.data?.draft],
          ] as const
        ).map(([label, value]) => (
          <Card key={label} radius="kpiTile" padding={12} style={styles.statTile}>
            <Text style={[t.type.kpiNumber, styles.statValue, { color: t.color.text }]}>
              {value ?? 0}
            </Text>
            <Text style={[t.type.kpiLabel, styles.statLabel, { color: t.color.sub }]}>{label}</Text>
          </Card>
        ))}
      </View>

      <ChipRow style={styles.kinds}>
        <Chip label="All" active={kind === 'all'} onPress={() => setKind('all')} />
        <Chip
          label={`Serah Terima${stats.data ? ` ${stats.data.handover}` : ''}`}
          active={kind === 'handover'}
          onPress={() => setKind('handover')}
        />
        <Chip
          label={`Penarikan${stats.data ? ` ${stats.data.returns}` : ''}`}
          active={kind === 'return'}
          onPress={() => setKind('return')}
        />
        <Chip
          label={`Perlengkapan${stats.data ? ` ${stats.data.accessory}` : ''}`}
          active={kind === 'accessory'}
          onPress={() => setKind('accessory')}
        />
      </ChipRow>

      <Input
        size="search"
        value={query}
        onChangeText={setQuery}
        placeholder="Number, asset, person, department…"
        autoCapitalize="none"
        autoCorrect={false}
        icon={<Search size={17} color={t.color.sub} strokeWidth={1.8} />}
        accessory={
          query ? (
            <Pressable
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={10}
            >
              <X size={16} color={t.color.sub} strokeWidth={1.9} />
            </Pressable>
          ) : null
        }
        containerStyle={styles.search}
      />

      {scope.length === 0 ? (
        <EmptyState
          title="No locations selected"
          description="Choose at least one location from the scope selector in the header."
        />
      ) : list.isPending ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={96} radius={t.radii.card} />
          ))}
        </View>
      ) : list.isError ? (
        <EmptyState
          variant="error"
          title="Could not load E-BAST documents"
          description={(list.error as Error).message}
          actionLabel="Try again"
          onAction={() => list.refetch()}
        />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          title="No E-BAST documents yet"
          description={
            kind === 'return'
              ? 'A Berita Acara Penarikan Barang is raised when an asset is returned.'
              : kind === 'handover'
                ? 'A Berita Acara Serah Terima Barang is raised when an asset is assigned.'
                : kind === 'accessory'
                  ? 'A Berita Acara Serah Terima Perlengkapan is raised from an accessory hand-out.'
                  : 'Berita Acara records appear here once an assignment or a return generates one.'
          }
        />
      ) : isDesktop ? (
        <DataTable
          rows={list.data ?? []}
          keyOf={(r) => r.id}
          onRowPress={(r) => router.push(`/bast/${r.id}`)}
          labelOf={(r) => `${r.bast_number} ${BAST_STATUS_LABEL[r.status]}`}
          columns={[
            {
              key: 'number',
              header: 'Number',
              weight: 1.6,
              render: (r) => (
                <Text style={[t.type.assetCode, { color: t.color.royal }]}>{r.bast_number}</Text>
              ),
            },
            {
              key: 'kind',
              header: 'Kind',
              render: (r) => (
                <Text numberOfLines={1} style={[t.type.meta, { color: t.color.sub }]}>
                  {BAST_KIND_LABEL[r.kind]}
                </Text>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <Badge label={BAST_STATUS_LABEL[r.status]} />,
            },
            {
              key: 'date',
              header: 'Date',
              render: (r) => (
                <Text numberOfLines={1} style={[t.type.meta, { color: t.color.sub }]}>
                  {shortDate(r.bast_date)}
                </Text>
              ),
            },
            {
              key: 'asset',
              header: 'Asset',
              weight: 1.4,
              render: (r) => (
                <Text numberOfLines={1} style={[t.type.meta, { color: t.color.sub }]}>
                  {r.asset_code ?? '—'}
                </Text>
              ),
            },
            {
              // Every holder, not just the first — the whole point of the
              // holder_label the server builds.
              key: 'holders',
              header: 'Held by',
              weight: 2,
              render: (r) => (
                <Text numberOfLines={1} style={[t.type.body, { color: t.color.text }]}>
                  {r.holder_label}
                </Text>
              ),
            },
            {
              key: 'location',
              header: 'Location',
              render: (r) => (
                <Text numberOfLines={1} style={[t.type.meta, { color: t.color.sub }]}>
                  {r.location_name}
                </Text>
              ),
            },
          ]}
        />
      ) : (
        <View style={styles.records}>
          {(list.data ?? []).map((row) => (
            <RecordCard key={row.id} row={row} onPress={() => router.push(`/bast/${row.id}`)} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function RecordCard({ row, onPress }: { row: BastListRow; onPress: () => void }) {
  const t = useTheme();
  const label = BAST_STATUS_LABEL[row.status];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.bast_number} ${label}`}
      style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
    >
      <Card padding={15}>
        <View style={styles.recordTop}>
          <Text style={[t.type.assetCode, { color: t.color.royal }]}>{row.bast_number}</Text>
          <Badge label={label} />
          <Text style={[t.type.metaStrong, styles.recordDate, { color: t.color.sub }]}>
            {shortDate(row.bast_date)}
          </Text>
        </View>

        <Text numberOfLines={1} style={[t.type.body, styles.recordAsset, { color: t.color.text }]}>
          {row.asset_name}
        </Text>
        <Text numberOfLines={1} style={[t.type.meta, styles.recordMeta, { color: t.color.sub }]}>
          {[BAST_KIND_LABEL[row.kind], row.holder_label, row.department_name, row.location_name]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: { marginBottom: 12 },
  countLine: { marginTop: 3 },
  stats: { flexDirection: 'row', gap: 9, marginTop: 14, marginBottom: 12 },
  kinds: { marginBottom: 14 },
  statTile: { flex: 1 },
  statValue: { fontSize: 20 },
  statLabel: { marginTop: 3 },
  skeletons: { gap: 10 },
  records: { gap: 10 },
  recordTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recordDate: { marginLeft: 'auto' },
  recordAsset: { marginTop: 9 },
  recordMeta: { marginTop: 3 },
});
