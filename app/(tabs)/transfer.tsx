/**
 * Transfer / Movement — README § Screens 12.
 *
 * "Form: Asset (pre-filled when entered from Asset Detail), Origin (read-only,
 *  current location), Destination (location select, must differ from origin),
 *  Date, Reason (select: project rollout, employee relocation, repair,
 *  redeployment, audit support, other), Remarks. Confirm → movement row + asset
 *  location update + audit entry, toast 'Movement recorded'.
 *  Movement history is append-only — never expose edit or delete. The Movement
 *  list shows a rail of `Origin → Destination` steps with date, user, reason,
 *  remarks."
 *
 * There is no edit or delete affordance anywhere below, and none can be added:
 * `movements` has no UPDATE/DELETE grant, no RLS policy, and a trigger that
 * raises on both (working rule #3).
 */

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, ChevronLeft } from 'lucide-react-native';

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
} from '@/components/ui';
import {
  MOVEMENT_REASONS,
  fetchMovements,
  recordMovement,
  type MovementRow,
} from '@/api/assignments';
import { fetchAssetFormOptions, searchAssets, type Option } from '@/api/assets';
import { todayIso } from '@/lib/dates';
import { queryKeys } from '@/lib/queryClient';
import { useScopeStore } from '@/store/useScopeStore';
import { useToast } from '@/store/useUiStore';

const DATE_HINT = 'YYYY-MM-DD';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const REASON_OPTIONS: Option[] = MOVEMENT_REASONS.map((r) => ({ id: r, name: r }));

export default function TransferScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const scope = useScopeStore((s) => s.scope);

  const { asset: assetParam } = useLocalSearchParams<{ asset?: string }>();

  const assets = useQuery({
    queryKey: ['transferAssets', scope],
    queryFn: () => searchAssets(scope),
    enabled: scope.length > 0,
  });
  const options = useQuery({ queryKey: ['assetFormOptions'], queryFn: fetchAssetFormOptions });

  const [assetId, setAssetId] = useState<string | null>(null);
  const [destination, setDestination] = useState<Option | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState<Option | null>(null);
  const [remarks, setRemarks] = useState('');
  const [picker, setPicker] = useState<'asset' | 'destination' | 'reason' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  // Pre-filled when entered from Asset Detail.
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (assetParam && assets.data && prefilledFor !== assetParam) {
    setPrefilledFor(assetParam);
    const found = assets.data.find((a) => a.asset_code === assetParam);
    if (found) setAssetId(found.id);
  }

  const asset = assets.data?.find((a) => a.id === assetId) ?? null;

  const assetOptions: Option[] = useMemo(
    () => (assets.data ?? []).map((a) => ({ id: a.id, name: `${a.asset_code} · ${a.name}` })),
    [assets.data],
  );

  // Destination must differ from the origin, so the origin is not offered.
  const destinationOptions = useMemo(
    () => (options.data?.locations ?? []).filter((l) => l.name !== asset?.location_name),
    [options.data, asset],
  );

  const history = useQuery({
    queryKey: ['movements', scope, assetId ?? 'all'],
    queryFn: () => fetchMovements(scope, assetId ?? undefined),
    enabled: scope.length > 0,
  });

  const confirm = useMutation({
    mutationFn: () =>
      recordMovement({
        assetId: asset!.id,
        toLocationId: destination!.id,
        reason: reason!.name,
        remarks: remarks || null,
        at: `${date}T00:00:00Z`,
      }),
    onSuccess: () => {
      toast('Movement recorded');
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['movements'] });
      void queryClient.invalidateQueries({ queryKey: ['transferAssets'] });
      if (asset)
        void queryClient.invalidateQueries({ queryKey: queryKeys.asset(asset.asset_code) });
      setDestination(null);
      setReason(null);
      setRemarks('');
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const submit = () => {
    const next: Record<string, string> = {};
    if (!asset) next.asset = 'Select an asset to continue';
    if (!destination) next.destination = 'Select a destination';
    if (!reason) next.reason = 'Select a reason';
    if (!DATE_RE.test(date.trim())) next.date = `Use ${DATE_HINT}`;

    setErrors(next);
    if (Object.keys(next).length > 0) {
      setFormError('Fill the required fields');
      return;
    }
    setFormError('');
    confirm.mutate();
  };

  if (options.isPending || assets.isPending) {
    return (
      <Screen>
        <View style={styles.skeletons}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={72} radius={t.radii.card} />
          ))}
        </View>
      </Screen>
    );
  }

  if (assets.isError || options.isError) {
    return (
      <Screen>
        <EmptyState
          variant="error"
          title="Could not load the form"
          description={((assets.error ?? options.error) as Error).message}
          actionLabel="Try again"
          onAction={() => {
            void assets.refetch();
            void options.refetch();
          }}
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
        <ChevronLeft size={15} color={t.color.royal} strokeWidth={2} />
        <Text style={[t.type.metaStrong, { color: t.color.royal }]}>Cancel</Text>
      </Pressable>

      <Text style={[t.type.screenTitle, { color: t.color.text }]}>Transfer Asset</Text>
      <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
        Movement history is append-only
      </Text>

      <Card padding={15} style={styles.form}>
        <SelectField
          label="Asset"
          required
          value={asset ? `${asset.asset_code} · ${asset.name}` : undefined}
          placeholder="Select an asset"
          error={errors.asset}
          onPress={() => setPicker('asset')}
          containerStyle={styles.field}
        />

        <Input
          label="Origin"
          value={asset?.location_name ?? ''}
          placeholder="Select an asset first"
          editable={false}
          helper="The asset's current location."
          containerStyle={styles.field}
        />

        <SelectField
          label="Destination"
          required
          value={destination?.name}
          placeholder={asset ? 'Select a destination' : 'Select an asset first'}
          error={errors.destination}
          onPress={() => setPicker('destination')}
          containerStyle={styles.field}
        />

        <DateField
          label="Date"
          required
          value={date || null}
          onChange={(value) => setDate(value ?? '')}
          error={errors.date}
          clearable={false}
          maximum={todayIso()}
          containerStyle={styles.field}
        />

        <SelectField
          label="Reason"
          required
          value={reason?.name}
          placeholder="Select a reason"
          error={errors.reason}
          onPress={() => setPicker('reason')}
          containerStyle={styles.field}
        />

        <Input
          label="Remarks"
          value={remarks}
          onChangeText={setRemarks}
          placeholder="Why the asset is moving, and who receives it…"
          multiline
        />
      </Card>

      <Button
        label="Confirm movement"
        block
        loading={confirm.isPending}
        onPress={submit}
        style={styles.submit}
      />
      {formError ? (
        <View style={styles.errorRow}>
          <AlertCircle size={14} color={t.color.error} strokeWidth={2} />
          <Text style={[t.type.meta, { color: t.color.error }]}>{formError}</Text>
        </View>
      ) : null}

      <Text style={[t.type.sectionLabel, styles.historyLabel, { color: t.color.sub }]}>
        {asset ? 'Movement history' : 'Recent movements'}
      </Text>

      {history.isPending ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} height={72} radius={t.radii.card} />
          ))}
        </View>
      ) : history.isError ? (
        <EmptyState
          variant="error"
          title="Could not load the movement history"
          description={(history.error as Error).message}
          actionLabel="Try again"
          onAction={() => history.refetch()}
        />
      ) : (history.data ?? []).length === 0 ? (
        <EmptyState
          title="No movements yet"
          description={
            asset
              ? 'This asset has never been transferred between locations.'
              : 'Transfers between Head Office and Site appear here once recorded.'
          }
        />
      ) : (
        <Card padding={0} radius="listContainer">
          {(history.data ?? []).map((row, i) => (
            <MovementStep
              key={row.id}
              row={row}
              showAsset={!asset}
              last={i === (history.data ?? []).length - 1}
            />
          ))}
        </Card>
      )}

      <PickerSheet
        visible={picker === 'asset'}
        title="Asset"
        options={assetOptions}
        selectedId={assetId}
        onSelect={(option) => {
          setAssetId(option.id);
          setDestination(null);
          setErrors((prev) => ({ ...prev, asset: '' }));
        }}
        onDismiss={() => setPicker(null)}
        emptyMessage="No assets in this scope."
      />
      <PickerSheet
        visible={picker === 'destination'}
        title="Destination"
        options={destinationOptions}
        selectedId={destination?.id ?? null}
        onSelect={(option) => {
          setDestination(option as Option);
          setErrors((prev) => ({ ...prev, destination: '' }));
        }}
        onDismiss={() => setPicker(null)}
        emptyMessage={asset ? 'No other location is available.' : 'Select an asset first.'}
      />
      <PickerSheet
        visible={picker === 'reason'}
        title="Reason"
        options={REASON_OPTIONS}
        selectedId={reason?.id ?? null}
        onSelect={(option) => {
          setReason(option as Option);
          setErrors((prev) => ({ ...prev, reason: '' }));
        }}
        onDismiss={() => setPicker(null)}
      />
    </Screen>
  );
}

/** One `Origin → Destination` step on the rail. Read-only, by design. */
function MovementStep({
  row,
  showAsset,
  last,
}: {
  row: MovementRow;
  showAsset: boolean;
  last: boolean;
}) {
  const t = useTheme();

  return (
    <View
      style={[styles.step, { borderBottomWidth: last ? 0 : 1, borderBottomColor: t.color.line }]}
    >
      <View style={styles.stepRoute}>
        <Text style={[t.type.body, { color: t.color.text }]}>{row.from_location ?? '—'}</Text>
        <ArrowRight size={14} color={t.color.royal} strokeWidth={2} />
        <Text style={[t.type.body, { color: t.color.text }]}>{row.to_location}</Text>
      </View>

      {showAsset ? (
        <Text style={[t.type.assetCode, styles.stepAsset, { color: t.color.royal }]}>
          {row.asset_code}
        </Text>
      ) : null}

      <Text style={[t.type.metaStrong, styles.stepMeta, { color: t.color.sub }]}>
        {[new Date(row.moved_at).toISOString().slice(0, 10), row.moved_by_name, row.reason]
          .filter(Boolean)
          .join(' · ')}
      </Text>

      {row.remarks ? (
        <Text style={[t.type.meta, styles.stepRemarks, { color: t.color.sub }]}>{row.remarks}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 3, marginBottom: 16 },
  form: { marginTop: 2 },
  field: { marginBottom: 12 },
  submit: { marginTop: 18, height: 46 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  historyLabel: { marginTop: 24, marginBottom: 9, marginLeft: 2 },
  skeletons: { gap: 12 },
  step: { paddingHorizontal: 15, paddingVertical: 13 },
  stepRoute: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepAsset: { marginTop: 4 },
  stepMeta: { marginTop: 4 },
  stepRemarks: { marginTop: 4, lineHeight: 16 },
});
