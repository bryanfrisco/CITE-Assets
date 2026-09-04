/**
 * Screen — the standard content container.
 *
 * Applies the README § Spacing rules: 18px horizontal padding, 16px content
 * top, and 132px bottom so content always clears the floating nav and FAB.
 *
 * KEYBOARD
 * --------
 * Every form on a phone ends with the button that submits it, and that button
 * is the first thing an on-screen keyboard covers.
 *
 * The obvious fixes do not work here. Expo SDK 54+ forces edge-to-edge on
 * Android, and Android 15 makes it mandatory: under edge-to-edge the window no
 * longer SHRINKS for the keyboard, it keeps its full height and draws behind
 * it. So `softwareKeyboardLayoutMode: "resize"` has nothing to resize and
 * KeyboardAvoidingView has no height change to react to. Both were tried, and
 * the bottom of the form stayed underneath the keyboard.
 *
 * What does work is measuring the keyboard and padding by exactly that much —
 * see useKeyboardInset(). It behaves the same on both platforms and does not
 * depend on how the window is configured.
 *
 * `keyboardShouldPersistTaps="handled"` is what lets one tap both dismiss the
 * keyboard and hit the button, rather than needing two.
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
import { useKeyboardInset } from '@/lib/useKeyboardInset';

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
  /**
   * Pinned to the bottom, outside the scroll.
   *
   * For the action somebody came to the screen to perform. On a long form the
   * button that finishes it sits below everything else, so reaching it means
   * scrolling past every field — worst on the Assign wizard, where the list of
   * people is hundreds of rows long and Continue is underneath all of them.
   *
   * It rides above the keyboard rather than under it, and carries the same
   * bottom clearance the scrolling content uses so it never sits on the
   * floating nav.
   */
  footer?: ReactNode;
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
  footer,
  testID,
}: ScreenProps) {
  const t = useTheme();
  const keyboard = useKeyboardInset();

  const padding: ViewStyle = {
    paddingHorizontal: bleed ? 0 : t.spacing.screenX,
    paddingTop: t.spacing.screenTop,
    // The 132px base clears the floating nav and FAB; the keyboard height on
    // top of it is what puts the last field within reach while typing.
    paddingBottom: t.spacing.screenBottom + keyboard,
  };

  // With a footer the scrolling content stops short of it, so the last field is
  // reachable instead of hiding underneath.
  const FOOTER_CLEARANCE = 84;
  const scrollPadding: ViewStyle = footer
    ? { ...padding, paddingBottom: FOOTER_CLEARANCE + keyboard }
    : padding;

  const bar = footer ? (
    <View
      style={[
        styles.footer,
        {
          paddingHorizontal: t.spacing.screenX,
          paddingBottom: t.spacing.screenBottom + keyboard,
          backgroundColor: t.color.bg,
          borderTopColor: t.color.line,
        },
      ]}
    >
      {footer}
    </View>
  ) : null;

  if (!scroll) {
    return (
      <View testID={testID} style={[styles.fill, { backgroundColor: t.color.bg }, style]}>
        <View style={[padding, styles.fill, contentStyle]}>{children}</View>
        {bar}
      </View>
    );
  }

  if (footer) {
    return (
      <View style={[styles.fill, { backgroundColor: t.color.bg }, style]}>
        <ScrollView
          testID={testID}
          style={styles.fill}
          contentContainerStyle={[scrollPadding, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {children}
        </ScrollView>
        {bar}
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
      keyboardDismissMode="interactive"
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
  footer: { paddingTop: 10, borderTopWidth: 1 },
});
