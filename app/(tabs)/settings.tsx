/**
 * Settings — README § 9.
 *
 * Phase 0 ships the Profile card and the Appearance section, because Phase 0's
 * acceptance criterion is that the dark-mode switch flips the whole theme.
 * User accounts, notification settings, default scope and About land with
 * Phase 1 and Phase 8.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

import { useTheme, useThemeContext } from '@/theme';
import { Badge, Button, Card, Screen, Switch } from '@/components/ui';
import { signOut } from '@/api/session';
import { Avatar } from '@/components/chrome';
import { roleLabels, useSessionStore } from '@/store/useSessionStore';
import { useUiStore, type Language } from '@/store/useUiStore';

export default function SettingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const { mode, setDarkMode } = useThemeContext();
  const account = useSessionStore((s) => s.account);
  const language = useUiStore((s) => s.language);
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

const styles = StyleSheet.create({
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
