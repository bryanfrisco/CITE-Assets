/**
 * Audit log — README § Audit log.
 *
 * The rows have existed since the first migration; this is the first thing to
 * read them. Nothing on this screen can change anything, which is not a
 * limitation to work around: a log with an edit button is not a log.
 *
 * Paged rather than infinite-scrolled. Someone opening this is usually looking
 * for one specific thing that happened on one specific day, and a page they can
 * step back through is easier to hold in your head than a list that keeps
 * growing under your thumb.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { Card, Chip, ChipRow, EmptyState, Input, Screen, Skeleton } from '@/components/ui';
import { Avatar } from '@/components/chrome';
import {
  AUDIT_ACTION_LABEL,
  AUDIT_FILTERS,
  AUDIT_PAGE_SIZE,
  fetchAuditLog,
  fetchAuditStats,
  type AuditAction,
  type AuditEntry,
} from '@/api/audit';
import { formatDateTime } from '@/lib/dates';
import { usePermissions } from '@/auth';

export default function AuditScreen() {
  const t = useTheme();
  const router = useRouter();
  const { can } = usePermissions();

  const [filter, setFilter] = useState<AuditAction | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const stats = useQuery({
    queryKey: ['auditStats'],
    queryFn: fetchAuditStats,
    enabled: can('audit.view'),
  });

  const entries = useQuery({
    queryKey: ['audit', filter, search, page],
    queryFn: () =>
      fetchAuditLog({
        action: filter === 'all' ? null : filter,
        search,
        offset: page * AUDIT_PAGE_SIZE,
      }),
    enabled: can('audit.view'),
  });

  if (!can('audit.view')) {
    return (
      <Screen>
        <EmptyState
          title="Not available"
          description="The audit log is for Corporate IT and above."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const rows = entries.data ?? [];
  // A full page means there is probably another; the log has no total to ask
  // for without counting the whole table on every keystroke.
  const hasMore = rows.length === AUDIT_PAGE_SIZE;

  const reset = (next: () => void) => {
    next();
    setPage(0);
  };

  return (
    <Screen refreshing={entries.isFetching} onRefresh={() => void entries.refetch()}>
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

      <Text style={[t.type.screenTitle, { color: t.color.text }]}>Audit log</Text>
      <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
        Every action, in every location, kept for good and unchangeable
      </Text>

      <View style={styles.stats}>
        {(
          [
            ['Today', stats.data?.today ?? 0],
            ['7 days', stats.data?.week ?? 0],
            ['All time', stats.data?.total ?? 0],
          ] as const
        ).map(([label, value]) => (
          <Card key={label} radius="kpiTile" padding={12} style={styles.statTile}>
            <Text style={[t.type.kpiNumber, styles.statValue, { color: t.color.text }]}>
              {value}
            </Text>
            <Text style={[t.type.kpiLabel, styles.statLabel, { color: t.color.sub }]}>{label}</Text>
          </Card>
        ))}
      </View>

      <Input
        size="search"
        value={search}
        onChangeText={(value) => reset(() => setSearch(value))}
        placeholder="Who, or what was touched"
        icon={<Search size={15} color={t.color.sub} strokeWidth={1.8} />}
        containerStyle={styles.search}
      />

      <ChipRow style={styles.filters}>
        {AUDIT_FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            active={filter === f.key}
            onPress={() => reset(() => setFilter(f.key))}
          />
        ))}
      </ChipRow>

      {entries.isPending ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={66} radius={t.radii.card} />
          ))}
        </View>
      ) : entries.isError ? (
        <EmptyState
          variant="error"
          title="Could not load the audit log"
          description={(entries.error as Error).message}
          actionLabel="Try again"
          onAction={() => entries.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={page > 0 ? 'Nothing further back' : 'Nothing recorded yet'}
          description={
            page > 0
              ? 'This is the end of the log for these filters.'
              : 'Actions appear here the moment anyone changes anything.'
          }
          actionLabel={page > 0 ? 'Back a page' : undefined}
          onAction={page > 0 ? () => setPage((p) => Math.max(0, p - 1)) : undefined}
        />
      ) : (
        <>
          <Card padding={0} radius="listContainer">
            {rows.map((row, i) => (
              <AuditRow key={row.id} entry={row} last={i === rows.length - 1} />
            ))}
          </Card>

          {page > 0 || hasMore ? (
            <View style={styles.pager}>
              <Pressable
                onPress={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                accessibilityRole="button"
                accessibilityLabel="Newer"
                hitSlop={8}
                style={styles.pageButton}
              >
                <ChevronLeft
                  size={15}
                  color={page === 0 ? t.color.sub : t.color.royal}
                  strokeWidth={2}
                />
                <Text
                  style={[t.type.metaStrong, { color: page === 0 ? t.color.sub : t.color.royal }]}
                >
                  Newer
                </Text>
              </Pressable>

              <Text style={[t.type.meta, { color: t.color.sub }]}>{`Page ${page + 1}`}</Text>

              <Pressable
                onPress={() => setPage((p) => p + 1)}
                disabled={!hasMore}
                accessibilityRole="button"
                accessibilityLabel="Older"
                hitSlop={8}
                style={styles.pageButton}
              >
                <Text style={[t.type.metaStrong, { color: hasMore ? t.color.royal : t.color.sub }]}>
                  Older
                </Text>
                <ChevronRight
                  size={15}
                  color={hasMore ? t.color.royal : t.color.sub}
                  strokeWidth={2}
                />
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function AuditRow({ entry, last }: { entry: AuditEntry; last: boolean }) {
  const t = useTheme();

  // The dot colour groups the log the way the Timeline does, so a person moving
  // between the two screens is reading the same vocabulary.
  const tone =
    entry.action === 'status_changed' || entry.action === 'master_deleted'
      ? t.color.amber
      : entry.action.startsWith('bast')
        ? t.color.royal
        : entry.action.startsWith('account')
          ? t.color.gold
          : t.color.success;

  return (
    <View
      style={[styles.row, { borderBottomWidth: last ? 0 : 1, borderBottomColor: t.color.line }]}
    >
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: tone }]} />
      </View>

      <View style={styles.rowText}>
        <View style={styles.rowTop}>
          <Text style={[t.type.metaStrong, { color: t.color.text }]}>
            {AUDIT_ACTION_LABEL[entry.action] ?? entry.action}
          </Text>
          <Text style={[t.type.meta, styles.when, { color: t.color.sub }]}>
            {formatDateTime(entry.created_at)}
          </Text>
        </View>

        <Text numberOfLines={2} style={[t.type.bodySmall, styles.summary, { color: t.color.text }]}>
          {entry.target_label ?? entry.summary}
        </Text>

        <View style={styles.actor}>
          <Avatar name={entry.actor_name} size={18} />
          <Text numberOfLines={1} style={[t.type.meta, { color: t.color.sub }]}>
            {entry.actor_label ?? entry.actor_name}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 3, marginBottom: 14, lineHeight: 17 },
  stats: { flexDirection: 'row', gap: 9, marginBottom: 14 },
  statTile: { flex: 1 },
  statValue: { fontSize: 20 },
  statLabel: { marginTop: 3 },
  search: { marginBottom: 12 },
  filters: { marginBottom: 12 },
  skeletons: { gap: 10 },
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 15, paddingVertical: 13 },
  rail: { width: 10, alignItems: 'center', paddingTop: 5 },
  dot: { width: 8, height: 8, borderRadius: 8 },
  rowText: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  when: { marginLeft: 'auto' },
  summary: { marginTop: 3, lineHeight: 17 },
  actor: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingHorizontal: 4,
  },
  pageButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
});
