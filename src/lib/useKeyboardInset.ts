/**
 * How much of the screen the on-screen keyboard is covering, in points.
 *
 * WHY THIS EXISTS RATHER THAN KeyboardAvoidingView
 * ------------------------------------------------
 * Expo SDK 54 and later force edge-to-edge on Android, and Android 15 makes it
 * mandatory. Under edge-to-edge the window no longer SHRINKS when the keyboard
 * appears — the app keeps its full height and simply draws behind it. So
 * `softwareKeyboardLayoutMode: "resize"` has nothing left to resize, and
 * `KeyboardAvoidingView` has no height change to react to.
 *
 * Measuring the keyboard directly works the same on both platforms and does
 * not care how the window behaves. Callers add the number to their bottom
 * padding, and the last field scrolls into reach.
 *
 * iOS uses the `Will` events so the padding animates with the keyboard rather
 * than snapping after it; Android only emits the `Did` pair.
 */

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardInset(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (e) => {
      setHeight(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
