/**
 * More — README § 7. The module list with its exact labels and sub-labels.
 * Only Settings is navigable in Phase 0; the rest land in their own phases.
 */

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeftRight,
  BarChart3,
  FileSpreadsheet,
  Grid3x3,
  QrCode,
  Settings as SettingsIcon,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react-native';

import { useTheme } from '@/theme';
import { ListCard, ListRow, Screen } from '@/components/ui';
import { useToast } from '@/store/useUiStore';
import { usePermissions } from '@/auth';

export default function MoreScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { can } = usePermissions();

  const iconProps = { size: 17, color: t.color.royal, strokeWidth: 1.7 } as const;

  // Master data and Audit log are role-gated (IMPLEMENTATION_PLAN.md § Phase 1).
  // A module with `route` is built; the rest toast the phase they land in.
  const modules: {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    phase?: string;
    route?: '/master' | '/labels' | '/transfer' | '/accounts' | '/maintenance';
  }[] = [
    {
      icon: <ArrowLeftRight {...iconProps} />,
      title: 'Movement',
      subtitle: 'Transfer history between HO and Site',
      route: '/transfer' as const,
    },
    {
      icon: <QrCode {...iconProps} />,
      title: 'Labels',
      subtitle: 'Print blank stickers and see what is issued',
      route: '/labels' as const,
    },
    {
      icon: <Wrench {...iconProps} />,
      title: 'Maintenance',
      subtitle: 'Open tickets and service records',
      route: '/maintenance' as const,
    },
    {
      icon: <BarChart3 {...iconProps} />,
      title: 'Reports & Export',
      subtitle: 'Excel and PDF with filters',
      phase: 'Phase 7',
    },
    {
      icon: <FileSpreadsheet {...iconProps} />,
      title: 'Import Excel',
      subtitle: 'Template → validate → import',
      phase: 'Phase 7',
    },
    ...(can('master.write')
      ? [
          {
            icon: <Grid3x3 {...iconProps} />,
            title: 'Master data',
            subtitle: 'Categories, brands, models, vendors',
            route: '/master' as const,
          },
        ]
      : []),
    ...(can('account.manage')
      ? [
          {
            icon: <Users {...iconProps} />,
            title: 'Accounts',
            subtitle: 'People, roles, and who can sign in',
            route: '/accounts' as const,
          },
        ]
      : []),
    ...(can('audit.view')
      ? [
          {
            icon: <ShieldCheck {...iconProps} />,
            title: 'Audit log',
            subtitle: 'Immutable record of every action',
            phase: 'Phase 1',
          },
        ]
      : []),
  ];

  return (
    <Screen>
      <Text style={[t.type.screenTitle, styles.title, { color: t.color.text }]}>More</Text>

      <ListCard>
        {modules.map((m) => (
          <ListRow
            key={m.title}
            icon={m.icon}
            title={m.title}
            subtitle={m.subtitle}
            onPress={() =>
              m.route ? router.push(m.route) : toast(`${m.title} arrives in ${m.phase}`)
            }
          />
        ))}
        <ListRow
          icon={<SettingsIcon {...iconProps} />}
          title="Settings"
          subtitle="Appearance, accounts, notifications"
          onPress={() => router.push('/settings')}
        />
      </ListCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 18 },
});
