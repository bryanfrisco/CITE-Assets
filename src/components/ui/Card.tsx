/**
 * Card — the base surface. README § Spacing, radii, shadows:
 * radius 17–20, 1px `line` border, two-layer shadow approximated in layout.ts.
 */

import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export interface CardProps {
  children: ReactNode;
  /**
   * 17 (default) · 18 for the warranty/section card · 20 for the detail hero ·
   * 16 for a KPI-style stat tile (README § BAST list).
   */
  radius?: 'card' | 'cardMedium' | 'cardLarge' | 'listContainer' | 'kpiTile';
  padding?: number;
  /** Section heading rendered inside the card, 13.5/650/−0.2. */
  title?: string;
  /** Right-hand accessory beside the title — usually a link or a count. */
  action?: ReactNode;
  /** Dashed border, used by empty states and upload targets. */
  dashed?: boolean;
  /** Drops the shadow — for cards nested inside another surface. */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Card({
  children,
  radius = 'card',
  padding = 14,
  title,
  action,
  dashed = false,
  flat = false,
  style,
  testID,
}: CardProps) {
  const t = useTheme();

  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: t.color.card,
          borderRadius: t.radii[radius],
          borderWidth: 1,
          borderColor: t.color.line,
          borderStyle: dashed ? 'dashed' : 'solid',
          padding,
        },
        !flat && !dashed && t.shadow.card,
        style,
      ]}
    >
      {title ? (
        <View style={styles.header}>
          <Text style={[t.type.cardHeading, { color: t.color.text }]}>{title}</Text>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
});
