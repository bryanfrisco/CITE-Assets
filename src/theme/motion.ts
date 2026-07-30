/**
 * Motion — README.md § Motion. Every animation in the app pulls its duration
 * and easing from here; no component invents a timing.
 */

import { Easing } from 'react-native';

export const motion = {
  /** Screen and tab-content changes. 180–200ms ease */
  fade: { duration: 190, easing: Easing.ease },
  /** Toast, scope dropdown, success state, inline forms. 200–250ms, translateY(10) → 0 */
  rise: { duration: 220, easing: Easing.ease, offset: 10 },
  /** FAB quick-action sheet. 240ms cubic-bezier(.22,.9,.3,1), translateY(100%) → 0 */
  sheet: { duration: 240, easing: Easing.bezier(0.22, 0.9, 0.3, 1) },
  /** Skeleton shimmer. 1.2s linear infinite, 320px gradient sweep */
  shimmer: { duration: 1200, easing: Easing.linear, sweep: 320 },
  /** Switch knob + track. 180ms */
  toggle: { duration: 180, easing: Easing.ease },
} as const;

/** README § Interactions — Home and Assets show skeletons for 620–700ms. */
export const SKELETON_MS = 620;

/** README § Global chrome — toast auto-dismiss. */
export const TOAST_MS = 2400;
