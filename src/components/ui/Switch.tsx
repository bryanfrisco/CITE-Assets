/**
 * Switch — README § Motion: "toggle | 180ms | switch knob + track".
 *
 * Built on Animated rather than the platform Switch so the track and knob use
 * the design's navy/line colours on both platforms.
 */

import React, { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

const TRACK_W = 46;
const TRACK_H = 28;
const KNOB = 22;
const PAD = 3;

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Row label, e.g. "Dark mode" or "Can sign in". */
  label?: string;
  /** Sub-label that usually reflects the current state. */
  description?: string;
  disabled?: boolean;
  testID?: string;
}

export function Switch({
  value,
  onValueChange,
  label,
  description,
  disabled = false,
  testID,
}: SwitchProps) {
  const t = useTheme();
  const [progress] = useState(() => new Animated.Value(value ? 1 : 0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: t.motion.toggle.duration,
      easing: t.motion.toggle.easing,
      // Colour interpolation is not supported by the native driver.
      useNativeDriver: false,
    }).start();
  }, [value, progress, t.motion.toggle]);

  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [t.color.line, t.color.navy],
  });
  const knobX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [PAD, TRACK_W - KNOB - PAD],
  });

  const control = (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : () => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View
          style={[
            styles.knob,
            {
              backgroundColor: t.color.card,
              shadowColor: t.color.shadowInk,
              transform: [{ translateX: knobX }],
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );

  if (!label) return control;

  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={[t.type.body, { color: t.color.text }]}>{label}</Text>
        {description ? (
          <Text style={[t.type.meta, { color: t.color.sub, marginTop: 2 }]}>{description}</Text>
        ) : null}
      </View>
      {control}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: TRACK_W, height: TRACK_H, borderRadius: TRACK_H / 2, justifyContent: 'center' },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  text: { flex: 1, minWidth: 0 },
});
