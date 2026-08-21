/**
 * More — README § 7. The module list with its exact labels and sub-labels.
 *
 * Every entry now goes somewhere. There is no longer a `phase` fallback that
 * toasts "arrives later", because there is nothing left behind one.
 */

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  FileSpreadsheet,
  Grid3x3,
  QrCode,
  Settings as SettingsIcon,
  ShieldCheck,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react-native';

import { useTheme } from '@/theme';
import { ListCard, ListRow, Screen } from '@/components/ui';
import { usePermissions } from '@/auth';

export default function MoreScreen() {
  const t = useTheme();
  const router = useRouter();
  const { can } = usePermissions();

  const iconProps = { size: 17, color: t.color.royal, strokeWidth: 1.7 } as const;

  // Master data, Accounts and the Audit log are role-gated
  // (IMPLEMENTATION_PLAN.md § Phase 1). `route` is required: every module now
  // goes somewhere, so there is nothing left to toast "arrives later" about.
  const modules: {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    route:
      | '/master'
      | '/labels'
      | '/transfer'
      | '/accounts'
      | '/maintenance'
      | '/accessories'
      | '/import'
      | '/import-employees'
      | '/reports'
      | '/audit';
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
      subtitle: 'CSV and PDF with filters',
      route: '/reports' as const,
    },
    {
      icon: <Boxes {...iconProps} />,
      title: 'Accessories',
      subtitle: 'Mice, keyboards, cables — counted, not serialised',
      route: '/accessories' as const,
    },
    {
      icon: <FileSpreadsheet {...iconProps} />,
      title: 'Import assets',
      subtitle: 'Template → check → import',
      route: '/import' as const,
    },
    ...(can('account.manage')
      ? [
          {
            icon: <UserPlus {...iconProps} />,
            title: 'Import employees',
            subtitle: 'Straight from the Odoo hr.employee export',
            route: '/import-employees' as const,
          },
        ]
      : []),
    ...(can('master.write')
      ? [
          {
            icon: <Grid3x3 {...iconProps} />,
            title: 'Master data',
            subtitle: 'Categories, brands, units, companies',
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
            route: '/audit' as const,
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
            onPress={() => router.push(m.route)}
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
