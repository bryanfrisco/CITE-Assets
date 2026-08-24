/**
 * Screen — the standard content container.
 *
 * Applies the README § Spacing rules: 18px horizontal padding, 16px content
 * top, and 132px bottom so content always clears the floating nav and FAB.
 *
 * KEYBOARD
 * --------
 * Every form on a phone ends with the button that submits it, and that button
 * is the first thing an on-screen keyboard covers. Three things keep it
 * reachable, and all three are needed:
 *
 *   * KeyboardAvoidingView shrinks the scroll area on iOS;
 *   * `softwareKeyboardLayoutMode: "resize"` in app.json does the same on
 *     Android — without it the whole window pans and the bottom is simply gone;
 *   * the extra bottom padding below gives the last field somewhere to scroll
 *     to once the area has shrunk.
 *
 * `keyboardShouldPersistTaps="handled"` was already here: it is what lets one
 * tap both dismiss the keyboard and hit the button, rather than needing two.
 */

import React, { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
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
    <KeyboardAvoidingView
      style={[styles.fill, { backgroundColor: t.color.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        testID={testID}
        style={[styles.fill, style]}
        contentContainerStyle={[padding, contentStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        // iOS only, and the tidiest of the three: the scroll view learns the
        // keyboard's height by itself and insets for it.
        automaticallyAdjustKeyboardInsets
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
