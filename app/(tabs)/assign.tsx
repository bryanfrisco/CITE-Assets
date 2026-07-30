/**
 * Assign / Return Asset — README § Screens 4, the 3-step wizard.
 *
 * Entered from the FAB sheet, the Dashboard quick action, or the Asset Detail
 * primary button (`?mode=return&asset=<code>`), which pre-selects the asset and
 * switches to return mode.
 *
 * DEVIATION — step 3 in return mode
 * ---------------------------------
 * README describes step 3 for the assign flow only. `return_asset()`
 * (DATABASE.md §11) takes the condition the asset comes back in, so return mode
 * swaps `Expected return` for a required `Condition on return` and drops the
 * Auto-generate BAST switch — a BAST documents a handover, not a return.
 * Everything else — the progress bar, the validation copy, the success state —
 * is shared.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, ChevronLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

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
  Switch,
} from '@/components/ui';
import { Avatar } from '@/components/chrome';
import { CategoryIcon } from '@/components/CategoryIcon';
import {
  assignAsset,
  fetchAssignableAssets,
  fetchAssignableEmployees,
  returnAsset,
  type AssignableAssetRow,
  type EmployeeRow,
} from '@/api/assignments';
import { fetchAssetFormOptions, type Option } from '@/api/assets';
import { queryKeys } from '@/lib/queryClient';
import { useScopeStore } from '@/store/useScopeStore';
import { useToast } from '@/store/useUiStore';

const STEP_NAMES = ['Employee', 'Asset', 'Details'] as const;
const DATE_HINT = 'YYYY-MM-DD';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AssignScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const scope = useScopeStore((s) => s.scope);

  const { mode: modeParam, asset: assetParam } = useLocalSearchParams<{
    mode?: string;
    asset?: string;
  }>();
  const isReturn = modeParam === 'return';

  const employees = useQuery({
    queryKey: ['assignableEmployees', scope],
    queryFn: () => fetchAssignableEmployees(scope),
    enabled: scope.length > 0,
  });

  const assets = useQuery({
    queryKey: ['assignableAssets', scope, isReturn ? 'return' : 'assign'],
    queryFn: () => fetchAssignableAssets(scope, isReturn ? 'return' : 'assign'),
    enabled: scope.length > 0,
  });

  const options = useQuery({ queryKey: ['assetFormOptions'], queryFn: fetchAssetFormOptions });

  const [step, setStep] = useState(1);
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [asset, setAsset] = useState<AssignableAssetRow | null>(null);
  const [date, setDate] = useState(today());
  const [expectedReturn, setExpectedReturn] = useState('');
  const [notes, setNotes] = useState('');
  const [autoBast, setAutoBast] = useState(true);
  const [condition, setCondition] = useState<Option | null>(null);
  const [conditionOpen, setConditionOpen] = useState(false);

  const [stepError, setStepError] = useState('');
  const [dateError, setDateError] = useState('');
  const [done, setDone] = useState<{ bastNumber: string | null } | null>(null);

  // Coming from Asset Detail the asset is already chosen, and in return mode so
  // is the person handing it back. Adjusted during render rather than in an
  // effect — the same pattern the Edit form uses.
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (assetParam && assets.data && employees.data && prefilledFor !== assetParam) {
    const found = assets.data.find((a) => a.asset_code === assetParam);
    setPrefilledFor(assetParam);
    if (found) {
      setAsset(found);
      const holder = employees.data.find((e) => e.full_name === found.holder_name);
      if (isReturn && holder) setEmployee(holder);
    }
  }

  const conditions = options.data?.conditions ?? [];
  // Return mode defaults to the condition the asset already carries.
  const [conditionSeeded, setConditionSeeded] = useState(false);
  if (isReturn && asset && conditions.length > 0 && !conditionSeeded) {
    setConditionSeeded(true);
    setCondition(conditions.find((c) => c.name === asset.condition_name) ?? null);
  }

  const commit = useMutation({
    mutationFn: async () => {
      if (isReturn) {
        await returnAsset({
          assetId: asset!.id,
          date,
          conditionId: condition!.id,
          notes: notes || null,
        });
        return { bastNumber: null };
      }
      const result = await assignAsset({
        assetId: asset!.id,
        accountId: employee!.id,
        locationId: null,
        date,
        expectedReturn: expectedReturn || null,
        notes: notes || null,
        autoBast,
      });
      return { bastNumber: result.bastNumber };
    },
    onSuccess: (result) => {
      setDone(result);
      toast(isReturn ? 'Asset returned successfully' : 'Assignment created successfully');
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['assignableAssets'] });
      void queryClient.invalidateQueries({ queryKey: ['bast'] });
      if (asset)
        void queryClient.invalidateQueries({ queryKey: queryKeys.asset(asset.asset_code) });
    },
    onError: (e: Error) => setStepError(e.message),
  });

  const advance = () => {
    // README § Validation — this copy is also what the RPC raises, so a direct
    // call cannot produce a different message.
    if (step === 1 && !employee) {
      setStepError('Select an employee to continue');
      return;
    }
    if (step === 2 && !asset) {
      setStepError('Select an asset to continue');
      return;
    }
    if (step === 3) {
      if (!date.trim() || !DATE_RE.test(date.trim())) {
        setDateError(isReturn ? 'Return date is required' : 'Assignment date is required');
        setStepError('Fill the required field');
        return;
      }
      if (isReturn && !condition) {
        setStepError('Fill the required field');
        return;
      }
      setDateError('');
      setStepError('');
      commit.mutate();
      return;
    }
    setStepError('');
    setStep(step + 1);
  };

  const summaryRows = useMemo(
    () => [
      { k: isReturn ? 'Returned by' : 'Employee', v: employee?.full_name ?? '—' },
      { k: 'Asset', v: asset ? `${asset.asset_code} · ${asset.name}` : '—' },
      { k: 'Date', v: date },
      {
        k: 'BAST',
        v: done?.bastNumber ? `${done.bastNumber} (draft)` : 'Not generated',
      },
    ],
    [isReturn, employee, asset, date, done],
  );

  // ---------------------------------------------------------------- success
  if (done) {
    return (
      <Screen contentStyle={styles.doneContent}>
        <View style={styles.doneTile}>
          <LinearGradient
            colors={[...t.gradients.success.colors]}
            start={t.gradients.success.start}
            end={t.gradients.success.end}
            style={[StyleSheet.absoluteFill, { borderRadius: 26 }]}
          />
          {/* zIndex keeps the tick above the absolutely-positioned gradient. */}
          <View style={styles.doneGlyph}>
            <Check size={36} color={t.color.onNavy} strokeWidth={2.4} />
          </View>
        </View>

        <Text style={[t.type.screenTitle, styles.doneTitle, { color: t.color.text }]}>
          {isReturn ? 'Asset returned' : 'Assignment created'}
        </Text>
        <Text style={[t.type.bodySmall, styles.doneSub, { color: t.color.sub }]}>
          {isReturn
            ? 'The asset is available again and its assignment history has been updated.'
            : done.bastNumber
              ? 'A BAST draft has been created and the assignment history updated.'
              : 'Assignment history updated. No BAST was generated.'}
        </Text>

        <Card radius="cardMedium" padding={16} style={styles.doneCard}>
          {summaryRows.map((row, i) => (
            <View
              key={row.k}
              style={[
                styles.doneRow,
                {
                  borderBottomWidth: i === summaryRows.length - 1 ? 0 : 1,
                  borderBottomColor: t.color.line,
                },
              ]}
            >
              <Text style={[t.type.meta, styles.doneKey, { color: t.color.sub }]}>{row.k}</Text>
              <Text style={[t.type.bodySmall, styles.doneValue, { color: t.color.text }]}>
                {row.v}
              </Text>
            </View>
          ))}
        </Card>

        <Button
          label="Generate BAST document"
          block
          style={styles.doneAction}
          onPress={() => {
            if (done.bastNumber) toast(`${done.bastNumber} generated`);
            router.replace('/bast');
          }}
        />
        <Button
          label="Back to dashboard"
          variant="secondary"
          block
          style={styles.doneSecondary}
          onPress={() => router.replace('/')}
        />
      </Screen>
    );
  }

  // ----------------------------------------------------------------- wizard
  const loading = employees.isPending || assets.isPending || options.isPending;
  const error = employees.error ?? assets.error ?? options.error;

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

      <Text style={[t.type.screenTitle, { color: t.color.text }]}>
        {isReturn ? 'Return Asset' : 'Assign Asset'}
      </Text>
      <Text style={[t.type.bodySmall, styles.stepLine, { color: t.color.sub }]}>
        {`Step ${step} of 3 · ${STEP_NAMES[step - 1]}`}
      </Text>

      <View style={styles.bars}>
        {[1, 2, 3].map((n) => (
          <View
            key={n}
            style={[styles.bar, { backgroundColor: n <= step ? t.color.navy : t.color.line }]}
          />
        ))}
      </View>

      {error ? (
        <EmptyState
          variant="error"
          title="Could not load the wizard"
          description={(error as Error).message}
          actionLabel="Try again"
          onAction={() => {
            void employees.refetch();
            void assets.refetch();
          }}
        />
      ) : loading ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={62} radius={t.radii.card} />
          ))}
        </View>
      ) : (
        <>
          {step === 1 ? (
            <View style={styles.stepBody}>
              <Text style={[t.type.sectionLabel, styles.stepLabel, { color: t.color.sub }]}>
                Select employee
              </Text>
              {employees.data && employees.data.length > 0 ? (
                <View style={styles.rows}>
                  {employees.data.map((e) => (
                    <SelectableRow
                      key={e.id}
                      selected={employee?.id === e.id}
                      onPress={() => {
                        setEmployee(e);
                        setStepError('');
                      }}
                      leading={<Avatar name={e.full_name} size={t.sizes.avatarWizard} />}
                      title={e.full_name}
                      meta={[e.department_name, e.location_name, e.nik].filter(Boolean).join(' · ')}
                    />
                  ))}
                </View>
              ) : (
                <EmptyState
                  title="No employees in this scope"
                  description="Add people in Settings, or widen the scope from the header."
                />
              )}
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.stepBody}>
              <Text style={[t.type.sectionLabel, styles.stepLabel, { color: t.color.sub }]}>
                {isReturn ? 'Select assigned asset' : 'Select available asset'}
              </Text>
              {assets.data && assets.data.length > 0 ? (
                <View style={styles.rows}>
                  {assets.data.map((a) => (
                    <SelectableRow
                      key={a.id}
                      selected={asset?.id === a.id}
                      onPress={() => {
                        setAsset(a);
                        setStepError('');
                      }}
                      leading={
                        <View
                          style={[
                            styles.assetIcon,
                            { backgroundColor: t.color.soft, borderColor: t.color.line },
                          ]}
                        >
                          <CategoryIcon name={null} size={18} color={t.color.royal} />
                        </View>
                      }
                      code={a.asset_code}
                      title={a.name}
                      meta={`${a.location_name} · ${a.condition_name}`}
                    />
                  ))}
                </View>
              ) : (
                <EmptyState
                  title={isReturn ? 'Nothing to return' : 'No available assets'}
                  description={
                    isReturn
                      ? 'No asset in this scope is currently assigned.'
                      : 'Every asset in this scope is already assigned or unavailable.'
                  }
                />
              )}
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.stepBody}>
              <Card radius="cardMedium" padding={16}>
                <Text style={[t.type.sectionLabel, { color: t.color.sub }]}>Summary</Text>

                <View style={styles.summaryPerson}>
                  <Avatar name={employee?.full_name ?? '—'} size={34} />
                  <View style={styles.summaryPersonText}>
                    <Text style={[t.type.body, { color: t.color.text }]}>
                      {employee?.full_name ?? '—'}
                    </Text>
                    <Text style={[t.type.metaStrong, styles.summaryMeta, { color: t.color.sub }]}>
                      {[employee?.department_name, employee?.location_name]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                </View>

                <View style={[styles.divider, { backgroundColor: t.color.line }]} />

                <Text style={[t.type.assetCode, { color: t.color.royal }]}>
                  {asset?.asset_code ?? '—'}
                </Text>
                <Text style={[t.type.bodySmall, styles.summaryAsset, { color: t.color.text }]}>
                  {asset?.name ?? '—'}
                </Text>
              </Card>

              <View style={styles.fields}>
                <Input
                  label={isReturn ? 'Return date' : 'Assignment date'}
                  required
                  value={date}
                  onChangeText={(value) => {
                    setDate(value);
                    if (dateError) setDateError('');
                  }}
                  error={dateError || null}
                  placeholder={DATE_HINT}
                />

                {isReturn ? (
                  <SelectField
                    label="Condition on return"
                    required
                    value={condition?.name}
                    placeholder="Select a condition"
                    onPress={() => setConditionOpen(true)}
                  />
                ) : (
                  <Input
                    label="Expected return (optional)"
                    value={expectedReturn}
                    onChangeText={setExpectedReturn}
                    placeholder={DATE_HINT}
                  />
                )}

                <Input
                  label="Notes"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Handover condition, accessories included…"
                  multiline
                />

                {isReturn ? null : (
                  <Card radius="cardMedium" padding={14}>
                    <Switch
                      value={autoBast}
                      onValueChange={setAutoBast}
                      label="Auto-generate BAST"
                      description="Berita Acara Serah Terima draft"
                    />
                  </Card>
                )}
              </View>
            </View>
          ) : null}

          <View style={styles.actions}>
            {step > 1 ? (
              <Button
                label="Back"
                variant="secondary"
                style={styles.navButton}
                onPress={() => {
                  setStepError('');
                  setStep(step - 1);
                }}
              />
            ) : null}
            <Button
              label={step === 3 ? (isReturn ? 'Confirm return' : 'Confirm assignment') : 'Continue'}
              block
              loading={commit.isPending}
              style={styles.navButton}
              onPress={advance}
            />
          </View>

          {stepError ? (
            <View style={styles.errorRow}>
              <AlertCircle size={14} color={t.color.error} strokeWidth={2} />
              <Text style={[t.type.meta, { color: t.color.error }]}>{stepError}</Text>
            </View>
          ) : null}
        </>
      )}

      <PickerSheet
        visible={conditionOpen}
        title="Condition"
        options={conditions}
        selectedId={condition?.id ?? null}
        onSelect={(option) => setCondition(option as Option)}
        onDismiss={() => setConditionOpen(false)}
        emptyMessage="No condition records yet — add one in Master data."
      />
    </Screen>
  );
}

/**
 * README § step 1/2: "Selected row: 1.5px royal border + `0 0 0 3px
 * rgba(43,87,196,.13)` ring + check icon."
 */
function SelectableRow({
  selected,
  onPress,
  leading,
  code,
  title,
  meta,
}: {
  selected: boolean;
  onPress: () => void;
  leading: React.ReactNode;
  code?: string;
  title: string;
  meta: string;
}) {
  const t = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.row,
        {
          borderRadius: t.radii.cardMedium,
          backgroundColor: t.color.card,
          borderWidth: selected ? 1.5 : 1,
          borderColor: selected ? t.color.royal : t.color.line,
          opacity: pressed ? 0.9 : 1,
        },
        selected ? { ...t.shadow.card, shadowColor: t.color.royal, shadowOpacity: 0.13 } : null,
      ]}
    >
      {leading}
      <View style={styles.rowText}>
        {code ? <Text style={[t.type.assetCode, { color: t.color.royal }]}>{code}</Text> : null}
        <Text numberOfLines={1} style={[t.type.body, { color: t.color.text }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[t.type.metaStrong, { color: t.color.sub }]}>
          {meta}
        </Text>
      </View>
      {selected ? <Check size={18} color={t.color.royal} strokeWidth={2.4} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  stepLine: { marginTop: 3 },
  bars: { flexDirection: 'row', gap: 5, marginTop: 14 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  skeletons: { gap: 9, marginTop: 18 },
  stepBody: { marginTop: 18 },
  stepLabel: { marginBottom: 9 },
  rows: { gap: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  assetIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryPerson: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 11 },
  summaryPersonText: { flex: 1, minWidth: 0 },
  summaryMeta: { marginTop: 2 },
  divider: { height: 1, marginVertical: 12 },
  summaryAsset: { marginTop: 2 },
  fields: { marginTop: 14, gap: 13 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 20 },
  navButton: { height: 46 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  doneContent: { paddingTop: 26 },
  doneTile: {
    width: 78,
    height: 78,
    borderRadius: 26,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  doneGlyph: { zIndex: 1 },
  doneTitle: { marginTop: 18, textAlign: 'center' },
  doneSub: { marginTop: 7, textAlign: 'center', paddingHorizontal: 14, lineHeight: 19 },
  doneCard: { marginTop: 20 },
  doneRow: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  doneKey: { width: 100 },
  doneValue: { flex: 1, textAlign: 'right' },
  doneAction: { marginTop: 16, height: 46 },
  doneSecondary: { marginTop: 9 },
});
