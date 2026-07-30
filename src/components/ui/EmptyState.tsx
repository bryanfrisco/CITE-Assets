/**
 * EmptyState — README § Assets:
 * "dashed-border card, 56px icon chip, 'No assets match', 'Try a different
 *  asset code or widen the global data scope.', `Reset filters` button".
 *
 * The `error` variant satisfies working rule #4 — every list ships loading,
 * empty AND error states — without inventing a second component.
 * Empty states are icon + text only; the design uses no illustrations.
 */

import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Inbox, TriangleAlert } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { Button } from './Button';
import { Card } from './Card';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Defaults to an inbox glyph (empty) or a warning triangle (error). */
  icon?: ReactNode;
  variant?: 'empty' | 'error';
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  variant = 'empty',
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps) {
  const t = useTheme();
  const isError = variant === 'error';
  const accent = isError ? t.color.error : t.color.sub;

  return (
    <Card dashed padding={22} testID={testID} style={styles.card}>
      <View
        style={[
          styles.chip,
          {
            width: t.sizes.emptyIconChip,
            height: t.sizes.emptyIconChip,
            borderRadius: t.radii.cardMedium,
            backgroundColor: isError ? 'rgba(224,57,62,0.10)' : t.color.soft,
          },
        ]}
      >
        {icon ??
          (isError ? (
            <TriangleAlert size={24} color={accent} strokeWidth={1.7} />
          ) : (
            <Inbox size={24} color={accent} strokeWidth={1.7} />
          ))}
      </View>

      <Text style={[t.type.cardHeading, styles.title, { color: t.color.text }]}>{title}</Text>
      {description ? (
        <Text style={[t.type.meta, styles.description, { color: t.color.sub }]}>{description}</Text>
      ) : null}

      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant={isError ? 'secondary' : 'primary'}
          size="sm"
          style={styles.action}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center' },
  chip: { alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 13, textAlign: 'center' },
  description: { marginTop: 5, textAlign: 'center', maxWidth: 260 },
  action: { marginTop: 15 },
});
