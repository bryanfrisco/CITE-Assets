/**
 * Screen — the standard content container.
 *
 * Applies the README § Spacing rules: 18px horizontal padding, 16px content
 * top, and 132px bottom so content always clears the floating nav and FAB.
 */

import React, { type ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

export interface ScreenProps {
  children: ReactNode;
  /** Set false for screens that manage their own scrolling (e.g. FlatList). */
  scroll?: boolean;
  /** Removes the 18px horizontal padding for edge-to-edge content. */
  bleed?: boolean;
  /** Pull-to-refresh (README § Dashboard). */
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Screen({
  children,
  scroll = true,
  bleed = false,
  refreshing,
  onRefresh,
  contentStyle,
  style,
  testID,
}: ScreenProps) {
  const t = useTheme();

  const padding: ViewStyle = {
    paddingHorizontal: bleed ? 0 : t.spacing.screenX,
    paddingTop: t.spacing.screenTop,
    paddingBottom: t.spacing.screenBottom,
  };

  if (!scroll) {
    return (
      <View testID={testID} style={[styles.fill, { backgroundColor: t.color.bg }, style]}>
        <View style={[padding, styles.fill, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      testID={testID}
      style={[styles.fill, { backgroundColor: t.color.bg }, style]}
      contentContainerStyle={[padding, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing ?? false}
            onRefresh={onRefresh}
            tintColor={t.color.sub}
            colors={[t.color.royal]}
            progressBackgroundColor={t.color.card}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
