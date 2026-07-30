/**
 * Toast — README § Global Chrome:
 * "16px insets, 104px from bottom, rgba(11,18,32,.94), radius 15, green check
 *  chip, auto-dismiss after 2400ms, single instance (new toast replaces the
 *  old)."
 *
 * This file is the visual component. The single-instance queue lives in
 * src/store/useUiStore.ts; ToastHost renders it once, above everything.
 */

import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Check, TriangleAlert } from 'lucide-react-native';

import { useTheme } from '@/theme';

export type ToastVariant = 'success' | 'error';

export interface ToastProps {
  message: string;
  variant?: ToastVariant;
  /** Changes whenever a new toast replaces the current one, re-running the rise. */
  nonce?: number;
}

export function Toast({ message, variant = 'success', nonce = 0 }: ToastProps) {
  const t = useTheme();
  const [rise] = useState(() => new Animated.Value(0));

  useEffect(() => {
    rise.setValue(0);
    Animated.timing(rise, {
      toValue: 1,
      duration: t.motion.rise.duration,
      easing: t.motion.rise.easing,
      useNativeDriver: true,
    }).start();
  }, [nonce, rise, t.motion.rise]);

  const translateY = rise.interpolate({
    inputRange: [0, 1],
    outputRange: [t.motion.rise.offset, 0],
  });

  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        {
          left: t.sizes.toastInset,
          right: t.sizes.toastInset,
          bottom: t.sizes.toastBottom,
          borderRadius: t.radii.toast,
          backgroundColor: t.color.toastBg,
          opacity: rise,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        style={[
          styles.chip,
          { backgroundColor: variant === 'error' ? t.color.error : t.color.success },
        ]}
      >
        {variant === 'error' ? (
          <TriangleAlert size={13} color={t.color.onNavy} strokeWidth={2} />
        ) : (
          <Check size={13} color={t.color.onNavy} strokeWidth={2.4} />
        )}
      </View>
      <Text style={[t.type.bodySmall, styles.message, { color: t.color.onDark }]} numberOfLines={2}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  chip: { width: 21, height: 21, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  // The toast surface is dark in both themes, so its text is always light.
  message: { flex: 1 },
});
