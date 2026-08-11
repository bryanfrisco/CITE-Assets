/**
 * theme.ts — the assembled theme object consumed through `useTheme()`.
 *
 * Composes tokens.ts (colour), typography.ts, layout.ts and motion.ts into one
 * value per mode, with the mode-dependent pieces (shadows, badge foreground,
 * nav inactive glyph) already resolved so components never branch on the mode
 * themselves.
 */

import {
  badgeForegroundDark,
  badgeToneByLabel,
  badgeTones,
  goldBadgeForegroundDark,
  chartColors,
  documentChipColors,
  fixed,
  gradients,
  palette,
  paperColors,
  viewerColors,
  timelineColors,
  uploadColors,
  type BadgeTone,
  type ThemeMode,
} from './tokens';
import { type } from './typography';
import { radii, shadows, sizes, spacing } from './layout';
import { SKELETON_MS, TOAST_MS, motion } from './motion';

export interface BadgeColors {
  bg: string;
  fg: string;
  border: string;
}

export interface Theme {
  mode: ThemeMode;
  isDark: boolean;

  color: {
    bg: string;
    card: string;
    soft: string;
    line: string;
    text: string;
    sub: string;
    navy: string;
    royal: string;
    gold: string;
    error: string;
    success: string;
    amber: string;
    neutral: string;
    navInactive: string;
    toastBg: string;
    backdrop: string;
    selectionRing: string;
    unreadWash: string;
    /** Text that sits on top of a navy surface. */
    onNavy: string;
    /** Text on a permanently dark surface such as the toast. */
    onDark: string;
    /** Drop-shadow ink. */
    shadowInk: string;
    /** Gold-tinted button on the navy warranty card. */
    goldButtonBg: string;
    goldButtonBorder: string;
    goldButtonText: string;
  };

  /** Resolve a badge tone, or a status label such as "Awaiting signature". */
  badge: (toneOrLabel: BadgeTone | string) => BadgeColors;

  gradients: typeof gradients;
  type: typeof type;
  spacing: typeof spacing;
  radii: typeof radii;
  sizes: typeof sizes;
  motion: typeof motion;
  chart: typeof chartColors;
  timeline: typeof timelineColors;
  documentChip: typeof documentChipColors;
  /** The BAST paper preview — fixed in both modes; it is a printed document. */
  paper: typeof paperColors;
  /** The full-screen photo viewer — also fixed in both modes. */
  viewer: typeof viewerColors;
  upload: typeof uploadColors;

  /** Shadows already bound to the current mode. */
  shadow: {
    card: ReturnType<typeof shadows.card>;
    nav: ReturnType<typeof shadows.nav>;
    fab: ReturnType<typeof shadows.fab>;
    paper: ReturnType<typeof shadows.paper>;
  };

  durations: {
    skeleton: number;
    toast: number;
  };
}

function isBadgeTone(value: string): value is BadgeTone {
  return value in badgeTones;
}

function buildTheme(mode: ThemeMode): Theme {
  const p = palette[mode];
  const isDark = mode === 'dark';

  return {
    mode,
    isDark,

    color: {
      bg: p.bg,
      card: p.card,
      soft: p.soft,
      line: p.line,
      text: p.text,
      sub: p.sub,
      navy: p.navy,
      royal: p.royal,
      gold: p.gold,
      error: fixed.error,
      success: fixed.successDark,
      amber: fixed.amber,
      neutral: fixed.neutral,
      navInactive: fixed.navInactive[mode],
      toastBg: fixed.toastBg,
      backdrop: fixed.backdrop,
      selectionRing: fixed.selectionRing,
      unreadWash: fixed.unreadWash,
      onNavy: fixed.white,
      onDark: fixed.onDark,
      shadowInk: fixed.shadowInk,
      goldButtonBg: fixed.goldButtonBg,
      goldButtonBorder: fixed.goldButtonBorder,
      goldButtonText: fixed.goldButtonText,
    },

    badge: (toneOrLabel) => {
      const tone: BadgeTone = isBadgeTone(toneOrLabel)
        ? toneOrLabel
        : (badgeToneByLabel[toneOrLabel] ?? 'retired');
      const base = badgeTones[tone];
      if (!isDark) return base;
      // Dark mode keeps the background and border, and collapses the
      // foreground to a single light colour (README § Colors).
      return { ...base, fg: tone === 'gold' ? goldBadgeForegroundDark : badgeForegroundDark };
    },

    gradients,
    type,
    spacing,
    radii,
    sizes,
    motion,
    chart: chartColors,
    timeline: timelineColors,
    documentChip: documentChipColors,
    paper: paperColors,
    viewer: viewerColors,
    upload: uploadColors,

    shadow: {
      card: shadows.card(mode),
      nav: shadows.nav(mode),
      fab: shadows.fab(),
      paper: shadows.paper(),
    },

    durations: {
      skeleton: SKELETON_MS,
      toast: TOAST_MS,
    },
  };
}

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');

export const themes: Record<ThemeMode, Theme> = {
  light: lightTheme,
  dark: darkTheme,
};

// BadgeTone and ThemeMode are re-exported from tokens.ts via the theme barrel;
// re-exporting them here too would be a duplicate export.
