/**
 * Accounts — the people the register knows about, and which of them sign in.
 *
 * Client instruction, 2026-07-30: "nanti barulah saat bikin akun akunnya bisa
 * di custom apakah akunnya dapat di loginkan atau tidak".
 *
 * Most rows here will never log in: they are the people assets are handed to,
 * and they exist so a BAST can name them. The badge says which is which, and
 * "No login" is stated plainly rather than left as an absence — a blank where a
 * role should be reads like something is missing.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Search, UserPlus } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { Badge, Button, Card, EmptyState, Input, Screen, Skeleton } from '@/components/ui';
import { Avatar } from '@/components/chrome';
import { ROLE_LABEL, fetchAccounts, type AccountRow } from '@/api/accounts';
import { usePermissions } from '@/auth';

export default function AccountsScreen() {
  const t = useTheme();
  const router = useRouter();
  const { can } = usePermissions();

  const [search, setSearch] = useState('');

  const accounts = useQuery({
    queryKey: ['accounts', search],
    queryFn: () => fetchAccounts(search),
  });

  const rows = accounts.data ?? [];
  const withLogin = rows.filter((r) => r.can_login);
  const recordOnly = rows.filter((r) => !r.can_login);

  return (
    <Screen refreshing={accounts.isFetching} onRefresh={() => void accounts.refetch()}>
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

      <Text style={[t.type.screenTitle, { color: t.color.text }]}>Accounts</Text>
      <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
        Everyone the register can name. Only some of them sign in.
      </Text>

      <Input
        size="search"
        value={search}
        onChangeText={setSearch}
        placeholder="Name, NIK or email"
        icon={<Search size={15} color={t.color.sub} strokeWidth={1.8} />}
        containerStyle={styles.search}
      />

      {can('account.manage') ? (
        <Button
          label="Add a person"
          block
          icon={<UserPlus size={15} color={t.color.onNavy} strokeWidth={1.8} />}
          onPress={() => router.push('/account-edit')}
          style={styles.add}
        />
      ) : null}

      {accounts.isPending ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={62} radius={t.radii.card} />
          ))}
        </View>
      ) : accounts.isError ? (
        <EmptyState
          variant="error"
          title="Could not load the accounts"
          description={(accounts.error as Error).message}
          actionLabel="Try again"
          onAction={() => accounts.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={search ? 'Nobody matches that' : 'No accounts yet'}
          description={
            search
              ? 'Try a different name, NIK or email.'
              : 'Add the people who receive assets — they do not need a login to appear on a BAST.'
          }
          actionLabel={can('account.manage') ? 'Add a person' : undefined}
          onAction={can('account.manage') ? () => router.push('/account-edit') : undefined}
        />
      ) : (
        <>
          {withLogin.length > 0 ? (
            <>
              <Text style={[t.type.sectionLabel, styles.groupLabel, { color: t.color.sub }]}>
                {`Can sign in · ${withLogin.length}`}
              </Text>
              <Card padding={0} radius="listContainer">
                {withLogin.map((row, i) => (
                  <AccountRowView
                    key={row.id}
                    row={row}
                    last={i === withLogin.length - 1}
                    onPress={
                      can('account.manage')
                        ? () => router.push(`/account-edit?id=${row.id}`)
                        : undefined
                    }
                  />
                ))}
              </Card>
            </>
          ) : null}

          {recordOnly.length > 0 ? (
            <>
              <Text style={[t.type.sectionLabel, styles.groupLabel, { color: t.color.sub }]}>
                {`Record only · ${recordOnly.length}`}
              </Text>
              <Card padding={0} radius="listContainer">
                {recordOnly.map((row, i) => (
                  <AccountRowView
                    key={row.id}
                    row={row}
                    last={i === recordOnly.length - 1}
                    onPress={
                      can('account.manage')
                        ? () => router.push(`/account-edit?id=${row.id}`)
                        : undefined
                    }
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

function AccountRowView({
  row,
  last,
  onPress,
}: {
  row: AccountRow;
  last: boolean;
  onPress?: () => void;
}) {
  const t = useTheme();

  // "Waiting for a password" is a real state, not an error: the account is
  // allowed to sign in but nobody has issued the credentials yet.
  const badge = !row.is_active
    ? { label: 'Inactive', tone: 'retired' as const }
    : row.can_login && !row.has_credentials
      ? { label: 'No password yet', tone: undefined }
      : row.role
        ? { label: ROLE_LABEL[row.role], tone: 'gold' as const }
        : { label: 'No login', tone: undefined };

  const meta = [row.nik, row.department_name, row.location_name].filter(Boolean).join(' · ');

  const body = (
    <View
      style={[styles.row, { borderBottomWidth: last ? 0 : 1, borderBottomColor: t.color.line }]}
    >
      <Avatar name={row.full_name} size={t.sizes.avatarWizard} />
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[t.type.bodySmall, { color: t.color.text }]}>
          {row.full_name}
          {row.is_me ? (
            <Text style={[t.type.meta, { color: t.color.sub }]}>{'  · you'}</Text>
          ) : null}
        </Text>
        <Text numberOfLines={1} style={[t.type.meta, styles.rowMeta, { color: t.color.sub }]}>
          {meta || row.email || 'No details yet'}
        </Text>
      </View>
      <Badge label={badge.label} tone={badge.tone} />
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={row.full_name}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 3, marginBottom: 14, lineHeight: 17 },
  search: { marginBottom: 12 },
  add: { marginBottom: 18 },
  skeletons: { gap: 10 },
  groupLabel: { marginTop: 6, marginBottom: 9, marginLeft: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowMeta: { marginTop: 3 },
});
