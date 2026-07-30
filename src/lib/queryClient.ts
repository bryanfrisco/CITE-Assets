/**
 * TanStack Query setup.
 *
 * README § State Management fixes the key shapes; every scoped key carries the
 * scope array so a change to the global scope invalidates the cache on its own:
 *   ['assets', scope, query, status] · ['asset', code] · ['bast', scope]
 *   ['notifications'] · ['master', entity] · ['dashboard', scope]
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const queryKeys = {
  dashboard: (scope: string[]) => ['dashboard', scope] as const,
  assets: (scope: string[], query: string, status: string) =>
    ['assets', scope, query, status] as const,
  asset: (code: string) => ['asset', code] as const,
  bast: (scope: string[]) => ['bast', scope] as const,
  notifications: () => ['notifications'] as const,
  master: (entity: string) => ['master', entity] as const,
  locations: () => ['locations'] as const,
};
