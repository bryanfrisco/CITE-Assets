/**
 * The app on a screen wide enough to hold a sidebar.
 *
 * The phone chrome is a floating bar with four destinations and a "More" that
 * hides thirteen more behind a tap. That is the right answer at 390px and the
 * wrong one at 1440: "More" only means anything when there is no room, and on
 * a desktop there is nothing but room.
 *
 * So the sidebar is not the bottom bar made tall — it is the More menu
 * unfolded, grouped by what somebody is trying to do. The permission gates are
 * the same ones more.tsx already applies, moved rather than rewritten, so a
 * Viewer sees exactly the same set of destinations on both layouts.
 *
 * Chosen by WINDOW WIDTH, not by platform: a browser at half width gets the
 * phone chrome, which is also what makes this testable by dragging a window
 * edge rather than by finding another machine.
 */

import React, { type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Boxes,
  FileSpreadsheet,
  FileText,
  Grid3x3,
  Home,
  KeyRound,
  MapPin,
  Package,
  QrCode,
  Settings as SettingsIcon,
  ShieldCheck,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react-native';

import { useTheme } from '@/theme';
import { usePermissions } from '@/auth';
import { useUiStore } from '@/store/useUiStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useScopeLabel } from '@/store/useScopeStore';
import { Avatar } from './Avatar';

const LOGO = require('../../../assets/cite-logo.png');

/** A destination, and the path prefixes that should light it up. */
interface Item {
  label: string;
  route: string;
  icon: ReactNode;
  /** Extra prefixes that belong to this item — asset detail under Assets. */
  also?: string[];
}

interface Section {
  heading?: string;
  items: Item[];
}

export interface DesktopShellProps {
  children: ReactNode;
  pathname: string;
  onPressScope: () => void;
}

export function DesktopShell({ children, pathname, onPressScope }: DesktopShellProps) {
  const t = useTheme();
  const router = useRouter();
  const { can } = usePermissions();
  const scopeLabel = useScopeLabel();
  const unread = useUiStore((s) => s.unreadCount);
  // Initials, not an empty disc. A blank avatar reads as a failed image.
  const me = useSessionStore((s) => s.account);

  const icon = { size: 17, strokeWidth: 1.7 } as const;

  const sections: Section[] = [
    {
      items: [
        { label: 'Dashboard', route: '/', icon: <Home {...icon} color={t.color.royal} /> },
        {
          label: 'Assets',
          route: '/assets',
          icon: <Package {...icon} color={t.color.royal} />,
          also: ['/asset/', '/add-asset', '/assign', '/scan'],
        },
        {
          label: 'E-BAST',
          route: '/bast',
          icon: <FileText {...icon} color={t.color.royal} />,
        },
        {
          label: 'Accessories',
          route: '/accessories',
          icon: <Boxes {...icon} color={t.color.royal} />,
          also: ['/accessory'],
        },
        {
          label: 'Licenses',
          route: '/licenses',
          icon: <KeyRound {...icon} color={t.color.royal} />,
          also: ['/license'],
        },
      ],
    },
    {
      heading: 'Kelola',
      items: [
        ...(can('account.manage')
          ? [
              {
                label: 'Accounts',
                route: '/accounts',
                icon: <Users {...icon} color={t.color.royal} />,
                also: ['/account-edit'],
              },
            ]
          : []),
        ...(can('master.write')
          ? [
              {
                label: 'Master data',
                route: '/master',
                icon: <Grid3x3 {...icon} color={t.color.royal} />,
                also: ['/master-usage'],
              },
            ]
          : []),
        {
          label: 'Maintenance',
          route: '/maintenance',
          icon: <Wrench {...icon} color={t.color.royal} />,
        },
        {
          label: 'Movement',
          route: '/transfer',
          icon: <ArrowLeftRight {...icon} color={t.color.royal} />,
        },
        { label: 'Labels', route: '/labels', icon: <QrCode {...icon} color={t.color.royal} /> },
      ],
    },
    {
      heading: 'Data',
      items: [
        {
          label: 'Import assets',
          route: '/import',
          icon: <FileSpreadsheet {...icon} color={t.color.royal} />,
        },
        ...(can('account.manage')
          ? [
              {
                label: 'Import employees',
                route: '/import-employees',
                icon: <UserPlus {...icon} color={t.color.royal} />,
              },
              {
                label: 'Import licenses',
                route: '/import-licenses',
                icon: <KeyRound {...icon} color={t.color.royal} />,
              },
            ]
          : []),
        {
          label: 'Reports',
          route: '/reports',
          icon: <BarChart3 {...icon} color={t.color.royal} />,
        },
      ],
    },
    {
      heading: 'Sistem',
      items: [
        ...(can('audit.view')
          ? [
              {
                label: 'Audit log',
                route: '/audit',
                icon: <ShieldCheck {...icon} color={t.color.royal} />,
              },
            ]
          : []),
        {
          label: 'Settings',
          route: '/settings',
          icon: <SettingsIcon {...icon} color={t.color.royal} />,
        },
      ],
    },
  ];

  /**
   * Longest match wins, so `/licenses` does not light up `/license/abc`'s item
   * and the other way round. Sorting by length is what makes prefix matching
   * safe when one route is a prefix of another.
   */
  const activeRoute = (() => {
    const candidates = sections
      .flatMap((s) => s.items)
      .flatMap((i) => [i.route, ...(i.also ?? [])].map((prefix) => ({ prefix, route: i.route })))
      .filter(({ prefix }) => (prefix === '/' ? pathname === '/' : pathname.startsWith(prefix)))
      .sort((a, b) => b.prefix.length - a.prefix.length);
    return candidates[0]?.route ?? '/';
  })();

  return (
    <View style={[styles.frame, { backgroundColor: t.color.bg }]}>
      <View
        style={[styles.sidebar, { backgroundColor: t.color.card, borderRightColor: t.color.line }]}
      >
        <Pressable
          onPress={() => router.navigate('/')}
          accessibilityRole="button"
          accessibilityLabel="CITE Assets, dashboard"
          style={styles.brand}
        >
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />
          <View style={styles.brandText}>
            <Text style={[t.type.appName, { color: t.color.text }]}>CITE Assets</Text>
            <Text style={[t.type.appSubtitle, { color: t.color.sub }]}>IT ASSET MANAGEMENT</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={onPressScope}
          accessibilityRole="button"
          accessibilityLabel={`Data scope: ${scopeLabel}`}
          style={({ pressed }) => [
            styles.scope,
            {
              borderRadius: t.radii.chip,
              borderColor: t.color.line,
              backgroundColor: pressed ? t.color.soft : 'transparent',
            },
          ]}
        >
          <MapPin size={14} color={t.color.royal} strokeWidth={1.8} />
          <Text
            numberOfLines={1}
            style={[t.type.metaStrong, styles.scopeText, { color: t.color.text }]}
          >
            {scopeLabel}
          </Text>
        </Pressable>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.navScroll}>
          {sections.map((section, i) => (
            <View key={section.heading ?? `top-${i}`} style={styles.section}>
              {section.heading ? (
                <Text style={[t.type.sectionLabel, styles.heading, { color: t.color.sub }]}>
                  {section.heading}
                </Text>
              ) : null}

              {section.items.map((item) => {
                const isActive = activeRoute === item.route;
                return (
                  <Pressable
                    key={item.route}
                    onPress={() =>
                      router.navigate(item.route as Parameters<typeof router.navigate>[0])
                    }
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: isActive }}
                    style={({ pressed }) => [
                      styles.item,
                      {
                        borderRadius: t.radii.chip,
                        backgroundColor: isActive
                          ? t.color.soft
                          : pressed
                            ? t.color.soft
                            : 'transparent',
                      },
                    ]}
                  >
                    {item.icon}
                    <Text
                      numberOfLines={1}
                      style={[
                        isActive ? t.type.metaStrong : t.type.meta,
                        styles.itemText,
                        { color: isActive ? t.color.text : t.color.sub },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.main}>
        <View
          style={[
            styles.topBar,
            { borderBottomColor: t.color.line, backgroundColor: t.color.card },
          ]}
        >
          <View style={styles.topSpacer} />

          <Pressable
            onPress={() => router.push('/notifications')}
            accessibilityRole="button"
            accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            style={({ pressed }) => [
              styles.bell,
              {
                borderRadius: t.radii.chip,
                backgroundColor: pressed ? t.color.soft : 'transparent',
              },
            ]}
          >
            <Bell size={18} color={t.color.sub} strokeWidth={1.8} />
            {unread > 0 ? (
              <View
                style={[styles.dot, { backgroundColor: t.color.error, borderColor: t.color.card }]}
              />
            ) : null}
          </Pressable>

          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Your account"
          >
            <Avatar name={me?.fullName ?? ''} size={32} />
          </Pressable>
        </View>

        <View style={styles.content}>
          <View style={styles.contentInner}>{children}</View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 260, borderRightWidth: 1, paddingHorizontal: 12, paddingTop: 18 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 },
  logo: { width: 32, height: 32 },
  brandText: { flex: 1, minWidth: 0 },
  scope: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 10,
    minHeight: 34,
    borderWidth: 1,
  },
  scopeText: { flex: 1, minWidth: 0 },
  navScroll: { flex: 1 },
  section: { marginTop: 14 },
  heading: { marginBottom: 6, marginLeft: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 36,
    paddingHorizontal: 10,
  },
  itemText: { flex: 1, minWidth: 0 },
  main: { flex: 1, minWidth: 0 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
  },
  topSpacer: { flex: 1 },
  bell: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  content: { flex: 1, alignItems: 'center' },
  // The content itself is still the phone layout; capping it keeps a table row
  // from stretching to 1900px, where the eye loses the line between columns.
  contentInner: { flex: 1, width: '100%', maxWidth: 1280 },
});
