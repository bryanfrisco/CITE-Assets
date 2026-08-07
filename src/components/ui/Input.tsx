/**
 * Input — README § Add Asset: "44px inputs, radius 13, 11.5/600 `sub` labels".
 *
 * Error state (README § Assign wizard): the field border turns #E0393E and a
 * helper line appears beneath it.
 */

import React, { forwardRef, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Red border + helper text. Pass the message, not just a boolean. */
  error?: string | null;
  /** Neutral helper shown when there is no error. */
  helper?: string;
  /** Leading adornment — the magnifier on the Assets search field. */
  icon?: ReactNode;
  /** Trailing adornment — the clear (×) button. */
  accessory?: ReactNode;
  /** Search fields are 42px; form fields are 44px. */
  size?: 'search' | 'field';
  required?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    error,
    helper,
    icon,
    accessory,
    size = 'field',
    required = false,
    containerStyle,
    ...props
  },
  ref,
) {
  const t = useTheme();
  const hasError = Boolean(error);
  const height = size === 'search' ? t.sizes.searchField : 44;
  const radius = size === 'search' ? t.radii.inputLarge : t.radii.input;
  const multiline = props.multiline ?? false;

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
            minHeight: multiline ? 92 : height,
            borderRadius: radius,
            backgroundColor: t.color.soft,
            borderColor: hasError ? t.color.error : t.color.line,
            alignItems: multiline ? 'flex-start' : 'center',
            paddingVertical: multiline ? 11 : 0,
          },
        ]}
      >
        {icon}
        <TextInput
          ref={ref}
          {...props}
          style={[t.type.bodySmall, styles.input, { color: t.color.text }]}
          placeholderTextColor={t.color.sub}
          accessibilityLabel={label ?? props.placeholder}
        />
        {accessory}
      </View>

      {hasError || helper ? (
        <Text
          style={[t.type.meta, styles.helper, { color: hasError ? t.color.error : t.color.sub }]}
        >
          {error ?? helper}
        </Text>
      ) : null}
    </View>
  );
});

/**
 * A read-only field that opens a picker — used wherever the design shows a
 * select (Department, Location, Reason…). Styled identically to Input.
 */
export function SelectField({
  label,
  value,
  placeholder,
  onPress,
  error,
  /** Neutral note under the field, shown when there is no error — same as Input. */
  helper,
  required = false,
  accessory,
  containerStyle,
}: {
  label?: string;
  value?: string | null;
  placeholder?: string;
  onPress?: () => void;
  error?: string | null;
  helper?: string;
  required?: boolean;
  accessory?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const hasError = Boolean(error);
  const filled = Boolean(value);

  return (
    <View style={containerStyle}>
      {label ? (
        <Text style={[t.type.fieldLabel, styles.label, { color: t.color.sub }]}>
          {label}
          {required ? <Text style={{ color: t.color.error }}> *</Text> : null}
        </Text>
      ) : null}

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
        style={({ pressed }) => [
          styles.field,
          {
            minHeight: 44,
            alignItems: 'center',
            borderRadius: t.radii.input,
            backgroundColor: t.color.soft,
            borderColor: hasError ? t.color.error : t.color.line,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[t.type.bodySmall, styles.input, { color: filled ? t.color.text : t.color.sub }]}
        >
          {value || placeholder}
        </Text>
        {accessory}
      </Pressable>

      {hasError ? (
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
    gap: 9,
    paddingHorizontal: 13,
    borderWidth: 1,
  },
  input: { flex: 1, padding: 0 },
  helper: { marginTop: 5, marginLeft: 2 },
});
