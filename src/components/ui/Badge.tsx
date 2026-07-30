/**
 * Badge — status / condition pill. README § Colors (semantic table) and
 * § Typography (badge text 10 / 650 / +0.2), radius 8.
 *
 * Pass a tone ('assigned') or a label straight from the data
 * ('Awaiting signature') — the theme resolves the label to a tone.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type BadgeTone } from '@/theme';

export interface BadgeProps {
  label: string;
  /** Override the tone that would be derived from `label`. */
  tone?: BadgeTone;
  /** 7px leading dot, used on the dashboard KPI tiles. */
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Badge({ label, tone, dot = false, style, testID }: BadgeProps) {
  const t = useTheme();
  const c = t.badge(tone ?? label);

  return (
    <View
      testID={testID}
      style={[
        styles.badge,
        {
          backgroundColor: c.bg,
          borderColor: c.border,
          borderRadius: t.radii.badge,
        },
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: c.fg }]} /> : null}
      <Text numberOfLines={1} style={[t.type.badge, { color: c.fg }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dot: { width: 7, height: 7, borderRadius: 9 },
});
