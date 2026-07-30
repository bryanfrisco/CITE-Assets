/**
 * Spacing, radii, shadows and fixed component sizes — README.md
 * § Spacing, radii, shadows, plus the per-screen measurements in § Screens.
 */

import { Platform, type ViewStyle } from 'react-native';

export const spacing = {
  /** Screen padding: 18px horizontal. */
  screenX: 18,
  /** Content top. */
  screenTop: 16,
  /** Bottom padding that clears the floating nav + FAB. */
  screenBottom: 132,
  /** Vertical rhythm between cards: 9–12px. */
  cardGapTight: 9,
  cardGap: 12,
  /** Before a new section label. */
  sectionGap: 20,
} as const;

export const radii = {
  card: 17,
  cardLarge: 20,
  /** Warranty card, KPI-adjacent panels. */
  cardMedium: 18,
  listContainer: 18,
  kpiTile: 16,
  input: 13,
  inputLarge: 14,
  button: 13,
  iconChip: 11,
  badge: 8,
  chip: 11,
  nav: 22,
  fab: 21,
  toast: 15,
  /** Bottom sheet: 26 26 0 0 */
  sheet: 26,
  /** BAST paper preview. */
  paper: 8,
} as const;

export const sizes = {
  /** Minimum hit target, everywhere. */
  hitSlop: 44,
  /** Header */
  headerTopInset: 56,
  logo: 32,
  bellButton: 34,
  avatar: 34,
  unreadDot: 7,
  /** Bottom navigation */
  navHeight: 66,
  navSideInset: 12,
  navBottomInset: 26,
  navFabGap: 64,
  /** FAB */
  fab: 60,
  fabRing: 3,
  /** Scope dropdown */
  scopeDropdownTop: 98,
  scopeDropdownInset: 18,
  scopeCheckbox: 22,
  /** Toast */
  toastInset: 16,
  toastBottom: 104,
  /** Lists & cards */
  searchField: 42,
  statusChipHeight: 32,
  categoryIconChip: 42,
  listIconChip: 32,
  emptyIconChip: 56,
  /** Avatars by context */
  avatarWizard: 36,
  avatarHistory: 30,
  avatarProfile: 48,
  /** Skeleton row heights (README § Dashboard loading). */
  skeletonKpi: 82,
  skeletonRow: 92,
  /** Bars */
  barLocation: 8,
  barDepartment: 7,
  progressWizard: 4,
  progressUpload: 6,
  /** Dashboard donut */
  donutRadius: 52,
  donutStroke: 13,
} as const;

/**
 * Shadows.
 *
 * CSS card shadow is two layers —
 *   0 1px 2px rgba(11,18,32,.05), 0 8px 24px rgba(11,18,32,.06)
 * — which React Native cannot express in one style. Each entry below keeps the
 * dominant (outer) layer and matches its visual weight; CSS blur is halved
 * because iOS `shadowRadius` is roughly half a CSS blur radius.
 */
export const shadows = {
  card: (mode: 'light' | 'dark'): ViewStyle =>
    Platform.select<ViewStyle>({
      android: { elevation: mode === 'dark' ? 2 : 3 },
      default: {
        shadowColor: mode === 'dark' ? '#000000' : '#0B1220',
        shadowOffset: { width: 0, height: mode === 'dark' ? 1 : 8 },
        shadowOpacity: mode === 'dark' ? 0.3 : 0.06,
        shadowRadius: mode === 'dark' ? 2 : 12,
      },
    }) as ViewStyle,

  /** Bottom nav: 0 12px 30px rgba(11,18,32,.14) */
  nav: (mode: 'light' | 'dark'): ViewStyle =>
    Platform.select<ViewStyle>({
      android: { elevation: 12 },
      default: {
        shadowColor: mode === 'dark' ? '#000000' : '#0B1220',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: mode === 'dark' ? 0.4 : 0.14,
        shadowRadius: 15,
      },
    }) as ViewStyle,

  /** FAB: 0 12px 26px rgba(0,7,45,.36) */
  fab: (): ViewStyle =>
    Platform.select<ViewStyle>({
      android: { elevation: 14 },
      default: {
        shadowColor: '#00072D',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.36,
        shadowRadius: 13,
      },
    }) as ViewStyle,

  /** BAST paper preview: 0 6px 18px rgba(11,18,32,.08) */
  paper: (): ViewStyle =>
    Platform.select<ViewStyle>({
      android: { elevation: 4 },
      default: {
        shadowColor: '#0B1220',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 9,
      },
    }) as ViewStyle,
} as const;
