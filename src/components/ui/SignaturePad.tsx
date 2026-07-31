/**
 * SignaturePad — sign with a finger, directly on the screen.
 *
 * The pad is always white with dark ink regardless of the app theme. It is a
 * preview of a printed document, and a signature drawn in white-on-black would
 * look nothing like the one that comes out of the printer.
 *
 * Points are captured in the normalised space described in src/lib/signature.ts
 * as they arrive, rather than in pixels and converted later, so nothing depends
 * on the pad still being the same size when the signature is submitted.
 */

import React, { useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Eraser } from 'lucide-react-native';

import { useTheme } from '@/theme';
import {
  MIN_POINT_DISTANCE,
  SIGNATURE_ASPECT,
  signaturePaths,
  type SignatureStrokes,
} from '@/lib/signature';

export interface SignaturePadProps {
  strokes: SignatureStrokes;
  onChange: (strokes: SignatureStrokes) => void;
  /** Printed under the ruled line, the way it will print on the document. */
  caption?: string;
  disabled?: boolean;
}

export function SignaturePad({ strokes, onChange, caption, disabled }: SignaturePadProps) {
  const t = useTheme();
  const [width, setWidth] = useState(0);

  const height = width / SIGNATURE_ASPECT;

  function normalise(x: number, y: number): [number, number] | null {
    if (!width) return null;
    return [clamp(x / width, 0, 1), clamp(y / width, 0, 1 / SIGNATURE_ASPECT)];
  }

  /**
   * Rebuilt every render rather than memoised behind refs.
   *
   * A gesture in progress is unaffected: React Native reads the handler off the
   * view's current props each time an event fires, so the next move already
   * sees the stroke the previous move added. Memoising it would mean reading
   * `strokes` out of a ref during render, which is exactly what the rules of
   * React tell you not to do — and here it would buy nothing but one object
   * allocation per frame.
   */
  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // Claim the gesture outright: without this the enclosing ScrollView takes
    // over the moment the finger travels vertically, and every downstroke of
    // the signature scrolls the page instead of drawing.
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,

    onPanResponderGrant: (event) => {
      const point = normalise(event.nativeEvent.locationX, event.nativeEvent.locationY);
      if (!point) return;
      onChange([...strokes, [point]]);
    },

    onPanResponderMove: (event) => {
      const point = normalise(event.nativeEvent.locationX, event.nativeEvent.locationY);
      if (!point) return;

      const stroke = strokes[strokes.length - 1];
      if (!stroke) return;

      const previous = stroke[stroke.length - 1];
      if (previous) {
        const dx = point[0] - previous[0];
        const dy = point[1] - previous[1];
        // A finger held still emits samples continuously; keeping them all
        // would triple the payload and change nothing that is visible.
        if (Math.hypot(dx, dy) < MIN_POINT_DISTANCE) return;
      }

      onChange([...strokes.slice(0, -1), [...stroke, point]]);
    },
  });

  const paths = width > 0 ? signaturePaths(strokes, width) : [];

  return (
    <View>
      <View
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={[
          styles.pad,
          {
            height: height || undefined,
            aspectRatio: height ? undefined : SIGNATURE_ASPECT,
            backgroundColor: t.paper.sheet,
            borderColor: t.color.line,
            borderRadius: t.radii.inputLarge,
          },
        ]}
        {...(disabled ? {} : responder.panHandlers)}
      >
        {/* The ruled line the signature sits on, matching the printed page. */}
        <View style={[styles.rule, { backgroundColor: t.paper.signatureLine }]} />

        {strokes.length === 0 ? (
          <Text style={[t.type.meta, styles.hint, { color: t.paper.muted }]}>
            Tanda tangan di sini
          </Text>
        ) : null}

        {width > 0 ? (
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            {paths.map((d, i) => (
              <Path
                key={i}
                d={d}
                stroke={t.paper.ink}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
          </Svg>
        ) : null}
      </View>

      <View style={styles.footer}>
        {caption ? (
          <Text numberOfLines={1} style={[t.type.meta, styles.caption, { color: t.color.sub }]}>
            {caption}
          </Text>
        ) : (
          <View style={styles.caption} />
        )}

        <Pressable
          onPress={() => onChange([])}
          disabled={disabled || strokes.length === 0}
          accessibilityRole="button"
          accessibilityLabel="Clear signature"
          hitSlop={8}
          style={styles.clear}
        >
          <Eraser
            size={13}
            color={strokes.length === 0 ? t.color.sub : t.color.royal}
            strokeWidth={1.8}
          />
          <Text
            style={[
              t.type.metaStrong,
              { color: strokes.length === 0 ? t.color.sub : t.color.royal },
            ]}
          >
            Clear
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const styles = StyleSheet.create({
  pad: { borderWidth: 1, overflow: 'hidden', justifyContent: 'center' },
  rule: { position: 'absolute', left: 18, right: 18, bottom: '22%', height: 1 },
  hint: { textAlign: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  caption: { flex: 1, minWidth: 0 },
  clear: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24 },
});
