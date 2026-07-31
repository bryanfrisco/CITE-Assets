/**
 * Add Asset — README § Screens 11.
 *
 * "Modal/stack form, grouped sections … Identity · Procurement · Placement ·
 *  Details. Required: name, category, brand, serial number, location, status,
 *  condition. Serial number must be unique — show 'Serial number already
 *  registered' inline. Save → toast + navigate to the new Asset Detail.
 *  Reuse the wizard's field styling (44px inputs, radius 13, 11.5/600 sub labels)."
 *
 * Built here because Phase 2's acceptance criterion is that a newly added
 * category is usable in this form with no release. Two pieces wait for Phase 3:
 *   - Asset Photo (needs the asset-photos Storage bucket, DATABASE.md §12)
 *   - the post-save jump to Asset Detail, which does not exist yet
 * Dates are typed as YYYY-MM-DD; a native date picker also lands with Phase 3.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, X } from 'lucide-react-native';

import { useTheme } from '@/theme';
import {
  Button,
  Card,
  EmptyState,
  Input,
  PickerSheet,
  Screen,
  SelectField,
  Skeleton,
} from '@/components/ui';
import {
  createAsset,
  fetchAssetDetail,
  fetchAssetFormOptions,
  updateAsset,
  type Option,
} from '@/api/assets';
import { tagAsset } from '@/api/tags';
import { queryKeys } from '@/lib/queryClient';
import { useToast } from '@/store/useUiStore';
import { usePermissions } from '@/auth';

type PickerKey =
  'category' | 'brand' | 'model' | 'vendor' | 'department' | 'location' | 'status' | 'condition';

interface Spec {
  key: string;
  value: string;
}

const DATE_HINT = 'YYYY-MM-DD';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function AddAssetScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  // `?edit=<assetCode>` turns this screen into the Edit form. Same fields, same
  // validation — only the write path and the copy differ.
  const { edit, tag } = useLocalSearchParams<{ edit?: string; tag?: string }>();
  const isEdit = Boolean(edit);
  // Arrived from the scanner: the sticker is already on the device, and
  // saving has to claim it in the same transaction that creates the asset.
  const isTagging = Boolean(tag) && !isEdit;

  const options = useQuery({
    queryKey: ['assetFormOptions'],
    queryFn: fetchAssetFormOptions,
  });

  const existing = useQuery({
    queryKey: queryKeys.asset(edit ?? ''),
    queryFn: () => fetchAssetDetail(edit ?? ''),
    enabled: isEdit,
  });

  const [picker, setPicker] = useState<PickerKey | null>(null);
  const [values, setValues] = useState<Record<PickerKey, Option | null>>({
    category: null,
    brand: null,
    model: null,
    vendor: null,
    department: null,
    location: null,
    status: null,
    condition: null,
  });

  const [assetCode, setAssetCode] = useState('');
  const [name, setName] = useState('');
  const [serial, setSerial] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [warrantyStart, setWarrantyStart] = useState('');
  const [warrantyEnd, setWarrantyEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [specs, setSpecs] = useState<Spec[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const canEditCode = can('asset.editCode');

  // Prefill once the asset and the pickers have both arrived, keyed on the
  // loaded asset id so a later refetch never stamps over the user's edits.
  //
  // This adjusts state during render rather than in an effect — the pattern
  // React documents for "adjusting state when a prop changes". React discards
  // the in-progress render and re-runs immediately, so the user never sees the
  // blank pass, and no cascading commit happens.
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  const loadedAsset = existing.data?.asset;
  if (loadedAsset && options.data && prefilledFor !== loadedAsset.id) {
    const opts = options.data;
    const find = (list: Option[], id: string | null) => list.find((o) => o.id === id) ?? null;

    setPrefilledFor(loadedAsset.id);
    setValues({
      category: find(opts.categories, loadedAsset.categoryId),
      brand: find(opts.brands, loadedAsset.brandId),
      model: find(opts.models, loadedAsset.modelId),
      vendor: find(opts.vendors, loadedAsset.vendorId),
      department: find(opts.departments, loadedAsset.departmentId),
      location: find(opts.locations, loadedAsset.locationId),
      status: find(opts.statuses, loadedAsset.statusId),
      condition: find(opts.conditions, loadedAsset.conditionId),
    });
    setAssetCode(loadedAsset.assetCode);
    setName(loadedAsset.name);
    setSerial(loadedAsset.serialNumber);
    setPurchaseDate(loadedAsset.purchaseDate ?? '');
    setPurchasePrice(loadedAsset.purchasePrice != null ? String(loadedAsset.purchasePrice) : '');
    setWarrantyStart(loadedAsset.warrantyStart ?? '');
    setWarrantyEnd(loadedAsset.warrantyEnd ?? '');
    setNotes(loadedAsset.notes ?? '');
    setSpecs(loadedAsset.specifications ?? []);
  }

  // Models are filtered to the chosen brand, so the two pickers cannot disagree.
  const modelOptions = useMemo(() => {
    const all = options.data?.models ?? [];
    if (!values.brand) return all;
    return all.filter((m) => m.brandId === values.brand?.id);
  }, [options.data, values.brand]);

  const optionsFor = (key: PickerKey): Option[] => {
    const d = options.data;
    if (!d) return [];
    switch (key) {
      case 'category':
        return d.categories;
      case 'brand':
        return d.brands;
      case 'model':
        return modelOptions;
      case 'vendor':
        return d.vendors;
      case 'department':
        return d.departments;
      case 'location':
        return d.locations;
      case 'status':
        return d.statuses;
      case 'condition':
        return d.conditions;
    }
  };

  const pick = (key: PickerKey, option: Option) => {
    setValues((prev) => ({
      ...prev,
      [key]: option,
      // Changing the brand invalidates a model that belonged to the old one.
      ...(key === 'brand' && prev.model?.brandId !== option.id ? { model: null } : null),
    }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const save = useMutation({
    mutationFn: (): Promise<{ id?: string; assetCode: string }> => {
      const input = {
        name,
        categoryId: values.category!.id,
        serialNumber: serial,
        locationId: values.location!.id,
        statusId: values.status!.id,
        conditionId: values.condition!.id,
        brandId: values.brand?.id ?? null,
        modelId: values.model?.id ?? null,
        vendorId: values.vendor?.id ?? null,
        departmentId: values.department?.id ?? null,
        purchaseDate: purchaseDate || null,
        purchasePrice: purchasePrice ? Number(purchasePrice.replace(/[^\d]/g, '')) : null,
        warrantyStart: warrantyStart || null,
        warrantyEnd: warrantyEnd || null,
        specifications: specs.filter((s) => s.key.trim() && s.value.trim()),
        notes: notes || null,
        assetCode: canEditCode && assetCode.trim() ? assetCode.trim() : null,
      };
      if (isEdit && existing.data) return updateAsset(existing.data.asset.id, input);
      if (isTagging) return tagAsset(tag!, input);
      return createAsset(input);
    },
    onSuccess: (asset) => {
      toast(
        isEdit
          ? `${asset.assetCode} updated`
          : isTagging
            ? `${asset.assetCode} registered on ${tag}`
            : `${asset.assetCode} added`,
      );
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.asset(asset.assetCode) });
      void queryClient.invalidateQueries({ queryKey: ['assetCount'] });
      void queryClient.invalidateQueries({ queryKey: ['tags'] });
      router.replace(`/asset/${asset.assetCode}`);
    },
    onError: (e: Error) => {
      // README § Add Asset: the serial clash is shown inline on the field.
      if (e.message === 'Serial number already registered') {
        setErrors((prev) => ({ ...prev, serial: e.message }));
        setFormError('Fill the required field');
      } else {
        setFormError(e.message);
      }
    },
  });

  const submit = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Asset name is required';
    if (!values.category) next.category = 'Category is required';
    if (!values.brand) next.brand = 'Brand is required';
    if (!serial.trim()) next.serial = 'Serial number is required';
    if (!values.location) next.location = 'Location is required';
    if (!values.status) next.status = 'Status is required';
    if (!values.condition) next.condition = 'Condition is required';

    for (const [field, value] of [
      ['purchaseDate', purchaseDate],
      ['warrantyStart', warrantyStart],
      ['warrantyEnd', warrantyEnd],
    ] as const) {
      if (value && !DATE_RE.test(value)) next[field] = `Use ${DATE_HINT}`;
    }

    setErrors(next);
    if (Object.keys(next).length > 0) {
      setFormError('Fill the required fields');
      return;
    }
    setFormError(null);
    save.mutate();
  };

  if (options.isPending || (isEdit && existing.isPending)) {
    return (
      <Screen>
        <View style={styles.skeletons}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={72} radius={t.radii.card} />
          ))}
        </View>
      </Screen>
    );
  }

  if (options.isError) {
    return (
      <Screen>
        <EmptyState
          variant="error"
          title="Could not load the form"
          description={(options.error as Error).message}
          actionLabel="Try again"
          onAction={() => options.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        hitSlop={8}
        style={styles.back}
      >
        <ChevronLeft size={17} color={t.color.royal} strokeWidth={1.9} />
        <Text style={[t.type.metaStrong, { color: t.color.royal }]}>Cancel</Text>
      </Pressable>

      <Text style={[t.type.screenTitle, styles.title, { color: t.color.text }]}>
        {isEdit ? 'Edit Asset' : isTagging ? 'Register Asset' : 'Add Asset'}
      </Text>

      {isTagging ? (
        <Card padding={13} style={styles.tagBanner}>
          <Text style={[t.type.sectionLabel, { color: t.color.sub }]}>Label</Text>
          <Text style={[t.type.assetCode, styles.tagCode, { color: t.color.royal }]}>{tag}</Text>
          <Text style={[t.type.meta, { color: t.color.sub }]}>
            Claimed the moment this asset is saved.
          </Text>
        </Card>
      ) : null}

      <Section label="Identity">
        <Input
          label="Asset code"
          value={assetCode}
          onChangeText={setAssetCode}
          placeholder={canEditCode ? 'Leave blank to generate' : 'Generated on save'}
          editable={canEditCode}
          autoCapitalize="characters"
          helper={
            canEditCode
              ? 'Only a Super Admin may set this manually.'
              : 'Generated from the category and purchase year.'
          }
          containerStyle={styles.field}
        />
        <Input
          label="Asset name"
          required
          value={name}
          onChangeText={setName}
          error={errors.name}
          placeholder="e.g. Lenovo ThinkPad T14 Gen 4"
          containerStyle={styles.field}
        />
        <SelectField
          label="Category"
          required
          value={values.category?.name}
          placeholder="Select a category"
          error={errors.category}
          onPress={() => setPicker('category')}
          containerStyle={styles.field}
        />
        <SelectField
          label="Brand"
          required
          value={values.brand?.name}
          placeholder="Select a brand"
          error={errors.brand}
          onPress={() => setPicker('brand')}
          containerStyle={styles.field}
        />
        <SelectField
          label="Model"
          value={values.model?.name}
          placeholder={values.brand ? 'Select a model' : 'Choose a brand first'}
          onPress={() => setPicker('model')}
          containerStyle={styles.field}
        />
        <Input
          label="Serial number"
          required
          value={serial}
          onChangeText={(value) => {
            setSerial(value);
            if (errors.serial) setErrors((prev) => ({ ...prev, serial: '' }));
          }}
          error={errors.serial}
          placeholder="e.g. PF3XK92L"
          autoCapitalize="characters"
          containerStyle={styles.field}
        />
      </Section>

      <Section label="Procurement">
        <SelectField
          label="Vendor"
          value={values.vendor?.name}
          placeholder="Select a vendor"
          onPress={() => setPicker('vendor')}
          containerStyle={styles.field}
        />
        <Input
          label="Purchase date"
          value={purchaseDate}
          onChangeText={setPurchaseDate}
          error={errors.purchaseDate}
          placeholder={DATE_HINT}
          containerStyle={styles.field}
        />
        <Input
          label="Purchase price (IDR)"
          value={purchasePrice}
          onChangeText={setPurchasePrice}
          placeholder="e.g. 21450000"
          keyboardType="number-pad"
          containerStyle={styles.field}
        />
        <Input
          label="Warranty start"
          value={warrantyStart}
          onChangeText={setWarrantyStart}
          error={errors.warrantyStart}
          placeholder={DATE_HINT}
          containerStyle={styles.field}
        />
        <Input
          label="Warranty end"
          value={warrantyEnd}
          onChangeText={setWarrantyEnd}
          error={errors.warrantyEnd}
          placeholder={DATE_HINT}
          containerStyle={styles.field}
        />
      </Section>

      <Section label="Placement">
        <SelectField
          label="Department"
          value={values.department?.name}
          placeholder="Select a department"
          onPress={() => setPicker('department')}
          containerStyle={styles.field}
        />
        <SelectField
          label="Current location"
          required
          value={values.location?.name}
          placeholder="Select a location"
          error={errors.location}
          onPress={() => setPicker('location')}
          containerStyle={styles.field}
        />
        <SelectField
          label="Status"
          required
          value={values.status?.name}
          placeholder="Select a status"
          error={errors.status}
          onPress={() => setPicker('status')}
          containerStyle={styles.field}
        />
        <SelectField
          label="Condition"
          required
          value={values.condition?.name}
          placeholder="Select a condition"
          error={errors.condition}
          onPress={() => setPicker('condition')}
          containerStyle={styles.field}
        />
      </Section>

      <Section label="Details">
        {specs.map((spec, i) => (
          <View key={i} style={styles.specRow}>
            <Input
              value={spec.key}
              onChangeText={(value) =>
                setSpecs((prev) => prev.map((s, j) => (j === i ? { ...s, key: value } : s)))
              }
              placeholder="Processor"
              containerStyle={styles.specKey}
            />
            <Input
              value={spec.value}
              onChangeText={(value) =>
                setSpecs((prev) => prev.map((s, j) => (j === i ? { ...s, value } : s)))
              }
              placeholder="Intel Core i7-1355U"
              containerStyle={styles.specValue}
            />
            <Pressable
              onPress={() => setSpecs((prev) => prev.filter((_, j) => j !== i))}
              accessibilityRole="button"
              accessibilityLabel="Remove specification"
              hitSlop={8}
              style={[styles.specRemove, { borderRadius: t.radii.iconChip }]}
            >
              <X size={15} color={t.color.sub} strokeWidth={1.9} />
            </Pressable>
          </View>
        ))}

        <Pressable
          onPress={() => setSpecs((prev) => [...prev, { key: '', value: '' }])}
          accessibilityRole="button"
          accessibilityLabel="Add specification"
          style={({ pressed }) => [
            styles.addSpec,
            {
              borderRadius: t.radii.input,
              borderColor: t.color.line,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Plus size={15} color={t.color.royal} strokeWidth={2} />
          <Text style={[t.type.metaStrong, { color: t.color.royal }]}>Add specification</Text>
        </Pressable>

        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Accessories included, storage location…"
          multiline
          containerStyle={styles.field}
        />

        <Text style={[t.type.meta, { color: t.color.sub }]}>
          {isEdit
            ? 'Upload the asset photo from the hero card on Asset Detail.'
            : 'Save the asset first, then add its photo from Asset Detail.'}
        </Text>
      </Section>

      <Button
        label={isEdit ? 'Save changes' : 'Save asset'}
        block
        onPress={submit}
        loading={save.isPending}
        style={styles.submit}
      />
      {formError ? (
        <Text style={[t.type.meta, styles.formError, { color: t.color.error }]}>{formError}</Text>
      ) : null}

      {(
        [
          'category',
          'brand',
          'model',
          'vendor',
          'department',
          'location',
          'status',
          'condition',
        ] as PickerKey[]
      ).map((key) => (
        <PickerSheet
          key={key}
          visible={picker === key}
          title={key[0]!.toUpperCase() + key.slice(1)}
          options={optionsFor(key)}
          selectedId={values[key]?.id ?? null}
          onSelect={(option) => pick(key, option as Option)}
          onDismiss={() => setPicker(null)}
          emptyMessage={
            key === 'model' && !values.brand
              ? 'Choose a brand first.'
              : `No ${key} records yet — add one in Master data.`
          }
        />
      ))}
    </Screen>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <>
      <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>
        {label}
      </Text>
      <Card padding={15}>{children}</Card>
    </>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 10, minHeight: 24 },
  title: { marginBottom: 4 },
  sectionLabel: { marginTop: 20, marginBottom: 9, marginLeft: 2 },
  field: { marginBottom: 12 },
  specRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  specKey: { flex: 1, minWidth: 0 },
  specValue: { flex: 1.4, minWidth: 0 },
  specRemove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  addSpec: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 14,
  },
  tagBanner: { marginTop: 12 },
  tagCode: { marginTop: 5, marginBottom: 3 },
  submit: { marginTop: 22 },
  formError: { marginTop: 10, textAlign: 'center' },
  skeletons: { gap: 12 },
});
