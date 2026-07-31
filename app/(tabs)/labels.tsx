/**
 * Labels — print a batch of blank stickers, and see what has been issued.
 *
 * Printing a batch issues the codes in the database first, then exports them.
 * That order is deliberate: a code that exists on tape but not in the register
 * is a sticker the scanner will refuse, and the team would only find out with
 * the label already stuck to a device.
 *
 * Export gives two files because the LW-700 has no wireless of any kind — see
 * src/lib/labels.ts. The CSV is the one that reaches the printer, via Epson
 * Label Editor on a PC over USB.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { AlertCircle, ChevronLeft, FileDown, Printer } from 'lucide-react-native';

import { useTheme } from '@/theme';
import {
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Input,
  Screen,
  Skeleton,
} from '@/components/ui';
import { createTagBatch, fetchTagStock, listTags, type TagRow, type TagStatus } from '@/api/tags';
import { DEFAULT_TAPE, TAPE_WIDTHS, buildLabelCsv, buildLabelSheetHtml } from '@/lib/labels';
import type { TapeWidth } from '@/lib/labels';
import { useToast } from '@/store/useUiStore';
import { usePermissions } from '@/auth';

const FILTERS: { key: TagStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'untagged', label: 'Blank' },
  { key: 'tagged', label: 'In use' },
  { key: 'void', label: 'Voided' },
];

export default function LabelsScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const [count, setCount] = useState('20');
  const [tape, setTape] = useState<TapeWidth>(DEFAULT_TAPE);
  const [filter, setFilter] = useState<TagStatus | 'all'>('all');
  const [error, setError] = useState('');

  const stock = useQuery({ queryKey: ['tagStock'], queryFn: fetchTagStock });
  const tags = useQuery({
    queryKey: ['tags', filter],
    queryFn: () => listTags(filter === 'all' ? undefined : filter),
  });

  const share = async (codes: string[], batchLabel: string) => {
    // CSV first — it is the one that reaches the LW-700.
    const csv = new File(Paths.cache, `labels-${batchLabel}.csv`);
    if (csv.exists) csv.delete();
    csv.create();
    csv.write(buildLabelCsv(codes, 'CITE ASSETS'));

    const html = await buildLabelSheetHtml(codes, { tape, caption: 'CITE ASSETS' });
    const { uri: pdfPath } = await Print.printToFileAsync({ html });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(csv.uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Send the label data to your PC',
      });
      await Sharing.shareAsync(pdfPath, {
        mimeType: 'application/pdf',
        dialogTitle: 'Label sheet (any printer)',
      });
    }
  };

  const print = useMutation({
    mutationFn: async () => {
      const n = Number(count.replace(/[^\d]/g, ''));
      if (!n) throw new Error('How many labels do you need?');
      // Issued in the database BEFORE the file is made: a code on tape that
      // the register has never heard of is a sticker the scanner will reject.
      const batch = await createTagBatch(n);
      await share(batch.codes, batch.batchId.slice(0, 8));
      return batch;
    },
    onSuccess: (batch) => {
      toast(`${batch.codes.length} labels issued`);
      void queryClient.invalidateQueries({ queryKey: ['tagStock'] });
      void queryClient.invalidateQueries({ queryKey: ['tags'] });
      setError('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const reexport = useMutation({
    mutationFn: async (rows: TagRow[]) =>
      share(
        rows.map((r) => r.code),
        'reprint',
      ),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Screen>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        style={styles.back}
      >
        <ChevronLeft size={15} color={t.color.royal} strokeWidth={2} />
        <Text style={[t.type.metaStrong, { color: t.color.royal }]}>Back</Text>
      </Pressable>

      <Text style={[t.type.screenTitle, { color: t.color.text }]}>Labels</Text>
      <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
        Blank stickers, issued here and claimed when they are scanned onto a device
      </Text>

      <View style={styles.stats}>
        {(
          [
            ['Blank', stock.data?.untagged],
            ['In use', stock.data?.tagged],
            ['Voided', stock.data?.void],
          ] as const
        ).map(([label, value]) => (
          <Card key={label} radius="kpiTile" padding={12} style={styles.statTile}>
            <Text style={[t.type.kpiNumber, styles.statValue, { color: t.color.text }]}>
              {value ?? 0}
            </Text>
            <Text style={[t.type.kpiLabel, styles.statLabel, { color: t.color.sub }]}>{label}</Text>
          </Card>
        ))}
      </View>

      {can('asset.create') ? (
        <Card padding={15} title="Print a batch">
          <Input
            label="How many labels"
            value={count}
            onChangeText={setCount}
            keyboardType="number-pad"
            placeholder="20"
            containerStyle={styles.field}
          />

          <Text style={[t.type.fieldLabel, styles.tapeLabel, { color: t.color.sub }]}>
            Tape width
          </Text>
          <ChipRow style={styles.tapes}>
            {TAPE_WIDTHS.map((width) => (
              <Chip
                key={width}
                label={`${width} mm`}
                active={tape === width}
                onPress={() => setTape(width)}
              />
            ))}
          </ChipRow>

          <Button
            label="Issue and export"
            block
            loading={print.isPending}
            icon={<Printer size={15} color={t.color.onNavy} strokeWidth={1.8} />}
            onPress={() => print.mutate()}
            style={styles.action}
          />

          <Text style={[t.type.meta, styles.hint, { color: t.color.sub }]}>
            Two files are shared: a CSV for Epson Label Editor on a PC — the LW-700 has no
            Bluetooth, so it prints over USB — and a ready-made PDF for any other printer.
          </Text>
        </Card>
      ) : null}

      {error ? (
        <View style={styles.errorRow}>
          <AlertCircle size={14} color={t.color.error} strokeWidth={2} />
          <Text style={[t.type.meta, { color: t.color.error }]}>{error}</Text>
        </View>
      ) : null}

      <Text style={[t.type.sectionLabel, styles.listLabel, { color: t.color.sub }]}>Issued</Text>

      <ChipRow style={styles.filters}>
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            active={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </ChipRow>

      {tags.isPending ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={58} radius={t.radii.card} />
          ))}
        </View>
      ) : tags.isError ? (
        <EmptyState
          variant="error"
          title="Could not load the labels"
          description={(tags.error as Error).message}
          actionLabel="Try again"
          onAction={() => tags.refetch()}
        />
      ) : (tags.data ?? []).length === 0 ? (
        <EmptyState
          title="No labels yet"
          description="Print a batch, stick them on your devices, then scan each one to register it."
        />
      ) : (
        <>
          <Card padding={0} radius="listContainer">
            {(tags.data ?? []).map((row, i) => (
              <TagRowView
                key={row.id}
                row={row}
                last={i === (tags.data ?? []).length - 1}
                onPress={row.asset_code ? () => router.push(`/asset/${row.asset_code}`) : undefined}
              />
            ))}
          </Card>

          {filter === 'untagged' && (tags.data ?? []).length > 0 && can('asset.create') ? (
            <Button
              label="Re-export these labels"
              variant="secondary"
              block
              loading={reexport.isPending}
              icon={<FileDown size={15} color={t.color.text} strokeWidth={1.8} />}
              onPress={() => reexport.mutate(tags.data ?? [])}
              style={styles.action}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

function TagRowView({ row, last, onPress }: { row: TagRow; last: boolean; onPress?: () => void }) {
  const t = useTheme();
  const label = row.status === 'untagged' ? 'Blank' : row.status === 'tagged' ? 'In use' : 'Voided';
  const tone =
    row.status === 'untagged' ? 'available' : row.status === 'void' ? 'retired' : undefined;

  const body = (
    <View
      style={[styles.row, { borderBottomWidth: last ? 0 : 1, borderBottomColor: t.color.line }]}
    >
      <View style={styles.rowText}>
        <Text style={[t.type.assetCode, { color: t.color.royal }]}>{row.code}</Text>
        <Text numberOfLines={1} style={[t.type.metaStrong, styles.rowMeta, { color: t.color.sub }]}>
          {row.asset_code ? `${row.asset_code} · ${row.asset_name}` : 'Not yet on a device'}
        </Text>
      </View>
      <Badge label={label} tone={tone} />
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={row.code}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 3, marginBottom: 14, lineHeight: 17 },
  stats: { flexDirection: 'row', gap: 9, marginBottom: 14 },
  statTile: { flex: 1 },
  statValue: { fontSize: 20 },
  statLabel: { marginTop: 3 },
  field: { marginBottom: 12 },
  tapeLabel: { marginBottom: 6, marginLeft: 2 },
  tapes: { marginBottom: 4 },
  action: { marginTop: 14 },
  hint: { marginTop: 10, lineHeight: 16 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  listLabel: { marginTop: 24, marginBottom: 9, marginLeft: 2 },
  filters: { marginBottom: 12 },
  skeletons: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowMeta: { marginTop: 3 },
});
