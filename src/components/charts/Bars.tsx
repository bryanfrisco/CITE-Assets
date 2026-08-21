/**
 * Horizontal bars — the by-location and by-department breakdowns.
 *
 * Lifted out of the Home screen unchanged when Reports needed the same chart,
 * for the same reason as the donut: two copies drift, and then the same number
 * looks different depending on which screen you are standing on.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/theme';
import type { NamedCount } from '@/api/dashboard';

export interface BarsProps {
  rows: NamedCount[];
  /** Denominator for the percentage; the bar LENGTH is scaled separately. */
  total: number;
}

export function Bars({ rows, total }: BarsProps) {
  const t = useTheme();
  // Scaled against the largest row rather than the total: with one location
  // holding 95% every other bar would be a sliver and the comparison useless.
  const largest = Math.max(...rows.map((r) => r.count), 1);

  return (
    <View style={styles.bars}>
      {rows.map((row) => (
        <View key={row.name}>
          <View style={styles.barTop}>
            <Text
              numberOfLines={1}
              style={[t.type.bodySmall, styles.barName, { color: t.color.text }]}
            >
              {row.name}
            </Text>
            <Text style={[t.type.metaStrong, { color: t.color.sub }]}>
              {`${row.count} · ${total > 0 ? Math.round((row.count / total) * 100) : 0}%`}
            </Text>
          </View>
          <View style={[styles.barTrack, { backgroundColor: t.color.soft }]}>
            <LinearGradient
              colors={[...t.gradients.bar.colors]}
              start={t.gradients.bar.start}
              end={t.gradients.bar.end}
              style={[styles.barFill, { width: `${(row.count / largest) * 100}%` }]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { gap: 13 },
  barTop: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 6 },
  barName: { flex: 1, minWidth: 0 },
  barTrack: { height: 8, borderRadius: 8, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 8 },
});
