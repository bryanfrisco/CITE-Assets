/**
 * Import assets from a CSV — Phase 7.
 *
 * IMPLEMENTATION_PLAN.md § Phase 7, "Done when": a file with 45 rows and 3 bad
 * ones imports 42 and returns a downloadable error report.
 *
 * Three steps, and the middle one is the point: pick a file, SEE what will
 * happen, then commit. The preview is a real dry run through the importer, not
 * a second opinion about it, so "42 will be added" is a promise the same code
 * then keeps.
 *
 * Nothing is imported until the second button is pressed. A register is not
 * something to find out about afterwards.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { AlertCircle, ChevronLeft, Download, FileDown, Upload } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { Badge, Button, Card, EmptyState, Screen, Skeleton } from '@/components/ui';
import {
  buildErrorReport,
  buildImportTemplate,
  parseImportCsv,
  type CsvRow,
  type RowError,
} from '@/lib/csv';
import { fetchImportHistory, importAssets, type ImportResult } from '@/api/imports';
import { useToast } from '@/store/useUiStore';
import { usePermissions } from '@/auth';

/** Writes a file into the cache and hands it to the share sheet. */
async function share(name: string, contents: string, dialogTitle: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle });
  }
}

export default function ImportScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<CsvRow[] | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');

  const history = useQuery({ queryKey: ['importHistory'], queryFn: () => fetchImportHistory() });

  const reset = () => {
    setFileName(null);
    setRows(null);
    setPreview(null);
    setWarning('');
    setError('');
  };

  const pick = useMutation({
    mutationFn: async () => {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return null;

      const chosen = picked.assets[0];
      const text = await new File(chosen.uri).text();
      const parsed = parseImportCsv(text);

      if (parsed.missingRequired.length > 0) {
        throw new Error(
          `The file is missing ${parsed.missingRequired.join(', ')} — download the template`,
        );
      }
      if (parsed.rows.length === 0) {
        throw new Error('The file has a header but no rows');
      }

      // Validated by the importer itself, so this is a real rehearsal.
      const result = await importAssets(parsed.rows, true, chosen.name);
      return { name: chosen.name, rows: parsed.rows, result, unknown: parsed.unknownColumns };
    },
    onSuccess: (data) => {
      if (!data) return;
      setFileName(data.name);
      setRows(data.rows);
      setPreview(data.result);
      setError('');
      setWarning(
        data.unknown.length > 0
          ? `Ignored ${data.unknown.length} column${data.unknown.length === 1 ? '' : 's'} the template does not use: ${data.unknown.join(', ')}`
          : '',
      );
    },
    onError: (e: Error) => {
      reset();
      setError(e.message);
    },
  });

  const commit = useMutation({
    mutationFn: () => importAssets(rows!, false, fileName ?? 'import.csv'),
    onSuccess: (result) => {
      toast(
        result.invalid === 0
          ? `${result.valid} assets imported`
          : `${result.valid} imported · ${result.invalid} skipped`,
      );
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['importHistory'] });
      reset();
    },
    onError: (e: Error) => setError(e.message),
  });

  const downloadTemplate = useMutation({
    mutationFn: () => share('cite-assets-template.csv', buildImportTemplate(), 'Import template'),
    onError: (e: Error) => setError(e.message),
  });

  const downloadErrors = useMutation({
    mutationFn: (errors: RowError[]) =>
      share('cite-assets-import-errors.csv', buildErrorReport(errors), 'Rows that were skipped'),
    onError: (e: Error) => setError(e.message),
  });

  if (!can('asset.create')) {
    return (
      <Screen>
        <EmptyState
          title="Not available"
          description="Importing assets needs a role that can create them."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

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

      <Text style={[t.type.screenTitle, { color: t.color.text }]}>Import assets</Text>
      <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
        Nothing is added until you have seen what will happen
      </Text>

      <Card padding={15} title="1 · The template" style={styles.card}>
        <Text style={[t.type.meta, styles.hint, { color: t.color.sub }]}>
          Sixteen columns, one filled-in example row. Categories, brands, locations and departments
          must already exist in Master data — a name the register has never heard of is reported,
          not created, so one typo cannot quietly become a second category.
        </Text>
        <Button
          label="Download the template"
          variant="secondary"
          block
          loading={downloadTemplate.isPending}
          icon={<FileDown size={15} color={t.color.text} strokeWidth={1.8} />}
          onPress={() => downloadTemplate.mutate()}
          style={styles.action}
        />
      </Card>

      <Card padding={15} title="2 · Check the file" style={styles.card}>
        <Button
          label={fileName ? 'Choose a different file' : 'Choose a CSV'}
          block
          loading={pick.isPending}
          icon={<Upload size={15} color={t.color.onNavy} strokeWidth={1.8} />}
          onPress={() => pick.mutate()}
        />

        {fileName ? (
          <Text numberOfLines={1} style={[t.type.meta, styles.fileName, { color: t.color.sub }]}>
            {fileName}
          </Text>
        ) : null}

        {warning ? (
          <Text style={[t.type.meta, styles.hint, { color: t.color.sub }]}>{warning}</Text>
        ) : null}

        {preview ? (
          <>
            <View style={styles.counts}>
              {(
                [
                  ['Rows', preview.total, undefined],
                  ['Will be added', preview.valid, 'available' as const],
                  [
                    'Skipped',
                    preview.invalid,
                    preview.invalid > 0 ? ('retired' as const) : undefined,
                  ],
                ] as const
              ).map(([label, value, tone]) => (
                <Card key={label} radius="kpiTile" padding={12} style={styles.countTile}>
                  <Text style={[t.type.kpiNumber, styles.countValue, { color: t.color.text }]}>
                    {value}
                  </Text>
                  <Text style={[t.type.kpiLabel, styles.countLabel, { color: t.color.sub }]}>
                    {label}
                  </Text>
                  {tone ? <Badge label=" " tone={tone} /> : null}
                </Card>
              ))}
            </View>

            {preview.invalid > 0 ? (
              <>
                <Text style={[t.type.sectionLabel, styles.errorsLabel, { color: t.color.sub }]}>
                  What will be skipped
                </Text>
                {preview.errors.slice(0, 5).map((row) => (
                  <View key={row.row} style={[styles.errorRow, { borderColor: t.color.line }]}>
                    <Text style={[t.type.metaStrong, { color: t.color.text }]}>
                      {`Row ${row.row}${row.name ? ` · ${row.name}` : ''}`}
                    </Text>
                    {row.problems.map((problem, i) => (
                      <Text key={i} style={[t.type.meta, { color: t.color.error, marginTop: 2 }]}>
                        {`${problem.column} — ${problem.message}`}
                      </Text>
                    ))}
                  </View>
                ))}
                {preview.errors.length > 5 ? (
                  <Text style={[t.type.meta, styles.hint, { color: t.color.sub }]}>
                    {`and ${preview.errors.length - 5} more — download the report to see them all`}
                  </Text>
                ) : null}
                <Button
                  label="Download the error report"
                  variant="secondary"
                  block
                  loading={downloadErrors.isPending}
                  icon={<Download size={15} color={t.color.text} strokeWidth={1.8} />}
                  onPress={() => downloadErrors.mutate(preview.errors)}
                  style={styles.action}
                />
              </>
            ) : (
              <Text style={[t.type.meta, styles.hint, { color: t.color.success }]}>
                Every row can be imported.
              </Text>
            )}
          </>
        ) : null}
      </Card>

      {preview ? (
        <Card padding={15} title="3 · Import" style={styles.card}>
          <Text style={[t.type.meta, styles.hint, { color: t.color.sub }]}>
            {preview.valid > 0
              ? `${preview.valid} asset${preview.valid === 1 ? '' : 's'} will be added. The skipped rows are left alone — fix them and import the file again; the ones already added will be reported as duplicates rather than doubled.`
              : 'Nothing in this file can be imported yet.'}
          </Text>
          <Button
            label={`Import ${preview.valid} asset${preview.valid === 1 ? '' : 's'}`}
            block
            disabled={preview.valid === 0}
            loading={commit.isPending}
            onPress={() => commit.mutate()}
            style={styles.action}
          />
        </Card>
      ) : null}

      {error ? (
        <View style={styles.errorLine}>
          <AlertCircle size={14} color={t.color.error} strokeWidth={2} />
          <Text style={[t.type.meta, { color: t.color.error }]}>{error}</Text>
        </View>
      ) : null}

      <Text style={[t.type.sectionLabel, styles.historyLabel, { color: t.color.sub }]}>
        Past imports
      </Text>

      {history.isPending ? (
        <Skeleton height={60} radius={t.radii.card} />
      ) : (history.data ?? []).length === 0 ? (
        <Text style={[t.type.meta, { color: t.color.sub }]}>None yet.</Text>
      ) : (
        <Card padding={0} radius="listContainer">
          {(history.data ?? []).map((batch, i) => (
            <View
              key={batch.id}
              style={[
                styles.historyRow,
                {
                  borderBottomWidth: i === (history.data ?? []).length - 1 ? 0 : 1,
                  borderBottomColor: t.color.line,
                },
              ]}
            >
              <View style={styles.historyText}>
                <Text numberOfLines={1} style={[t.type.bodySmall, { color: t.color.text }]}>
                  {batch.file_name}
                </Text>
                <Text style={[t.type.meta, { color: t.color.sub, marginTop: 3 }]}>
                  {`${batch.imported_rows} imported · ${batch.skipped_rows} skipped · ${batch.imported_by_name}`}
                </Text>
              </View>
              <Text style={[t.type.meta, { color: t.color.sub }]}>
                {new Date(batch.created_at).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                })}
              </Text>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 3, marginBottom: 14, lineHeight: 17 },
  card: { marginBottom: 12 },
  hint: { marginTop: 10, lineHeight: 16 },
  action: { marginTop: 12 },
  fileName: { marginTop: 10 },
  counts: { flexDirection: 'row', gap: 9, marginTop: 14 },
  countTile: { flex: 1 },
  countValue: { fontSize: 20 },
  countLabel: { marginTop: 3 },
  errorsLabel: { marginTop: 18, marginBottom: 9 },
  errorRow: { borderWidth: 1, borderRadius: 12, padding: 11, marginBottom: 8 },
  errorLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  historyLabel: { marginTop: 12, marginBottom: 9, marginLeft: 2 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  historyText: { flex: 1, minWidth: 0 },
});
