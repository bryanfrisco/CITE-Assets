/**
 * A table, for the registers on a desktop.
 *
 * The card rows are right on a phone: one thing per row, everything that
 * matters stacked inside it. On a 1280px screen the same card shows three
 * facts and leaves the rest of the line empty, so comparing two assets means
 * opening both.
 *
 * A table answers that by putting the facts in columns somebody can run their
 * eye down. It is used ONLY above the desktop breakpoint — the phone keeps its
 * cards, and no screen has to maintain two designs by hand because both come
 * from the same rows.
 *
 * The header stays put while the body scrolls, because a column of codes with
 * no heading in sight is a column of noise.
 */

import React, { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

export interface Column<T> {
  /** Stable identity for the column; also the accessibility label prefix. */
  key: string;
  header: string;
  /** Flex weight. Two columns at 2 and 1 split three ways. */
  weight?: number;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  onRowPress?: (row: T) => void;
  /** Spoken when a row is focused; the row's own words, not "row 12". */
  labelOf?: (row: T) => string;
}

export function DataTable<T>({ columns, rows, keyOf, onRowPress, labelOf }: DataTableProps<T>) {
  const t = useTheme();

  return (
    <View
      style={[
        styles.frame,
        {
          borderRadius: t.radii.card,
          borderColor: t.color.line,
          backgroundColor: t.color.card,
        },
      ]}
    >
      <View
        style={[styles.head, { borderBottomColor: t.color.line, backgroundColor: t.color.soft }]}
      >
        {columns.map((c) => (
          <Text
            key={c.key}
            numberOfLines={1}
            style={[
              t.type.kpiLabel,
              styles.cell,
              {
                color: t.color.sub,
                flex: c.weight ?? 1,
                textAlign: c.align ?? 'left',
              },
            ]}
          >
            {c.header.toUpperCase()}
          </Text>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {rows.map((row, i) => {
          const content = columns.map((c) => (
            <View key={c.key} style={[styles.cell, { flex: c.weight ?? 1 }]}>
              {c.render(row)}
            </View>
          ));

          const frame = {
            borderBottomWidth: i === rows.length - 1 ? 0 : 1,
            borderBottomColor: t.color.line,
          };

          if (!onRowPress) {
            return (
              <View key={keyOf(row)} style={[styles.row, frame]}>
                {content}
              </View>
            );
          }

          return (
            <Pressable
              key={keyOf(row)}
              onPress={() => onRowPress(row)}
              accessibilityRole="button"
              accessibilityLabel={labelOf?.(row)}
              style={({ pressed }) => [
                styles.row,
                frame,
                { backgroundColor: pressed ? t.color.soft : 'transparent' },
              ]}
            >
              {content}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: 1, overflow: 'hidden' },
  head: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 46 },
  cell: { paddingHorizontal: 12, minWidth: 0 },
});
