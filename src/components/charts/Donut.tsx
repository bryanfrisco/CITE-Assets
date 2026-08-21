/**
 * The category donut, drawn with stroke-dasharray on concentric circles.
 *
 * Rotated −90° so the first segment starts at twelve o'clock. A chart that
 * begins at three o'clock reads as though something is missing from the top.
 *
 * Lifted out of the Home screen unchanged when Reports needed the same chart.
 * Two copies of a chart drift — one gets a legend, the other gets a new colour
 * — and then the same number looks different on two screens.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/theme';
import { donutSegments, type NamedCount } from '@/api/dashboard';

export interface DonutProps {
  data: NamedCount[];
  /** Word under the total in the middle. */
  centreLabel?: string;
}

export function Donut({ data, centreLabel = 'TOTAL' }: DonutProps) {
  const t = useTheme();
  const { segments, total } = donutSegments(data);

  const radius = t.sizes.donutRadius;
  const stroke = t.sizes.donutStroke;
  const size = (radius + stroke) * 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <View style={styles.donutRow}>
      <View>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={t.color.soft}
            strokeWidth={stroke}
            fill="none"
          />
          {total > 0
            ? segments.map((s) => {
                const length = (s.count / total) * circumference;
                const element = (
                  <Circle
                    key={s.name}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={s.color}
                    strokeWidth={stroke}
                    fill="none"
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={-offset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  />
                );
                offset += length;
                return element;
              })
            : null}
        </Svg>

        <View style={[styles.donutCentre, { width: size, height: size }]} pointerEvents="none">
          <Text style={[t.type.kpiNumber, { color: t.color.text }]}>{total}</Text>
          <Text style={[t.type.kpiLabel, { color: t.color.sub }]}>{centreLabel}</Text>
        </View>
      </View>

      <View style={styles.legend}>
        {segments.map((s) => (
          <View key={s.name} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text
              numberOfLines={1}
              style={[t.type.meta, styles.legendName, { color: t.color.sub }]}
            >
              {s.name}
            </Text>
            <Text style={[t.type.metaStrong, { color: t.color.text }]}>{s.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  donutCentre: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: { flex: 1, gap: 7 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 8, height: 8, borderRadius: 8 },
  legendName: { flex: 1, minWidth: 0 },
});
