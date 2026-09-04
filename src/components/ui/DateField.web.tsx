/**
 * DateField, on the web.
 *
 * `@react-native-community/datetimepicker` has no web build at all, so the
 * phone version of this file does not merely look wrong in a browser — it
 * fails to resolve, and every screen with a date on it goes down with it.
 * Assign, Return, maintenance, licence expiry and both imports all have one.
 *
 * Metro picks this file over DateField.tsx on web automatically, which is why
 * the props are identical down to the names: no caller knows there are two.
 *
 * WHY THE BROWSER'S OWN INPUT
 * ---------------------------
 * `<input type="date">` already knows the reader's locale, keyboard entry,
 * screen readers and the min/max clamp. Anything hand-drawn here would be a
 * worse calendar that also has to be maintained. It reads and writes
 * `YYYY-MM-DD` natively, which is exactly what the database columns hold, so
 * there is no conversion to get wrong either.
 *
 * The chrome around it — label, helper, error, the ruled box — is copied from
 * the phone version so a form does not change shape between platforms.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CalendarDays, X } from 'lucide-react-native';

import { useTheme } from '@/theme';
import type { DateFieldProps } from './DateField';

export type { DateFieldProps };

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
  const hasError = Boolean(error);

  return (
    <View style={containerStyle}>
      {label ? (
        <Text style={[t.type.fieldLabel, styles.label, { color: t.color.sub }]}>
          {label}
          {required ? <Text style={{ color: t.color.error }}> *</Text> : null}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          {
            borderRadius: t.radii.inputLarge,
            borderColor: hasError ? t.color.error : t.color.line,
            backgroundColor: t.color.card,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        <CalendarDays size={16} color={t.color.sub} strokeWidth={1.8} />

        <input
          type="date"
          value={value ?? ''}
          disabled={disabled}
          min={minimum ?? undefined}
          max={maximum ?? undefined}
          aria-label={label ?? placeholder}
          // An empty input reports '', which is a cleared date rather than an
          // empty string the callers would have to interpret.
          onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: value ? t.color.text : t.color.sub,
            // Matching t.type.body rather than inheriting: this is a DOM node,
            // so the React Native text styles never reach it.
            fontSize: 15,
            fontFamily: 'Inter, system-ui, sans-serif',
            padding: 0,
          }}
        />

        {value && clearable && !disabled ? (
          <Text
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label ?? 'date'}`}
            onPress={() => onChange(null)}
            style={styles.clear}
          >
            <X size={15} color={t.color.sub} strokeWidth={2} />
          </Text>
        ) : null}
      </View>

      {error ? (
        <Text style={[t.type.meta, styles.helper, { color: t.color.error }]}>{error}</Text>
      ) : helper ? (
        <Text style={[t.type.meta, styles.helper, { color: t.color.sub }]}>{helper}</Text>
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
  helper: { marginTop: 5, marginLeft: 2, lineHeight: 15 },
  clear: { cursor: 'pointer' },
});
