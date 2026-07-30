/**
 * Dev-only fallback session.
 *
 * Used exclusively by SessionProvider when EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY
 * are unset AND __DEV__ is true, so the chrome and theme can be reviewed before
 * a Supabase project is provisioned. It mirrors the prototype's signed-in user
 * and its two seeded locations.
 *
 * Nothing else in the app may import this.
 */

import type { BootstrapResult } from '@/api/session';
import type { ScopeLocation } from '@/store/useScopeStore';

export const DEMO_LOCATIONS: ScopeLocation[] = [
  { id: 'HO', code: 'HO', name: 'Head Office', meta: 'Jakarta · 812 assets' },
  { id: 'SITE', code: 'SITE', name: 'Site', meta: 'Konawe operations · 472 assets' },
];

export const DEMO_SESSION: BootstrapResult = {
  account: {
    id: 'demo-dewi',
    fullName: 'Dewi Lestari',
    email: 'dewi.lestari@cite.co.id',
    nik: '18930',
    department: 'Corporate IT',
    departmentId: null,
    locationId: 'HO',
    locationCode: 'HO',
    role: 'super_admin',
    canLogin: true,
  },
  allowedLocations: ['HO', 'SITE'],
  scope: ['HO', 'SITE'],
};
