/**
 * Is there room for a desktop layout?
 *
 * Measured from the WINDOW, not from Platform.OS. A browser on a tablet, a
 * half-width window on a laptop and a phone all want the same compact chrome,
 * and asking about the platform would give two of those the wrong one. It also
 * means the desktop shell can be tested by resizing a window rather than by
 * finding another machine.
 *
 * 1024 is where the 260px sidebar stops eating the content: below it the list
 * columns start wrapping, which is worse than the bottom bar it replaced.
 */

import { useWindowDimensions } from 'react-native';

export const DESKTOP_BREAKPOINT = 1024;

export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return width >= DESKTOP_BREAKPOINT;
}
