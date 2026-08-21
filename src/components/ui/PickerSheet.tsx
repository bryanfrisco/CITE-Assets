/**
 * PickerSheet — the selection surface behind every SelectField.
 *
 * Composed from BottomSheet so it inherits the design's backdrop, radius and
 * 240ms motion rather than introducing a second sheet style.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { BottomSheet } from './BottomSheet';

export interface PickerOption {
  id: string;
  name: string;
  detail?: string | null;
}

export interface PickerSheetProps {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedId?: string | null;
  onSelect: (option: PickerOption) => void;
  onDismiss: () => void;
  /** Copy shown when there is nothing to pick — usually a master data hint. */
  emptyMessage?: string;
  /**
   * Renders a first row that clears the selection, e.g. `All categories`.
   *
   * Without it the only way to undo a filter is the small × on the pill that
   * opened this sheet, which is easy to miss — the sheet is where people look
   * for the choice they made, so it is where "no choice" belongs too. Selecting
   * it calls `onClear`; omit both and the row is not rendered at all.
   */
  clearLabel?: string;
  onClear?: () => void;
}

export function PickerSheet({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onDismiss,
  emptyMessage = 'No records yet',
  clearLabel,
  onClear,
}: PickerSheetProps) {
  const t = useTheme();
  const showClear = Boolean(clearLabel && onClear);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title={title}>
      {options.length === 0 && !showClear ? (
        <Text style={[t.type.meta, styles.empty, { color: t.color.sub }]}>{emptyMessage}</Text>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {showClear ? (
            <Pressable
              onPress={() => {
                onClear!();
                onDismiss();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: !selectedId }}
              accessibilityLabel={clearLabel}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? t.color.soft : 'transparent' },
              ]}
            >
              <View style={styles.rowText}>
                <Text style={[t.type.body, { color: t.color.text }]}>{clearLabel}</Text>
              </View>
              {!selectedId ? <Check size={17} color={t.color.royal} strokeWidth={2.2} /> : null}
            </Pressable>
          ) : null}
          {options.map((option, i) => {
            const selected = option.id === selectedId;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  onSelect(option);
                  onDismiss();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={option.name}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderTopWidth: i === 0 && !showClear ? 0 : 1,
                    borderTopColor: t.color.line,
                    backgroundColor: pressed ? t.color.soft : 'transparent',
                  },
                ]}
              >
                <View style={styles.rowText}>
                  <Text style={[t.type.body, { color: t.color.text }]}>{option.name}</Text>
                  {option.detail ? (
                    <Text style={[t.type.meta, { color: t.color.sub, marginTop: 2 }]}>
                      {option.detail}
                    </Text>
                  ) : null}
                </View>
                {selected ? <Check size={17} color={t.color.royal} strokeWidth={2.2} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 340 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, minHeight: 44 },
  rowText: { flex: 1, minWidth: 0 },
  empty: { paddingVertical: 18, textAlign: 'center' },
});
