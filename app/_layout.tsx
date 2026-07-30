/**
 * Root layout — providers and the auth route guard.
 *
 * Order matters: SafeArea → Theme → Query → Session → the navigator, with the
 * toast host mounted above everything so it floats over any screen.
 */

import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';

import { ThemeProvider, useInterFonts, useTheme } from '@/theme';
import { queryClient } from '@/lib/queryClient';
import { ToastHost } from '@/components/chrome';
import { SessionProvider } from '@/auth';
import { useSessionStore } from '@/store/useSessionStore';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <AppShell />
          </SessionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppShell() {
  const t = useTheme();
  const fontsReady = useInterFonts();
  const status = useSessionStore((s) => s.status);

  useAuthRedirect(status, fontsReady);

  // Hold the first frame until Inter is available and the session is resolved,
  // so text does not reflow and the sign-in screen never flashes for a user
  // who is already signed in.
  if (!fontsReady || status === 'loading') {
    return <View style={{ flex: 1, backgroundColor: t.color.bg }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.color.bg }}>
      <StatusBar style={t.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.color.bg },
          // README § Motion: screen changes cross-fade.
          animation: 'fade',
          animationDuration: t.motion.fade.duration,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sign-in" />
      </Stack>
      <ToastHost />
    </View>
  );
}

/** Sends signed-out users to /sign-in and signed-in users back into the app. */
function useAuthRedirect(
  status: ReturnType<typeof useSessionStore.getState>['status'],
  ready: boolean,
) {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!ready || status === 'loading') return;

    const onSignIn = segments[0] === 'sign-in';

    if (status === 'unauthenticated' && !onSignIn) {
      router.replace('/sign-in');
    } else if (status === 'authenticated' && onSignIn) {
      router.replace('/');
    }
  }, [status, ready, segments, router]);
}
