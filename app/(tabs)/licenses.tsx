/**
 * Licenses — the register for software.
 *
 * Deliberately the same shape as Assets and Accessories: the same filter pill,
 * the same search field, the same card. Somebody who can find a laptop here can
 * find AutoCAD without being taught anything new.
 *
 * Two things differ, and both come from what a licence actually is:
 *
 *   There is no scope selector. Assets and accessories live at a location and
 *   RLS narrows them; software is bought centrally and belongs to everybody, so
 *   the register reads the same for Site IT and for Head Office.
 *
 *   The figure on the right is seats, not quantity. What somebody needs to know
 *   before promising a licence to a person is whether a chair is free.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, KeyRound, Plus, Search, SlidersHorizontal, X } from 'lucide-react-native';

import { useTheme } from '@/theme';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Input,
  PickerSheet,
  Screen,
  Skeleton,
} from '@/components/ui';
import { expiryLabel, expiryTone, fetchLicenses } from '@/api/licenses';
import { listMaster } from '@/api/masterData';
import { queryKeys } from '@/lib/queryClient';
import { usePermissions } from '@/auth';
import { useIsDesktop } from '@/lib/useBreakpoint';

type StatusFilter = 'available' | 'expiring' | 'expired';

const STATUS_LABEL: Record<StatusFilter, string> = {
  available: 'Has a free seat',
  expiring: 'Expiring soon',
  expired: 'Expired',
};

export default function LicensesScreen() {
  const t = useTheme();
  const router = useRouter();
  const { can } = usePermissions();
  const isDesktop = useIsDesktop();

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter | null>(null);
  const [categorySheet, setCategorySheet] = useState(false);
  const [statusSheet, setStatusSheet] = useState(false);

  // Same 220ms as the other two registers, so typing feels identical.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 220);
    return () => clearTimeout(id);
  }, [query]);

  const categories = useQuery({
    queryKey: queryKeys.master('license_category'),
    queryFn: () => listMaster('license_category'),
  });

  const licenses = useQuery({
    queryKey: ['licenses', debounced, category, status],
    queryFn: () => fetchLicenses({ query: debounced, categoryId: category, status }),
  });

  const categoryName = (categories.data ?? []).find((c) => c.id === category)?.name ?? null;
  const filtering = debounced.trim() !== '' || category !== null || status !== null;

  const resetFilters = () => {
    setQuery('');
    setDebounced('');
    setCategory(null);
    setStatus(null);
  };

  const rows = licenses.data ?? [];
  const seats = rows.reduce(
    (acc, r) => ({ used: acc.used + r.used_seats, free: acc.free + r.available_seats }),
    { used: 0, free: 0 },
  );

  return (
    <Screen>
      <Text style={[t.type.screenTitle, { color: t.color.text }]}>Licenses</Text>
      <Text style={[t.type.meta, styles.countLine, { color: t.color.sub }]}>
        {`${rows.length} licences · ${seats.used} seats in use · ${seats.free} free`}
      </Text>

      <View style={styles.narrowRow}>
        <Pressable
          onPress={() => setCategorySheet(true)}
          accessibilityRole="button"
          accessibilityLabel="Filter by licence category"
          style={({ pressed }) => [
            styles.narrowButton,
            {
              borderRadius: t.radii.inputLarge,
              borderColor: category ? t.color.royal : t.color.line,
              borderWidth: category ? 1.5 : 1,
              backgroundColor: pressed ? t.color.soft : t.color.card,
            },
          ]}
        >
          <SlidersHorizontal size={14} color={t.color.sub} strokeWidth={1.8} />
          <Text
            numberOfLines={1}
            style={[t.type.metaStrong, styles.narrowLabel, { color: t.color.text }]}
          >
            {categoryName ?? 'All categories'}
          </Text>
          {category ? (
            <Pressable
              onPress={() => setCategory(null)}
              accessibilityRole="button"
              accessibilityLabel="Clear category"
              hitSlop={10}
            >
              <X size={14} color={t.color.sub} strokeWidth={2} />
            </Pressable>
          ) : null}
        </Pressable>

        <Pressable
          onPress={() => setStatusSheet(true)}
          accessibilityRole="button"
          accessibilityLabel="Filter by status"
          style={({ pressed }) => [
            styles.narrowButton,
            {
              borderRadius: t.radii.inputLarge,
              borderColor: status ? t.color.royal : t.color.line,
              borderWidth: status ? 1.5 : 1,
              backgroundColor: pressed ? t.color.soft : t.color.card,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[t.type.metaStrong, styles.narrowLabel, { color: t.color.text }]}
          >
            {status ? STATUS_LABEL[status] : 'Any status'}
          </Text>
          {status ? (
            <Pressable
              onPress={() => setStatus(null)}
              accessibilityRole="button"
              accessibilityLabel="Clear status"
              hitSlop={10}
            >
              <X size={14} color={t.color.sub} strokeWidth={2} />
            </Pressable>
          ) : null}
        </Pressable>
      </View>

      <Input
        size="search"
        value={query}
        onChangeText={setQuery}
        placeholder="Software, licence number, vendor…"
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

      {can('asset.create') ? (
        <Button
          label="Add a licence"
          variant="secondary"
          block
          icon={<Plus size={15} color={t.color.text} strokeWidth={1.9} />}
          onPress={() => router.push('/license-edit')}
          style={styles.add}
        />
      ) : null}

      {licenses.isPending ? (
        <View style={styles.list}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={86} radius={t.radii.card} />
          ))}
        </View>
      ) : licenses.isError ? (
        <EmptyState
          variant="error"
          title="Could not load licences"
          description={(licenses.error as Error).message}
          actionLabel="Try again"
          onAction={() => licenses.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No licences match"
          description={
            filtering
              ? 'Try a different name, or clear the filters.'
              : 'Add the first licence, or import them from a spreadsheet.'
          }
          actionLabel={filtering ? 'Reset filters' : undefined}
          onAction={filtering ? resetFilters : undefined}
        />
      ) : isDesktop ? (
        <DataTable
          rows={rows}
          keyOf={(r) => r.id}
          onRowPress={(r) => router.push({ pathname: '/license/[id]', params: { id: r.id } })}
          labelOf={(r) => `${r.software}, ${r.available_seats} of ${r.total_seats} seats free`}
          columns={[
            {
              key: 'software',
              header: 'Software',
              weight: 1.8,
              render: (r) => (
                <Text numberOfLines={1} style={[t.type.body, { color: t.color.text }]}>
                  {r.software}
                </Text>
              ),
            },
            {
              key: 'category',
              header: 'Category',
              render: (r) => (
                <Text numberOfLines={1} style={[t.type.meta, { color: t.color.sub }]}>
                  {r.category_name}
                </Text>
              ),
            },
            {
              key: 'vendor',
              header: 'Vendor',
              weight: 1.6,
              render: (r) => (
                <Text numberOfLines={1} style={[t.type.meta, { color: t.color.sub }]}>
                  {r.vendor_name ?? '—'}
                </Text>
              ),
            },
            {
              key: 'number',
              header: 'Licence no.',
              weight: 1.6,
              render: (r) => (
                <Text numberOfLines={1} style={[t.type.meta, { color: t.color.sub }]}>
                  {r.license_number ?? '—'}
                </Text>
              ),
            },
            {
              key: 'seats',
              header: 'Seats',
              align: 'right',
              render: (r) => (
                <Text style={[t.type.metaStrong, { color: t.color.text, textAlign: 'right' }]}>
                  {`${r.used_seats}/${r.total_seats}`}
                </Text>
              ),
            },
            {
              key: 'expiry',
              header: 'Expiry',
              weight: 1.3,
              render: (r) =>
                r.expiry_state === 'none' ? (
                  <Text style={[t.type.meta, { color: t.color.sub }]}>—</Text>
                ) : (
                  <Badge
                    label={expiryLabel(r.expiry_state, r.expiry_date)}
                    tone={expiryTone(r.expiry_state)}
                  />
                ),
            },
          ]}
        />
      ) : (
        <View style={styles.list}>
          {rows.map((row) => (
            <Pressable
              key={row.id}
              onPress={() => router.push({ pathname: '/license/[id]', params: { id: row.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${row.software}, ${row.available_seats} of ${row.total_seats} seats free`}
            >
              <Card padding={13}>
                <View style={styles.cardTop}>
                  <View
                    style={[
                      styles.iconChip,
                      {
                        width: t.sizes.categoryIconChip,
                        height: t.sizes.categoryIconChip,
                        borderRadius: t.radii.iconChip,
                        backgroundColor: t.color.soft,
                      },
                    ]}
                  >
                    <KeyRound size={19} color={t.color.royal} strokeWidth={1.8} />
                  </View>

                  <View style={styles.cardText}>
                    <Text numberOfLines={1} style={[t.type.body, { color: t.color.text }]}>
                      {row.software}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[t.type.metaStrong, { color: t.color.sub, marginTop: 3 }]}
                    >
                      {[row.category_name, row.vendor_name].filter(Boolean).join(' · ')}
                    </Text>
                  </View>

                  <View style={styles.seats}>
                    <Text style={[t.type.assetCode, { color: t.color.royal }]}>
                      {row.available_seats}
                    </Text>
                    <Text style={[t.type.badge, { color: t.color.sub }]}>of {row.total_seats}</Text>
                  </View>

                  <ChevronRight size={18} color={t.color.sub} strokeWidth={1.7} />
                </View>

                {row.expiry_state !== 'none' && row.expiry_state !== 'ok' ? (
                  <View style={styles.badgeRow}>
                    <Badge
                      label={expiryLabel(row.expiry_state, row.expiry_date)}
                      tone={expiryTone(row.expiry_state)}
                    />
                  </View>
                ) : null}
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      <PickerSheet
        visible={categorySheet}
        title="Licence category"
        options={(categories.data ?? [])
          .filter((c) => c.isActive)
          .map((c) => ({ id: c.id, name: c.name }))}
        selectedId={category}
        onSelect={(o) => setCategory(o.id)}
        onDismiss={() => setCategorySheet(false)}
        emptyMessage="No licence categories in master data yet"
        clearLabel="All categories"
        onClear={() => setCategory(null)}
      />

      <PickerSheet
        visible={statusSheet}
        title="Status"
        options={(Object.keys(STATUS_LABEL) as StatusFilter[]).map((k) => ({
          id: k,
          name: STATUS_LABEL[k],
        }))}
        selectedId={status}
        onSelect={(o) => setStatus(o.id as StatusFilter)}
        onDismiss={() => setStatusSheet(false)}
        clearLabel="Any status"
        onClear={() => setStatus(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  narrowRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  narrowButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 12,
  },
  narrowLabel: { flex: 1, minWidth: 0 },
  countLine: { marginTop: 5, marginBottom: 14 },
  search: { marginBottom: 12 },
  add: { marginBottom: 14 },
  list: { gap: 9 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  iconChip: { alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, minWidth: 0 },
  seats: { alignItems: 'flex-end' },
  badgeRow: { flexDirection: 'row', marginTop: 10 },
});
