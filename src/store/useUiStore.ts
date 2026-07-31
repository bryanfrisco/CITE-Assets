/**
 * Global UI state — README § State Management:
 * `theme`, `language`, `toast`, `unreadCount`.
 *
 * `theme` lives in ThemeProvider because it also needs the OS colour scheme;
 * everything else is here.
 */

import { create } from 'zustand';

import type { ToastVariant } from '@/components/ui';

export type Language = 'EN' | 'ID';

export interface ToastState {
  message: string;
  variant: ToastVariant;
  /** Increments on every show so the rise animation restarts. */
  nonce: number;
}

interface UiState {
  toast: ToastState | null;
  language: Language;
  unreadCount: number;
  /** Single instance — a new toast replaces the old one (README § Global Chrome). */
  showToast: (message: string, variant?: ToastVariant) => void;
  hideToast: () => void;
  setLanguage: (language: Language) => void;
  setUnreadCount: (count: number) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  toast: null,
  language: 'EN',
  // Placeholder until the notifications query lands in Phase 6; the prototype
  // opens with three unread items.
  // Starts at zero and is replaced by the real count as soon as the session
  // is up. A seeded number here would show a red dot on an empty inbox.
  unreadCount: 0,

  showToast: (message, variant = 'success') =>
    set({ toast: { message, variant, nonce: (get().toast?.nonce ?? 0) + 1 } }),

  hideToast: () => set({ toast: null }),

  setLanguage: (language) => set({ language }),

  setUnreadCount: (unreadCount) => set({ unreadCount }),
}));

/** Convenience hook so screens can just call `toast('Movement recorded')`. */
export function useToast() {
  return useUiStore((s) => s.showToast);
}
