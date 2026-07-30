/**
 * BottomSheet — README § Global Chrome:
 * "Backdrop rgba(4,8,22,.42) + 3px blur; tap backdrop to dismiss",
 * radius 26 26 0 0, and README § Motion: 240ms cubic-bezier(.22,.9,.3,1),
 * translateY(100%) → 0.
 */

import React, { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

export interface BottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  testID?: string;
}

export function BottomSheet({
  visible,
  onDismiss,
  title,
  subtitle,
  children,
  testID,
}: BottomSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [slide] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: t.motion.sheet.duration,
      easing: t.motion.sheet.easing,
      useNativeDriver: true,
    }).start();
  }, [visible, slide, t.motion.sheet]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [screenH, 0] });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
      testID={testID}
    >
      <View style={styles.fill}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: slide }]}>
            <BlurView intensity={3} style={StyleSheet.absoluteFill}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: t.color.backdrop }]} />
            </BlurView>
          </Animated.View>
        </Pressable>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: t.color.card,
              borderTopLeftRadius: t.radii.sheet,
              borderTopRightRadius: t.radii.sheet,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: t.color.line }]} />
          {title ? (
            <View style={styles.header}>
              <Text style={[t.type.cardHeading, { color: t.color.text }]}>{title}</Text>
              {subtitle ? (
                <Text style={[t.type.meta, { color: t.color.sub, marginTop: 3 }]}>{subtitle}</Text>
              ) : null}
            </View>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  sheet: { paddingHorizontal: 18, paddingTop: 10 },
  grabber: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  header: { marginBottom: 14 },
});
