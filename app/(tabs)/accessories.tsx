/**
 * Accessories — the register for things that have no serial number.
 *
 * Deliberately the same screen as Assets: the same pill for the category
 * filter, the same search field, the same card. Somebody who can find a laptop
 * here can find a mouse without being taught anything.
 *
 * What differs is the number on the right of each row. An asset is one thing
 * and is either out or not; an accessory is a pile, and the only figure worth
 * putting in front of somebody is how many are left.
 *
 * Scope does the location filtering, exactly as on Assets — and RLS narrows it
 * again server-side, so Site IT cannot spend Head Office stock even by asking.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, Search, SlidersHorizontal, X } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { Button, Card, EmptyState, Input, PickerSheet, Screen, Skeleton } from '@/components/ui';
import { CategoryIcon } from '@/components/CategoryIcon';
import { fetchAccessories } from '@/api/accessories';
import { listMaster } from '@/api/masterData';
import { queryKeys } from '@/lib/queryClient';
import { useScopeLabel, useScopeStore } from '@/store/useScopeStore';
import { usePermissions } from '@/auth';

export default function AccessoriesScreen() {
  const t = useTheme();
  const router = useRouter();
  const scope = useScopeStore((s) => s.scope);
  const scopeLabel = useScopeLabel();
  const { can } = usePermissions();

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Same 220ms as the asset register, so typing feels identical.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 220);
    return () => clearTimeout(id);
  }, [query]);

  const categories = useQuery({
    queryKey: queryKeys.master('category'),
    queryFn: () => listMaster('category'),
  });

  const accessories = useQuery({
    queryKey: ['accessories', scope, debounced, category],
    queryFn: () => fetchAccessories(scope, { query: debounced, categoryId: category }),
    enabled: scope.length > 0,
  });

  const categoryName = (categories.data ?? []).find((c) => c.id === category)?.name ?? null;
  const filtering = debounced.trim() !== '' || category !== null;

  const resetFilters = () => {
    setQuery('');
    setDebounced('');
    setCategory(null);
  };

  const totals = useMemo(() => {
    const rows = accessories.data ?? [];
    return {
      available: rows.reduce((sum, r) => sum + r.available_qty, 0),
      out: rows.reduce((sum, r) => sum + r.assigned_qty, 0),
    };
  }, [accessories.data]);

  return (
    <Screen>
      <Text style={[t.type.screenTitle, { color: t.color.text }]}>Accessories</Text>
      <Text style={[t.type.meta, styles.countLine, { color: t.color.sub }]}>
        {`${totals.available} available · ${totals.out} out · ${scopeLabel}`}
      </Text>

      <View style={styles.narrowRow}>
        <Pressable
          onPress={() => setSheetOpen(true)}
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
      </View>

      <Input
        size="search"
        value={query}
        onChangeText={setQuery}
        placeholder={categoryName ? `Search in ${categoryName}…` : 'Name, model, brand…'}
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
          label="Add an accessory"
          variant="secondary"
          block
          icon={<Plus size={15} color={t.color.text} strokeWidth={1.9} />}
          onPress={() => router.push('/accessory-edit')}
          style={styles.add}
        />
      ) : null}

      {scope.length === 0 ? (
        <EmptyState
          title="No accessories match"
          description="Widen the global data scope to see stock at another location."
        />
      ) : accessories.isPending ? (
        <View style={styles.list}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={82} radius={t.radii.card} />
          ))}
        </View>
      ) : accessories.isError ? (
        <EmptyState
          variant="error"
          title="Could not load accessories"
          description={(accessories.error as Error).message}
          actionLabel="Try again"
          onAction={() => accessories.refetch()}
        />
      ) : (accessories.data ?? []).length === 0 ? (
        <EmptyState
          title="No accessories match"
          description="Try a different name, or widen the global data scope."
          actionLabel={filtering ? 'Reset filters' : undefined}
          onAction={filtering ? resetFilters : undefined}
        />
      ) : (
        <View style={styles.list}>
          {(accessories.data ?? []).map((row) => (
            <Pressable
              key={row.id}
              onPress={() => router.push(`/accessory/${row.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${row.name}, ${row.available_qty} available`}
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
                    <CategoryIcon name={null} size={19} color={t.color.royal} />
                  </View>

                  <View style={styles.cardText}>
                    <Text numberOfLines={1} style={[t.type.body, { color: t.color.text }]}>
                      {row.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[t.type.metaStrong, { color: t.color.sub, marginTop: 3 }]}
                    >
                      {`${row.category_name} · ${row.location_name}`}
                    </Text>
                  </View>

                  <View style={styles.stock}>
                    <Text style={[t.type.assetCode, { color: t.color.royal }]}>
                      {row.available_qty}
                    </Text>
                    <Text style={[t.type.badge, { color: t.color.sub }]}>of {row.total_qty}</Text>
                  </View>

                  <ChevronRight size={18} color={t.color.sub} strokeWidth={1.7} />
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      <PickerSheet
        visible={sheetOpen}
        title="Category"
        options={(categories.data ?? [])
          .filter((c) => c.isActive)
          .map((c) => ({ id: c.id, name: c.name }))}
        selectedId={category}
        onSelect={(o) => setCategory(o.id)}
        onDismiss={() => setSheetOpen(false)}
        emptyMessage="No categories in master data yet"
        clearLabel="All categories"
        onClear={() => setCategory(null)}
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
  categoryChip: { alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, minWidth: 0 },
  stock: { alignItems: 'flex-end' },
});
