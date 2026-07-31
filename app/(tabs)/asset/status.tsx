/**
 * Change an asset's status — client instruction, 2026-07-30:
 * "langsung ubah saja tapi ada lognya pastinya ttg siapa yang mengganti ganti".
 *
 * Direct, as asked: pick the new status and it is applied. The reason is
 * required because that is the part the audit trail cannot supply — the log
 * already knows who and when, and "Available → Retired" on its own tells the
 * next person nothing about why the laptop left the register.
 *
 * `Assigned` is not offered. It is what assigning to a person produces, and
 * offering it here would let the register claim an asset is in someone's hands
 * with no assignment behind it.
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
import { Badge, Button, Card, EmptyState, Input, Screen, Skeleton } from '@/components/ui';
import {
  changeAssetStatus,
  fetchAssetDetail,
  fetchAssetFormOptions,
  type Option,
} from '@/api/assets';
import { queryKeys } from '@/lib/queryClient';
import { useToast } from '@/store/useUiStore';

/**
 * Statuses that end an asset's working life. Shown apart from the rest because
 * they behave differently — they clear the department, and the asset stops
 * appearing anywhere it can be handed out from.
 */
const TERMINAL = ['Lost', 'Retired'];

export default function ChangeStatusScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { code } = useLocalSearchParams<{ code: string }>();

  const detail = useQuery({
    queryKey: queryKeys.asset(code),
    queryFn: () => fetchAssetDetail(code),
    enabled: Boolean(code),
  });
  const options = useQuery({ queryKey: ['assetFormOptions'], queryFn: fetchAssetFormOptions });

  const [statusId, setStatusId] = useState<string | null>(null);
  const [conditionId, setConditionId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const a = detail.data?.asset;

  const submit = useMutation({
    mutationFn: () => changeAssetStatus(a!.id, statusId!, reason, conditionId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.asset(code) });
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast(`Status changed to ${result.status}`);
      router.replace(`/asset/${code}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  if (detail.isPending || options.isPending) {
    return (
      <Screen>
        <View style={styles.skeletons}>
          <Skeleton height={90} radius={t.radii.cardMedium} />
          <Skeleton height={220} radius={t.radii.cardMedium} />
        </View>
      </Screen>
    );
  }

  if (!a) {
    return (
      <Screen>
        <EmptyState
          variant="error"
          title="Asset not found"
          description="It may have been removed, or it is outside your location scope."
          actionLabel="All assets"
          onAction={() => router.replace('/assets')}
        />
      </Screen>
    );
  }

  const statuses = (options.data?.statuses ?? []).filter((s) => s.name !== 'Assigned');
  const inService = statuses.filter((s) => !TERMINAL.includes(s.name));
  const terminal = statuses.filter((s) => TERMINAL.includes(s.name));

  const chosen = statuses.find((s) => s.id === statusId);
  const endsLife = Boolean(chosen && TERMINAL.includes(chosen.name));
  const heldBySomeone = Boolean(a.assignedToName);

  // The database refuses this outright; saying so before the tap is the
  // difference between a hint and an error message.
  const blocked = endsLife && heldBySomeone;
  const ready = Boolean(statusId) && reason.trim().length > 0 && !blocked;

  const pick = (option: Option, selected: boolean, onPress: () => void) => (
    <Pressable
      key={option.id}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={option.name}
      style={({ pressed }) => [
        styles.option,
        {
          borderColor: selected ? t.color.royal : t.color.line,
          borderWidth: selected ? 1.5 : 1,
          borderRadius: t.radii.inputLarge,
          backgroundColor: pressed ? t.color.soft : 'transparent',
        },
      ]}
    >
      <Text style={[t.type.bodySmall, { color: t.color.text }]}>{option.name}</Text>
    </Pressable>
  );

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

        <Text style={[t.type.screenTitle, { color: t.color.text }]}>Change status</Text>
        <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
          {`${a.assetCode} · ${a.name}`}
        </Text>

        <Card padding={15} style={styles.card}>
          <View style={styles.currentRow}>
            <Text style={[t.type.fieldLabel, { color: t.color.sub }]}>Now</Text>
            <Badge label={a.statusName} />
            <Badge label={a.conditionName} />
          </View>
          {heldBySomeone ? (
            <Text style={[t.type.meta, styles.held, { color: t.color.sub }]}>
              {`Held by ${a.assignedToName}`}
            </Text>
          ) : null}
        </Card>

        <Card padding={15} title="New status" style={styles.card}>
          <View style={styles.options}>
            {inService.map((s) =>
              pick(s, s.id === statusId, () => {
                setStatusId(s.id);
                setError('');
              }),
            )}
          </View>

          <Text style={[t.type.sectionLabel, styles.groupLabel, { color: t.color.sub }]}>
            Ends its working life
          </Text>
          <View style={styles.options}>
            {terminal.map((s) =>
              pick(s, s.id === statusId, () => {
                setStatusId(s.id);
                setError('');
              }),
            )}
          </View>

          {blocked ? (
            <View style={styles.errorRow}>
              <AlertCircle size={14} color={t.color.error} strokeWidth={2} />
              <Text style={[t.type.meta, { color: t.color.error }]}>
                {`Return this asset first — ${a.assignedToName} still has it.`}
              </Text>
            </View>
          ) : endsLife ? (
            <Text style={[t.type.meta, styles.groupHint, { color: t.color.sub }]}>
              It will stop appearing anywhere it can be handed out from, and it leaves its
              department. The record and its history stay.
            </Text>
          ) : null}
        </Card>

        <Card padding={15} title="Condition" style={styles.card}>
          <View style={styles.options}>
            {(options.data?.conditions ?? []).map((c) =>
              pick(c, c.id === (conditionId ?? a.conditionId), () => setConditionId(c.id)),
            )}
          </View>
        </Card>

        <Card padding={15} style={styles.card}>
          <Input
            label="Why"
            required
            value={reason}
            onChangeText={(value) => {
              setReason(value);
              setError('');
            }}
            placeholder="e.g. Screen beyond economical repair, disposed 31 Jul 2026"
            multiline
            numberOfLines={3}
          />
          <Text style={[t.type.meta, styles.reasonHint, { color: t.color.sub }]}>
            Recorded against your name and kept for good — it is what the next person reads instead
            of guessing.
          </Text>
        </Card>

        {error ? (
          <View style={styles.errorRow}>
            <AlertCircle size={14} color={t.color.error} strokeWidth={2} />
            <Text style={[t.type.meta, { color: t.color.error }]}>{error}</Text>
          </View>
        ) : null}

        <Button
          label="Change status"
          block
          disabled={!ready}
          loading={submit.isPending}
          onPress={() => submit.mutate()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 12 },
  skeletons: { gap: 12 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 3, marginBottom: 14, lineHeight: 17 },
  card: { marginBottom: 12 },
  currentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  held: { marginTop: 8 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { paddingHorizontal: 14, paddingVertical: 10, minHeight: 40, justifyContent: 'center' },
  groupLabel: { marginTop: 16, marginBottom: 8 },
  groupHint: { marginTop: 10, lineHeight: 16 },
  reasonHint: { marginTop: 8, lineHeight: 16 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginBottom: 10 },
});
