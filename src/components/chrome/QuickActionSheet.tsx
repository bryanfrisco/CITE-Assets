/**
 * QuickActionSheet — README § Global Chrome:
 * "opens the Quick actions bottom sheet with four 2-column tiles:
 *  Add Asset · Register new equipment / Assign Asset · Handover to employee /
 *  Transfer Asset · HO ↔ Site movement / Generate BAST · Berita Acara Serah Terima"
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeftRight, FileText, Plus, QrCode, UserPlus } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { BottomSheet } from '@/components/ui';

export type QuickAction =
  'scan-label' | 'add-asset' | 'assign-asset' | 'transfer-asset' | 'generate-bast';

interface Tile {
  key: QuickAction;
  title: string;
  subtitle: string;
  Icon: typeof Plus;
}

const TILES: Tile[] = [
  // First: with labels in play, scanning is how most assets now enter the
  // register, and it is the action done standing next to the device.
  { key: 'scan-label', title: 'Scan Label', subtitle: 'Register or look up by QR', Icon: QrCode },
  { key: 'add-asset', title: 'Add Asset', subtitle: 'Register new equipment', Icon: Plus },
  { key: 'assign-asset', title: 'Assign Asset', subtitle: 'Handover to employee', Icon: UserPlus },
  {
    key: 'transfer-asset',
    title: 'Transfer Asset',
    subtitle: 'HO ↔ Site movement',
    Icon: ArrowLeftRight,
  },
  {
    key: 'generate-bast',
    title: 'Generate E-BAST',
    subtitle: 'Berita Acara Serah Terima',
    Icon: FileText,
  },
];

export interface QuickActionSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (action: QuickAction) => void;
}

export function QuickActionSheet({ visible, onDismiss, onSelect }: QuickActionSheetProps) {
  const t = useTheme();

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Quick actions">
      <View style={styles.grid}>
        {TILES.map(({ key, title, subtitle, Icon }) => (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            accessibilityRole="button"
            accessibilityLabel={`${title}. ${subtitle}`}
            style={({ pressed }) => [
              styles.tile,
              {
                borderRadius: t.radii.cardMedium,
                backgroundColor: t.color.soft,
                borderColor: t.color.line,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.chip,
                { borderRadius: t.radii.iconChip, backgroundColor: t.color.card },
              ]}
            >
              <Icon size={20} color={t.color.royal} strokeWidth={1.8} />
            </View>
            <Text style={[t.type.body, { color: t.color.text, marginTop: 10 }]}>{title}</Text>
            <Text style={[t.type.meta, { color: t.color.sub, marginTop: 2 }]}>{subtitle}</Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Two columns.
  tile: { width: '48%', flexGrow: 1, padding: 14, borderWidth: 1, minHeight: 44 },
  chip: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
});
