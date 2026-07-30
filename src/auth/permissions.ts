/**
 * Permission matrix — IMPLEMENTATION_PLAN.md § Phase 1, transcribed exactly.
 *
 *                    Super Admin   Corporate IT   Site IT          Viewer
 *  View assets       all           all            own location     own location
 *  Create/edit       ✓             ✓              ✓ (own location) —
 *  Delete asset      ✓             —              —                —
 *  Assign / return   ✓             ✓              ✓                —
 *  Movement          ✓             ✓              ✓                —
 *  Generate/upload   ✓             ✓              ✓                —
 *  Master data       ✓ incl delete ✓ no delete    —                —
 *  Accounts          ✓             —              —                —
 *  Audit log         ✓             ✓              —                —
 *
 * This table hides UI. It is NOT the security boundary — RLS in migration
 * 0002 is (DATABASE.md §10). Both must agree; the RLS test in
 * tests/rls-site-it.mjs proves the database half.
 */

import type { UserRole } from '@/store/useSessionStore';

export type Permission =
  | 'asset.view'
  | 'asset.create'
  | 'asset.edit'
  | 'asset.delete'
  | 'asset.editCode'
  | 'assignment.write'
  | 'movement.write'
  | 'bast.write'
  | 'master.write'
  | 'master.delete'
  | 'account.manage'
  | 'audit.view';

const MATRIX: Record<UserRole, Permission[]> = {
  super_admin: [
    'asset.view',
    'asset.create',
    'asset.edit',
    'asset.delete',
    // README § Interactions: "only Super Admin can delete master data or edit
    // an asset code".
    'asset.editCode',
    'assignment.write',
    'movement.write',
    'bast.write',
    'master.write',
    'master.delete',
    'account.manage',
    'audit.view',
  ],
  corporate_it: [
    'asset.view',
    'asset.create',
    'asset.edit',
    'assignment.write',
    'movement.write',
    'bast.write',
    'master.write',
    'audit.view',
  ],
  site_it: [
    'asset.view',
    'asset.create',
    'asset.edit',
    'assignment.write',
    'movement.write',
    'bast.write',
  ],
  viewer: ['asset.view'],
};

export function roleHas(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role].includes(permission);
}

/**
 * Site IT may only create or edit assets at its own location — the row-level
 * half of "✓ (own location)". RLS enforces it; this mirrors it in the UI so a
 * Site IT user is never offered a location they cannot write to.
 */
export function canWriteAtLocation(
  role: UserRole | null | undefined,
  userLocationId: string | null,
  targetLocationId: string | null,
): boolean {
  if (!roleHas(role, 'asset.edit')) return false;
  if (role === 'super_admin' || role === 'corporate_it') return true;
  return Boolean(userLocationId) && userLocationId === targetLocationId;
}
