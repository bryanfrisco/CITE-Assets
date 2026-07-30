/**
 * Typography — README.md § Typography.
 *
 * The prototype uses CSS weights that have no direct static font file (560,
 * 610, 620, 650, 680). Inter ships Regular/Medium/SemiBold/Bold, so each CSS
 * weight is mapped onto the nearest bundled face by `family()`. iOS falls back
 * to SF Pro via the system font when Inter has not finished loading.
 */

import { Platform, type TextStyle } from 'react-native';

export const fontFamilies = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** CSS weight → bundled Inter face. */
export function family(weight: number): string {
  if (weight >= 680) return fontFamilies.bold;
  if (weight >= 600) return fontFamilies.semibold;
  if (weight >= 500) return fontFamilies.medium;
  return fontFamilies.regular;
}

/** All numeric columns use tabular figures (README § Typography, last line). */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

function role(size: number, weight: number, letterSpacing: number, extra?: TextStyle): TextStyle {
  return {
    fontFamily: family(weight),
    fontSize: size,
    letterSpacing,
    // RN on Android ignores fontWeight when fontFamily names a static face,
    // but iOS still uses it to pick an optical variant, so keep it truthful.
    ...(Platform.OS === 'ios' ? { fontWeight: String(weight) as TextStyle['fontWeight'] } : null),
    ...extra,
  };
}

export const type = {
  /** Screen title — "Assets", "Settings". 22 / 680 / −0.6 */
  screenTitle: role(22, 680, -0.6, { lineHeight: 27 }),
  /** App name in the header. 16 / 650 / −0.35 */
  appName: role(16, 650, -0.35, { lineHeight: 19 }),
  /** App subtitle "IT ASSET MANAGEMENT". 10.5 / 500 uppercase / +0.28 */
  appSubtitle: role(10.5, 500, 0.28, { lineHeight: 13, textTransform: 'uppercase' }),
  /** Card / section heading. 13.5 / 650 / −0.2 */
  cardHeading: role(13.5, 650, -0.2, { lineHeight: 17 }),
  /** Uppercase eyebrow above a section. 11 / 700 uppercase / +0.42 */
  sectionLabel: role(11, 700, 0.42, { lineHeight: 14, textTransform: 'uppercase' }),
  /** KPI tile label. 9.5 / 650 uppercase / +0.34 */
  kpiLabel: role(9.5, 650, 0.34, { lineHeight: 12, textTransform: 'uppercase' }),
  /** KPI value. 22 / 680 tabular / −0.9 */
  kpiNumber: role(22, 680, -0.9, { lineHeight: 26, ...tabular }),
  /** Hero number — warranty "23". 34 / 700 / −1.4 */
  heroNumber: role(34, 700, -1.4, { lineHeight: 39, ...tabular }),
  /** Primary list / body text. 13.5 / 600 / −0.15 */
  body: role(13.5, 600, -0.15, { lineHeight: 17 }),
  /** Slightly smaller body — key/value values, tile labels. 12.5 / 560 / −0.15 */
  bodySmall: role(12.5, 560, -0.15, { lineHeight: 16 }),
  /** Asset name on Asset Detail. 19 / 670 */
  detailTitle: role(19, 670, -0.4, { lineHeight: 23 }),
  /** Timeline event title. 13 / 640 */
  timelineTitle: role(13, 640, -0.15, { lineHeight: 16 }),
  /** Secondary / meta line. 11.5 / 400 / 0 */
  meta: role(11.5, 400, 0, { lineHeight: 15 }),
  /** Meta with emphasis — field labels, holder line. 11 / 520 / 0 */
  metaStrong: role(11, 520, 0, { lineHeight: 14 }),
  /** Form field label. 11.5 / 600 */
  fieldLabel: role(11.5, 600, 0, { lineHeight: 14 }),
  /** Asset code — always royal, always tabular. 10.5 / 700 / +0.5 */
  assetCode: role(10.5, 700, 0.5, { lineHeight: 13, ...tabular }),
  /** Badge text. 10 / 650 / +0.2 */
  badge: role(10, 650, 0.2, { lineHeight: 12 }),
  /** Bottom-nav label. 9.5 / 620 / +0.1 */
  navLabel: role(9.5, 620, 0.1, { lineHeight: 12 }),
} as const;

export type TypeRole = keyof typeof type;
