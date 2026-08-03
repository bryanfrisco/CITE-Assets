/**
 * OfflineBanner — says so when the phone cannot reach anything.
 *
 * This app is used at Site, where coverage is patchy, and every failure without
 * it looks the same: a red toast saying a request failed. That is the wrong
 * story. "Your phone has no signal" and "the server refused this" need
 * different reactions from the person holding it, and only one of them is worth
 * retrying.
 *
 * Shown for `isInternetReachable === false` rather than `isConnected === false`.
 * A phone joined to a site Wi-Fi with no route out reports itself as connected,
 * and that is exactly the case people find confusing.
 */

import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { WifiOff } from 'lucide-react-native';

import { useTheme } from '@/theme';

export function OfflineBanner() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);
  // useState rather than useRef: the value is read during render to build the
  // style, and a ref read at that point is exactly what the rules of React
  // forbid. The initialiser runs once either way.
  const [slide] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // `isInternetReachable` is null until the first probe finishes. Treating
      // that as offline would flash the banner on every cold start.
      setOffline(state.isInternetReachable === false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: offline ? 1 : 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [offline, slide]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + 6,
          backgroundColor: t.color.error,
          opacity: slide,
          transform: [
            { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }) },
          ],
        },
      ]}
    >
      <View style={styles.row}>
        <WifiOff size={15} color={t.color.onNavy} strokeWidth={2} />
        <Text style={[t.type.metaStrong, { color: t.color.onNavy }]}>
          No connection — nothing will save until this clears
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
});
