/**
 * BottomNav + FAB — README § Global Chrome:
 * "floating bar, 12px side insets, 26px from bottom:
 *  Home · Assets · (64px gap for FAB) · BAST · More.
 *  Active = navy (dark: white); inactive = #8B94A7 (dark #93A0B8).
 *  'Assets' stays active on Asset Detail; 'More' stays active on Master data,
 *  Settings, Audit log."
 *
 * "Center FAB (60×60, navy gradient, gold +) … 3px `bg`-colored ring."
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Box, FileText, Grid3x3, House, Plus } from 'lucide-react-native';

import { useTheme } from '@/theme';

export type NavKey = 'home' | 'assets' | 'bast' | 'more';

const ICONS = {
  home: House,
  assets: Box,
  bast: FileText,
  more: Grid3x3,
} as const;

const LABELS: Record<NavKey, string> = {
  home: 'Home',
  assets: 'Assets',
  bast: 'BAST',
  more: 'More',
};

export interface BottomNavProps {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
  onPressFab: () => void;
  fabOpen?: boolean;
  /**
   * Hidden for a Viewer — every quick action behind the FAB is a mutation
   * (IMPLEMENTATION_PLAN.md § Phase 1: "a Viewer sees no mutating buttons").
   * The 64px gap stays so the bar keeps its layout.
   */
  showFab?: boolean;
}

export function BottomNav({
  active,
  onNavigate,
  onPressFab,
  fabOpen = false,
  showFab = true,
}: BottomNavProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 0) + t.sizes.navBottomInset;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <View
        style={[
          styles.bar,
          {
            marginHorizontal: t.sizes.navSideInset,
            height: t.sizes.navHeight,
            borderRadius: t.radii.nav,
            backgroundColor: t.color.card,
            borderColor: t.color.line,
          },
          t.shadow.nav,
        ]}
      >
        <NavItem nav="home" active={active} onNavigate={onNavigate} />
        <NavItem nav="assets" active={active} onNavigate={onNavigate} />
        {/* 64px gap reserved for the FAB. */}
        <View style={{ width: t.sizes.navFabGap }} />
        <NavItem nav="bast" active={active} onNavigate={onNavigate} />
        <NavItem nav="more" active={active} onNavigate={onNavigate} />
      </View>

      {!showFab ? null : (
        <Pressable
          onPress={onPressFab}
          accessibilityRole="button"
          accessibilityLabel="Quick actions"
          accessibilityState={{ expanded: fabOpen }}
          style={({ pressed }) => [
            styles.fab,
            {
              width: t.sizes.fab,
              height: t.sizes.fab,
              borderRadius: t.radii.fab,
              // 3px ring in the canvas colour lifts the FAB off the bar.
              borderWidth: t.sizes.fabRing,
              borderColor: t.color.bg,
              bottom: t.sizes.navHeight / 2 - t.sizes.fab / 2 + 8,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
            t.shadow.fab,
          ]}
        >
          <LinearGradient
            colors={[...t.gradients.navy.colors]}
            locations={[...t.gradients.navy.locations]}
            start={t.gradients.navy.start}
            end={t.gradients.navy.end}
            style={[StyleSheet.absoluteFill, { borderRadius: t.radii.fab }]}
          />
          {/* The gradient is absolutely positioned, so it paints over static
              siblings — the glyph needs its own stacking context. */}
          <View style={styles.fabGlyph}>
            <Plus size={26} color={t.color.gold} strokeWidth={2.2} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

function NavItem({
  nav,
  active,
  onNavigate,
}: {
  nav: NavKey;
  active: NavKey;
  onNavigate: (key: NavKey) => void;
}) {
  const t = useTheme();
  const isActive = active === nav;
  // Active is navy in light mode and white in dark mode.
  const color = isActive ? (t.isDark ? t.color.onNavy : t.color.navy) : t.color.navInactive;
  const Icon = ICONS[nav];

  return (
    <Pressable
      onPress={() => onNavigate(nav)}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={LABELS[nav]}
      style={styles.item}
    >
      <Icon size={21} color={color} strokeWidth={isActive ? 2 : 1.7} />
      <Text style={[t.type.navLabel, { color, marginTop: 4 }]}>{LABELS[nav]}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  // Each item fills a quarter of the remaining width; 44px minimum height.
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  fab: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fabGlyph: { zIndex: 1 },
});
