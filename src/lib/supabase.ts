/**
 * Supabase client.
 *
 * Session storage uses AsyncStorage rather than SecureStore so the same client
 * works on web (Metro's web target) during development. Phase 1 revisits this
 * when real auth lands.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** False until .env carries a project — Phase 0 renders without a backend. */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured && __DEV__) {
  console.warn(
    '[CITE Assets] EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY are not set. ' +
      'Copy .env.example to .env — see README-DEV.md.',
  );
}

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'anon', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // React Native has no URL bar to parse a session out of.
    detectSessionInUrl: false,
  },
});
