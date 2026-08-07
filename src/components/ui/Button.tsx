/**
 * Button — README § Asset Detail (primary navy + secondary), § Dashboard
 * (gold-tinted "Review list"), § Settings (destructive "Log out"),
 * § Master data (navy "Add" / "Save").
 *
 * Radius 12–14, minimum 44px hit target.
 */

import React, { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'gold' | 'destructive' | 'link';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  /** Stretches to fill the row — the default for a primary action. */
  block?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  block = false,
  disabled = false,
  loading = false,
  style,
  testID,
}: ButtonProps) {
  const t = useTheme();
  // "Review list" on the warranty card is 34px; everything else is 44px.
  const height = size === 'sm' ? 34 : 44;
  const inactive = disabled || loading;

  const surface: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: t.color.navy, borderColor: t.color.navy },
    secondary: { backgroundColor: t.color.card, borderColor: t.color.line },
    gold: { backgroundColor: t.color.goldButtonBg, borderColor: t.color.goldButtonBorder },
    destructive: { backgroundColor: t.badge('broken').bg, borderColor: t.badge('broken').border },
    link: { backgroundColor: 'transparent', borderColor: 'transparent' },
  };

  const labelColor: Record<ButtonVariant, string> = {
    primary: t.color.onNavy,
    secondary: t.color.text,
    // The gold button only ever sits on the navy warranty card.
    gold: t.color.goldButtonText,
    destructive: t.color.error,
    link: t.color.royal,
  };

  const body = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={labelColor[variant]} />
      ) : (
        <>
          {icon}
          <Text numberOfLines={1} style={[t.type.body, { color: labelColor[variant] }]}>
            {label}
          </Text>
        </>
      )}
    </>
  );

  return (
    <Pressable
      testID={testID}
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      // A 34px button still needs a 44px touch target.
      hitSlop={size === 'sm' ? { top: 5, bottom: 5, left: 0, right: 0 } : undefined}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          // `block` sets flex: 1 below, which in a COLUMN container makes the
          // main-axis basis 0 and collapses the button to its two borders — a
          // hairline. That is what the Asset actions sheet was rendering: five
          // buttons stacked, all 2px tall. minHeight is not part of the flex
          // basis, so it survives, and it changes nothing where the button was
          // already laid out correctly.
          minHeight: height,
          borderRadius: variant === 'link' ? 0 : t.radii.button,
          paddingHorizontal: variant === 'link' ? 0 : 16,
          alignSelf: block ? 'stretch' : 'flex-start',
          flex: block ? 1 : undefined,
          borderWidth: variant === 'link' ? 0 : 1,
          opacity: inactive ? 0.45 : pressed ? 0.88 : 1,
        },
        surface[variant],
        style,
      ]}
    >
      {/* The primary button carries the navy hero gradient. */}
      {variant === 'primary' ? (
        <LinearGradient
          colors={[...t.gradients.navy.colors]}
          locations={[...t.gradients.navy.locations]}
          start={t.gradients.navy.start}
          end={t.gradients.navy.end}
          style={[StyleSheet.absoluteFill, { borderRadius: t.radii.button }]}
        />
      ) : null}
      <View style={styles.content}>{body}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // zIndex keeps the label above the absolutely-positioned navy gradient.
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    zIndex: 1,
  },
});
