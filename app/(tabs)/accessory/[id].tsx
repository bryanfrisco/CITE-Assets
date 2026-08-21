/**
 * One accessory — how many there are, who has them, and the two buttons.
 *
 * Three tiles rather than one number, because "40 in stock" answers nothing on
 * its own. Total, out and available together are what somebody about to hand a
 * mouse over actually needs.
 *
 * `Assign to` and `Return` are the same words the asset wizard uses. The
 * quantity field is the only thing this screen has that the asset flow does
 * not, and it exists because a pile is not a thing.
 *
 * Every hand-out stays in the history after it comes back. A returned row is
 * still evidence that somebody had three of these in March.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react-native';

import { useTheme } from '@/theme';
import {
  Badge,
  BottomSheet,
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
  assignAccessory,
  createAccessoryBast,
  fetchAccessoryDetail,
  returnAccessory,
} from '@/api/accessories';
import { fetchAssignableEmployees } from '@/api/assignments';
import { todayIso } from '@/lib/dates';
import { useScopeStore } from '@/store/useScopeStore';
import { useToast } from '@/store/useUiStore';
import { usePermissions } from '@/auth';

export default function AccessoryDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const scope = useScopeStore((s) => s.scope);
  const { can } = usePermissions();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [assignOpen, setAssignOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [qty, setQty] = useState('1');
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [assignError, setAssignError] = useState('');
  const [returning, setReturning] = useState<string | null>(null);
  const [returnError, setReturnError] = useState('');
  // Set the moment something is handed out, so the offer of a document appears
  // while the hand-over is still the thing in front of the person.
  const [justOut, setJustOut] = useState<{
    checkoutId: string;
    accountId: string;
    accountName: string;
  } | null>(null);
  const [paperError, setPaperError] = useState('');

  const detail = useQuery({
    queryKey: ['accessory', id],
    queryFn: () => fetchAccessoryDetail(id ?? ''),
    enabled: Boolean(id),
  });

  const people = useQuery({
    queryKey: ['assignableEmployees', scope],
    queryFn: () => fetchAssignableEmployees(scope),
    enabled: assignOpen,
  });

  const peopleOptions = useMemo(
    () =>
      (people.data ?? []).map((p) => ({
        id: p.id,
        name: p.full_name,
        detail: [p.department_name, p.location_name, p.nik].filter(Boolean).join(' · '),
      })),
    [people.data],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['accessory', id] });
    void queryClient.invalidateQueries({ queryKey: ['accessories'] });
  };

  const give = useMutation({
    mutationFn: () => assignAccessory(id!, accountId!, Number(qty), date, notes || undefined),
    onSuccess: (result) => {
      setAssignOpen(false);
      setQty('1');
      setNotes('');
      refresh();
      toast(`${result.qty} to ${result.accountName} · ${result.availableQty} left`);
      setPaperError('');
      setJustOut({
        checkoutId: result.checkoutId,
        accountId: accountId!,
        accountName: result.accountName,
      });
      setAccountId(null);
    },
    onError: (e: Error) => setAssignError(e.message),
  });

  const paper = useMutation({
    mutationFn: ({ accountId: who, checkoutId }: { accountId: string; checkoutId: string }) =>
      createAccessoryBast(who, [checkoutId]),
    onSuccess: (result) => {
      setJustOut(null);
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['bast'] });
      void queryClient.invalidateQueries({ queryKey: ['bastStats'] });
      toast(`${result.bastNumber} raised`);
      router.push(`/bast/${result.bastId}`);
    },
    onError: (e: Error) => setPaperError(e.message),
  });

  const take = useMutation({
    mutationFn: (checkoutId: string) => returnAccessory(checkoutId),
    onSuccess: (result) => {
      setReturning(null);
      refresh();
      toast(`${result.qty} back · ${result.availableQty} available`);
    },
    onError: (e: Error) => setReturnError(e.message),
  });

  if (detail.isPending) {
    return (
      <Screen>
        <Skeleton height={120} radius={t.radii.cardLarge} />
      </Screen>
    );
  }

  if (detail.isError) {
    return (
      <Screen>
        <EmptyState
          variant="error"
          title="Could not load this accessory"
          description={(detail.error as Error).message}
          actionLabel="Try again"
          onAction={() => detail.refetch()}
        />
      </Screen>
    );
  }

  if (!detail.data) {
    return (
      <Screen>
        <EmptyState
          title="Not found"
          description="It either does not exist or it is at a location outside your scope."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const a = detail.data.accessory;
  const history = detail.data.history;
  const wanted = Number(qty);
  const canGive =
    Boolean(accountId) && Number.isFinite(wanted) && wanted >= 1 && wanted <= a.availableQty;

  return (
    <Screen>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back to Accessories"
        hitSlop={8}
        style={styles.back}
      >
        <ChevronLeft size={15} color={t.color.royal} strokeWidth={2} />
        <Text style={[t.type.metaStrong, { color: t.color.royal }]}>Accessories</Text>
      </Pressable>

      <Text style={[t.type.screenTitle, { color: t.color.text }]}>{a.name}</Text>
      <Text style={[t.type.meta, styles.subtitle, { color: t.color.sub }]}>
        {[a.brandName, a.modelNo, a.categoryName, a.locationName].filter(Boolean).join(' · ')}
      </Text>

      <View style={styles.tiles}>
        {(
          [
            ['Total', a.totalQty],
            ['Out', a.assignedQty],
            ['Available', a.availableQty],
          ] as const
        ).map(([label, value]) => (
          <Card key={label} radius="kpiTile" padding={12} style={styles.tile}>
            <Text style={[t.type.kpiNumber, styles.tileValue, { color: t.color.text }]}>
              {value}
            </Text>
            <Text style={[t.type.kpiLabel, styles.tileLabel, { color: t.color.sub }]}>{label}</Text>
          </Card>
        ))}
      </View>

      {can('assignment.write') ? (
        <Button
          label="Assign to"
          block
          disabled={a.availableQty === 0 || !a.isActive}
          onPress={() => {
            setAssignError('');
            setQty('1');
            setDate(todayIso());
            setAssignOpen(true);
          }}
          style={styles.action}
        />
      ) : null}

      {a.availableQty === 0 ? (
        <Text style={[t.type.meta, styles.hint, { color: t.color.sub }]}>
          Nothing left on the shelf. Take some back first, or raise the total.
        </Text>
      ) : null}

      {can('asset.edit') ? (
        <Button
          label="Edit"
          variant="secondary"
          block
          onPress={() => router.push(`/accessory-edit?id=${a.id}`)}
          style={styles.action}
        />
      ) : null}

      <Text style={[t.type.sectionLabel, styles.historyLabel, { color: t.color.sub }]}>
        Who has them
      </Text>

      {history.length === 0 ? (
        <Text style={[t.type.meta, { color: t.color.sub }]}>None handed out yet.</Text>
      ) : (
        <Card padding={0} radius="listContainer">
          {history.map((row, i) => (
            <View
              key={row.id}
              style={[
                styles.historyRow,
                {
                  borderBottomWidth: i === history.length - 1 ? 0 : 1,
                  borderBottomColor: t.color.line,
                },
              ]}
            >
              <View style={styles.historyText}>
                <Text numberOfLines={1} style={[t.type.bodySmall, { color: t.color.text }]}>
                  {`${row.qty} × ${row.accountName}`}
                </Text>
                <Text style={[t.type.meta, { color: t.color.sub, marginTop: 3 }]}>
                  {row.state === 'active'
                    ? `Out since ${row.assignedDate}`
                    : `${row.assignedDate} → ${row.returnedDate}`}
                  {row.bastNumber ? ` · ${row.bastNumber}` : ''}
                </Text>
              </View>

              {row.state === 'active' ? (
                can('assignment.write') ? (
                  <View style={styles.rowActions}>
                    {!row.bastNumber ? (
                      <Button
                        label="BAST"
                        variant="secondary"
                        loading={paper.isPending && justOut?.checkoutId === row.id}
                        onPress={() => {
                          setPaperError('');
                          setJustOut({
                            checkoutId: row.id,
                            accountId: row.accountId,
                            accountName: row.accountName,
                          });
                          paper.mutate({ accountId: row.accountId, checkoutId: row.id });
                        }}
                      />
                    ) : null}
                    <Button
                      label="Return"
                      variant="secondary"
                      loading={take.isPending && returning === row.id}
                      onPress={() => {
                        setReturnError('');
                        setReturning(row.id);
                        take.mutate(row.id);
                      }}
                    />
                  </View>
                ) : (
                  <Badge label="Active" />
                )
              ) : (
                <Badge label="Returned" />
              )}
            </View>
          ))}
        </Card>
      )}

      {returnError ? (
        <Text style={[t.type.meta, styles.hint, { color: t.color.error }]}>{returnError}</Text>
      ) : null}

      <BottomSheet
        visible={justOut !== null && !paper.isPending}
        onDismiss={() => setJustOut(null)}
        title="Put it on paper?"
        subtitle={
          justOut
            ? `${justOut.accountName} has it. A Berita Acara Serah Terima Perlengkapan records the hand-over with two signatures.`
            : undefined
        }
      >
        <View style={styles.sheet}>
          <Text style={[t.type.meta, { color: t.color.sub, lineHeight: 16 }]}>
            If this went out alongside a laptop whose BAST is still a draft, add it there instead —
            open that document and use Rincian barang. A signed document can never change, which is
            why a later accessory gets a sheet of its own.
          </Text>

          {paperError ? (
            <Text style={[t.type.meta, { color: t.color.error, lineHeight: 16 }]}>
              {paperError}
            </Text>
          ) : null}

          <Button
            label="Raise a BAST Perlengkapan"
            block
            loading={paper.isPending}
            onPress={() =>
              paper.mutate({ accountId: justOut!.accountId, checkoutId: justOut!.checkoutId })
            }
          />
          <Button label="Not now" variant="secondary" block onPress={() => setJustOut(null)} />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={assignOpen}
        onDismiss={() => setAssignOpen(false)}
        title={`Assign ${a.name}`}
        subtitle={`${a.availableQty} available at ${a.locationName}`}
      >
        <View style={styles.sheet}>
          <SelectField
            label="To"
            required
            value={peopleOptions.find((p) => p.id === accountId)?.name}
            placeholder={people.isPending ? 'Loading…' : 'Choose someone'}
            onPress={() => setPeopleOpen(true)}
          />

          <Input
            label="How many"
            required
            value={qty}
            onChangeText={(value) => {
              setQty(value.replace(/[^0-9]/g, ''));
              setAssignError('');
            }}
            keyboardType="number-pad"
          />

          <DateField label="Date" value={date} onChange={(v) => setDate(v ?? todayIso())} />

          <Input
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Handed over with the laptop…"
            multiline
            numberOfLines={2}
          />

          {wanted > a.availableQty ? (
            <Text style={[t.type.meta, { color: t.color.error, lineHeight: 16 }]}>
              {`Only ${a.availableQty} left.`}
            </Text>
          ) : null}

          {assignError ? (
            <Text style={[t.type.meta, { color: t.color.error, lineHeight: 16 }]}>
              {assignError}
            </Text>
          ) : null}

          <Button
            label="Assign"
            block
            disabled={!canGive}
            loading={give.isPending}
            onPress={() => give.mutate()}
          />
          <Button label="Cancel" variant="secondary" block onPress={() => setAssignOpen(false)} />
        </View>
      </BottomSheet>

      <PickerSheet
        visible={peopleOpen}
        title="Assign to"
        options={peopleOptions}
        selectedId={accountId}
        onSelect={(o) => {
          setAccountId(o.id);
          setAssignError('');
        }}
        onDismiss={() => setPeopleOpen(false)}
        emptyMessage="Nobody in the current scope."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 4, marginBottom: 14, lineHeight: 17 },
  tiles: { flexDirection: 'row', gap: 9, marginBottom: 14 },
  tile: { flex: 1 },
  tileValue: { fontSize: 20 },
  tileLabel: { marginTop: 3 },
  action: { marginBottom: 10 },
  hint: { marginBottom: 10, lineHeight: 16 },
  historyLabel: { marginTop: 8, marginBottom: 9, marginLeft: 2 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  historyText: { flex: 1, minWidth: 0 },
  rowActions: { flexDirection: 'row', gap: 6 },
  sheet: { gap: 12 },
});
