/**
 * Dashboard — one round trip for the whole Home screen.
 *
 * Six separate queries would each settle at a different moment, and for a frame
 * or two the tiles would disagree with the chart underneath them. One call
 * cannot do that.
 */

import { supabase } from '@/lib/supabase';
import { chartColors } from '@/theme/tokens';

export interface StatusCount {
  name: string;
  count: number;
  /** Straight from master data, so a new status brings its own colour. */
  color: string;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface RecentEvent {
  kind: 'assigned' | 'moved' | 'registered';
  title: string;
  detail: string | null;
  at: string;
  assetCode: string;
}

export interface DashboardSummary {
  total: number;
  addedThisMonth: number;
  byStatus: StatusCount[];
  warrantyExpiring: number;
  byCategory: NamedCount[];
  byLocation: NamedCount[];
  byDepartment: NamedCount[];
  recent: RecentEvent[];
}

export async function fetchDashboard(scope: string[]): Promise<DashboardSummary> {
  const { data, error } = await supabase.rpc('dashboard_summary', { p_locations: scope });
  if (error) throw new Error(error.message);
  return data as DashboardSummary;
}

/**
 * The donut's palette. Taken from the theme's own chart tokens rather than
 * restated here: README § Dashboard names these six, and a second copy is a
 * second thing to keep in step with the design.
 *
 * Ordered largest-first by the caller, so the darkest navy always lands on the
 * biggest slice.
 */
export const CATEGORY_COLORS = [
  chartColors.laptop,
  chartColors.desktop,
  chartColors.monitor,
  chartColors.networking,
  chartColors.printer,
  chartColors.others,
];

/**
 * Collapses the tail into "Others" so the donut never has more than six
 * segments. Returns the segments and the total they add up to, which is what
 * the centre of the donut shows.
 */
export function donutSegments(
  categories: NamedCount[],
  max = 6,
): { segments: (NamedCount & { color: string })[]; total: number } {
  const total = categories.reduce((sum, c) => sum + c.count, 0);
  if (categories.length <= max) {
    return {
      segments: categories.map((c, i) => ({ ...c, color: CATEGORY_COLORS[i]! })),
      total,
    };
  }

  const head = categories.slice(0, max - 1);
  const tail = categories.slice(max - 1);
  return {
    segments: [
      ...head.map((c, i) => ({ ...c, color: CATEGORY_COLORS[i]! })),
      {
        name: 'Others',
        count: tail.reduce((sum, c) => sum + c.count, 0),
        color: CATEGORY_COLORS[max - 1]!,
      },
    ],
    total,
  };
}
