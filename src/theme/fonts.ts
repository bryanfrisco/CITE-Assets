/**
 * Inter is bundled so iOS (SF Pro Display) and Android render the same
 * weights — README.md § Typography.
 *
 * The four static faces cover every CSS weight the design uses; see
 * `family()` in typography.ts for the mapping.
 */

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';

export const interFontMap = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
};

/** Returns true once every bundled face is ready to render. */
export function useInterFonts(): boolean {
  const [loaded, error] = useFonts(interFontMap);
  // A font failure must not block the app — the system face is an acceptable
  // fallback and is what iOS would use anyway.
  return loaded || error != null;
}
