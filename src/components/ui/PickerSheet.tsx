/**
 * PickerSheet — the selection surface behind every SelectField.
 *
 * Composed from BottomSheet so it inherits the design's backdrop, radius and
 * 240ms motion rather than introducing a second sheet style.
 *
 * SEARCH
 * ------
 * Appears on its own once the list is long enough to be worth searching. The
 * employee import brought 527 people, and picking a second holder out of that
 * by scrolling is not something anybody finishes. Every picker in the app goes
 * through this component, so fixing it here fixes the company picker, the
 * accessory picker and the rest at the same time — and a two-item Location
 * picker still gets no field it does not need.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, Search, X } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { BottomSheet } from './BottomSheet';
import { Input } from './Input';

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
  /**
   * Force the search field on or off. Left alone it appears once there are
   * more rows than fit on a screen, which is the point at which scrolling
   * stops being a reasonable way to find something.
   */
  searchable?: boolean;
}

/** Long enough that scrolling is worse than typing. */
const SEARCH_THRESHOLD = 8;

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
  searchable,
}: PickerSheetProps) {
  const t = useTheme();
  const showClear = Boolean(clearLabel && onClear);
  const [query, setQuery] = useState('');

  const showSearch = searchable ?? options.length >= SEARCH_THRESHOLD;

  // Both the name and the detail line, because the detail is where the
  // department, the location and the employee number live — and those are as
  // likely to be what somebody remembers as the name itself.
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return options;
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(needle) || (o.detail ?? '').toLowerCase().includes(needle),
    );
  }, [options, query]);

  // A stale query would hide everything the next time the sheet opened.
  const close = () => {
    setQuery('');
    onDismiss();
  };

  return (
    <BottomSheet visible={visible} onDismiss={close} title={title}>
      {showSearch ? (
        <Input
          size="search"
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${options.length} ${title.toLowerCase()}…`}
          autoCapitalize="none"
          autoCorrect={false}
          icon={<Search size={17} color={t.color.sub} strokeWidth={1.8} />}
          accessory={
            query ? (
              <Pressable
                onPress={() => setQuery('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={10}
              >
                <X size={16} color={t.color.sub} strokeWidth={1.9} />
              </Pressable>
            ) : null
          }
          containerStyle={styles.search}
        />
      ) : null}

      {options.length === 0 && !showClear ? (
        <Text style={[t.type.meta, styles.empty, { color: t.color.sub }]}>{emptyMessage}</Text>
      ) : shown.length === 0 && !showClear ? (
        <Text style={[t.type.meta, styles.empty, { color: t.color.sub }]}>
          Nothing matches that.
        </Text>
      ) : (
        <ScrollView
          style={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {showClear ? (
            <Pressable
              onPress={() => {
                onClear!();
                close();
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
          {shown.map((option, i) => {
            const selected = option.id === selectedId;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  onSelect(option);
                  close();
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
  search: { marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, minHeight: 44 },
  rowText: { flex: 1, minWidth: 0 },
  empty: { paddingVertical: 18, textAlign: 'center' },
});
