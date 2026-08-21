/**
 * Add or edit an accessory.
 *
 * One screen for both, because the fields are identical and the only thing
 * that changes is whether an id came in. `account-edit.tsx` does the same.
 *
 * Location is fixed once created. Moving stock between Head Office and Site is
 * a physical event with a count attached, not a dropdown — and quietly editing
 * the location would move the whole pile with nothing recording that it
 * travelled. So on an existing row the field still shows where the stock is,
 * but does not open: hiding it would leave the question unanswered instead.
 *
 * `total_qty` is the number OWNED, not the number on the shelf. The server
 * refuses to take it below what is currently out, because a register that says
 * five exist while seven are in people's hands is worse than no register.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react-native';

import { useTheme } from '@/theme';
import {
  Button,
  Card,
  DateField,
  EmptyState,
  Input,
  PickerSheet,
  Screen,
  SelectField,
  Skeleton,
  Switch,
} from '@/components/ui';
import { createAccessory, fetchAccessoryDetail, updateAccessory } from '@/api/accessories';
import { listMaster } from '@/api/masterData';
import { queryKeys } from '@/lib/queryClient';
import { useScopeStore } from '@/store/useScopeStore';
import { useToast } from '@/store/useUiStore';
import { usePermissions } from '@/auth';

type Picker = 'category' | 'brand' | 'vendor' | 'location' | null;

export default function AccessoryEditScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const scope = useScopeStore((s) => s.scope);
  const { can } = usePermissions();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(id);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [modelNo, setModelNo] = useState('');
  const [totalQty, setTotalQty] = useState('0');
  const [purchaseDate, setPurchaseDate] = useState<string | null>(null);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [picker, setPicker] = useState<Picker>(null);
  const [error, setError] = useState('');

  const detail = useQuery({
    queryKey: ['accessory', id],
    queryFn: () => fetchAccessoryDetail(id!),
    enabled: editing,
  });

  const categories = useQuery({
    queryKey: queryKeys.master('category'),
    queryFn: () => listMaster('category'),
  });
  const brands = useQuery({
    queryKey: queryKeys.master('brand'),
    queryFn: () => listMaster('brand'),
  });
  const vendors = useQuery({
    queryKey: queryKeys.master('vendor'),
    queryFn: () => listMaster('vendor'),
  });
  const locations = useQuery({
    queryKey: queryKeys.master('location'),
    queryFn: () => listMaster('location'),
  });

  // Fill the form once the record arrives.
  useEffect(() => {
    const a = detail.data?.accessory;
    if (!a) return;
    setName(a.name);
    setCategoryId(a.categoryId);
    setBrandId(a.brandId);
    setVendorId(a.vendorId);
    setLocationId(a.locationId);
    setModelNo(a.modelNo ?? '');
    setTotalQty(String(a.totalQty));
    setPurchaseDate(a.purchaseDate);
    setPurchasePrice(a.purchasePrice == null ? '' : String(a.purchasePrice));
    setNotes(a.notes ?? '');
    setIsActive(a.isActive);
  }, [detail.data]);

  const opts = (rows: { id: string; name: string; isActive: boolean }[] | undefined) =>
    (rows ?? []).filter((r) => r.isActive).map((r) => ({ id: r.id, name: r.name }));

  const categoryOptions = useMemo(() => opts(categories.data), [categories.data]);
  const brandOptions = useMemo(() => opts(brands.data), [brands.data]);
  const vendorOptions = useMemo(() => opts(vendors.data), [vendors.data]);
  // Only locations the current scope covers — creating stock somewhere the
  // person cannot then see it would be a dead end, and RLS refuses it anyway.
  const locationOptions = useMemo(
    () => opts(locations.data).filter((l) => scope.includes(l.id)),
    [locations.data, scope],
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        categoryId: categoryId!,
        locationId: locationId!,
        totalQty: Number(totalQty || '0'),
        brandId,
        vendorId,
        modelNo: modelNo.trim() || null,
        purchaseDate,
        purchasePrice: purchasePrice.trim() || null,
        notes: notes.trim() || null,
        isActive,
      };
      return editing ? updateAccessory(id!, payload) : createAccessory(payload);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['accessories'] });
      void queryClient.invalidateQueries({ queryKey: ['accessory'] });
      toast(editing ? 'Accessory updated' : `${name.trim()} added`);
      if (editing) router.back();
      else router.replace(`/accessory/${result.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!can('asset.create')) {
    return (
      <Screen>
        <EmptyState
          title="Not available"
          description="Adding accessories needs a role that can create assets."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  if (editing && detail.isPending) {
    return (
      <Screen>
        <Skeleton height={120} radius={t.radii.cardLarge} />
      </Screen>
    );
  }

  const complete = name.trim() !== '' && categoryId !== null && locationId !== null;

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

      <Text style={[t.type.screenTitle, { color: t.color.text }]}>
        {editing ? 'Edit accessory' : 'Add an accessory'}
      </Text>
      <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
        Things with no serial number — mice, keyboards, cables, headsets
      </Text>

      <Card padding={15} title="What it is" style={styles.card}>
        <Input
          label="Name"
          required
          value={name}
          onChangeText={(v) => {
            setName(v);
            setError('');
          }}
          placeholder="e.g. Logitech M170 Wireless Mouse"
          containerStyle={styles.field}
        />
        <SelectField
          label="Category"
          required
          value={categoryOptions.find((c) => c.id === categoryId)?.name}
          placeholder="Choose a category"
          onPress={() => setPicker('category')}
          containerStyle={styles.field}
        />
        <SelectField
          label="Brand"
          value={brandOptions.find((b) => b.id === brandId)?.name}
          placeholder="Optional"
          onPress={() => setPicker('brand')}
          containerStyle={styles.field}
        />
        <Input
          label="Model number"
          value={modelNo}
          onChangeText={setModelNo}
          placeholder="Optional"
          containerStyle={styles.field}
        />
      </Card>

      <Card padding={15} title="How many, and where" style={styles.card}>
        <Input
          label="Total owned"
          required
          value={totalQty}
          onChangeText={(v) => {
            setTotalQty(v.replace(/[^0-9]/g, ''));
            setError('');
          }}
          keyboardType="number-pad"
          containerStyle={styles.field}
        />
        <Text style={[t.type.meta, styles.hint, { color: t.color.sub }]}>
          The number owned, not the number on the shelf. What is available is worked out from this
          minus whatever is currently out.
        </Text>
        <SelectField
          label="Location"
          required
          value={locationOptions.find((l) => l.id === locationId)?.name}
          placeholder={editing ? undefined : 'Choose a location'}
          onPress={editing ? undefined : () => setPicker('location')}
          containerStyle={styles.field}
        />
        {editing ? (
          <Text style={[t.type.meta, styles.hint, { color: t.color.sub }]}>
            Location is fixed. Stock at another location is a separate record.
          </Text>
        ) : null}
      </Card>

      <Card padding={15} title="Purchase" style={styles.card}>
        <SelectField
          label="Vendor"
          value={vendorOptions.find((v) => v.id === vendorId)?.name}
          placeholder="Optional"
          onPress={() => setPicker('vendor')}
          containerStyle={styles.field}
        />
        <DateField
          label="Bought on"
          value={purchaseDate}
          onChange={setPurchaseDate}
          placeholder="Optional"
        />
        <Input
          label="Price each"
          value={purchasePrice}
          onChangeText={(v) => setPurchasePrice(v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="IDR, per unit"
          containerStyle={styles.field}
        />
        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          multiline
          numberOfLines={2}
          containerStyle={styles.field}
        />
        {editing ? (
          <View style={styles.switchRow}>
            <Text style={[t.type.body, { color: t.color.text }]}>In use</Text>
            <Switch value={isActive} onValueChange={setIsActive} />
          </View>
        ) : null}
      </Card>

      {error ? (
        <Text style={[t.type.meta, styles.hint, { color: t.color.error }]}>{error}</Text>
      ) : null}

      <Button
        label={editing ? 'Save' : 'Add it'}
        block
        disabled={!complete}
        loading={save.isPending}
        onPress={() => save.mutate()}
      />

      <PickerSheet
        visible={picker === 'category'}
        title="Category"
        options={categoryOptions}
        selectedId={categoryId}
        onSelect={(o) => setCategoryId(o.id)}
        onDismiss={() => setPicker(null)}
        emptyMessage="Add a category in Master data first."
      />
      <PickerSheet
        visible={picker === 'brand'}
        title="Brand"
        options={brandOptions}
        selectedId={brandId}
        onSelect={(o) => setBrandId(o.id)}
        onDismiss={() => setPicker(null)}
        clearLabel="No brand"
        onClear={() => setBrandId(null)}
      />
      <PickerSheet
        visible={picker === 'vendor'}
        title="Vendor"
        options={vendorOptions}
        selectedId={vendorId}
        onSelect={(o) => setVendorId(o.id)}
        onDismiss={() => setPicker(null)}
        clearLabel="No vendor"
        onClear={() => setVendorId(null)}
      />
      <PickerSheet
        visible={picker === 'location'}
        title="Location"
        options={locationOptions}
        selectedId={locationId}
        onSelect={(o) => setLocationId(o.id)}
        onDismiss={() => setPicker(null)}
        emptyMessage="No location in the current scope."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 3, marginBottom: 14, lineHeight: 17 },
  card: { marginBottom: 12 },
  field: { marginBottom: 12 },
  hint: { marginTop: -4, marginBottom: 12, lineHeight: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
