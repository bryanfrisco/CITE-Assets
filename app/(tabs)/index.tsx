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
import Svg, { Circle } from 'react-native-svg';
import {
  ArrowLeftRight,
  Clock,
  FileSpreadsheet,
  FileText,
  PackagePlus,
  QrCode,
  UserPlus,
} from 'lucide-react-native';

import { useTheme } from '@/theme';
import { Button, Card, EmptyState, Screen, SkeletonKpiGrid } from '@/components/ui';
import { donutSegments, fetchDashboard, type NamedCount, type RecentEvent } from '@/api/dashboard';
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
              />
            ))}
          </View>

          {/* Shown even at zero: "0 in the next 30 days" is an answer somebody
              wants, and a card that disappears reads as broken. */}
          <Card radius="cardLarge" padding={0} style={styles.warrantyCard}>
            <LinearGradient
              colors={[...t.gradients.navy.colors]}
              start={t.gradients.navy.start}
              end={t.gradients.navy.end}
              style={styles.warranty}
            >
              <View style={styles.warrantyHead}>
                <View style={[styles.warrantyIcon, { backgroundColor: t.badge('gold').bg }]}>
                  <Clock size={15} color={t.color.gold} strokeWidth={2} />
                </View>
                <Text style={[t.type.kpiLabel, { color: t.color.gold }]}>WARRANTY EXPIRING</Text>
              </View>

              <Text style={[styles.warrantyNumber, { color: t.color.onNavy }]}>
                {data.warrantyExpiring}
              </Text>
              <Text style={[t.type.bodySmall, styles.warrantySub, { color: t.color.onNavy }]}>
                {data.warrantyExpiring === 1
                  ? 'asset in the next 30 days'
                  : 'assets in the next 30 days'}
              </Text>

              {data.warrantyExpiring > 0 ? (
                <Button
                  label="Review list"
                  variant="gold"
                  size="sm"
                  onPress={() => router.push('/reports')}
                  style={styles.warrantyButton}
                />
              ) : null}
            </LinearGradient>
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

          <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>
            Assets by category
          </Text>
          <Card padding={15}>
            <CategoryDonut categories={data.byCategory} />
          </Card>

          {data.byLocation.length > 0 ? (
            <>
              <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>
                By location
              </Text>
              <Card padding={15}>
                <Bars rows={data.byLocation} total={data.total} />
              </Card>
            </>
          ) : null}

          {data.byDepartment.length > 0 ? (
            <>
              <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>
                By department
              </Text>
              <Card padding={15}>
                <Bars rows={data.byDepartment} total={data.total} />
              </Card>
            </>
          ) : null}

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

function KpiTile({
  label,
  value,
  delta,
  dot,
}: {
  label: string;
  value: number;
  delta: string;
  dot: string;
}) {
  const t = useTheme();
  return (
    <Card radius="kpiTile" padding={12} style={styles.kpiTile}>
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
}

/**
 * The donut, drawn with stroke-dasharray on concentric circles.
 *
 * Rotated −90° so the first segment starts at twelve o'clock. A chart that
 * begins at three o'clock reads as though something is missing from the top.
 */
function CategoryDonut({ categories }: { categories: NamedCount[] }) {
  const t = useTheme();
  const { segments, total } = donutSegments(categories);

  const radius = t.sizes.donutRadius;
  const stroke = t.sizes.donutStroke;
  const size = (radius + stroke) * 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <View style={styles.donutRow}>
      <View>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={t.color.soft}
            strokeWidth={stroke}
            fill="none"
          />
          {total > 0
            ? segments.map((s) => {
                const length = (s.count / total) * circumference;
                const element = (
                  <Circle
                    key={s.name}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={s.color}
                    strokeWidth={stroke}
                    fill="none"
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={-offset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  />
                );
                offset += length;
                return element;
              })
            : null}
        </Svg>

        <View style={[styles.donutCentre, { width: size, height: size }]} pointerEvents="none">
          <Text style={[t.type.kpiNumber, { color: t.color.text }]}>{total}</Text>
          <Text style={[t.type.kpiLabel, { color: t.color.sub }]}>TOTAL</Text>
        </View>
      </View>

      <View style={styles.legend}>
        {segments.map((s) => (
          <View key={s.name} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text
              numberOfLines={1}
              style={[t.type.meta, styles.legendName, { color: t.color.sub }]}
            >
              {s.name}
            </Text>
            <Text style={[t.type.metaStrong, { color: t.color.text }]}>{s.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Bars({ rows, total }: { rows: NamedCount[]; total: number }) {
  const t = useTheme();
  // Scaled against the largest row rather than the total: with one location
  // holding 95% every other bar would be a sliver and the comparison useless.
  const largest = Math.max(...rows.map((r) => r.count), 1);

  return (
    <View style={styles.bars}>
      {rows.map((row) => (
        <View key={row.name}>
          <View style={styles.barTop}>
            <Text
              numberOfLines={1}
              style={[t.type.bodySmall, styles.barName, { color: t.color.text }]}
            >
              {row.name}
            </Text>
            <Text style={[t.type.metaStrong, { color: t.color.sub }]}>
              {`${row.count} · ${total > 0 ? Math.round((row.count / total) * 100) : 0}%`}
            </Text>
          </View>
          <View style={[styles.barTrack, { backgroundColor: t.color.soft }]}>
            <LinearGradient
              colors={[...t.gradients.bar.colors]}
              start={t.gradients.bar.start}
              end={t.gradients.bar.end}
              style={[styles.barFill, { width: `${(row.count / largest) * 100}%` }]}
            />
          </View>
        </View>
      ))}
    </View>
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
  kpiDot: { width: 7, height: 7, borderRadius: 7, marginBottom: 7 },
  kpiValue: { marginTop: 3, marginBottom: 2 },

  warrantyCard: { marginTop: 16, overflow: 'hidden' },
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

  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  donutCentre: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: { flex: 1, gap: 7 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 8, height: 8, borderRadius: 8 },
  legendName: { flex: 1, minWidth: 0 },

  bars: { gap: 13 },
  barTop: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 6 },
  barName: { flex: 1, minWidth: 0 },
  barTrack: { height: 8, borderRadius: 8, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 8 },

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
