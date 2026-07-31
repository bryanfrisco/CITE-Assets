/**
 * Tab layout — the real app chrome that wraps every main screen:
 * header, scope dropdown, floating bottom nav + FAB, and the quick-action sheet.
 *
 * The nav is rendered here rather than by expo-router's Tabs so it can float
 * over the content with the 64px FAB gap the design calls for.
 */

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import {
  AppHeader,
  BottomNav,
  QuickActionSheet,
  ScopeDropdown,
  type NavKey,
  type QuickAction,
} from '@/components/chrome';
import { fetchUnreadCount } from '@/api/notifications';
import { useUiStore } from '@/store/useUiStore';
import { usePermissions } from '@/auth';

/**
 * README § Global Chrome: "'Assets' stays active on Asset Detail; 'More' stays
 * active on Master data, Settings, Audit log."
 */
function navKeyFor(pathname: string): NavKey {
  if (
    pathname.startsWith('/assets') ||
    pathname.startsWith('/asset/') ||
    pathname.startsWith('/add-asset') ||
    pathname.startsWith('/assign') ||
    pathname.startsWith('/transfer') ||
    pathname.startsWith('/scan') ||
    pathname.startsWith('/labels')
  ) {
    return 'assets';
  }
  if (pathname.startsWith('/bast')) return 'bast';
  if (
    pathname.startsWith('/more') ||
    pathname.startsWith('/master') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/notifications') ||
    pathname.startsWith('/maintenance') ||
    pathname.startsWith('/accounts') ||
    pathname.startsWith('/account-edit') ||
    pathname.startsWith('/audit')
  ) {
    return 'more';
  }
  return 'home';
}

const NAV_ROUTES: Record<NavKey, '/' | '/assets' | '/bast' | '/more'> = {
  home: '/',
  assets: '/assets',
  bast: '/bast',
  more: '/more',
};

export default function TabsLayout() {
  const t = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { isReadOnly } = usePermissions();

  const [scopeOpen, setScopeOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);

  // The bell's red dot. Refetched on an interval rather than pushed, because
  // the notifications that matter here are written overnight by a cron job —
  // a realtime subscription would hold a socket open all day to deliver one
  // row at 05:00.
  const setUnreadCount = useUiStore((s) => s.setUnreadCount);
  const unread = useQuery({
    queryKey: ['notificationsUnread'],
    queryFn: fetchUnreadCount,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (typeof unread.data === 'number') setUnreadCount(unread.data);
  }, [unread.data, setUnreadCount]);

  const active = navKeyFor(pathname);

  const handleQuickAction = (action: QuickAction) => {
    setFabOpen(false);
    const routes: Record<QuickAction, '/add-asset' | '/assign' | '/transfer' | '/bast' | '/scan'> =
      {
        'scan-label': '/scan',
        'add-asset': '/add-asset',
        'assign-asset': '/assign',
        'transfer-asset': '/transfer',
        'generate-bast': '/bast',
      };
    router.push(routes[action]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.color.bg }}>
      <AppHeader
        scopeOpen={scopeOpen}
        onPressScope={() => setScopeOpen((open) => !open)}
        onPressBell={() => router.push('/notifications')}
        onPressAvatar={() => router.push('/more')}
      />

      <View style={{ flex: 1 }}>
        <Slot />
      </View>

      <ScopeDropdown visible={scopeOpen} onDismiss={() => setScopeOpen(false)} />

      <BottomNav
        active={active}
        fabOpen={fabOpen}
        // Every quick action behind the FAB is a mutation, so a Viewer never
        // sees it (IMPLEMENTATION_PLAN.md § Phase 1).
        showFab={!isReadOnly}
        onNavigate={(key) => router.navigate(NAV_ROUTES[key])}
        onPressFab={() => setFabOpen(true)}
      />

      <QuickActionSheet
        visible={fabOpen}
        onDismiss={() => setFabOpen(false)}
        onSelect={handleQuickAction}
      />
    </View>
  );
}
