/**
 * ThemeProvider — owns the light/dark mode and persists the choice per device
 * (README § Interactions: "Dark-mode switch — instant theme swap, persisted
 * per device").
 *
 * Preference values:
 *   'system' — follow the OS (the default, matching app.json
 *              userInterfaceStyle: "automatic")
 *   'light' | 'dark' — the user flipped the switch in Settings
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import { themes, type Theme } from './theme';
import type { ThemeMode } from './tokens';

const STORAGE_KEY = 'cite.theme.preference';

export type ThemePreference = 'system' | ThemeMode;

export interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  preference: ThemePreference;
  /** Settings switch — "Dark mode". */
  setDarkMode: (enabled: boolean) => void;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  // Restore the stored preference once, on mount.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored);
        }
      })
      .catch(() => {
        // A read failure just means we stay on the system default.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Persisting is best-effort; the in-memory switch has already flipped.
    });
  }, []);

  const mode: ThemeMode =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const setDarkMode = useCallback(
    (enabled: boolean) => setPreference(enabled ? 'dark' : 'light'),
    [setPreference],
  );

  const toggle = useCallback(
    () => setPreference(mode === 'dark' ? 'light' : 'dark'),
    [mode, setPreference],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: themes[mode], mode, preference, setDarkMode, setPreference, toggle }),
    [mode, preference, setDarkMode, setPreference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
