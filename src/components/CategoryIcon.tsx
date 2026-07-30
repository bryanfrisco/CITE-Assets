/**
 * CategoryIcon — maps `categories.icon` (a Lucide name stored as data, per
 * DATABASE.md §2) onto the icon set README § Assets lists.
 *
 * A category added at runtime may carry an icon name nobody has mapped yet, so
 * this falls back to the generic box rather than rendering nothing.
 */

import React from 'react';
import {
  Box,
  Laptop,
  Monitor,
  Network,
  Printer,
  Server,
  type LucideProps,
} from 'lucide-react-native';

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  laptop: Laptop,
  monitor: Monitor,
  printer: Printer,
  server: Server,
  network: Network,
  box: Box,
};

export function CategoryIcon({
  name,
  size = 20,
  color,
  strokeWidth = 1.7,
}: {
  name?: string | null;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  const Icon = (name && ICONS[name]) || Box;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}
