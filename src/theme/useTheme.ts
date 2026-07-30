import { useContext } from 'react';

import { ThemeContext, type ThemeContextValue } from './ThemeProvider';
import type { Theme } from './theme';

/** The only supported way for a component to read design tokens. */
export function useTheme(): Theme {
  return useThemeContext().theme;
}

/** Full context — for the Settings screen, which also writes the preference. */
export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}
