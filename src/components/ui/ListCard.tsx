/**
 * ListCard — the rounded container that holds a run of rows with 1px `line`
 * dividers between them (README § More, § Notifications, § Settings).
 * Radius 18, no padding of its own; each row owns its padding.
 */

import React, { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { useTheme } from '@/theme';

export interface ListCardProps {
  children: ReactNode;
  /** Uppercase eyebrow rendered above the container, 11/700/+0.42. */
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ListCard({ children, label, style, testID }: ListCardProps) {
  const t = useTheme();
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <View testID={testID}>
      {label ? (
        <Text style={[t.type.sectionLabel, styles.label, { color: t.color.sub }]}>{label}</Text>
      ) : null}
      <View
        style={[
          {
            backgroundColor: t.color.card,
            borderRadius: t.radii.listContainer,
            borderWidth: 1,
            borderColor: t.color.line,
            overflow: 'hidden',
          },
          t.shadow.card,
          style,
        ]}
      >
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <View style={{ height: 1, backgroundColor: t.color.line }} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

export interface ListRowProps {
  /** 32px icon chip on the left (README § More). */
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  /** Right-hand value text, e.g. "6 types on". */
  value?: string;
  /** Replaces the chevron — a badge, a switch, anything. */
  accessory?: ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  destructive?: boolean;
  testID?: string;
}

export function ListRow({
  icon,
  title,
  subtitle,
  value,
  accessory,
  showChevron,
  onPress,
  destructive = false,
  testID,
}: ListRowProps) {
  const t = useTheme();
  const chevron = showChevron ?? Boolean(onPress);

  const content = (
    <View style={styles.row}>
      {icon ? (
        <View
          style={[
            styles.iconChip,
            {
              width: t.sizes.listIconChip,
              height: t.sizes.listIconChip,
              borderRadius: t.radii.iconChip,
              backgroundColor: t.color.soft,
            },
          ]}
        >
          {icon}
        </View>
      ) : null}

      <View style={styles.rowText}>
        <Text
          numberOfLines={1}
          style={[t.type.body, { color: destructive ? t.color.error : t.color.text }]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={[t.type.meta, { color: t.color.sub, marginTop: 2 }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {value ? <Text style={[t.type.meta, { color: t.color.sub }]}>{value}</Text> : null}
      {accessory}
      {chevron ? <ChevronRight size={18} color={t.color.sub} strokeWidth={1.7} /> : null}
    </View>
  );

  if (!onPress) return <View testID={testID}>{content}</View>;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => ({ backgroundColor: pressed ? t.color.soft : 'transparent' })}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 8, marginLeft: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    // 44px minimum hit target (README § Spacing).
    minHeight: 44,
    paddingVertical: 12,
  },
  iconChip: { alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
});
