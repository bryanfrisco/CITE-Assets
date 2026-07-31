/**
 * Notifications — Phase 6.
 *
 * IMPLEMENTATION_PLAN.md § Phase 6, "Done when": an asset whose warranty is 20
 * days away produces a notification overnight and the bell shows the red dot.
 *
 * Tapping a row marks it read AND opens what it is about. Those are one action
 * from the user's side: nobody taps a warranty warning to mark it read, they
 * tap it to go and look at the laptop.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  CheckCheck,
  ChevronLeft,
  DatabaseBackup,
  FileText,
  ShieldAlert,
  Wrench,
} from 'lucide-react-native';

import { useTheme } from '@/theme';
import { Button, Card, EmptyState, Screen, Skeleton } from '@/components/ui';
import {
  fetchNotifications,
  isBackupReminder,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from '@/api/notifications';
import { useToast } from '@/store/useUiStore';

function relative(value: string): string {
  const then = new Date(value).getTime();
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function NotificationsScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const inbox = useQuery({ queryKey: ['notifications'], queryFn: () => fetchNotifications() });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['notificationsUnread'] });
  };

  const readOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: refresh,
  });

  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: (marked) => {
      refresh();
      toast(marked === 0 ? 'Nothing was unread' : `${marked} marked as read`);
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const rows = inbox.data ?? [];
  const unread = rows.filter((r) => !r.read_at).length;

  const open = (row: NotificationRow) => {
    if (!row.read_at) readOne.mutate(row.id);
    if (row.bast_id) router.push(`/bast/${row.bast_id}`);
    else if (row.asset_code) router.push(`/asset/${row.asset_code}`);
  };

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
        <Text style={[t.type.metaStrong, { color: t.color.royal }]}>Back</Text>
      </Pressable>

      <Text style={[t.type.screenTitle, { color: t.color.text }]}>Notifications</Text>
      <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
        {unread > 0 ? `${unread} unread` : 'Nothing waiting'}
      </Text>

      {unread > 0 ? (
        <Button
          label="Mark all as read"
          variant="secondary"
          block
          loading={readAll.isPending}
          icon={<CheckCheck size={15} color={t.color.text} strokeWidth={1.8} />}
          onPress={() => readAll.mutate()}
          style={styles.markAll}
        />
      ) : null}

      {inbox.isPending ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={70} radius={t.radii.card} />
          ))}
        </View>
      ) : inbox.isError ? (
        <EmptyState
          variant="error"
          title="Could not load your notifications"
          description={(inbox.error as Error).message}
          actionLabel="Try again"
          onAction={() => inbox.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          description="Warranty warnings, service reminders and the weekly backup note arrive here."
        />
      ) : (
        <Card padding={0} radius="listContainer">
          {rows.map((row, i) => (
            <NotificationRowView
              key={row.id}
              row={row}
              last={i === rows.length - 1}
              onPress={() => open(row)}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}

function NotificationRowView({
  row,
  last,
  onPress,
}: {
  row: NotificationRow;
  last: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const unread = !row.read_at;

  const { icon, tint } = iconFor(row, t);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={row.title}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: t.color.line,
          backgroundColor: pressed ? t.color.soft : 'transparent',
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: t.color.soft }]}>{icon}</View>

      <View style={styles.rowText}>
        <Text
          numberOfLines={2}
          style={[unread ? t.type.metaStrong : t.type.bodySmall, { color: t.color.text }]}
        >
          {row.title}
        </Text>
        {row.body ? (
          <Text numberOfLines={2} style={[t.type.meta, styles.body, { color: t.color.sub }]}>
            {row.body}
          </Text>
        ) : null}
        <Text style={[t.type.meta, styles.when, { color: t.color.sub }]}>
          {relative(row.created_at)}
        </Text>
      </View>

      {/* The same dot as the bell, so "unread" means one thing everywhere. */}
      {unread ? <View style={[styles.dot, { backgroundColor: tint }]} /> : null}
    </Pressable>
  );
}

function iconFor(row: NotificationRow, t: ReturnType<typeof useTheme>) {
  const size = 17;
  const width = 1.8;

  if (isBackupReminder(row)) {
    return {
      icon: <DatabaseBackup size={size} color={t.color.royal} strokeWidth={width} />,
      tint: t.color.royal,
    };
  }

  switch (row.kind) {
    case 'warranty_expiring':
      return {
        icon: <ShieldAlert size={size} color={t.color.amber} strokeWidth={width} />,
        tint: t.color.amber,
      };
    case 'maintenance_reminder':
      return {
        icon: <Wrench size={size} color={t.color.amber} strokeWidth={width} />,
        tint: t.color.amber,
      };
    case 'new_bast':
      return {
        icon: <FileText size={size} color={t.color.royal} strokeWidth={width} />,
        tint: t.color.royal,
      };
    default:
      return {
        icon: <CalendarClock size={size} color={t.color.royal} strokeWidth={width} />,
        tint: t.color.royal,
      };
  }
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 3, marginBottom: 14 },
  markAll: { marginBottom: 14 },
  skeletons: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0 },
  body: { marginTop: 3, lineHeight: 16 },
  when: { marginTop: 5 },
  dot: { width: 7, height: 7, borderRadius: 7, marginTop: 6 },
});
