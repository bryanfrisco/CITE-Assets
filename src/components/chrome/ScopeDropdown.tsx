/**
 * ScopeDropdown — README § Global Chrome:
 * "Tapping opens a dropdown (absolute, 18px insets, top 98px) listing each
 *  location with a 22px checkbox (royal when checked), name, and meta
 *  (`Jakarta · 812 assets`…), plus the footer note: 'Dashboard, Assets, BAST,
 *  Documents and Reports all follow this scope.' Selection is multi-select."
 *
 * Motion: rise — 220ms, translateY(10) → 0.
 */

import React, { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { useScopeStore } from '@/store/useScopeStore';

export interface ScopeDropdownProps {
  visible: boolean;
  onDismiss: () => void;
}

export function ScopeDropdown({ visible, onDismiss }: ScopeDropdownProps) {
  const t = useTheme();
  const locations = useScopeStore((s) => s.locations);
  const scope = useScopeStore((s) => s.scope);
  const toggle = useScopeStore((s) => s.toggle);
  // Lazy state rather than a ref: the animated value must survive re-renders
  // without being read from a ref during render.
  const [rise] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(rise, {
      toValue: visible ? 1 : 0,
      duration: t.motion.rise.duration,
      easing: t.motion.rise.easing,
      useNativeDriver: true,
    }).start();
  }, [visible, rise, t.motion.rise]);

  if (!visible) return null;

  const translateY = rise.interpolate({
    inputRange: [0, 1],
    outputRange: [t.motion.rise.offset, 0],
  });

  return (
    <>
      {/* Tapping anywhere outside closes the dropdown. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Close data scope"
      />

      <Animated.View
        style={[
          styles.dropdown,
          {
            top: t.sizes.scopeDropdownTop,
            left: t.sizes.scopeDropdownInset,
            right: t.sizes.scopeDropdownInset,
            backgroundColor: t.color.card,
            borderColor: t.color.line,
            borderRadius: t.radii.listContainer,
            opacity: rise,
            transform: [{ translateY }],
          },
          t.shadow.nav,
        ]}
      >
        <Text style={[t.type.sectionLabel, styles.title, { color: t.color.sub }]}>
          Global data scope
        </Text>

        {locations.map((location, i) => {
          const checked = scope.includes(location.id);
          return (
            <Pressable
              key={location.id}
              onPress={() => toggle(location.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={`${location.name}, ${location.meta}`}
              style={({ pressed }) => [
                styles.row,
                {
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: t.color.line,
                  backgroundColor: pressed ? t.color.soft : 'transparent',
                },
              ]}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    width: t.sizes.scopeCheckbox,
                    height: t.sizes.scopeCheckbox,
                    borderRadius: 7,
                    backgroundColor: checked ? t.color.royal : 'transparent',
                    borderColor: checked ? t.color.royal : t.color.line,
                  },
                ]}
              >
                {checked ? <Check size={14} color={t.color.onNavy} strokeWidth={2.6} /> : null}
              </View>

              <View style={styles.rowText}>
                <Text style={[t.type.body, { color: t.color.text }]}>{location.name}</Text>
                <Text style={[t.type.meta, { color: t.color.sub, marginTop: 2 }]}>
                  {location.meta}
                </Text>
              </View>
            </Pressable>
          );
        })}

        <View style={[styles.footer, { borderTopColor: t.color.line }]}>
          <Text style={[t.type.meta, { color: t.color.sub }]}>
            Dashboard, Assets, E-BAST, Documents and Reports all follow this scope.
          </Text>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  dropdown: { position: 'absolute', borderWidth: 1, overflow: 'hidden' },
  title: { paddingHorizontal: 14, paddingTop: 13, paddingBottom: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, minHeight: 44 },
  checkbox: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  rowText: { flex: 1, minWidth: 0 },
  footer: { borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
});
