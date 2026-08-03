/**
 * Assets — README § Screens 2.
 *
 * Title + count line "4 of 7 in scope · HO + Site" · 42px search field with a
 * clear button · scrollable status chips · asset cards (42px category chip,
 * royal code, name, holder line, chevron, then status/condition/location) ·
 * the dashed empty state with a Reset filters button.
 *
 * Search runs through the search_assets RPC, never client-side filtering.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownUp, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react-native';

import { useTheme } from '@/theme';
import {
  Badge,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Input,
  PickerSheet,
  Screen,
  SkeletonRows,
} from '@/components/ui';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ASSET_SORTS, countAssetsInScope, searchAssets, type AssetSort } from '@/api/assets';
import { listMaster } from '@/api/masterData';
import { queryKeys } from '@/lib/queryClient';
import { useScopeLabel, useScopeStore } from '@/store/useScopeStore';

const ALL = 'All';

export default function AssetsScreen() {
  const t = useTheme();
  const router = useRouter();
  const scope = useScopeStore((s) => s.scope);
  const resetScope = useScopeStore((s) => s.reset);
  const scopeLabel = useScopeLabel();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>(ALL);
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<AssetSort>('code');
  const [sheet, setSheet] = useState<'category' | 'sort' | null>(null);
  const [debounced, setDebounced] = useState('');

  // Typing must not fire a query per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 220);
    return () => clearTimeout(timer);
  }, [query]);

  const statuses = useQuery({
    queryKey: queryKeys.master('status'),
    queryFn: () => listMaster('status'),
  });

  const categories = useQuery({
    queryKey: queryKeys.master('category'),
    queryFn: () => listMaster('category'),
  });

  const statusId = useMemo(() => {
    if (status === ALL) return null;
    return statuses.data?.find((s) => s.name === status)?.id ?? null;
  }, [status, statuses.data]);

  const assets = useQuery({
    queryKey: [...queryKeys.assets(scope, debounced, status), category, sort],
    queryFn: () => searchAssets(scope, { query: debounced, statusId, categoryId: category, sort }),
    enabled: scope.length > 0,
  });

  const total = useQuery({
    queryKey: ['assetCount', scope],
    queryFn: () => countAssetsInScope(scope),
    enabled: scope.length > 0,
  });

  const filtering = debounced.trim() !== '' || status !== ALL || category !== null;

  const resetFilters = () => {
    setQuery('');
    setStatus(ALL);
    setCategory(null);
    setSort('code');
    // README § Assets: Reset filters also "restores both scope locations".
    resetScope();
  };

  const statusChips = [ALL, ...(statuses.data ?? []).filter((s) => s.isActive).map((s) => s.name)];

  const categoryName = (categories.data ?? []).find((c) => c.id === category)?.name ?? null;
  const sortLabel = ASSET_SORTS.find((o) => o.key === sort)?.label ?? 'Asset code';

  return (
    <Screen>
      <Text style={[t.type.screenTitle, { color: t.color.text }]}>Assets</Text>
      <Text style={[t.type.meta, styles.countLine, { color: t.color.sub }]}>
        {`${assets.data?.length ?? 0} of ${total.data ?? 0} in scope · ${scopeLabel}`}
      </Text>

      <View style={styles.narrowRow}>
        <Pressable
          onPress={() => setSheet('category')}
          accessibilityRole="button"
          accessibilityLabel="Filter by category"
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
          onPress={() => setSheet('sort')}
          accessibilityRole="button"
          accessibilityLabel="Sort"
          style={({ pressed }) => [
            styles.narrowButton,
            styles.sortButton,
            {
              borderRadius: t.radii.inputLarge,
              borderColor: t.color.line,
              backgroundColor: pressed ? t.color.soft : t.color.card,
            },
          ]}
        >
          <ArrowDownUp size={14} color={t.color.sub} strokeWidth={1.8} />
          <Text
            numberOfLines={1}
            style={[t.type.metaStrong, styles.narrowLabel, { color: t.color.text }]}
          >
            {sortLabel}
          </Text>
        </Pressable>
      </View>

      <Input
        size="search"
        value={query}
        onChangeText={setQuery}
        placeholder={
          categoryName ? `Search in ${categoryName}…` : 'Asset code, serial, name, user…'
        }
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

      <ChipRow style={styles.chips}>
        {statusChips.map((name) => (
          <Chip key={name} label={name} active={status === name} onPress={() => setStatus(name)} />
        ))}
      </ChipRow>

      {scope.length === 0 ? (
        // README § Interactions: zero locations selected → empty state.
        <EmptyState
          title="No assets match"
          description="Try a different asset code or widen the global data scope."
          actionLabel="Reset filters"
          onAction={resetFilters}
        />
      ) : assets.isPending ? (
        <SkeletonRows />
      ) : assets.isError ? (
        <EmptyState
          variant="error"
          title="Could not load assets"
          description={(assets.error as Error).message}
          actionLabel="Try again"
          onAction={() => assets.refetch()}
        />
      ) : (assets.data ?? []).length === 0 ? (
        <EmptyState
          title="No assets match"
          description="Try a different asset code or widen the global data scope."
          actionLabel={filtering ? 'Reset filters' : undefined}
          onAction={filtering ? resetFilters : undefined}
        />
      ) : (
        <View style={styles.list}>
          {(assets.data ?? []).map((asset) => (
            <Pressable
              key={asset.id}
              onPress={() => router.push(`/asset/${asset.asset_code}`)}
              accessibilityRole="button"
              accessibilityLabel={`${asset.asset_code} ${asset.name}`}
            >
              <Card padding={13}>
                <View style={styles.cardTop}>
                  <View
                    style={[
                      styles.categoryChip,
                      {
                        width: t.sizes.categoryIconChip,
                        height: t.sizes.categoryIconChip,
                        borderRadius: t.radii.iconChip,
                        backgroundColor: t.color.soft,
                      },
                    ]}
                  >
                    <CategoryIcon name={asset.category_icon} size={19} color={t.color.royal} />
                  </View>

                  <View style={styles.cardText}>
                    <Text style={[t.type.assetCode, { color: t.color.royal }]}>
                      {asset.asset_code}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[t.type.body, { color: t.color.text, marginTop: 2 }]}
                    >
                      {asset.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[t.type.metaStrong, { color: t.color.sub, marginTop: 2 }]}
                    >
                      {asset.holder_name
                        ? `${asset.holder_name}${asset.department_name ? ` · ${asset.department_name}` : ''}`
                        : 'Unassigned'}
                    </Text>
                  </View>

                  <ChevronRight size={18} color={t.color.sub} strokeWidth={1.7} />
                </View>

                <View style={styles.badges}>
                  <Badge label={asset.status_name} />
                  <Badge label={asset.condition_name} />
                  <View
                    style={[
                      styles.locationChip,
                      {
                        borderRadius: t.radii.badge,
                        backgroundColor: t.color.soft,
                        borderColor: t.color.line,
                      },
                    ]}
                  >
                    <Text style={[t.type.badge, { color: t.color.sub }]}>
                      {asset.location_name}
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
      <PickerSheet
        visible={sheet === 'category'}
        title="Category"
        options={(categories.data ?? [])
          .filter((c) => c.isActive)
          .map((c) => ({ id: c.id, name: c.name }))}
        selectedId={category}
        onSelect={(o) => setCategory(o.id)}
        onDismiss={() => setSheet(null)}
        emptyMessage="No categories in master data yet"
      />

      <PickerSheet
        visible={sheet === 'sort'}
        title="Sort by"
        options={ASSET_SORTS.map((o) => ({ id: o.key, name: o.label }))}
        selectedId={sort}
        onSelect={(o) => setSort(o.id as AssetSort)}
        onDismiss={() => setSheet(null)}
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
  sortButton: { flex: 0.9 },
  narrowLabel: { flex: 1, minWidth: 0 },
  countLine: { marginTop: 5, marginBottom: 14 },
  search: { marginBottom: 12 },
  chips: { marginBottom: 14 },
  list: { gap: 9 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  categoryChip: { alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, minWidth: 0 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11, flexWrap: 'wrap' },
  locationChip: { paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
});
