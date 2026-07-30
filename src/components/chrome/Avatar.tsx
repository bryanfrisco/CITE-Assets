/**
 * Avatar — navy circle with initials. Used at 34 (header), 36 (assign wizard),
 * 30 (assignment history) and 48 (Settings profile).
 *
 * README § Settings: record-only accounts (can_login = false) show a grey
 * avatar instead of navy.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import { initialsOf } from '@/store/useSessionStore';

export interface AvatarProps {
  name: string;
  size?: number;
  /** Grey surface for record-only accounts. */
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Avatar({ name, size = 34, muted = false, style }: AvatarProps) {
  const t = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={name}
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: muted ? t.color.soft : t.color.navy,
          borderWidth: muted ? 1 : 0,
          borderColor: t.color.line,
        },
        style,
      ]}
    >
      <Text
        style={[
          t.type.badge,
          { color: muted ? t.color.sub : t.color.onNavy, fontSize: Math.round(size * 0.34) },
        ]}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
});
