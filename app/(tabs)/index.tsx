/**
 * Home (Dashboard) — README § Screens 1.
 *
 * Greeting, scope sentence, KPI grid, warranty card, quick actions, the
 * category donut, location and department bars, and recent activity.
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
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeftRight,
  Clock,
  FileSpreadsheet,
  FileText,
  KeyRound,
  PackagePlus,
  QrCode,
  UserPlus,
  Wrench,
} from 'lucide-react-native';

import { useTheme } from '@/theme';
import { Button, Card, EmptyState, Screen, SkeletonKpiGrid } from '@/components/ui';
import { fetchDashboard, type RecentEvent } from '@/api/dashboard';
import { Bars } from '@/components/charts/Bars';
import { useIsDesktop } from '@/lib/useBreakpoint';
import { Donut } from '@/components/charts/Donut';
import { formatRelative } from '@/lib/dates';
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

          {/* Three things that run out. Shown even at zero: "0 in the next 30
              days" is an answer somebody wants, and a card that disappears
              reads as broken.

              Side by side on a desktop, stacked on a phone. They answer the
              same question about three different things, so seeing them
              together is the point. */}
          <View style={isDesktop ? styles.expiryRow : styles.expiryStack}>
            <ExpiryCard
              label="WARRANTY EXPIRING"
              count={data.warrantyExpiring}
              sub={
                data.warrantyExpiring === 1
                  ? 'asset in the next 30 days'
                  : 'assets in the next 30 days'
              }
              icon={<Clock size={15} color={t.color.gold} strokeWidth={2} />}
              onPress={() => router.push('/reports')}
            />

            <ExpiryCard
              label="LICENCES EXPIRING"
              count={data.licensesExpiring}
              sub={
                data.licensesExpiring === 1
                  ? 'licence in the next 60 days'
                  : 'licences in the next 60 days'
              }
              // Already out of time is a different problem from running out of
              // it, so it gets its own line rather than being folded into one
              // number that hides it.
              urgent={data.licensesExpired > 0 ? `${data.licensesExpired} already expired` : null}
              icon={<KeyRound size={15} color={t.color.gold} strokeWidth={2} />}
              onPress={() => router.push('/licenses')}
            />

            <ExpiryCard
              label="SERVICE DUE"
              count={data.maintenanceDue}
              sub={
                data.maintenanceDue === 1
                  ? 'asset in the next 30 days'
                  : 'assets in the next 30 days'
              }
              urgent={
                data.maintenanceOverdue > 0 ? `${data.maintenanceOverdue} already overdue` : null
              }
              icon={<Wrench size={15} color={t.color.gold} strokeWidth={2} />}
              onPress={() => router.push('/maintenance')}
            />
          </View>

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

/**
 * One thing that runs out: warranties, licences, servicing.
 *
 * The three read as one family because they answer the same question, and the
 * shape came from the warranty card that was already here rather than a new
 * design invented alongside it.
 *
 * `urgent` is for what has already passed its date. Adding it to the headline
 * would make one bigger number and lose the distinction that matters — a
 * licence that lapsed last month has somebody locked out of their tools today.
 */
function ExpiryCard({
  label,
  count,
  sub,
  urgent = null,
  icon,
  onPress,
}: {
  label: string;
  count: number;
  sub: string;
  urgent?: string | null;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  const t = useTheme();

  return (
    <Card radius="cardLarge" padding={0} style={styles.expiryCard}>
      <LinearGradient
        colors={[...t.gradients.navy.colors]}
        start={t.gradients.navy.start}
        end={t.gradients.navy.end}
        style={styles.warranty}
      >
        <View style={styles.warrantyHead}>
          <View style={[styles.warrantyIcon, { backgroundColor: t.badge('gold').bg }]}>{icon}</View>
          <Text numberOfLines={1} style={[t.type.kpiLabel, { color: t.color.gold }]}>
            {label}
          </Text>
        </View>

        <Text style={[styles.warrantyNumber, { color: t.color.onNavy }]}>{count}</Text>
        <Text style={[t.type.bodySmall, styles.warrantySub, { color: t.color.onNavy }]}>{sub}</Text>

        {urgent ? (
          <Text style={[t.type.metaStrong, styles.expiryUrgent, { color: t.color.gold }]}>
            {urgent}
          </Text>
        ) : null}

        {count > 0 || urgent ? (
          <Button
            label="Review list"
            variant="gold"
            size="sm"
            onPress={onPress}
            style={styles.warrantyButton}
          />
        ) : null}
      </LinearGradient>
    </Card>
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

  // The three run-out cards. `flex: 1` with `minWidth: 0` lets them share a
  // desktop row evenly without a long label pushing one wider than the rest.
  expiryRow: { flexDirection: 'row', gap: 12, marginTop: 16, alignItems: 'stretch' },
  expiryStack: { gap: 12, marginTop: 16 },
  expiryCard: { flex: 1, minWidth: 0, overflow: 'hidden' },
  expiryUrgent: { marginTop: 8 },
  warranty: { padding: 18 },
  warrantyHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warrantyIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warrantyNumber: { fontSize: 34, fontWeight: '700', marginTop: 12, letterSpacing: -1 },
  warrantySub: { opacity: 0.82 },
  warrantyButton: { marginTop: 14, alignSelf: 'flex-start' },

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
