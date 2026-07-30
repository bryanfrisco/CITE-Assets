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
}

export function PickerSheet({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onDismiss,
  emptyMessage = 'No records yet',
}: PickerSheetProps) {
  const t = useTheme();

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title={title}>
      {options.length === 0 ? (
        <Text style={[t.type.meta, styles.empty, { color: t.color.sub }]}>{emptyMessage}</Text>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
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
                    borderTopWidth: i === 0 ? 0 : 1,
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
