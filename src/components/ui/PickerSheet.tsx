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
import { Check, Plus, Search, X } from 'lucide-react-native';

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
  /**
   * Creates a record without leaving the sheet, for the pickers backed by
   * master data.
   *
   * Master data used to be reachable only from its own screen, so registering
   * a laptop of a category nobody had entered yet meant abandoning a
   * half-filled form, going to Master data, coming back and starting again.
   * Whatever the person typed to search for the missing record is exactly the
   * name they wanted, so the "nothing matches" state offers to create it with
   * that name rather than making them type it a second time.
   *
   * Resolves to the created option, which is then selected — the person was
   * choosing something, and creating it is how they chose.
   */
  onCreate?: (name: string, code: string) => Promise<PickerOption>;
  /** The word for what gets made: "category", "brand". Used in the row's copy. */
  createLabel?: string;
  /**
   * Set when the record needs a short code as well as a name, and the row
   * grows a second field instead of being one tap.
   *
   * A category's code is not decoration: it becomes the LAP or MON in every
   * asset code filed under it, for as long as those assets exist. Guessing one
   * from the name would be a permanent decision made silently.
   */
  createCodeLabel?: string;
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
  onCreate,
  createLabel = 'record',
  createCodeLabel,
}: PickerSheetProps) {
  const t = useTheme();
  const showClear = Boolean(clearLabel && onClear);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [code, setCode] = useState('');

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
    setCreateError('');
    setCode('');
    onDismiss();
  };

  const typed = query.trim();
  // Offered only once something has been typed, and only when that something
  // is not already in the list. An "Add new" row with nothing typed would be a
  // second, emptier form; an exact match means the record already exists and
  // the row above is the answer.
  const canCreate =
    Boolean(onCreate) &&
    typed.length > 0 &&
    !options.some((o) => o.name.trim().toLowerCase() === typed.toLowerCase());

  const create = async () => {
    if (!onCreate || creating) return;
    // The server raises the same message, so a direct call cannot produce a
    // different one — but saying it here saves a round trip to be told.
    if (createCodeLabel && code.trim() === '') {
      setCreateError(`Enter a ${createLabel} code first`);
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const made = await onCreate(typed, code.trim().toUpperCase());
      onSelect(made);
      close();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : `Could not add that ${createLabel}`);
    } finally {
      setCreating(false);
    }
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

      {createError ? (
        <Text style={[t.type.meta, styles.createError, { color: t.color.error }]}>
          {createError}
        </Text>
      ) : null}

      {shown.length === 0 && !showClear ? (
        <View>
          <Text style={[t.type.meta, styles.empty, { color: t.color.sub }]}>
            {options.length === 0 ? emptyMessage : 'Nothing matches that.'}
          </Text>
          {canCreate ? createCodeLabel ? <CreateWithCode /> : <CreateRow /> : null}
        </View>
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
          {canCreate ? createCodeLabel ? <CreateWithCode /> : <CreateRow /> : null}
        </ScrollView>
      )}
    </BottomSheet>
  );

  /**
   * The row itself, declared here so both the empty state and the bottom of a
   * filtered list can use it without the props being threaded through a second
   * component.
   */
  function CreateRow() {
    return (
      <Pressable
        onPress={() => void create()}
        disabled={creating}
        accessibilityRole="button"
        accessibilityLabel={`Add ${typed} as a new ${createLabel}`}
        style={({ pressed }) => [
          styles.row,
          styles.createRow,
          { borderTopColor: t.color.line, backgroundColor: pressed ? t.color.soft : 'transparent' },
        ]}
      >
        <Plus size={16} color={t.color.royal} strokeWidth={2.2} />
        <View style={styles.rowText}>
          <Text numberOfLines={1} style={[t.type.body, { color: t.color.royal }]}>
            {creating ? `Adding “${typed}”…` : `Add “${typed}”`}
          </Text>
          <Text style={[t.type.meta, { color: t.color.sub, marginTop: 2 }]}>
            {`New ${createLabel}, saved to master data`}
          </Text>
        </View>
      </Pressable>
    );
  }

  /** The two-field version, for a record that needs a code as well. */
  function CreateWithCode() {
    return (
      <View style={[styles.createBox, { borderTopColor: t.color.line }]}>
        <Text style={[t.type.meta, { color: t.color.sub }]}>
          {`Add “${typed}” as a new ${createLabel}`}
        </Text>
        <Input
          size="search"
          value={code}
          onChangeText={(v) => {
            setCode(v.toUpperCase());
            setCreateError('');
          }}
          placeholder={createCodeLabel}
          autoCapitalize="characters"
          autoCorrect={false}
          containerStyle={styles.createCode}
        />
        <Pressable
          onPress={() => void create()}
          disabled={creating}
          accessibilityRole="button"
          accessibilityLabel={`Add ${typed} as a new ${createLabel}`}
          style={({ pressed }) => [
            styles.createConfirm,
            {
              borderColor: t.color.royal,
              borderRadius: t.radii.chip,
              backgroundColor: pressed ? t.color.soft : 'transparent',
            },
          ]}
        >
          <Plus size={15} color={t.color.royal} strokeWidth={2.2} />
          <Text style={[t.type.metaStrong, { color: t.color.royal }]}>
            {creating ? 'Adding…' : `Add ${createLabel}`}
          </Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  list: { maxHeight: 340 },
  search: { marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, minHeight: 44 },
  rowText: { flex: 1, minWidth: 0 },
  empty: { paddingVertical: 18, textAlign: 'center' },
  createRow: { borderTopWidth: 1 },
  createError: { paddingTop: 6, paddingBottom: 2 },
  createBox: { borderTopWidth: 1, paddingTop: 12, gap: 8 },
  createCode: { marginBottom: 0 },
  createConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingVertical: 10,
  },
});
