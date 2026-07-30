/**
 * AppHeader — README § Global Chrome:
 * "56px top inset for the status bar, `card` background, 1px bottom `line`:
 *  CITE logo 32×32 · 'CITE Assets' + 'IT ASSET MANAGEMENT' · bell button
 *  (34×34, red 7px dot when unread) · scope chip (pin icon + label) ·
 *  avatar 34×34 navy with initials."
 */

import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, MapPin } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { useScopeLabel } from '@/store/useScopeStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { Avatar } from './Avatar';

const logo = require('../../../assets/cite-logo.png');

export interface AppHeaderProps {
  onPressBell?: () => void;
  onPressScope?: () => void;
  onPressAvatar?: () => void;
  scopeOpen?: boolean;
}

export function AppHeader({
  onPressBell,
  onPressScope,
  onPressAvatar,
  scopeOpen = false,
}: AppHeaderProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const scopeLabel = useScopeLabel();
  const unreadCount = useUiStore((s) => s.unreadCount);
  const account = useSessionStore((s) => s.account);

  // 56px is the design's total top inset; on devices with a taller status bar
  // the safe-area value wins so nothing sits under the notch.
  const topInset = Math.max(insets.top, t.sizes.headerTopInset - 12);

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: topInset,
          backgroundColor: t.color.card,
          borderBottomColor: t.color.line,
        },
      ]}
    >
      <View style={styles.row}>
        <Image
          source={logo}
          style={{ width: t.sizes.logo, height: t.sizes.logo }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />

        <View style={styles.brand}>
          <Text numberOfLines={1} style={[t.type.appName, { color: t.color.text }]}>
            CITE Assets
          </Text>
          <Text numberOfLines={1} style={[t.type.appSubtitle, { color: t.color.sub }]}>
            IT ASSET MANAGEMENT
          </Text>
        </View>

        <Pressable
          onPress={onPressBell}
          accessibilityRole="button"
          accessibilityLabel={
            unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
          }
          hitSlop={5}
          style={({ pressed }) => [
            styles.bell,
            {
              width: t.sizes.bellButton,
              height: t.sizes.bellButton,
              borderRadius: t.radii.iconChip,
              backgroundColor: t.color.soft,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Bell size={18} color={t.color.text} strokeWidth={1.7} />
          {unreadCount > 0 ? (
            <View
              style={[
                styles.unreadDot,
                {
                  width: t.sizes.unreadDot,
                  height: t.sizes.unreadDot,
                  borderRadius: t.sizes.unreadDot,
                  backgroundColor: t.color.error,
                  borderColor: t.color.card,
                },
              ]}
            />
          ) : null}
        </Pressable>

        <Pressable
          onPress={onPressScope}
          accessibilityRole="button"
          accessibilityLabel={`Data scope: ${scopeLabel}`}
          accessibilityState={{ expanded: scopeOpen }}
          hitSlop={5}
          style={({ pressed }) => [
            styles.scopeChip,
            {
              borderRadius: t.radii.chip,
              backgroundColor: scopeOpen ? t.color.navy : t.color.soft,
              borderColor: scopeOpen ? t.color.navy : t.color.line,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <MapPin size={13} color={scopeOpen ? t.color.onNavy : t.color.royal} strokeWidth={1.8} />
          <Text
            numberOfLines={1}
            style={[t.type.metaStrong, { color: scopeOpen ? t.color.onNavy : t.color.text }]}
          >
            {scopeLabel}
          </Text>
        </Pressable>

        <Pressable onPress={onPressAvatar} accessibilityRole="button" hitSlop={5}>
          <Avatar name={account?.fullName ?? 'CITE'} size={t.sizes.avatar} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { borderBottomWidth: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // 7px gaps and 12px side padding: on a 390pt screen this is what lets
    // "IT ASSET MANAGEMENT" render in full next to a long scope label such as
    // "Head Office" (a single-location Site IT or Viewer user).
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  brand: { flex: 1, minWidth: 0, marginLeft: 2 },
  bell: { alignItems: 'center', justifyContent: 'center' },
  unreadDot: { position: 'absolute', top: 6, right: 6, borderWidth: 1.5 },
  scopeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 30,
    paddingHorizontal: 9,
    borderWidth: 1,
    // Long labels ("Head Office" for a single-location user) must ellipsize
    // rather than squeeze "IT ASSET MANAGEMENT" out of the brand block.
    maxWidth: 104,
  },
});
