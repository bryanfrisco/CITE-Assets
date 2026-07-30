/**
 * ToastHost — renders the single toast instance above everything and owns the
 * 2400ms auto-dismiss (README § Global Chrome). Mounted once, in the root
 * layout; screens call `useToast()` rather than rendering <Toast> themselves.
 */

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Toast } from '@/components/ui';
import { useTheme } from '@/theme';
import { useUiStore } from '@/store/useUiStore';

export function ToastHost() {
  const t = useTheme();
  const toast = useUiStore((s) => s.toast);
  const hideToast = useUiStore((s) => s.hideToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(hideToast, t.durations.toast);
    // A new toast replaces the old one, so the previous timer is cleared here.
    return () => clearTimeout(timer);
  }, [toast, hideToast, t.durations.toast]);

  if (!toast) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Toast message={toast.message} variant={toast.variant} nonce={toast.nonce} />
    </View>
  );
}
