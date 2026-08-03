/**
 * Record a repair, or edit one already recorded.
 *
 * `?asset=<code>` records against that asset; `?id=<uuid>` edits an existing
 * record.
 *
 * A record is a title and a date range. Leave the end date empty while the
 * device is still in the shop and fill it in when it comes back — that is the
 * whole workflow, and it replaces the open/in-progress/completed/cancelled
 * ladder that used to sit here.
 *
 * This screen does not touch the asset's status. If a laptop needs to show as
 * Maintenance in the register, that is Change status on the asset, with a
 * reason. Keeping the two apart is what stopped a closed repair leaving an
 * asset unassignable forever.
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
import { editMaintenance, fetchMaintenance, logMaintenance } from '@/api/maintenance';
import { fetchAssetDetail, fetchAssetFormOptions } from '@/api/assets';
import { formatDate, todayIso } from '@/lib/dates';
import { queryKeys } from '@/lib/queryClient';
import { useScopeStore } from '@/store/useScopeStore';
import { useToast } from '@/store/useUiStore';

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
  const [started, setStarted] = useState<string | null>(todayIso());
  const [completed, setCompleted] = useState<string | null>(null);
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [cost, setCost] = useState('');
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState('');
  const [seeded, setSeeded] = useState(false);

  // Seeded from the record the first time it arrives, adjusted during render so
  // the first paint is already correct rather than one frame behind.
  if (editing && existing && !seeded) {
    setSeeded(true);
    setTitle(existing.title);
    setDetail(existing.detail ?? '');
    setStarted(existing.started_at);
    setCompleted(existing.completed_at);
    setNextDue(existing.next_due_at);
    setCost(String(Number(existing.cost ?? 0) || ''));
    setWarranty(existing.under_warranty);
    setInternal(existing.is_internal);
  }

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    void queryClient.invalidateQueries({ queryKey: ['maintenanceStats'] });
    const code = assetCode ?? existing?.asset_code;
    if (code) void queryClient.invalidateQueries({ queryKey: queryKeys.asset(code) });
  };

  const save = useMutation({
    mutationFn: async () => {
      const amount = cost ? Number(cost.replace(/[^\d.]/g, '')) : null;

      if (editing) {
        return editMaintenance(id!, {
          title,
          startedAt: started,
          completedAt: completed,
          detail: detail || null,
          vendorId: internal ? null : vendorId,
          cost: amount,
          nextDueAt: nextDue,
          // Emptying the field has to mean "back in the shop", and a null on
          // its own cannot say that — it also means "unchanged".
          clearCompleted: completed === null,
        });
      }

      return logMaintenance({
        assetId: asset.data!.asset.id,
        title,
        startedAt: started ?? todayIso(),
        completedAt: completed,
        detail: detail || null,
        vendorId: internal ? null : vendorId,
        isInternal: internal,
        underWarranty: warranty,
        cost: amount,
        nextDueAt: nextDue,
      });
    },
    onSuccess: (result) => {
      invalidate();
      toast(result.ongoing ? 'Recorded · still in the shop' : 'Recorded');
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
    : `${asset.data!.asset.assetCode} · recording a repair`;

  const vendors = options.data?.vendors ?? [];
  const ready = title.trim().length > 0 && Boolean(started);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + t.spacing.screenBottom },
        ]}
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
          <View style={styles.stateRow}>
            <Badge
              label={existing!.ongoing ? 'In the shop' : 'Done'}
              tone={existing!.ongoing ? undefined : 'available'}
            />
            <Text style={[t.type.meta, { color: t.color.sub }]}>
              {existing!.ongoing
                ? `Since ${formatDate(existing!.started_at)}`
                : `${formatDate(existing!.started_at)} — ${formatDate(existing!.completed_at)}`}
            </Text>
          </View>
        ) : null}

        <Card padding={15} title="What was done" style={styles.card}>
          <Input
            label="Title"
            required
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Replace swollen battery"
            containerStyle={styles.field}
          />
          <Input
            label="Notes"
            value={detail}
            onChangeText={setDetail}
            placeholder="What was found, what was done"
            multiline
            numberOfLines={3}
          />
        </Card>

        <Card padding={15} title="When" style={styles.card}>
          <DateField
            label="Went in"
            required
            value={started}
            onChange={setStarted}
            clearable={false}
            maximum={completed ?? todayIso()}
            containerStyle={styles.field}
          />
          <DateField
            label="Came back"
            value={completed}
            onChange={setCompleted}
            placeholder="Still in the shop"
            minimum={started}
            maximum={todayIso()}
            helper="Leave empty while it is still away. Clearing it puts it back in the shop."
          />
        </Card>

        <Card padding={15} title="Who and how much" style={styles.card}>
          <Switch
            value={internal}
            onValueChange={setInternal}
            label="Handled in-house"
            description={internal ? 'No vendor' : 'A vendor did the work'}
          />
          {!internal ? (
            <SelectField
              label="Vendor"
              value={vendors.find((v) => v.id === vendorId)?.name ?? null}
              placeholder="Choose a vendor"
              onPress={() => setPicker(true)}
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

          <Input
            label="Cost"
            value={cost}
            onChangeText={setCost}
            placeholder="0"
            keyboardType="number-pad"
            helper="Rupiah, excluding anything the warranty covered"
            containerStyle={styles.fieldTop}
          />
        </Card>

        <Card padding={15} title="Next service" style={styles.card}>
          <DateField
            label="Due"
            value={nextDue}
            onChange={setNextDue}
            placeholder="No schedule"
            minimum={started}
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
          label={editing ? 'Save changes' : 'Record it'}
          block
          disabled={!ready}
          loading={save.isPending}
          onPress={() => {
            setError('');
            save.mutate();
          }}
        />

        <Text style={[t.type.meta, styles.footnote, { color: t.color.sub }]}>
          This is a record only. To take the asset out of circulation, change its status on the
          asset itself — that way it comes back when you say so, not when a record closes.
        </Text>
      </ScrollView>

      <PickerSheet
        visible={picker}
        title="Vendor"
        options={vendors.map((v) => ({ id: v.id, name: v.name }))}
        selectedId={vendorId}
        onSelect={(o) => setVendorId(o.id)}
        onDismiss={() => setPicker(false)}
        emptyMessage="No vendors in master data yet"
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
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  card: { marginBottom: 12 },
  field: { marginBottom: 12 },
  fieldTop: { marginTop: 14 },
  switchGap: { marginTop: 14 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  footnote: { marginTop: 12, lineHeight: 16 },
});
