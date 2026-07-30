/**
 * usePermissions() — the hook every screen uses to decide whether to render a
 * mutating control. A Viewer must see no mutating buttons at all
 * (IMPLEMENTATION_PLAN.md § Phase 1, "Done when").
 */

import { useMemo } from 'react';

import { useSessionStore, type UserRole } from '@/store/useSessionStore';
import { canWriteAtLocation, roleHas, type Permission } from './permissions';

export interface Permissions {
  role: UserRole | null;
  can: (permission: Permission) => boolean;
  canWriteAt: (locationId: string | null) => boolean;
  /** True when the user may not mutate anything — hides every write affordance. */
  isReadOnly: boolean;
}

export function usePermissions(): Permissions {
  const account = useSessionStore((s) => s.account);
  const role = account?.role ?? null;
  const locationId = account?.locationId ?? null;

  return useMemo(
    () => ({
      role,
      can: (permission: Permission) => roleHas(role, permission),
      canWriteAt: (target: string | null) => canWriteAtLocation(role, locationId, target),
      isReadOnly: !roleHas(role, 'asset.edit'),
    }),
    [role, locationId],
  );
}
