/**
 * Master data — README § Screens 8.
 *
 * "Entity chips: Category, Brand, Model, Vendor, Department, Location, Status,
 *  Condition. An inline add/edit row (royal + icon, text field with placeholder
 *  `New <entity> name`, navy Add / Save button). Rows show the name and
 *  `<Entity> · used by n assets`, with edit (pencil) and delete (red-tinted
 *  trash) buttons."
 *
 * Validation and the delete guard are enforced in migration 0007 and only
 * displayed here — the server is the authority, not this screen.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Pencil, Plus, Trash2, X } from 'lucide-react-native';

import { useTheme } from '@/theme';
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Input,
  PickerSheet,
  Screen,
  SelectField,
  Skeleton,
} from '@/components/ui';
import {
  MASTER_ENTITIES,
  createMaster,
  deleteMaster,
  labelFor,
  listMaster,
  renameMaster,
  setMasterActive,
  type MasterEntity,
  type MasterExtra,
  type MasterRecord,
} from '@/api/masterData';
import { queryKeys } from '@/lib/queryClient';
import { useToast } from '@/store/useUiStore';
import { usePermissions } from '@/auth';

const LOCATION_KINDS = [
  { id: 'head_office', name: 'Head office' },
  { id: 'site', name: 'Site' },
];

/** Example codes, so the shape of each one is obvious before the first is typed. */
const CODE_PLACEHOLDER: Partial<Record<MasterEntity, string>> = {
  category: 'e.g. LPT',
  location: 'e.g. SITE2',
  unit: 'e.g. DT-042',
  company: 'e.g. SPR',
};

export default function MasterDataScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const [entity, setEntity] = useState<MasterEntity>('category');
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Extra columns the schema requires that the design's single name field does
  // not cover: a model needs a brand, a location needs a code and a kind, a
  // category needs its code (LPT, MON…). Without these the insert cannot be
  // built at all.
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'head_office' | 'site'>('site');
  const [brandId, setBrandId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [picker, setPicker] = useState<'brand' | 'kind' | 'location' | null>(null);
  const [confirming, setConfirming] = useState<MasterRecord | null>(null);

  const label = labelFor(entity);
  const canWrite = can('master.write');
  const canDelete = can('master.delete');

  const records = useQuery({
    queryKey: queryKeys.master(entity),
    queryFn: () => listMaster(entity),
  });

  const brands = useQuery({
    queryKey: queryKeys.master('brand'),
    queryFn: () => listMaster('brand'),
    enabled: entity === 'model',
  });

  const brandOptions = useMemo(
    () => (brands.data ?? []).filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name })),
    [brands.data],
  );

  // A unit sits at exactly one location — that is how "where is DT-042" gets
  // answered without making the unit itself a location.
  const locations = useQuery({
    queryKey: queryKeys.master('location'),
    queryFn: () => listMaster('location'),
    enabled: entity === 'unit',
  });

  const locationOptions = useMemo(
    () => (locations.data ?? []).filter((l) => l.isActive).map((l) => ({ id: l.id, name: l.name })),
    [locations.data],
  );

  const resetForm = () => {
    setDraft('');
    setEditingId(null);
    setError(null);
    setCode('');
    setBrandId(null);
    setLocationId(null);
    setKind('site');
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.master(entity) });
    // The Add Asset pickers read the same records, so they must refetch too —
    // this is what makes a new category usable without a release.
    void queryClient.invalidateQueries({ queryKey: ['assetFormOptions'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (editingId) {
        await renameMaster(entity, editingId, draft);
        return 'updated' as const;
      }
      const extra: MasterExtra = {};
      if (entity === 'category') extra.code = code;
      if (entity === 'location') {
        extra.code = code;
        extra.kind = kind;
      }
      if (entity === 'model') extra.brandId = brandId ?? undefined;
      if (entity === 'unit') {
        extra.code = code;
        extra.locationId = locationId ?? undefined;
      }
      if (entity === 'company') extra.code = code;
      await createMaster(entity, draft, extra);
      return 'created' as const;
    },
    onSuccess: (result) => {
      // README § Master data toasts.
      toast(result === 'updated' ? 'Record updated' : `${draft.trim()} added to ${label}`);
      resetForm();
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const softDelete = useMutation({
    mutationFn: (record: MasterRecord) => setMasterActive(entity, record.id, !record.isActive),
    onSuccess: (_data, record) => {
      toast(record.isActive ? `${record.name} deactivated` : `${record.name} restored`);
      setConfirming(null);
      invalidate();
    },
    onError: (e: Error) => {
      toast(e.message, 'error');
      setConfirming(null);
    },
  });

  const hardDelete = useMutation({
    mutationFn: (record: MasterRecord) => deleteMaster(entity, record.id),
    onSuccess: (_data, record) => {
      toast(`${record.name} deleted`);
      setConfirming(null);
      invalidate();
    },
    onError: (e: Error) => {
      // "Cannot delete <name> — still used by n assets" arrives ready to show.
      toast(e.message, 'error');
      setConfirming(null);
    },
  });

  const beginEdit = (record: MasterRecord) => {
    setEditingId(record.id);
    setDraft(record.name);
    setError(null);
  };

  const needsCode =
    entity === 'category' || entity === 'location' || entity === 'unit' || entity === 'company';

  // No asset points at a company — people do, so master_usage() leaves
  // assetCount at 0 and counts accounts into totalCount instead. Printing the
  // asset count here would tell an admin that a company with 436 employees is
  // unused, and the delete they then tried would fail contradicting the screen.
  const countsPeople = entity === 'company';
  const usageNoun = countsPeople ? 'people' : 'assets';
  const usageCount = (record: MasterRecord) =>
    countsPeople ? record.totalCount : record.assetCount;

  const canSubmit = canWrite && !save.isPending;

  return (
    <Screen>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back to More"
        hitSlop={8}
        style={styles.back}
      >
        <ChevronLeft size={17} color={t.color.royal} strokeWidth={1.9} />
        <Text style={[t.type.metaStrong, { color: t.color.royal }]}>More</Text>
      </Pressable>

      <Text style={[t.type.screenTitle, { color: t.color.text }]}>Master data</Text>
      <Text style={[t.type.meta, styles.lead, { color: t.color.sub }]}>
        Categories, brands and the rest are records, not code — changes take effect immediately.
      </Text>

      <ChipRow>
        {MASTER_ENTITIES.map((e) => (
          <Chip
            key={e.key}
            label={e.label}
            active={entity === e.key}
            onPress={() => {
              setEntity(e.key);
              resetForm();
            }}
          />
        ))}
      </ChipRow>

      {/* Inline add / edit row */}
      {canWrite ? (
        <Card padding={13} style={styles.form}>
          <View style={styles.formRow}>
            <View
              style={[
                styles.plusChip,
                { borderRadius: t.radii.iconChip, backgroundColor: t.color.soft },
              ]}
            >
              {editingId ? (
                <Pencil size={16} color={t.color.royal} strokeWidth={1.8} />
              ) : (
                <Plus size={18} color={t.color.royal} strokeWidth={2.1} />
              )}
            </View>

            <Input
              value={draft}
              onChangeText={(value) => {
                setDraft(value);
                if (error) setError(null);
              }}
              placeholder={`New ${label.toLowerCase()} name`}
              containerStyle={styles.formInput}
              autoCapitalize="words"
              onSubmitEditing={() => canSubmit && save.mutate()}
              returnKeyType="done"
            />

            <Button
              label={editingId ? 'Save' : 'Add'}
              onPress={() => save.mutate()}
              loading={save.isPending}
              disabled={!canSubmit}
            />
          </View>

          {/* Schema-required extras, shown only for the entities that need them. */}
          {!editingId && needsCode ? (
            <Input
              label={`${label} code`}
              value={code}
              onChangeText={setCode}
              placeholder={CODE_PLACEHOLDER[entity] ?? 'e.g. LPT'}
              autoCapitalize="characters"
              containerStyle={styles.extra}
            />
          ) : null}

          {!editingId && entity === 'location' ? (
            <SelectField
              label="Kind"
              value={LOCATION_KINDS.find((k) => k.id === kind)?.name}
              onPress={() => setPicker('kind')}
              containerStyle={styles.extra}
            />
          ) : null}

          {!editingId && entity === 'unit' ? (
            <SelectField
              label="Location"
              required
              value={locationOptions.find((l) => l.id === locationId)?.name}
              placeholder="Select a location"
              onPress={() => setPicker('location')}
              containerStyle={styles.extra}
            />
          ) : null}

          {!editingId && entity === 'model' ? (
            <SelectField
              label="Brand"
              required
              value={brandOptions.find((b) => b.id === brandId)?.name}
              placeholder="Select a brand"
              onPress={() => setPicker('brand')}
              containerStyle={styles.extra}
            />
          ) : null}

          {error ? (
            <Text style={[t.type.meta, styles.error, { color: t.color.error }]}>{error}</Text>
          ) : null}

          {editingId ? (
            <Pressable onPress={resetForm} hitSlop={8} style={styles.cancel}>
              <X size={13} color={t.color.sub} strokeWidth={1.9} />
              <Text style={[t.type.meta, { color: t.color.sub }]}>Cancel edit</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : null}

      {/* List: loading, error, empty, content */}
      {records.isPending ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={58} radius={t.radii.card} />
          ))}
        </View>
      ) : records.isError ? (
        <EmptyState
          variant="error"
          title="Could not load master data"
          description={(records.error as Error).message}
          actionLabel="Try again"
          onAction={() => records.refetch()}
        />
      ) : (records.data ?? []).length === 0 ? (
        <EmptyState title="No records yet" description="Add the first one using the field above." />
      ) : (
        <View style={styles.list}>
          {(records.data ?? []).map((record) => (
            <Card key={record.id} padding={13} style={styles.record}>
              <View style={styles.recordText}>
                <View style={styles.nameRow}>
                  <Text
                    numberOfLines={1}
                    style={[t.type.body, { color: record.isActive ? t.color.text : t.color.sub }]}
                  >
                    {record.name}
                  </Text>
                  {!record.isActive ? <Badge label="Inactive" tone="retired" /> : null}
                </View>
                <Text style={[t.type.meta, { color: t.color.sub, marginTop: 3 }]}>
                  {record.detail
                    ? `${label} · ${record.detail} · used by ${usageCount(record)} ${usageNoun}`
                    : `${label} · used by ${usageCount(record)} ${usageNoun}`}
                </Text>
              </View>

              {canWrite ? (
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => beginEdit(record)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${record.name}`}
                    hitSlop={8}
                    style={[
                      styles.actionButton,
                      { borderRadius: t.radii.iconChip, backgroundColor: t.color.soft },
                    ]}
                  >
                    <Pencil size={15} color={t.color.sub} strokeWidth={1.8} />
                  </Pressable>

                  <Pressable
                    onPress={() => setConfirming(record)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${record.name}`}
                    hitSlop={8}
                    style={[
                      styles.actionButton,
                      {
                        borderRadius: t.radii.iconChip,
                        backgroundColor: t.badge('broken').bg,
                      },
                    ]}
                  >
                    <Trash2 size={15} color={t.color.error} strokeWidth={1.8} />
                  </Pressable>
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      )}

      <PickerSheet
        visible={picker === 'brand'}
        title="Brand"
        options={brandOptions}
        selectedId={brandId}
        onSelect={(option) => setBrandId(option.id)}
        onDismiss={() => setPicker(null)}
        emptyMessage="Add a brand first, then come back to Model."
      />

      <PickerSheet
        visible={picker === 'location'}
        title="Location"
        options={locationOptions}
        selectedId={locationId}
        onSelect={(option) => setLocationId(option.id)}
        onDismiss={() => setPicker(null)}
        emptyMessage="Add a location first, then come back to Unit."
      />

      <PickerSheet
        visible={picker === 'kind'}
        title="Location kind"
        options={LOCATION_KINDS}
        selectedId={kind}
        onSelect={(option) => setKind(option.id as 'head_office' | 'site')}
        onDismiss={() => setPicker(null)}
      />

      {/* Remove: soft delete is offered first, because README prefers is_active
          and a referenced record cannot be hard-deleted at all. */}
      <BottomSheet
        visible={Boolean(confirming)}
        onDismiss={() => setConfirming(null)}
        title={confirming ? `Remove ${confirming.name}?` : ''}
        subtitle={
          confirming
            ? usageCount(confirming) > 0
              ? `Used by ${usageCount(confirming)} ${usageNoun}. Deactivating keeps every existing record intact and hides it from new ones.`
              : `Not used by any ${countsPeople ? 'person' : 'asset'} yet.`
            : undefined
        }
      >
        <View style={styles.sheetActions}>
          <Button
            label={confirming?.isActive ? 'Deactivate' : 'Restore'}
            variant="secondary"
            block
            onPress={() => confirming && softDelete.mutate(confirming)}
            loading={softDelete.isPending}
          />
          {canDelete ? (
            <Button
              label="Delete permanently"
              variant="destructive"
              block
              onPress={() => confirming && hardDelete.mutate(confirming)}
              loading={hardDelete.isPending}
            />
          ) : null}
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 10, minHeight: 24 },
  lead: { marginTop: 5, marginBottom: 16 },
  form: { marginTop: 14 },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  plusChip: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  formInput: { flex: 1, minWidth: 0 },
  extra: { marginTop: 11 },
  error: { marginTop: 10 },
  cancel: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 11, minHeight: 24 },
  skeletons: { marginTop: 14, gap: 9 },
  list: { marginTop: 14, gap: 9 },
  record: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recordText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: 7 },
  actionButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  sheetActions: { gap: 10, paddingBottom: 4 },
});
