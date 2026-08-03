/**
 * DateField — a date, picked with the platform's own picker.
 *
 * Client instruction, 2026-08-03: "tanggal ikuti tanggal global". So the value
 * is DISPLAYED through the device's locale and picked with the device's own
 * calendar — a phone set to Indonesian gets an Indonesian calendar, and nobody
 * has to be told what order the numbers go in.
 *
 * The value handed in and out is always `YYYY-MM-DD`, which is what the
 * database columns are. Those two facts are deliberately separate: the format
 * a person reads is a preference, the format a record stores is not.
 *
 * Replaces the plain text fields that asked people to type `YYYY-MM-DD`. Those
 * worked — they were validated — but validation after the fact is a worse
 * experience than a control that cannot produce a wrong answer.
 */

import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { CalendarDays, X } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { formatDate, fromIsoDate, toIsoDate } from '@/lib/dates';

export interface DateFieldProps {
  label?: string;
  /** `YYYY-MM-DD`, or null for empty. */
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  helper?: string;
  error?: string | null;
  required?: boolean;
  /** Both `YYYY-MM-DD`. */
  minimum?: string | null;
  maximum?: string | null;
  /** Shows a × to clear an optional date. */
  clearable?: boolean;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export function DateField({
  label,
  value,
  onChange,
  placeholder = 'Choose a date',
  helper,
  error,
  required = false,
  minimum,
  maximum,
  clearable = true,
  disabled = false,
  containerStyle,
}: DateFieldProps) {
  const t = useTheme();
  const [open, setOpen] = useState(false);

  const current = fromIsoDate(value) ?? new Date();
  const hasError = Boolean(error);

  const handle = (event: DateTimePickerEvent, picked?: Date) => {
    // Android's dialog is modal and reports its own dismissal; iOS's inline
    // spinner keeps firing as it scrolls, so it is closed by the Done row below.
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed' || !picked) return;
    onChange(toIsoDate(picked));
  };

  return (
    <View style={containerStyle}>
      {label ? (
        <Text style={[t.type.fieldLabel, styles.label, { color: t.color.sub }]}>
          {label}
          {required ? <Text style={{ color: t.color.error }}> *</Text> : null}
        </Text>
      ) : null}

      <Pressable
        onPress={() => !disabled && setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
        accessibilityValue={{ text: value ? formatDate(value) : 'not set' }}
        style={({ pressed }) => [
          styles.field,
          {
            borderRadius: t.radii.inputLarge,
            borderColor: hasError ? t.color.error : t.color.line,
            backgroundColor: pressed && !disabled ? t.color.soft : t.color.card,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        <CalendarDays size={16} color={t.color.sub} strokeWidth={1.8} />

        <Text
          numberOfLines={1}
          style={[t.type.body, styles.value, { color: value ? t.color.text : t.color.sub }]}
        >
          {value ? formatDate(value) : placeholder}
        </Text>

        {value && clearable && !disabled ? (
          <Pressable
            onPress={() => onChange(null)}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label ?? 'date'}`}
            hitSlop={10}
          >
            <X size={15} color={t.color.sub} strokeWidth={2} />
          </Pressable>
        ) : null}
      </Pressable>

      {error ? (
        <Text style={[t.type.meta, styles.helper, { color: t.color.error }]}>{error}</Text>
      ) : helper ? (
        <Text style={[t.type.meta, styles.helper, { color: t.color.sub }]}>{helper}</Text>
      ) : null}

      {open ? (
        <>
          <DateTimePicker
            value={current}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handle}
            minimumDate={fromIsoDate(minimum) ?? undefined}
            maximumDate={fromIsoDate(maximum) ?? undefined}
          />
          {Platform.OS === 'ios' ? (
            <Pressable
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Done"
              style={styles.done}
            >
              <Text style={[t.type.metaStrong, { color: t.color.royal }]}>Done</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 6, marginLeft: 2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 44,
    paddingHorizontal: 13,
    borderWidth: 1,
  },
  value: { flex: 1, minWidth: 0 },
  helper: { marginTop: 5, marginLeft: 2, lineHeight: 15 },
  done: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 6, minHeight: 32 },
});
