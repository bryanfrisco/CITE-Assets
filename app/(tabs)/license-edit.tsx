/**
 * Add or edit a licence.
 *
 * Same form shape as accessory-edit: one card, fields in the order somebody
 * reads them off a purchase record.
 *
 * `Licence number` is optional on purpose. Seven of the fifteen licences in the
 * real register have none, and the ones that do are not always numbers —
 * "Using Email" and "Subscription ID : 5521692074" are both real values. A
 * required field here would have meant inventing data to get past it.
 *
 * Seats are not set here. They are managed on the detail screen, where the
 * count can be checked against who is actually sitting in them.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Trash2 } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { BottomSheet, Button, Card, DateField, Input, PickerSheet, Screen } from '@/components/ui';
import {
  createLicense,
  deleteLicense,
  fetchLicense,
  updateLicense,
  type LicenseInput,
} from '@/api/licenses';
import { listMaster } from '@/api/masterData';
import { queryKeys } from '@/lib/queryClient';
import { usePermissions } from '@/auth';
import { useKeyboardInset } from '@/lib/useKeyboardInset';

export default function LicenseEditScreen() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { role } = usePermissions();
  const keyboard = useKeyboardInset();

  const editing = typeof id === 'string' && id.length > 0;
  const isSuperAdmin = role === 'super_admin';

  const [software, setSoftware] = useState('');
  const [number, setNumber] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [year, setYear] = useState('');
  const [expiry, setExpiry] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const [categorySheet, setCategorySheet] = useState(false);
  const [vendorSheet, setVendorSheet] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState('');

  const categories = useQuery({
    queryKey: queryKeys.master('license_category'),
    queryFn: () => listMaster('license_category'),
  });
  const vendors = useQuery({
    queryKey: queryKeys.master('vendor'),
    queryFn: () => listMaster('vendor'),
  });

  const existing = useQuery({
    queryKey: ['license', id],
    queryFn: () => fetchLicense(id as string),
    enabled: editing,
  });

  // Fill the form once, the moment the record arrives.
  //
  // Seeded during render rather than in an effect, the same way accessory-edit
  // and assign do it: an effect would paint the empty form and then immediately
  // paint it again, which React flags as a cascading render.
  const [seeded, setSeeded] = useState(false);
  const loaded = existing.data;
  if (loaded && !seeded) {
    setSeeded(true);
    setSoftware(loaded.software);
    setNumber(loaded.license_number ?? '');
    setCategoryId(loaded.category_id);
    setVendorId(loaded.vendor_id);
    setYear(loaded.purchase_year ? String(loaded.purchase_year) : '');
    setExpiry(loaded.expiry_date);
    setNotes(loaded.notes ?? '');
  }

  const save = useMutation({
    mutationFn: async () => {
      if (software.trim() === '') throw new Error('Enter the software name first');
      if (!categoryId) throw new Error('Pick a licence category first');

      const input: LicenseInput = {
        software: software.trim(),
        license_number: number.trim() === '' ? null : number.trim(),
        category_id: categoryId,
        vendor_id: vendorId,
        purchase_year: year.trim() === '' ? null : Number.parseInt(year, 10),
        expiry_date: expiry,
        notes: notes.trim() === '' ? null : notes.trim(),
      };

      if (editing) {
        await updateLicense(id as string, input);
        return id as string;
      }
      return createLicense(input);
    },
    onSuccess: (newId) => {
      qc.invalidateQueries({ queryKey: ['licenses'] });
      qc.invalidateQueries({ queryKey: ['license', newId] });
      router.back();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteLicense(id as string, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['licenses'] });
      setDeleteOpen(false);
      router.replace('/licenses');
    },
    onError: (e: Error) => setError(e.message),
  });

  const categoryName = (categories.data ?? []).find((c) => c.id === categoryId)?.name ?? null;
  const vendorName = (vendors.data ?? []).find((v) => v.id === vendorId)?.name ?? null;

  return (
    <Screen contentStyle={{ paddingBottom: t.spacing.screenBottom + keyboard }}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={styles.back}
        hitSlop={8}
      >
        <ChevronLeft size={18} color={t.color.sub} strokeWidth={2} />
        <Text style={[t.type.metaStrong, { color: t.color.sub }]}>Licenses</Text>
      </Pressable>

      <Text style={[t.type.screenTitle, { color: t.color.text, marginBottom: 16 }]}>
        {editing ? 'Edit licence' : 'Add a licence'}
      </Text>

      <Card padding={16}>
        <Field label="Software">
          <Input value={software} onChangeText={setSoftware} placeholder="AutoCAD" />
        </Field>

        <Field label="Licence number" hint="Optional — many licences do not have one">
          <Input
            value={number}
            onChangeText={setNumber}
            placeholder="V5TV-SXKS-D549-A9H9-VVG2"
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </Field>

        <Field label="Category">
          <Picker
            value={categoryName}
            placeholder="Pick a category"
            onPress={() => setCategorySheet(true)}
          />
        </Field>

        <Field label="Vendor" hint="Optional">
          <Picker
            value={vendorName}
            placeholder="Pick a vendor"
            onPress={() => setVendorSheet(true)}
          />
        </Field>

        <Field label="Purchase year" hint="Optional">
          <Input
            value={year}
            onChangeText={setYear}
            keyboardType="number-pad"
            placeholder="2026"
            maxLength={4}
          />
        </Field>

        <Field label="Expiry date" hint="Optional — leave empty for a perpetual licence">
          <DateField value={expiry} onChange={setExpiry} placeholder="No end date" />
        </Field>

        <Field label="Notes" hint="Optional">
          <Input
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything worth remembering"
            multiline
          />
        </Field>

        {error ? (
          <Text style={[t.type.meta, { color: t.color.error, marginTop: 4 }]}>{error}</Text>
        ) : null}

        <Button
          label={editing ? 'Save changes' : 'Add licence'}
          block
          loading={save.isPending}
          onPress={() => {
            setError('');
            save.mutate();
          }}
          style={{ marginTop: 18 }}
        />

        {editing && isSuperAdmin ? (
          <Button
            label="Delete licence"
            variant="secondary"
            block
            icon={<Trash2 size={15} color={t.color.error} strokeWidth={1.9} />}
            onPress={() => {
              setReason('');
              setError('');
              setDeleteOpen(true);
            }}
            style={{ marginTop: 8 }}
          />
        ) : null}
      </Card>

      <PickerSheet
        visible={categorySheet}
        title="Licence category"
        options={(categories.data ?? [])
          .filter((c) => c.isActive)
          .map((c) => ({ id: c.id, name: c.name }))}
        selectedId={categoryId}
        onSelect={(o) => setCategoryId(o.id)}
        onDismiss={() => setCategorySheet(false)}
        emptyMessage="No licence categories in master data yet"
      />

      <PickerSheet
        visible={vendorSheet}
        title="Vendor"
        options={(vendors.data ?? [])
          .filter((v) => v.isActive)
          .map((v) => ({ id: v.id, name: v.name }))}
        selectedId={vendorId}
        onSelect={(o) => setVendorId(o.id)}
        onDismiss={() => setVendorSheet(false)}
        emptyMessage="No vendors in master data yet"
        clearLabel="No vendor"
        onClear={() => setVendorId(null)}
      />

      <BottomSheet
        visible={deleteOpen}
        onDismiss={() => setDeleteOpen(false)}
        title="Delete this licence?"
      >
        <Text style={[t.type.meta, { color: t.color.sub, marginBottom: 10 }]}>
          Its seats go with it. A licence with somebody still sitting in a seat cannot be deleted —
          return those seats first. The reason below is recorded in the audit log.
        </Text>
        <Input value={reason} onChangeText={setReason} placeholder="Why is this being deleted?" />
        <View style={styles.sheetActions}>
          <Button
            label="Delete"
            block
            disabled={reason.trim() === ''}
            loading={remove.isPending}
            onPress={() => remove.mutate()}
          />
          <Button label="Cancel" variant="secondary" block onPress={() => setDeleteOpen(false)} />
        </View>
      </BottomSheet>
    </Screen>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[t.type.fieldLabel, { color: t.color.text }]}>{label}</Text>
      {hint ? (
        <Text style={[t.type.meta, { color: t.color.sub, marginBottom: 6 }]}>{hint}</Text>
      ) : null}
      {children}
    </View>
  );
}

function Picker({
  value,
  placeholder,
  onPress,
}: {
  value: string | null;
  placeholder: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={placeholder}
      style={({ pressed }) => [
        styles.picker,
        {
          borderRadius: t.radii.inputLarge,
          borderColor: t.color.line,
          backgroundColor: pressed ? t.color.soft : t.color.card,
        },
      ]}
    >
      <Text style={[t.type.body, { color: value ? t.color.text : t.color.sub }]}>
        {value ?? placeholder}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  field: { marginBottom: 14 },
  picker: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1 },
  sheetActions: { gap: 8, marginTop: 16 },
});
