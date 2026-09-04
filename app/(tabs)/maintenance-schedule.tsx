/**
 * Maintenance rules, and what they say is due.
 *
 * The rule is set per CATEGORY, not per asset: "every laptop, every six months"
 * is the sentence people say out loud, and writing it once covers every laptop
 * bought afterwards. Setting a date on each record by hand is the version that
 * silently stops working — miss it once and the asset drops out of the
 * schedule, and a thing that is not listed as due looks exactly like a thing
 * that is not due.
 *
 * Nothing on this screen is stored as a due date. Both lists are derived from
 * the rules every time they are read, so changing a rule immediately changes
 * what is due — which is the only behaviour that makes a rule worth having.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react-native';

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
  Screen,
  Skeleton,
} from '@/components/ui';
import {
  fetchMaintenanceDue,
  fetchMaintenanceSchedules,
  setMaintenanceSchedule,
  type MaintenanceScheduleRow,
} from '@/api/maintenance';
import { useScopeStore } from '@/store/useScopeStore';
import { usePermissions } from '@/auth';

type Tab = 'due' | 'rules';

export default function MaintenanceScheduleScreen() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const scope = useScopeStore((s) => s.scope);
  const { can } = usePermissions();

  const canEdit = can('master.write');

  const [tab, setTab] = useState<Tab>('due');
  const [editing, setEditing] = useState<MaintenanceScheduleRow | null>(null);
  const [months, setMonths] = useState('');
  const [error, setError] = useState('');

  const rules = useQuery({
    queryKey: ['maintenanceSchedules'],
    queryFn: fetchMaintenanceSchedules,
  });

  const due = useQuery({
    queryKey: ['maintenanceDue', scope],
    queryFn: () => fetchMaintenanceDue(scope, 30),
    enabled: scope.length > 0,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const trimmed = months.trim();
      if (trimmed === '') {
        await setMaintenanceSchedule(editing.category_id, null);
        return;
      }
      const n = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(n) || n < 1 || n > 120) {
        throw new Error('Choose between 1 and 120 months');
      }
      await setMaintenanceSchedule(editing.category_id, n);
    },
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['maintenanceSchedules'] });
      qc.invalidateQueries({ queryKey: ['maintenanceDue'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const withRule = (rules.data ?? []).filter((r) => r.every_months);
  const overdue = (due.data ?? []).filter((d) => d.days_late > 0);

  return (
    <Screen>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        style={styles.back}
      >
        <ChevronLeft size={15} color={t.color.royal} strokeWidth={2} />
        <Text style={[t.type.metaStrong, { color: t.color.royal }]}>Maintenance</Text>
      </Pressable>

      <Text style={[t.type.screenTitle, { color: t.color.text }]}>Service schedule</Text>
      <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
        {`${withRule.length} categor${withRule.length === 1 ? 'y has' : 'ies have'} a rule · ${
          overdue.length
        } overdue`}
      </Text>

      <ChipRow style={styles.tabs}>
        <Chip label="Due now" active={tab === 'due'} onPress={() => setTab('due')} />
        <Chip label="Rules" active={tab === 'rules'} onPress={() => setTab('rules')} />
      </ChipRow>

      {tab === 'due' ? (
        due.isPending ? (
          <View style={styles.list}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height={72} radius={t.radii.card} />
            ))}
          </View>
        ) : due.isError ? (
          <EmptyState
            variant="error"
            title="Could not work out what is due"
            description={(due.error as Error).message}
            actionLabel="Try again"
            onAction={() => due.refetch()}
          />
        ) : (due.data ?? []).length === 0 ? (
          <EmptyState
            title="Nothing due in the next 30 days"
            description={
              withRule.length === 0
                ? 'No category has a rule yet. Set one under Rules and this list fills itself in.'
                : 'Everything under a rule has been serviced recently enough.'
            }
          />
        ) : (
          <View style={styles.list}>
            {(due.data ?? []).map((row) => (
              <Pressable
                key={row.asset_id}
                onPress={() =>
                  router.push({ pathname: '/asset/[code]', params: { code: row.asset_code } })
                }
                accessibilityRole="button"
                accessibilityLabel={`${row.asset_code}, due ${row.due_on}`}
              >
                <Card padding={13}>
                  <View style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={[t.type.assetCode, { color: t.color.royal }]}>
                        {row.asset_code}
                      </Text>
                      <Text numberOfLines={1} style={[t.type.body, { color: t.color.text }]}>
                        {row.asset_name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[t.type.meta, { color: t.color.sub, marginTop: 3 }]}
                      >
                        {[
                          row.last_done ? `Last done ${row.last_done}` : 'Never serviced',
                          `Every ${row.every_months} month${row.every_months === 1 ? '' : 's'}`,
                          row.holder_name,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <View style={styles.rowRight}>
                      <Badge
                        label={
                          row.days_late > 0 ? `${row.days_late}d late` : `in ${-row.days_late}d`
                        }
                        tone={row.days_late > 0 ? 'broken' : 'maintenance'}
                      />
                      <ChevronRight size={16} color={t.color.sub} strokeWidth={1.7} />
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )
      ) : rules.isPending ? (
        <View style={styles.list}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={62} radius={t.radii.card} />
          ))}
        </View>
      ) : (
        <View style={styles.list}>
          {(rules.data ?? []).map((rule) => (
            <Pressable
              key={rule.category_id}
              disabled={!canEdit}
              onPress={() => {
                setEditing(rule);
                setMonths(rule.every_months ? String(rule.every_months) : '');
                setError('');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Set the rule for ${rule.category_name}`}
            >
              <Card padding={13}>
                <View style={styles.row}>
                  <CalendarClock
                    size={18}
                    color={rule.every_months ? t.color.royal : t.color.sub}
                    strokeWidth={1.8}
                  />
                  <View style={styles.rowText}>
                    <Text numberOfLines={1} style={[t.type.body, { color: t.color.text }]}>
                      {rule.category_name}
                    </Text>
                    <Text style={[t.type.meta, { color: t.color.sub, marginTop: 2 }]}>
                      {rule.every_months
                        ? `Every ${rule.every_months} month${rule.every_months === 1 ? '' : 's'} · ${
                            rule.asset_count
                          } asset${rule.asset_count === 1 ? '' : 's'}`
                        : `No rule · ${rule.asset_count} asset${rule.asset_count === 1 ? '' : 's'}`}
                    </Text>
                  </View>
                  {canEdit ? (
                    <ChevronRight size={16} color={t.color.sub} strokeWidth={1.7} />
                  ) : null}
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      <BottomSheet
        visible={editing !== null}
        onDismiss={() => setEditing(null)}
        title={editing ? `Service ${editing.category_name} every…` : ''}
        subtitle="Leave it empty to remove the rule. Nothing is scheduled for a category without one."
      >
        <Input
          value={months}
          onChangeText={setMonths}
          keyboardType="number-pad"
          placeholder="Months, e.g. 6"
          maxLength={3}
        />
        <Text style={[t.type.meta, { color: t.color.sub, marginTop: 8 }]}>
          Counted from the last completed service, or from the purchase date when the asset has
          never been serviced.
        </Text>
        {error ? (
          <Text style={[t.type.meta, { color: t.color.error, marginTop: 8 }]}>{error}</Text>
        ) : null}
        <View style={styles.sheetActions}>
          <Button label="Save" block loading={save.isPending} onPress={() => save.mutate()} />
          <Button label="Cancel" variant="secondary" block onPress={() => setEditing(null)} />
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 5, marginBottom: 14 },
  tabs: { marginBottom: 12 },
  list: { gap: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  rowText: { flex: 1, minWidth: 0 },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  sheetActions: { gap: 8, marginTop: 16 },
});
