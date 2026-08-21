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
 * swaps `Expected return` for a required `Condition on return`. Everything else
 * — the progress bar, the validation copy, the success state — is shared.
 *
 * The switch used to be hidden in return mode, on the reasoning that "a BAST
 * documents a handover, not a return". That was wrong, and the client's own
 * paperwork says so: the Berita Acara Penarikan Barang is the sheet that proves
 * a device came back, and it is signed by both sides exactly like the handover.
 * Migration 0032 gives it `kind = 'return'`, and the switch is offered in both
 * modes now with the wording that matches the document being raised.
 *
 * RETURN HAS NO EMPLOYEE STEP
 * ---------------------------
 * Client instruction, 2026-08-06: "ketika orang mau return asset jangan assign
 * asset (jangan select an employee) langsung return saja, tidak ada yang punya."
 *
 * Correct, and the step was never doing any work. return_asset() reads the
 * holder off the ACTIVE ASSIGNMENT — the person picked here was never sent
 * anywhere. So the screen was asking for a fact it already knew, and worse,
 * inviting an answer that could contradict the record. Return is two steps now:
 * pick the asset, confirm. Whoever holds it is shown, not chosen.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, ChevronLeft, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

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
import { todayIso } from '@/lib/dates';
import {
  assignAccessory,
  attachAccessoriesToBast,
  fetchAccessories,
  type AccessoryRow,
} from '@/api/accessories';
import { bastIdByNumber } from '@/api/bast';
import { setSecondaryHolder } from '@/api/assignments';
import { queryKeys } from '@/lib/queryClient';
import { useScopeStore } from '@/store/useScopeStore';
import { useToast } from '@/store/useUiStore';

/**
 * The stages, by mode. Named rather than numbered because the return flow drops
 * one — indexing panels by `step === 2` would silently mean different things in
 * the two modes, which is the kind of bug that only shows up in the wrong one.
 */
const ASSIGN_STAGES = ['employee', 'asset', 'details'] as const;
const RETURN_STAGES = ['asset', 'details'] as const;

type Stage = (typeof ASSIGN_STAGES)[number];

const STAGE_NAMES: Record<Stage, string> = {
  employee: 'Employee',
  asset: 'Asset',
  details: 'Details',
};
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
  // accessoryId -> how many. Only ever populated in assign mode: a return
  // hands nothing out, and the accessories that went with the laptop come back
  // through their own Return button where the quantity is already known.
  const [accessoryPicks, setAccessoryPicks] = useState<Record<string, number>>({});
  const [accessorySheet, setAccessorySheet] = useState(false);
  // The other shift on a shared handy-talkie. Optional and hidden behind a
  // link, because almost everything has one holder and the wizard must not get
  // heavier for the exception.
  const [secondHolderId, setSecondHolderId] = useState<string | null>(null);
  const [secondSheet, setSecondSheet] = useState(false);
  const [condition, setCondition] = useState<Option | null>(null);
  const [conditionOpen, setConditionOpen] = useState(false);

  const [stepError, setStepError] = useState('');
  const [dateError, setDateError] = useState('');
  const [done, setDone] = useState<{ bastNumber: string | null } | null>(null);

  // Coming from Asset Detail the asset is already chosen. Adjusted during
  // render rather than in an effect — the same pattern the Edit form uses.
  //
  // Nothing is prefilled for the person any more: on a return there is no
  // employee step to prefill, and the holder comes off the asset row.
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (assetParam && assets.data && prefilledFor !== assetParam) {
    const found = assets.data.find((a) => a.asset_code === assetParam);
    setPrefilledFor(assetParam);
    if (found) setAsset(found);
  }

  const stages: readonly Stage[] = isReturn ? RETURN_STAGES : ASSIGN_STAGES;
  const stage = stages[step - 1] ?? stages[stages.length - 1]!;
  const lastStep = stages.length;

  const conditions = options.data?.conditions ?? [];
  // Return mode defaults to the condition the asset already carries.
  const [conditionSeeded, setConditionSeeded] = useState(false);
  if (isReturn && asset && conditions.length > 0 && !conditionSeeded) {
    setConditionSeeded(true);
    setCondition(conditions.find((c) => c.name === asset.condition_name) ?? null);
  }

  // Stock the person could be given alongside the asset. Fetched only in
  // assign mode, and only what is actually on a shelf in the current scope.
  const accessories = useQuery({
    queryKey: ['accessories', scope, 'assignable'],
    queryFn: () => fetchAccessories(scope),
    enabled: !isReturn && scope.length > 0,
  });

  const availableAccessories = (accessories.data ?? []).filter(
    (a: AccessoryRow) => a.is_active && a.available_qty > 0,
  );

  const pickedAccessories = availableAccessories.filter((a) => (accessoryPicks[a.id] ?? 0) > 0);

  const commit = useMutation({
    mutationFn: async () => {
      if (isReturn) {
        const result = await returnAsset({
          assetId: asset!.id,
          date,
          conditionId: condition!.id,
          notes: notes || null,
          autoBast,
        });
        return { bastNumber: result.bastNumber };
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

      // Accessories go out AFTER the assignment succeeds, one call each. Stock
      // only moves here; putting the lines on the document is a separate step
      // below, so a failure to write paper can never leave the shelf wrong.
      // Before the accessories, so the draft BAST already knows it needs a
      // third signature by the time anything is written on it.
      if (secondHolderId) {
        await setSecondaryHolder(asset!.id, secondHolderId);
      }

      const checkoutIds: string[] = [];
      for (const picked of pickedAccessories) {
        const out = await assignAccessory(
          picked.id,
          employee!.id,
          accessoryPicks[picked.id] ?? 1,
          date,
          notes || undefined,
        );
        checkoutIds.push(out.checkoutId);
      }

      if (checkoutIds.length > 0 && result.bastNumber) {
        // assign_asset() hands back the number it minted, not the id.
        const bastId = await bastIdByNumber(result.bastNumber);
        if (bastId) await attachAccessoriesToBast(bastId, checkoutIds);
      }

      return { bastNumber: result.bastNumber, accessories: checkoutIds.length };
    },
    onSuccess: (result) => {
      setDone(result);
      toast(isReturn ? 'Asset returned successfully' : 'Assignment created successfully');
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['assignableAssets'] });
      void queryClient.invalidateQueries({ queryKey: ['bast'] });
      void queryClient.invalidateQueries({ queryKey: ['accessories'] });
      if (asset)
        void queryClient.invalidateQueries({ queryKey: queryKeys.asset(asset.asset_code) });
    },
    onError: (e: Error) => setStepError(e.message),
  });

  const advance = () => {
    // README § Validation — this copy is also what the RPC raises, so a direct
    // call cannot produce a different message.
    if (stage === 'employee' && !employee) {
      setStepError('Select an employee to continue');
      return;
    }
    if (stage === 'asset' && !asset) {
      setStepError('Select an asset to continue');
      return;
    }
    if (stage === 'details') {
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
      // On a return the holder is read off the record, never picked.
      {
        k: isReturn ? 'Returned by' : 'Employee',
        v: isReturn ? (asset?.holder_name ?? 'Nobody') : (employee?.full_name ?? '—'),
      },
      { k: 'Asset', v: asset ? `${asset.asset_code} · ${asset.name}` : '—' },
      { k: 'Date', v: date },
      {
        k: 'E-BAST',
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
          {done.bastNumber
            ? isReturn
              ? 'The asset is available again, and a Berita Acara Penarikan Barang draft is waiting to be signed.'
              : 'An E-BAST draft has been created and the assignment history updated.'
            : isReturn
              ? 'The asset is available again and its assignment history has been updated.'
              : 'Assignment history updated. No E-BAST was generated.'}
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
          label="Generate E-BAST document"
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
        {`Step ${step} of ${lastStep} · ${STAGE_NAMES[stage]}`}
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
          {stage === 'employee' ? (
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

              {employee ? (
                <Card radius="cardMedium" padding={14} style={styles.secondHolder}>
                  <Text style={[t.type.metaStrong, { color: t.color.text }]}>
                    {secondHolderId ? 'Two people are answerable for this' : 'Held by two people?'}
                  </Text>
                  <Text style={[t.type.meta, styles.accessoryHint, { color: t.color.sub }]}>
                    A handy-talkie carried on opposite shifts, for example. The document is raised
                    once for the pair and is not finished until BOTH have signed it. Shift changes
                    are not recorded.
                  </Text>

                  {secondHolderId ? (
                    <View style={styles.accessoryRow}>
                      <View style={styles.accessoryText}>
                        <Text numberOfLines={1} style={[t.type.bodySmall, { color: t.color.text }]}>
                          {employees.data?.find((e) => e.id === secondHolderId)?.full_name}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setSecondHolderId(null)}
                        accessibilityRole="button"
                        accessibilityLabel="Remove the second holder"
                        hitSlop={10}
                      >
                        <X size={16} color={t.color.sub} strokeWidth={1.9} />
                      </Pressable>
                    </View>
                  ) : (
                    <Button
                      label="Add a second holder"
                      variant="secondary"
                      block
                      onPress={() => setSecondSheet(true)}
                      style={styles.accessoryAdd}
                    />
                  )}
                </Card>
              ) : null}
            </View>
          ) : null}

          {stage === 'asset' ? (
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

          {stage === 'details' ? (
            <View style={styles.stepBody}>
              <Card radius="cardMedium" padding={16}>
                <Text style={[t.type.sectionLabel, { color: t.color.sub }]}>Summary</Text>

                {/* On a return this is who the record says holds it — shown,
                    not chosen. Picking a name here could only ever contradict
                    the assignment the return is about to close. */}
                <View style={styles.summaryPerson}>
                  <Avatar
                    name={(isReturn ? asset?.holder_name : employee?.full_name) ?? '—'}
                    size={34}
                  />
                  <View style={styles.summaryPersonText}>
                    <Text style={[t.type.body, { color: t.color.text }]}>
                      {(isReturn ? asset?.holder_name : employee?.full_name) ?? '—'}
                    </Text>
                    <Text style={[t.type.metaStrong, styles.summaryMeta, { color: t.color.sub }]}>
                      {isReturn
                        ? `Returning to ${asset?.location_name ?? 'the store'}`
                        : [employee?.department_name, employee?.location_name]
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
                <DateField
                  label={isReturn ? 'Return date' : 'Assignment date'}
                  required
                  value={date || null}
                  onChange={(value) => {
                    setDate(value ?? '');
                    if (dateError) setDateError('');
                  }}
                  error={dateError || null}
                  clearable={false}
                  maximum={todayIso()}
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
                  <DateField
                    label="Expected return (optional)"
                    value={expectedReturn || null}
                    onChange={(value) => setExpectedReturn(value ?? '')}
                    // Nothing is due back before it goes out.
                    minimum={date || null}
                  />
                )}

                <Input
                  label="Notes"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Handover condition, accessories included…"
                  multiline
                />

                {!isReturn ? (
                  <Card radius="cardMedium" padding={14} title="Accessories">
                    <Text style={[t.type.meta, styles.accessoryHint, { color: t.color.sub }]}>
                      Anything handed over with it — a mouse, a headset, a cable. These go on the
                      same E-BAST as extra lines, so the paper matches the bag.
                    </Text>

                    {pickedAccessories.map((a) => (
                      <View key={a.id} style={styles.accessoryRow}>
                        <View style={styles.accessoryText}>
                          <Text
                            numberOfLines={1}
                            style={[t.type.bodySmall, { color: t.color.text }]}
                          >
                            {a.name}
                          </Text>
                          <Text style={[t.type.meta, { color: t.color.sub, marginTop: 2 }]}>
                            {`${a.available_qty} available · ${a.location_name}`}
                          </Text>
                        </View>
                        <Input
                          value={String(accessoryPicks[a.id] ?? 1)}
                          onChangeText={(v) => {
                            const n = Number(v.replace(/[^0-9]/g, '') || '0');
                            setAccessoryPicks((prev) => ({
                              ...prev,
                              [a.id]: Math.min(Math.max(n, 0), a.available_qty),
                            }));
                          }}
                          keyboardType="number-pad"
                          containerStyle={styles.accessoryQty}
                        />
                        <Pressable
                          onPress={() =>
                            setAccessoryPicks((prev) => {
                              const next = { ...prev };
                              delete next[a.id];
                              return next;
                            })
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${a.name}`}
                          hitSlop={10}
                        >
                          <X size={16} color={t.color.sub} strokeWidth={1.9} />
                        </Pressable>
                      </View>
                    ))}

                    <Button
                      label={pickedAccessories.length > 0 ? 'Add another' : 'Add accessories'}
                      variant="secondary"
                      block
                      disabled={availableAccessories.length === 0}
                      onPress={() => setAccessorySheet(true)}
                      style={styles.accessoryAdd}
                    />

                    {availableAccessories.length === 0 ? (
                      <Text style={[t.type.meta, styles.accessoryHint, { color: t.color.sub }]}>
                        Nothing in stock at the locations in scope.
                      </Text>
                    ) : null}
                  </Card>
                ) : null}

                <Card radius="cardMedium" padding={14}>
                  <Switch
                    value={autoBast}
                    onValueChange={setAutoBast}
                    label="Auto-generate E-BAST"
                    description={
                      isReturn
                        ? 'Berita Acara Penarikan Barang draft'
                        : 'Berita Acara Serah Terima Barang draft'
                    }
                  />
                  {!autoBast && pickedAccessories.length > 0 ? (
                    <Text style={[t.type.meta, styles.accessoryHint, { color: t.color.sub }]}>
                      With this off the accessories still go out and are still recorded — they just
                      will not be on any document.
                    </Text>
                  ) : null}
                </Card>
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
              label={
                stage === 'details'
                  ? isReturn
                    ? 'Confirm return'
                    : 'Confirm assignment'
                  : 'Continue'
              }
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

      <PickerSheet
        visible={secondSheet}
        title="Second holder"
        options={(employees.data ?? [])
          .filter((e) => e.id !== employee?.id)
          .map((e) => ({
            id: e.id,
            name: e.full_name,
            detail: [e.department_name, e.location_name, e.nik].filter(Boolean).join(' · '),
          }))}
        selectedId={secondHolderId}
        onSelect={(option) => setSecondHolderId(option.id)}
        onDismiss={() => setSecondSheet(false)}
        emptyMessage="Nobody else in this scope."
      />

      <PickerSheet
        visible={accessorySheet}
        title="Add an accessory"
        options={availableAccessories
          .filter((a) => !((accessoryPicks[a.id] ?? 0) > 0))
          .map((a) => ({
            id: a.id,
            name: a.name,
            detail: `${a.available_qty} available · ${a.location_name}`,
          }))}
        selectedId={null}
        onSelect={(option) => setAccessoryPicks((prev) => ({ ...prev, [option.id]: 1 }))}
        onDismiss={() => setAccessorySheet(false)}
        emptyMessage="Everything in stock is already on the list."
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
  navButton: { height: 46, minHeight: 46 },
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
  doneAction: { marginTop: 16, height: 46, minHeight: 46 },
  doneSecondary: { marginTop: 9 },
  accessoryHint: { marginTop: 8, lineHeight: 16 },
  accessoryRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 11 },
  accessoryText: { flex: 1, minWidth: 0 },
  accessoryQty: { width: 66 },
  accessoryAdd: { marginTop: 12 },
  secondHolder: { marginTop: 14 },
});
