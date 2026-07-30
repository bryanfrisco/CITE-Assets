/**
 * Chip — the filter/segment pill used by the Assets status filter, the Asset
 * Detail tabs and the Master data entity picker.
 *
 * README § Assets: "Active chip = navy fill / white text; inactive = card bg,
 * `sub` text, `line` border. Height 32, radius 11."
 */

import React, { type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

export interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Chip({ label, active = false, onPress, icon, style, testID }: ChipProps) {
  const t = useTheme();

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      // 32px is the visual height; hitSlop lifts the touch target to 44px.
      hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
      style={({ pressed }) => [
        styles.chip,
        {
          height: t.sizes.statusChipHeight,
          borderRadius: t.radii.chip,
          backgroundColor: active ? t.color.navy : t.color.card,
          borderColor: active ? t.color.navy : t.color.line,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {icon}
      <Text
        numberOfLines={1}
        style={[t.type.metaStrong, { color: active ? t.color.onNavy : t.color.sub }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export interface ChipRowProps {
  children: ReactNode;
  /** Horizontally scrollable, as on the Assets status filter. */
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ChipRow({ children, scrollable = true, style }: ChipRowProps) {
  const t = useTheme();

  if (!scrollable) {
    return <View style={[styles.row, style]}>{children}</View>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Bleed to the screen edge so chips can scroll out of view naturally.
      style={{ marginHorizontal: -t.spacing.screenX }}
      contentContainerStyle={[styles.row, { paddingHorizontal: t.spacing.screenX }, style]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 13,
    borderWidth: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
