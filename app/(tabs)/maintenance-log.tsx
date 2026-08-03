/**
 * Open or update a maintenance job — Phase 6.
 *
 * `?asset=<code>` opens a new job against that asset; `?id=<uuid>` updates an
 * existing one. One screen for both because the fields are the same fields, and
 * the only real difference is which of them can still be changed.
 *
 * "Next due" is the field that matters most and the one people skip. It is what
 * feeds the reminder job — a completed service with no next date will never
 * remind anybody of anything, which is why it is offered on the update side
 * too, not only when opening.
 */

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, ChevronLeft } from 'lucide-react-native';

import { useTheme } from '@/theme';
import {
  Badge,
  Button,
  Card,
  DateField,
  EmptyState,
  Input,
  PickerSheet,
  SelectField,
  Skeleton,
  Switch,
} from '@/components/ui';
import {
  MAINTENANCE_STATE_LABEL,
  fetchMaintenance,
  openMaintenance,
  updateMaintenance,
  type MaintenanceState,
} from '@/api/maintenance';
import { fetchAssetDetail, fetchAssetFormOptions } from '@/api/assets';
import { todayIso } from '@/lib/dates';
import { queryKeys } from '@/lib/queryClient';
import { useScopeStore } from '@/store/useScopeStore';
import { useToast } from '@/store/useUiStore';

const STATES: MaintenanceState[] = ['open', 'in_progress', 'completed', 'cancelled'];

export default function MaintenanceLogScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const scope = useScopeStore((s) => s.scope);
  const { asset: assetCode, id } = useLocalSearchParams<{ asset?: string; id?: string }>();

  const editing = Boolean(id);

  const asset = useQuery({
    queryKey: queryKeys.asset(assetCode ?? ''),
    queryFn: () => fetchAssetDetail(assetCode ?? ''),
    enabled: Boolean(assetCode) && !editing,
  });

  const all = useQuery({
    queryKey: ['maintenance', scope, 'all'],
    queryFn: () => fetchMaintenance(scope),
    enabled: editing && scope.length > 0,
  });

  const options = useQuery({ queryKey: ['assetFormOptions'], queryFn: fetchAssetFormOptions });

  const existing = all.data?.find((m) => m.id === id);

  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [internal, setInternal] = useState(false);
  const [warranty, setWarranty] = useState(false);
  const [nextDue, setNextDue] = useState('');
  const [cost, setCost] = useState('');
  const [state, setState] = useState<MaintenanceState>('open');
  const [picker, setPicker] = useState<'vendor' | 'state' | null>(null);
  const [error, setError] = useState('');
  const [seeded, setSeeded] = useState(false);

  // Seeded from the record the first time it arrives, adjusted during render
  // rather than in an effect so the first paint is already correct.
  if (editing && existing && !seeded) {
    setSeeded(true);
    setTitle(existing.title);
    setDetail(existing.detail ?? '');
    setState(existing.state);
    setCost(String(Number(existing.cost ?? 0) || ''));
    setNextDue(existing.next_due_at ?? '');
    setWarranty(existing.under_warranty);
  }

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    void queryClient.invalidateQueries({ queryKey: ['maintenanceStats'] });
    const code = assetCode ?? existing?.asset_code;
    if (code) void queryClient.invalidateQueries({ queryKey: queryKeys.asset(code) });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        return updateMaintenance(id!, {
          state,
          cost: cost ? Number(cost.replace(/[^\d.]/g, '')) : null,
          detail: detail || null,
          nextDueAt: nextDue || null,
        });
      }

      return openMaintenance({
        assetId: asset.data!.asset.id,
        title,
        detail: detail || null,
        vendorId: internal ? null : vendorId,
        isInternal: internal,
        underWarranty: warranty,
        nextDueAt: nextDue || null,
      });
    },
    onSuccess: () => {
      invalidate();
      toast(editing ? 'Maintenance updated' : 'Job opened');
      router.back();
    },
    onError: (e: Error) => setError(e.message),
  });

  const loading = options.isPending || (editing ? all.isPending : asset.isPending);

  if (loading) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Skeleton height={110} radius={t.radii.cardMedium} />
        <Skeleton height={230} radius={t.radii.cardMedium} />
      </ScrollView>
    );
  }

  if (editing ? !existing : !asset.data) {
    return (
      <View style={styles.centre}>
        <EmptyState
          variant="error"
          title={editing ? 'Maintenance record not found' : 'Asset not found'}
          description="It may have been removed, or it is outside your location scope."
          actionLabel="Maintenance"
          onAction={() => router.replace('/maintenance')}
        />
      </View>
    );
  }

  const heading = editing ? existing!.title : asset.data!.asset.name;
  const subheading = editing
    ? `${existing!.asset_code} · ${existing!.asset_name}`
    : `${asset.data!.asset.assetCode} · opening a new job`;

  const vendors = options.data?.vendors ?? [];
  const ready = editing ? true : title.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
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

        <Text style={[t.type.screenTitle, { color: t.color.text }]}>{heading}</Text>
        <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
          {subheading}
        </Text>

        {editing ? (
          <Card padding={15} title="State" style={styles.card}>
            <View style={styles.stateRow}>
              <Badge label={MAINTENANCE_STATE_LABEL[existing!.state]} />
              {existing!.vendor_name ? (
                <Text style={[t.type.meta, { color: t.color.sub }]}>{existing!.vendor_name}</Text>
              ) : null}
            </View>
            <SelectField
              label="Change to"
              value={MAINTENANCE_STATE_LABEL[state]}
              onPress={() => setPicker('state')}
              containerStyle={styles.field}
            />
            <Text style={[t.type.meta, { color: t.color.sub }]}>
              Marking it Completed or Cancelled stamps today&apos;s date on it, so a report can tell
              this month&apos;s work from last year&apos;s.
            </Text>
          </Card>
        ) : (
          <Card padding={15} title="What is being done" style={styles.card}>
            <Input
              label="Title"
              required
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Replace swollen battery"
              containerStyle={styles.field}
            />
            <Switch
              value={internal}
              onValueChange={setInternal}
              label="Handled in-house"
              description={internal ? 'No vendor' : 'A vendor is doing the work'}
            />
            {!internal ? (
              <SelectField
                label="Vendor"
                value={vendors.find((v) => v.id === vendorId)?.name ?? null}
                placeholder="Choose a vendor"
                onPress={() => setPicker('vendor')}
                containerStyle={styles.fieldTop}
              />
            ) : null}
            <View style={styles.switchGap}>
              <Switch
                value={warranty}
                onValueChange={setWarranty}
                label="Under warranty"
                description={warranty ? 'The vendor should not charge for this' : 'Chargeable'}
              />
            </View>
          </Card>
        )}

        <Card padding={15} title="Details" style={styles.card}>
          <Input
            label="Notes"
            value={detail}
            onChangeText={setDetail}
            placeholder="What was found, what was done"
            multiline
            numberOfLines={3}
            containerStyle={styles.field}
          />
          {editing ? (
            <Input
              label="Cost"
              value={cost}
              onChangeText={setCost}
              placeholder="0"
              keyboardType="number-pad"
              helper="Rupiah, excluding anything the warranty covered"
              containerStyle={styles.field}
            />
          ) : null}
          <DateField
            label="Next service due"
            value={nextDue || null}
            onChange={(value) => setNextDue(value ?? '')}
            minimum={todayIso()}
            helper="A reminder lands a week before this date"
          />
        </Card>

        {error ? (
          <View style={styles.errorRow}>
            <AlertCircle size={14} color={t.color.error} strokeWidth={2} />
            <Text style={[t.type.meta, { color: t.color.error }]}>{error}</Text>
          </View>
        ) : null}

        <Button
          label={editing ? 'Save changes' : 'Open the job'}
          block
          disabled={!ready}
          loading={save.isPending}
          onPress={() => {
            setError('');
            save.mutate();
          }}
        />
      </ScrollView>

      <PickerSheet
        visible={picker === 'vendor'}
        title="Vendor"
        options={vendors.map((v) => ({ id: v.id, name: v.name }))}
        selectedId={vendorId}
        onSelect={(o) => setVendorId(o.id)}
        onDismiss={() => setPicker(null)}
        emptyMessage="No vendors in master data yet"
      />

      <PickerSheet
        visible={picker === 'state'}
        title="State"
        options={STATES.map((s) => ({ id: s, name: MAINTENANCE_STATE_LABEL[s] }))}
        selectedId={state}
        onSelect={(o) => setState(o.id as MaintenanceState)}
        onDismiss={() => setPicker(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 12 },
  centre: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 3, marginBottom: 14, lineHeight: 17 },
  card: { marginBottom: 12 },
  field: { marginBottom: 12 },
  fieldTop: { marginTop: 14 },
  switchGap: { marginTop: 14 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
});
