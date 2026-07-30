/**
 * Skeleton — README § Motion: "shimmer | 1.2s linear infinite, 320px gradient
 * sweep", and § Dashboard: 82px KPI tiles / 92px asset rows for 620–700ms.
 */

import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/theme';

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 16, radius, style }: SkeletonProps) {
  const t = useTheme();
  const sweep = t.motion.shimmer.sweep;
  const [shift] = useState(() => new Animated.Value(-sweep));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(shift, {
        toValue: sweep,
        duration: t.motion.shimmer.duration,
        easing: t.motion.shimmer.easing,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [shift, sweep, t.motion.shimmer]);

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius ?? t.radii.iconChip,
          backgroundColor: t.color.soft,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateX: shift }] }]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={['transparent', t.color.line, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: sweep, height: '100%' }}
        />
      </Animated.View>
    </View>
  );
}

/** The 3×2 grid of 82px tiles shown on Home while the dashboard loads. */
export function SkeletonKpiGrid() {
  const t = useTheme();
  return (
    <View style={styles.grid}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton
          key={i}
          height={t.sizes.skeletonKpi}
          radius={t.radii.kpiTile}
          style={styles.gridItem}
        />
      ))}
    </View>
  );
}

/** The 92px rows shown while the Assets list loads. */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.cardGapTight }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={t.sizes.skeletonRow} radius={t.radii.card} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  // Three columns with two 9px gaps.
  gridItem: { width: '31.5%', flexGrow: 1 },
});
