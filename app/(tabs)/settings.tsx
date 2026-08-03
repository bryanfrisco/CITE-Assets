/**
 * Settings — README § 9.
 *
 * Phase 0 ships the Profile card and the Appearance section, because Phase 0's
 * acceptance criterion is that the dark-mode switch flips the whole theme.
 * User accounts, notification settings, default scope and About land with
 * Phase 1 and Phase 8.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react-native';

import { useTheme, useThemeContext } from '@/theme';
import { Badge, Button, Card, Input, Screen, Skeleton, Switch } from '@/components/ui';
import { changeOwnPassword, signOut } from '@/api/session';
import { fetchScheduledJobs, runNotificationJobsNow } from '@/api/notifications';
import { MIN_PASSWORD_LENGTH } from '@/api/accounts';
import { Avatar } from '@/components/chrome';
import { roleLabels, useSessionStore } from '@/store/useSessionStore';
import { useToast, useUiStore, type Language } from '@/store/useUiStore';
import { usePermissions } from '@/auth';

export default function SettingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const { mode, setDarkMode } = useThemeContext();
  const account = useSessionStore((s) => s.account);
  const language = useUiStore((s) => s.language);
  const { can } = usePermissions();
  const setLanguage = useUiStore((s) => s.setLanguage);

  const isDark = mode === 'dark';

  return (
    <Screen>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back to More"
        hitSlop={8}
        style={styles.back}
      >
        <ChevronLeft size={17} color={t.color.royal} strokeWidth={1.9} />
        <Text style={[t.type.metaStrong, { color: t.color.royal }]}>More</Text>
      </Pressable>

      <Text style={[t.type.screenTitle, styles.title, { color: t.color.text }]}>Settings</Text>

      {/* Profile — 48px navy avatar, name, email, gold role badge. */}
      <Card padding={15}>
        <View style={styles.profile}>
          <Avatar name={account?.fullName ?? 'CITE'} size={t.sizes.avatarProfile} />
          <View style={styles.profileText}>
            <Text style={[t.type.body, { color: t.color.text }]}>{account?.fullName}</Text>
            <Text style={[t.type.meta, { color: t.color.sub, marginTop: 2 }]}>
              {account?.email}
            </Text>
          </View>
        </View>
        <View style={styles.roleRow}>
          {account?.role ? (
            <Badge tone="gold" label={roleLabels[account.role].toUpperCase()} />
          ) : (
            // README § Settings: record-only accounts carry a "No login" badge.
            <Badge label="No login" />
          )}
        </View>
      </Card>

      <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>
        Appearance
      </Text>

      <Card padding={15}>
        <Switch
          value={isDark}
          onValueChange={setDarkMode}
          label="Dark mode"
          description={isDark ? 'On · easier on the eyes at site' : 'Off · following light theme'}
        />

        <View style={[styles.divider, { backgroundColor: t.color.line }]} />

        <View style={styles.languageRow}>
          <Text style={[t.type.body, { color: t.color.text }]}>Language</Text>
          <View style={[styles.segmented, { backgroundColor: t.color.soft }]}>
            {(['EN', 'ID'] as Language[]).map((code) => {
              const active = language === code;
              return (
                <Pressable
                  key={code}
                  onPress={() => setLanguage(code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.segment,
                    active && { backgroundColor: t.color.card, borderColor: t.color.line },
                  ]}
                >
                  <Text style={[t.type.metaStrong, { color: active ? t.color.text : t.color.sub }]}>
                    {code}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Card>

      <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>
        Password
      </Text>
      <ChangePassword />

      {can('account.manage') ? (
        <>
          <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>
            Scheduled jobs
          </Text>
          <ScheduledJobs />
        </>
      ) : null}

      <Button
        label="Log out"
        variant="destructive"
        block
        style={styles.logout}
        onPress={() => {
          void signOut();
        }}
      />

      <Text style={[t.type.meta, styles.build, { color: t.color.sub }]}>
        CITE Assets v1.0.0 · Build 2026.07
      </Text>
    </Screen>
  );
}

/**
 * What the database is scheduled to do, and a way to make it do it now.
 *
 * An empty list is the state worth showing: it means pg_cron is not installed,
 * so nothing runs and nothing anywhere would say so. Pressing "Run now"
 * exercises the same code the schedule runs, which is the only way to find out
 * the pipeline works without waiting until 22:00 and hoping.
 */
/**
 * Changing your own password.
 *
 * Separate from the Accounts screen on purpose: a Super Admin resetting
 * somebody's password means that Super Admin knows it. This path means nobody
 * does, which is the only version worth having once more than one person can
 * sign in.
 */
function ChangePassword() {
  const t = useTheme();
  const toast = useToast();

  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const change = useMutation({
    mutationFn: () => changeOwnPassword(next),
    onSuccess: () => {
      setNext('');
      setConfirm('');
      setError('');
      toast('Password changed');
    },
    onError: (e: Error) => setError(e.message),
  });

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = next.length >= MIN_PASSWORD_LENGTH && next === confirm;

  return (
    <Card padding={15}>
      <Input
        label="New password"
        value={next}
        onChangeText={(value) => {
          setNext(value);
          setError('');
        }}
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        secureTextEntry
        autoCapitalize="none"
        error={tooShort ? `At least ${MIN_PASSWORD_LENGTH} characters` : null}
        containerStyle={styles.passwordField}
      />
      <Input
        label="Repeat it"
        value={confirm}
        onChangeText={(value) => {
          setConfirm(value);
          setError('');
        }}
        placeholder="Type it again"
        secureTextEntry
        autoCapitalize="none"
        error={mismatch ? 'These do not match' : null}
      />

      {error ? (
        <Text style={[t.type.meta, styles.passwordHint, { color: t.color.error }]}>{error}</Text>
      ) : null}

      <Button
        label="Change password"
        variant="secondary"
        block
        disabled={!ready}
        loading={change.isPending}
        onPress={() => change.mutate()}
        style={styles.passwordAction}
      />
      <Text style={[t.type.meta, styles.passwordHint, { color: t.color.sub }]}>
        You stay signed in on this phone. Anywhere else you are signed in will need the new one.
      </Text>
    </Card>
  );
}

function ScheduledJobs() {
  const t = useTheme();
  const toast = useToast();

  const jobs = useQuery({ queryKey: ['scheduledJobs'], queryFn: fetchScheduledJobs });

  const run = useMutation({
    mutationFn: runNotificationJobsNow,
    onSuccess: (result) => {
      const total = result.warranty + result.maintenance + result.backup;
      // Zero is the normal answer on a second press, and saying so plainly is
      // better than a success message that looks like nothing happened.
      toast(
        total === 0
          ? 'Ran · nothing new to send'
          : `Ran · ${total} notification${total === 1 ? '' : 's'} sent`,
      );
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  return (
    <Card padding={15}>
      {jobs.isPending ? (
        <Skeleton height={40} radius={t.radii.card} />
      ) : jobs.isError ? (
        <Text style={[t.type.meta, { color: t.color.error }]}>{(jobs.error as Error).message}</Text>
      ) : (jobs.data ?? []).length === 0 ? (
        <Text style={[t.type.meta, { color: t.color.error, lineHeight: 16 }]}>
          Nothing is scheduled. Warranty warnings and the weekly backup reminder will not arrive on
          their own until pg_cron is enabled on this project.
        </Text>
      ) : (
        (jobs.data ?? []).map((job) => (
          <View key={job.jobname} style={styles.jobRow}>
            <View style={styles.jobText}>
              <Text style={[t.type.bodySmall, { color: t.color.text }]}>
                {job.jobname === 'cite-daily-notifications'
                  ? 'Warranty and service reminders'
                  : 'Weekly backup reminder'}
              </Text>
              <Text style={[t.type.meta, { color: t.color.sub, marginTop: 2 }]}>
                {job.jobname === 'cite-daily-notifications'
                  ? 'Every night, 05:00 WIB'
                  : 'Fridays, 15:00 WIB'}
              </Text>
            </View>
            <Badge
              label={job.active ? 'On' : 'Paused'}
              tone={job.active ? 'available' : undefined}
            />
          </View>
        ))
      )}

      <Button
        label="Run now"
        variant="secondary"
        block
        loading={run.isPending}
        onPress={() => run.mutate()}
        style={styles.jobRun}
      />
      <Text style={[t.type.meta, { color: t.color.sub, marginTop: 9, lineHeight: 16 }]}>
        Safe to press twice — each notification is sent once for the thing it is about.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  passwordField: { marginBottom: 12 },
  passwordAction: { marginTop: 14 },
  passwordHint: { marginTop: 9, lineHeight: 16 },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  jobText: { flex: 1, minWidth: 0 },
  jobRun: { marginTop: 12 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 10, minHeight: 24 },
  title: { marginBottom: 14 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileText: { flex: 1, minWidth: 0 },
  roleRow: { marginTop: 12 },
  sectionLabel: { marginTop: 20, marginBottom: 9, marginLeft: 2 },
  divider: { height: 1, marginVertical: 13 },
  languageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  segmented: { flexDirection: 'row', borderRadius: 11, padding: 3, gap: 3 },
  segment: {
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  logout: { marginTop: 20 },
  build: { marginTop: 14, textAlign: 'center' },
});
