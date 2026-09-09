/**
 * Home (Dashboard) — README § Screens 1.
 *
 * Greeting, scope sentence, KPI grid, a "Needs attention" block, quick
 * actions, the category donut, location and department bars, and recent
 * activity.
 *
 * The attention block replaced three gradient cards that filled a row to say
 * "0", "0", "0". Its rows are in a FIXED order rather than sorted by count,
 * because a list read every morning is read by position, and every row says
 * why its number reads as it does — a bare zero cannot tell "nothing is due"
 * apart from "nothing is being watched".
 *
 * Everything comes from one `dashboard_summary()` call. Six separate queries
 * would each settle at a different moment and the tiles would disagree with the
 * chart underneath them for a frame or two — the kind of thing nobody reports
 * and everybody half-notices.
 *
 * All three states working rule #4 asks for are here: skeletons while it loads,
 * an error state with a retry, and an empty state for a register nobody has put
 * anything in yet.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  PackagePlus,
  QrCode,
  UserPlus,
} from 'lucide-react-native';

import { useTheme } from '@/theme';
import { Card, EmptyState, Screen, SkeletonKpiGrid } from '@/components/ui';
import { fetchDashboard, type RecentEvent } from '@/api/dashboard';
import { Bars } from '@/components/charts/Bars';
import { useIsDesktop } from '@/lib/useBreakpoint';
import { Donut } from '@/components/charts/Donut';
import { formatDate, formatRelative } from '@/lib/dates';
import { greetingFor, useSessionStore } from '@/store/useSessionStore';
import { useScopeSentence, useScopeStore } from '@/store/useScopeStore';
import { usePermissions } from '@/auth';

const QUICK_ACTIONS = [
  { label: 'Scan label', route: '/scan' },
  { label: 'Add asset', route: '/add-asset' },
  { label: 'Assign', route: '/assign' },
  { label: 'Transfer', route: '/transfer' },
  { label: 'E-BAST', route: '/bast' },
  { label: 'Import', route: '/import' },
] as const;

export default function HomeScreen() {
  const isDesktop = useIsDesktop();
  const t = useTheme();
  const router = useRouter();
  const account = useSessionStore((s) => s.account);
  const scope = useScopeStore((s) => s.scope);
  const { can, isReadOnly } = usePermissions();

  const summary = useQuery({
    queryKey: ['dashboard', scope],
    queryFn: () => fetchDashboard(scope),
    enabled: scope.length > 0,
  });

  const data = summary.data;
  const scopeSentence = useScopeSentence(data?.total);

  /**
   * The rows of the "Needs attention" block.
   *
   * `count: null` means the question is not being asked — not that the answer
   * is zero. It renders as a dash with a line saying what is missing, because
   * a 0 there would read as reassurance that nothing needs servicing when in
   * fact nothing is being watched.
   *
   * `detail` always says something. On a zero it carries the horizon: nothing
   * in the next 60 days, and here is the first one after that.
   */
  const attention: AttentionItem[] = data
    ? [
        {
          key: 'bast',
          count: data.bastDraft + data.bastAwaitingSignature,
          label: 'e-BAST not yet signed',
          // Both are unfinished, but a draft waits on you and a sent one waits
          // on somebody else. The number is the backlog; this says whose move.
          detail:
            data.bastDraft + data.bastAwaitingSignature === 0
              ? 'Every handover is signed'
              : [
                  data.bastDraft > 0 ? `${data.bastDraft} draft` : null,
                  data.bastAwaitingSignature > 0
                    ? `${data.bastAwaitingSignature} awaiting a signature`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
          route: '/bast',
        },
        {
          key: 'unassigned',
          count: data.unassignedAssets,
          label: 'Assets nobody is holding',
          detail:
            data.unassignedAssets === 0
              ? 'Everything is with somebody'
              : 'Ready to hand out, or forgotten',
          route: '/assets',
        },
        {
          key: 'labels',
          count: data.labelsUnused,
          label: 'Labels printed, not yet on anything',
          detail:
            data.labelsUnused === 0
              ? 'No blank stock waiting'
              : 'Stick one on a device to register it',
          route: '/labels',
        },
        {
          key: 'warranty',
          count: data.warrantyExpiring,
          label: 'Warranties ending in 30 days',
          detail: horizon(data.nextWarranty, 'Nothing after that either'),
          route: '/reports',
        },
        {
          key: 'licences',
          count: data.licensesExpiring,
          label: 'Licences ending in 60 days',
          detail:
            data.licensesExpired > 0
              ? `${data.licensesExpired} already expired`
              : horizon(data.nextLicense, 'None with an end date'),
          urgent: data.licensesExpired > 0,
          route: '/licenses',
        },
        data.maintenanceRules === 0
          ? {
              key: 'service',
              // Not zero — unasked. The dash is the honest answer.
              count: null,
              label: 'Service due',
              detail: 'No service rules set yet — tap to add one',
              route: '/maintenance-schedule',
            }
          : {
              key: 'service',
              count: data.maintenanceDue,
              label: 'Assets due for service in 30 days',
              detail:
                data.maintenanceOverdue > 0
                  ? `${data.maintenanceOverdue} already overdue`
                  : horizon(data.nextService, 'Nothing coming up'),
              urgent: data.maintenanceOverdue > 0,
              route: '/maintenance',
            },
      ]
    : [];

  const icon = { size: 18, color: t.color.royal, strokeWidth: 1.8 } as const;
  const actionIcons = [
    <QrCode key="scan" {...icon} />,
    <PackagePlus key="add" {...icon} />,
    <UserPlus key="assign" {...icon} />,
    <ArrowLeftRight key="transfer" {...icon} />,
    <FileText key="bast" {...icon} />,
    <FileSpreadsheet key="import" {...icon} />,
  ];

  return (
    <Screen refreshing={summary.isFetching} onRefresh={() => void summary.refetch()}>
      <Text style={[t.type.screenTitle, { color: t.color.text }]}>
        {greetingFor(account?.fullName ?? 'there')}
      </Text>
      <Text style={[t.type.meta, styles.scopeLine, { color: t.color.sub }]}>{scopeSentence}</Text>

      {scope.length === 0 ? (
        // README § Interactions: zero locations selected → empty state.
        <EmptyState
          title="No locations in scope"
          description="Select at least one location in the scope chip to see dashboard figures."
        />
      ) : summary.isPending ? (
        <SkeletonKpiGrid />
      ) : summary.isError ? (
        <EmptyState
          variant="error"
          title="Could not load the dashboard"
          description={(summary.error as Error).message}
          actionLabel="Try again"
          onAction={() => summary.refetch()}
        />
      ) : !data ? null : data.total === 0 ? (
        <EmptyState
          title="Nothing in the register yet"
          description="Print a batch of labels and scan them onto your devices, or import a CSV of what you already have."
          actionLabel={can('asset.create') ? 'Print labels' : undefined}
          onAction={can('asset.create') ? () => router.push('/labels') : undefined}
        />
      ) : (
        <>
          {/* Every status comes from master data, so adding one there puts a
              tile here without a code change. */}
          <View style={styles.kpiGrid}>
            <KpiTile
              label="Total"
              value={data.total}
              delta={
                data.addedThisMonth > 0 ? `+${data.addedThisMonth} this month` : 'none this month'
              }
              dot={t.color.royal}
              wide={isDesktop}
              onPress={() => router.push('/assets')}
            />
            {data.byStatus.slice(0, 5).map((s) => (
              <KpiTile
                key={s.name}
                label={s.name}
                value={s.count}
                delta={
                  data.total > 0 ? `${Math.round((s.count / data.total) * 100)}% of fleet` : ''
                }
                dot={s.color}
                wide={isDesktop}
              />
            ))}
          </View>

          {/* One block instead of three cards that each filled a third of a row
              to say "0".

              Order is FIXED, not sorted by count. A dashboard read every
              morning is read by position — a list that rearranges itself makes
              you check each line instead of glancing at the one you want. Work
              sitting still comes first, then the things running out.

              Every row says why its number is what it is. A bare zero cannot
              tell "nothing is due" apart from "nothing is being watched", and
              Service Due was the second kind while looking like the first. */}
          <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>
            Needs attention
          </Text>
          <Card padding={0} radius="listContainer">
            {attention.map((row, i) => (
              <AttentionRow key={row.key} row={row} last={i === attention.length - 1} />
            ))}
          </Card>

          {!isReadOnly ? (
            <>
              <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>
                Quick actions
              </Text>
              <View style={styles.actions}>
                {QUICK_ACTIONS.map((action, i) => (
                  <Pressable
                    key={action.label}
                    onPress={() => router.push(action.route)}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    style={({ pressed }) => [
                      styles.action,
                      {
                        borderRadius: t.radii.card,
                        borderColor: t.color.line,
                        backgroundColor: pressed ? t.color.soft : t.color.card,
                      },
                    ]}
                  >
                    {actionIcons[i]}
                    <Text numberOfLines={1} style={[t.type.meta, { color: t.color.text }]}>
                      {action.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {/* Three views of the same fleet. Side by side on a wide screen
              because comparing them is the point; stacked on a phone because
              there is no other option. */}
          <View style={isDesktop ? styles.chartRow : undefined}>
            <View style={isDesktop ? styles.chartCol : undefined}>
              <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>
                Assets by category
              </Text>
              <Card padding={15}>
                <Donut data={data.byCategory} />
              </Card>
            </View>

            {data.byLocation.length > 0 ? (
              <View style={isDesktop ? styles.chartCol : undefined}>
                <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>
                  By location
                </Text>
                <Card padding={15}>
                  <Bars rows={data.byLocation} total={data.total} />
                </Card>
              </View>
            ) : null}

            {data.byDepartment.length > 0 ? (
              <View style={isDesktop ? styles.chartCol : undefined}>
                <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>
                  By department
                </Text>
                <Card padding={15}>
                  <Bars rows={data.byDepartment} total={data.total} />
                </Card>
              </View>
            ) : null}
          </View>

          {data.recent.length > 0 ? (
            <>
              <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>
                Recent activity
              </Text>
              <Card padding={0} radius="listContainer">
                {data.recent.slice(0, 8).map((event, i, shown) => (
                  <RecentRow
                    key={`${event.kind}-${event.at}-${i}`}
                    event={event}
                    last={i === shown.length - 1}
                    onPress={() => router.push(`/asset/${event.assetCode}`)}
                  />
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

interface AttentionItem {
  key: string;
  /** null means "not being watched", which is not the same as zero. */
  count: number | null;
  label: string;
  detail: string;
  /** Something has already passed its date, rather than approaching one. */
  urgent?: boolean;
  route: Href;
}

/**
 * "Nothing in the window, and the next one is X on 12 Dec."
 *
 * A zero on its own tells you today is fine and nothing about tomorrow. The
 * server deliberately returns the first item BEYOND the window, since anything
 * inside it is already in the count.
 */
function horizon(next: { label: string; date: string } | null, whenNone: string): string {
  if (!next) return whenNone;
  return `Next: ${next.label} · ${formatDate(next.date)}`;
}

/**
 * One line of the block: a number, what it counts, and why it reads that way.
 *
 * The number carries the emphasis rather than an icon or a colour block —
 * scanning this list is reading six numbers, and anything competing with them
 * slows that down. Colour is spent only on the two states that mean somebody
 * is already late.
 */
function AttentionRow({ row, last }: { row: AttentionItem; last: boolean }) {
  const t = useTheme();
  const router = useRouter();

  const idle = row.count === 0 || row.count === null;
  const tone = row.urgent ? t.color.error : idle ? t.color.sub : t.color.text;

  return (
    <Pressable
      onPress={() => router.push(row.route)}
      accessibilityRole="button"
      accessibilityLabel={`${row.label}, ${row.count ?? 'not set up'}. ${row.detail}`}
      style={({ pressed }) => [
        styles.attnRow,
        {
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: t.color.line,
          backgroundColor: pressed ? t.color.soft : 'transparent',
        },
      ]}
    >
      <Text style={[styles.attnCount, { color: tone }]}>{row.count ?? '—'}</Text>

      <View style={styles.attnText}>
        <Text numberOfLines={1} style={[t.type.body, { color: idle ? t.color.sub : t.color.text }]}>
          {row.label}
        </Text>
        <Text numberOfLines={1} style={[t.type.meta, { color: t.color.sub, marginTop: 2 }]}>
          {row.detail}
        </Text>
      </View>

      <ChevronRight size={17} color={t.color.sub} strokeWidth={1.7} />
    </Pressable>
  );
}

function KpiTile({
  label,
  value,
  delta,
  dot,
  wide = false,
  onPress,
}: {
  label: string;
  value: number;
  delta: string;
  dot: string;
  /** Six across on a desktop rather than three, so the fleet reads in one line. */
  wide?: boolean;
  onPress?: () => void;
}) {
  const t = useTheme();

  // A number on a dashboard is a question. Making it open the list that answers
  // it is the difference between a report and a place to work from.
  const body = (
    <Card radius="kpiTile" padding={12} style={styles.kpiInner}>
      <View style={[styles.kpiDot, { backgroundColor: dot }]} />
      <Text numberOfLines={1} style={[t.type.kpiLabel, { color: t.color.sub }]}>
        {label.toUpperCase()}
      </Text>
      <Text style={[t.type.kpiNumber, styles.kpiValue, { color: t.color.text }]}>{value}</Text>
      {delta ? (
        <Text numberOfLines={1} style={[t.type.meta, { color: t.color.sub }]}>
          {delta}
        </Text>
      ) : null}
    </Card>
  );

  if (!onPress) return <View style={wide ? styles.kpiTileWide : styles.kpiTile}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      style={({ pressed }) => [
        wide ? styles.kpiTileWide : styles.kpiTile,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {body}
    </Pressable>
  );
}

function RecentRow({
  event,
  last,
  onPress,
}: {
  event: RecentEvent;
  last: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  // The same colours the asset Timeline uses, so the two rails read as one
  // vocabulary rather than two.
  const tone = t.timeline[event.kind] ?? t.color.neutral;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={event.title}
      style={({ pressed }) => [
        styles.recentRow,
        {
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: t.color.line,
          backgroundColor: pressed ? t.color.soft : 'transparent',
        },
      ]}
    >
      <View style={[styles.recentDot, { backgroundColor: tone }]} />
      <View style={styles.recentText}>
        <Text numberOfLines={1} style={[t.type.bodySmall, { color: t.color.text }]}>
          {event.title}
        </Text>
        {event.detail ? (
          <Text
            numberOfLines={1}
            style={[t.type.meta, styles.recentDetail, { color: t.color.sub }]}
          >
            {event.detail}
          </Text>
        ) : null}
      </View>
      <Text style={[t.type.meta, { color: t.color.sub }]}>{formatRelative(event.at)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scopeLine: { marginTop: 5, marginBottom: 18 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  kpiTile: { width: '31.5%' },
  // Six across, so the whole fleet's status reads in one line on a desktop
  // instead of wrapping to two rows with an empty half beside them.
  kpiTileWide: { width: '15.6%', minWidth: 150 },
  chartRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  chartCol: { flex: 1, minWidth: 0 },
  kpiInner: { width: '100%' },
  kpiDot: { width: 7, height: 7, borderRadius: 7, marginBottom: 7 },
  kpiValue: { marginTop: 3, marginBottom: 2 },

  // A fixed-width number column so six counts line up as a column somebody can
  // run an eye down, whether they are 0 or 60.
  attnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, minHeight: 58 },
  attnCount: { fontSize: 21, fontWeight: '700', minWidth: 38, textAlign: 'right' },
  attnText: { flex: 1, minWidth: 0 },

  sectionLabel: { marginTop: 22, marginBottom: 10, marginLeft: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  action: { width: '31.5%', alignItems: 'center', gap: 7, paddingVertical: 14, borderWidth: 1 },

  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  recentDot: { width: 8, height: 8, borderRadius: 8 },
  recentText: { flex: 1, minWidth: 0 },
  recentDetail: { marginTop: 2 },
});
