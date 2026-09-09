/**
 * One licence, and the seats inside it.
 *
 * The seat list is the screen. Everything above it — the three tiles, the
 * expiry badge — exists to answer "can I give this to somebody?" before the
 * reader has to count rows.
 *
 * Two deliberate absences:
 *
 *   A seat has no status field to edit. `Used` and `Standby` are printed from
 *   whether anybody is sitting there, so the badge and the holder line can
 *   never disagree.
 *
 *   The stored password is not on this screen until somebody asks for it.
 *   `has_secret` says a password exists; pressing Reveal fetches it through an
 *   RPC that writes an audit row first. A Super Admin sees the button; nobody
 *   else knows it is there.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Eye, KeyRound, Pencil, Plus, RotateCcw, UserPlus } from 'lucide-react-native';

import { useTheme } from '@/theme';
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  EmptyState,
  Input,
  PickerSheet,
  Screen,
  Skeleton,
} from '@/components/ui';
import {
  assignSeat,
  expiryLabel,
  expiryTone,
  fetchLicense,
  returnSeat,
  revealSeatSecret,
  setLicenseSeats,
  type SeatRow,
} from '@/api/licenses';
import { fetchAccounts } from '@/api/accounts';
import { usePermissions } from '@/auth';

export default function LicenseDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { role, can } = usePermissions();

  const canWrite = can('master.write');
  const isSuperAdmin = role === 'super_admin';

  const [seatForAssign, setSeatForAssign] = useState<SeatRow | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  /**
   * The account this seat runs under. Follows the chosen person's work email
   * until somebody types over it — which is what makes the ordinary case one
   * tap and still leaves room for a shared or vendor-issued account.
   */
  const [seatAccount, setSeatAccount] = useState('');
  const [accountEdited, setAccountEdited] = useState(false);
  const [assignError, setAssignError] = useState('');

  const [seatsOpen, setSeatsOpen] = useState(false);
  const [seatCount, setSeatCount] = useState('');
  const [seatsError, setSeatsError] = useState('');

  /** seatId → the password, once it has been fetched and audited. */
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const license = useQuery({
    queryKey: ['license', id],
    queryFn: () => fetchLicense(id),
    enabled: !!id,
  });

  const people = useQuery({
    queryKey: ['accounts', 'for-seat'],
    queryFn: () => fetchAccounts(),
    enabled: peopleOpen,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['license', id] });
    qc.invalidateQueries({ queryKey: ['licenses'] });
  };

  const give = useMutation({
    mutationFn: async () => {
      if (!seatForAssign || !accountId) throw new Error('Pick somebody first');
      await assignSeat(seatForAssign.id, accountId, null, seatAccount.trim());
    },
    onSuccess: () => {
      setSeatForAssign(null);
      setAccountId(null);
      setSeatAccount('');
      setAccountEdited(false);
      setAssignError('');
      invalidate();
    },
    onError: (e: Error) => setAssignError(e.message),
  });

  const take = useMutation({
    mutationFn: (seatId: string) => returnSeat(seatId),
    onSuccess: invalidate,
  });

  const resize = useMutation({
    mutationFn: async () => {
      const n = Number.parseInt(seatCount, 10);
      if (!Number.isFinite(n) || n < 0) throw new Error('Enter how many seats this licence has');
      await setLicenseSeats(id, n);
    },
    onSuccess: () => {
      setSeatsOpen(false);
      setSeatsError('');
      invalidate();
    },
    onError: (e: Error) => setSeatsError(e.message),
  });

  const reveal = useMutation({
    mutationFn: (seatId: string) => revealSeatSecret(seatId),
    onSuccess: (secret, seatId) => {
      setRevealed((prev) => ({ ...prev, [seatId]: secret ?? '(empty)' }));
    },
  });

  const back = (
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
  );

  if (license.isPending) {
    return (
      <Screen>
        {back}
        <Skeleton height={120} radius={t.radii.card} />
        <View style={{ height: 12 }} />
        <Skeleton height={220} radius={t.radii.card} />
      </Screen>
    );
  }

  if (license.isError || !license.data) {
    return (
      <Screen>
        {back}
        <EmptyState
          variant="error"
          title="Could not load this licence"
          description={(license.error as Error)?.message ?? 'It may have been deleted.'}
          actionLabel="Try again"
          onAction={() => license.refetch()}
        />
      </Screen>
    );
  }

  const l = license.data;
  const used = l.seats.filter((s) => s.account_id).length;
  const free = l.seats.length - used;

  return (
    <Screen>
      {back}

      <Card padding={18}>
        <View style={styles.heroTop}>
          <View
            style={[
              styles.iconChip,
              {
                width: t.sizes.categoryIconChip,
                height: t.sizes.categoryIconChip,
                borderRadius: t.radii.iconChip,
                backgroundColor: t.color.soft,
              },
            ]}
          >
            <KeyRound size={19} color={t.color.royal} strokeWidth={1.8} />
          </View>
          <View style={styles.heroText}>
            <Text style={[t.type.screenTitle, { color: t.color.text }]}>{l.software}</Text>
            <Text style={[t.type.metaStrong, { color: t.color.sub, marginTop: 3 }]}>
              {[l.category_name, l.vendor_name].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        <View style={styles.badgeRow}>
          <Badge
            label={expiryLabel(l.expiry_state, l.expiry_date)}
            tone={expiryTone(l.expiry_state)}
          />
        </View>

        <View style={styles.tiles}>
          <Tile label="Seats" value={String(l.seats.length)} />
          <Tile label="In use" value={String(used)} />
          <Tile label="Free" value={String(free)} accent={free > 0} />
        </View>

        <View style={styles.facts}>
          <Fact label="Licence number" value={l.license_number ?? 'Not recorded'} />
          <Fact label="Purchased" value={l.purchase_year ? String(l.purchase_year) : '—'} />
          {l.notes ? <Fact label="Notes" value={l.notes} /> : null}
        </View>

        {canWrite ? (
          <View style={styles.actions}>
            <Button
              label="Edit"
              variant="secondary"
              icon={<Pencil size={15} color={t.color.text} strokeWidth={1.9} />}
              onPress={() => router.push(`/license-edit?id=${l.id}`)}
              style={styles.action}
            />
            <Button
              label="Seats"
              variant="secondary"
              icon={<Plus size={15} color={t.color.text} strokeWidth={1.9} />}
              onPress={() => {
                setSeatCount(String(l.seats.length));
                setSeatsError('');
                setSeatsOpen(true);
              }}
              style={styles.action}
            />
          </View>
        ) : null}
      </Card>

      <Text style={[t.type.cardHeading, styles.sectionTitle, { color: t.color.text }]}>Seats</Text>

      {l.seats.length === 0 ? (
        <EmptyState
          title="No seats yet"
          description={
            canWrite
              ? 'Use Seats above to say how many this licence has.'
              : 'Nobody has recorded how many seats this licence has.'
          }
        />
      ) : (
        <View style={styles.list}>
          {l.seats.map((seat) => (
            <Card key={seat.id} padding={13}>
              <View style={styles.seatTop}>
                <View style={styles.seatText}>
                  <Text numberOfLines={1} style={[t.type.body, { color: t.color.text }]}>
                    {seat.holder_name ?? 'Nobody yet'}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[t.type.metaStrong, { color: t.color.sub, marginTop: 3 }]}
                  >
                    {[seat.seat_account, seat.department].filter(Boolean).join(' · ') || '—'}
                  </Text>
                </View>
                <Badge
                  label={seat.status}
                  tone={seat.status === 'Used' ? 'assigned' : 'available'}
                />
              </View>

              {revealed[seat.id] ? (
                <View
                  style={[
                    styles.secret,
                    { backgroundColor: t.color.soft, borderRadius: t.radii.chip },
                  ]}
                >
                  <Text style={[t.type.metaStrong, { color: t.color.sub }]}>Password</Text>
                  <Text selectable style={[t.type.body, { color: t.color.text, marginTop: 2 }]}>
                    {revealed[seat.id]}
                  </Text>
                </View>
              ) : null}

              {canWrite || (isSuperAdmin && seat.has_secret) ? (
                <View style={styles.seatActions}>
                  {canWrite && !seat.account_id ? (
                    <Button
                      label="Assign to"
                      variant="secondary"
                      size="sm"
                      icon={<UserPlus size={14} color={t.color.text} strokeWidth={1.9} />}
                      onPress={() => {
                        setSeatForAssign(seat);
                        setAccountId(null);
                        setSeatAccount(seat.seat_account ?? '');
                        // Starts false even when the seat already carries an
                        // account. Treating an existing value as "deliberate"
                        // is what stopped the chosen person's email from
                        // filling in — a leftover address blocked the very
                        // thing that would have replaced it. Only typing in
                        // the field marks it as yours.
                        setAccountEdited(false);
                        setAssignError('');
                      }}
                    />
                  ) : null}
                  {canWrite && seat.account_id ? (
                    <Button
                      label="Return"
                      variant="secondary"
                      size="sm"
                      icon={<RotateCcw size={14} color={t.color.text} strokeWidth={1.9} />}
                      loading={take.isPending && take.variables === seat.id}
                      onPress={() => take.mutate(seat.id)}
                    />
                  ) : null}
                  {isSuperAdmin && seat.has_secret && !revealed[seat.id] ? (
                    <Button
                      label="Reveal password"
                      variant="secondary"
                      size="sm"
                      icon={<Eye size={14} color={t.color.text} strokeWidth={1.9} />}
                      loading={reveal.isPending && reveal.variables === seat.id}
                      onPress={() => reveal.mutate(seat.id)}
                    />
                  ) : null}
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      )}

      {/* Assign a seat -------------------------------------------------- */}
      <BottomSheet
        visible={seatForAssign !== null}
        onDismiss={() => setSeatForAssign(null)}
        title="Assign this seat"
      >
        <Pressable
          onPress={() => setPeopleOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Choose a person"
          style={({ pressed }) => [
            styles.field,
            {
              borderRadius: t.radii.inputLarge,
              borderColor: t.color.line,
              backgroundColor: pressed ? t.color.soft : t.color.card,
            },
          ]}
        >
          <Text style={[t.type.body, { color: accountId ? t.color.text : t.color.sub }]}>
            {(people.data ?? []).find((p) => p.id === accountId)?.full_name ?? 'Choose a person'}
          </Text>
        </Pressable>

        <Text style={[t.type.meta, { color: t.color.sub, marginTop: 12, marginBottom: 6 }]}>
          Account this seat runs under
        </Text>
        <Input
          value={seatAccount}
          onChangeText={(v) => {
            setSeatAccount(v);
            setAccountEdited(true);
          }}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="name@company.co.id"
        />
        <Text style={[t.type.meta, { color: t.color.sub, marginTop: 6 }]}>
          Filled in from their work email. Change it for a shared or vendor account, or leave it
          empty for a licence identified by its number instead.
        </Text>

        {assignError ? (
          <Text style={[t.type.meta, { color: t.color.error, marginTop: 8 }]}>{assignError}</Text>
        ) : null}

        <View style={styles.sheetActions}>
          <Button
            label="Assign"
            block
            disabled={!accountId}
            loading={give.isPending}
            onPress={() => give.mutate()}
          />
          <Button label="Cancel" variant="secondary" block onPress={() => setSeatForAssign(null)} />
        </View>
      </BottomSheet>

      {/* How many seats ------------------------------------------------- */}
      <BottomSheet
        visible={seatsOpen}
        onDismiss={() => setSeatsOpen(false)}
        title="How many seats?"
      >
        <Text style={[t.type.meta, { color: t.color.sub, marginBottom: 10 }]}>
          Adding creates empty seats. Reducing only ever removes empty ones — a seat somebody is
          using is never taken away by this.
        </Text>
        <Input
          value={seatCount}
          onChangeText={setSeatCount}
          keyboardType="number-pad"
          placeholder="e.g. 28"
        />
        {seatsError ? (
          <Text style={[t.type.meta, { color: t.color.error, marginTop: 8 }]}>{seatsError}</Text>
        ) : null}
        <View style={styles.sheetActions}>
          <Button label="Save" block loading={resize.isPending} onPress={() => resize.mutate()} />
          <Button label="Cancel" variant="secondary" block onPress={() => setSeatsOpen(false)} />
        </View>
      </BottomSheet>

      <PickerSheet
        visible={peopleOpen}
        title="Assign to"
        options={(people.data ?? []).map((p) => ({
          id: p.id,
          name: p.full_name,
          detail: [p.nik, p.department_name].filter(Boolean).join(' · ') || null,
        }))}
        selectedId={accountId}
        onSelect={(o) => {
          setAccountId(o.id);
          if (!accountEdited) {
            setSeatAccount((people.data ?? []).find((p) => p.id === o.id)?.email ?? '');
          }
          setAssignError('');
        }}
        onDismiss={() => setPeopleOpen(false)}
        emptyMessage="No accounts yet."
      />
    </Screen>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: t.color.soft, borderRadius: t.radii.kpiTile }]}>
      <Text style={[t.type.assetCode, { color: accent ? t.color.royal : t.color.text }]}>
        {value}
      </Text>
      <Text style={[t.type.badge, { color: t.color.sub, marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={styles.fact}>
      <Text style={[t.type.metaStrong, { color: t.color.sub }]}>{label}</Text>
      <Text style={[t.type.body, { color: t.color.text, marginTop: 2 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  iconChip: { alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1, minWidth: 0 },
  badgeRow: { flexDirection: 'row', marginTop: 12 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 14 },
  tile: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  facts: { marginTop: 16, gap: 12 },
  fact: {},
  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  action: { flex: 1 },
  sectionTitle: { marginTop: 22, marginBottom: 10 },
  list: { gap: 9 },
  seatTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  seatText: { flex: 1, minWidth: 0 },
  seatActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 },
  secret: { marginTop: 11, padding: 11 },
  field: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1 },
  sheetActions: { gap: 8, marginTop: 16 },
});
