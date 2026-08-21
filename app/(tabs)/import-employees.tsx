/**
 * Import employees from the Odoo hr.employee export.
 *
 * Same three steps as Import assets — template, see what will happen, commit —
 * because they are the same job and learning it twice would be a tax on the
 * one person who does both.
 *
 * Two things differ, and both come from the file being a monthly re-export
 * rather than a one-off load:
 *
 *   1. The counts are New / Updated / Unchanged / Skipped. An employee list is
 *      imported again every month, and "526 valid" would hide the only number
 *      that matters, which is how many records are about to CHANGE.
 *
 *   2. When the preview finds problems, Import does not fire straight away. A
 *      sheet names them and offers to go back. On a clean file the sheet never
 *      appears — a confirmation that always appears is one nobody reads.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { AlertCircle, ChevronLeft, Download, FileDown, Upload } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { BottomSheet, Button, Card, EmptyState, Screen, Skeleton } from '@/components/ui';
import {
  EMPLOYEE_IMPORT,
  buildEmployeeTemplate,
  buildErrorReport,
  parseImportCsv,
  type CsvRow,
  type RowError,
} from '@/lib/csv';
import { fetchImportHistory, importAccounts, type EmployeeImportResult } from '@/api/imports';
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

export default function ImportEmployeesScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<CsvRow[] | null>(null);
  const [preview, setPreview] = useState<EmployeeImportResult | null>(null);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [showProblems, setShowProblems] = useState(false);

  const history = useQuery({
    queryKey: ['importHistory', 'employees'],
    queryFn: () => fetchImportHistory('employees'),
  });

  const reset = () => {
    setFileName(null);
    setRows(null);
    setPreview(null);
    setWarning('');
    setError('');
    setConfirming(false);
    setShowProblems(false);
  };

  const willWrite = preview ? preview.created + preview.updated : 0;
  const problemCount = preview ? preview.skipped + preview.warnings.length : 0;

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
      const parsed = parseImportCsv(text, EMPLOYEE_IMPORT);

      if (parsed.missingRequired.length > 0) {
        throw new Error('The file has no Employee Name column — download the template');
      }
      if (parsed.rows.length === 0) {
        throw new Error('The file has a header but no rows');
      }

      // A real dry run through the importer, so the numbers shown are a promise
      // the same code then keeps.
      const result = await importAccounts(parsed.rows, true, chosen.name);
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
          ? `Ignored ${data.unknown.length} column${data.unknown.length === 1 ? '' : 's'} this import does not use: ${data.unknown.join(', ')}`
          : '',
      );
    },
    onError: (e: Error) => {
      reset();
      setError(e.message);
    },
  });

  const commit = useMutation({
    mutationFn: () => importAccounts(rows!, false, fileName ?? 'employees.csv'),
    onSuccess: (result) => {
      toast(
        result.updated > 0
          ? `${result.created} added · ${result.updated} updated`
          : `${result.created} employee${result.created === 1 ? '' : 's'} added`,
      );
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['importHistory', 'employees'] });
      reset();
    },
    onError: (e: Error) => {
      setConfirming(false);
      setError(e.message);
    },
  });

  const downloadTemplate = useMutation({
    mutationFn: () =>
      share('cite-employees-template.csv', buildEmployeeTemplate(), 'Employee template'),
    onError: (e: Error) => setError(e.message),
  });

  const downloadErrors = useMutation({
    mutationFn: (errors: RowError[]) =>
      share(
        'cite-employees-skipped.csv',
        buildErrorReport(errors, 'nik'),
        'Rows that were skipped',
      ),
    onError: (e: Error) => setError(e.message),
  });

  /** Import goes through the sheet only when there is something to warn about. */
  const startImport = () => {
    if (problemCount > 0) setConfirming(true);
    else commit.mutate();
  };

  const counts = useMemo(
    () =>
      preview
        ? ([
            ['New', preview.created],
            ['Updated', preview.updated],
            ['Unchanged', preview.unchanged],
            ['Skipped', preview.skipped],
          ] as const)
        : [],
    [preview],
  );

  if (!can('account.manage')) {
    return (
      <Screen>
        <EmptyState
          title="Not available"
          description="Importing employees is a Super Admin task."
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

      <Text style={[t.type.screenTitle, { color: t.color.text }]}>Import employees</Text>
      <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
        Nothing is written until you have seen what will happen
      </Text>

      <Card padding={15} title="1 · The template" style={styles.card}>
        <Text style={[t.type.meta, styles.hint, { color: t.color.sub }]}>
          Six columns, named exactly as Odoo names them — so the file you export from hr.employee
          can be used as it is, with no columns to rename. Company names must already exist in
          Master data.
        </Text>
        <Text style={[t.type.meta, styles.hint, { color: t.color.sub }]}>
          This import only ever writes name, employee ID, job position, company, email and phone.
          Roles, sign-ins and locations are set inside the app and are never touched.
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

      <Card padding={15} title="2 · Review" style={styles.card}>
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
              {counts.map(([label, value]) => (
                <Card key={label} radius="kpiTile" padding={12} style={styles.countTile}>
                  <Text style={[t.type.kpiNumber, styles.countValue, { color: t.color.text }]}>
                    {value}
                  </Text>
                  <Text style={[t.type.kpiLabel, styles.countLabel, { color: t.color.sub }]}>
                    {label}
                  </Text>
                </Card>
              ))}
            </View>

            {preview.warningSummary.length > 0 ? (
              <>
                <Text style={[t.type.sectionLabel, styles.errorsLabel, { color: t.color.sub }]}>
                  Values that will be left blank
                </Text>
                {preview.warningSummary.map((w) => (
                  <Text
                    key={w.message}
                    style={[t.type.meta, styles.summaryRow, { color: t.color.sub }]}
                  >
                    {`${w.count} × ${w.message}`}
                  </Text>
                ))}
                <Text style={[t.type.meta, styles.hint, { color: t.color.sub }]}>
                  These rows still import. Only the unusable value is dropped.
                </Text>
              </>
            ) : null}

            {preview.skipped > 0 ? (
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
                  label="Download the skipped rows"
                  variant="secondary"
                  block
                  loading={downloadErrors.isPending}
                  icon={<Download size={15} color={t.color.text} strokeWidth={1.8} />}
                  onPress={() => downloadErrors.mutate(preview.errors)}
                  style={styles.action}
                />
              </>
            ) : null}

            {problemCount === 0 ? (
              <Text style={[t.type.meta, styles.hint, { color: t.color.success }]}>
                Every row can be imported as it stands.
              </Text>
            ) : null}
          </>
        ) : null}
      </Card>

      {preview ? (
        <Card padding={15} title="3 · Import" style={styles.card}>
          <Text style={[t.type.meta, styles.hint, { color: t.color.sub }]}>
            {willWrite > 0
              ? `${preview.created} will be added and ${preview.updated} updated. Everyone comes in as Record only — nobody gets a sign-in from an import.`
              : 'This file would change nothing. Everyone in it already matches what is stored.'}
          </Text>
          <Button
            label={
              willWrite > 0
                ? `Import ${willWrite} row${willWrite === 1 ? '' : 's'}`
                : 'Nothing to import'
            }
            block
            disabled={willWrite === 0}
            loading={commit.isPending}
            onPress={startImport}
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
      ) : history.isError ? (
        <Text style={[t.type.meta, { color: t.color.error }]}>Could not load past imports.</Text>
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
                  {`${batch.imported_rows} written · ${batch.skipped_rows} skipped · ${batch.imported_by_name}`}
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

      {/* The wizard the client asked for: on a file with problems, Import stops
          here first and says what they are. */}
      <BottomSheet
        visible={confirming}
        onDismiss={() => {
          setConfirming(false);
          setShowProblems(false);
        }}
        title={`${problemCount} row${problemCount === 1 ? '' : 's'} need attention`}
        subtitle={
          preview
            ? `${preview.skipped} will be skipped entirely, and ${preview.warnings.length} value${preview.warnings.length === 1 ? '' : 's'} will be left blank. The other ${willWrite} can be imported now.`
            : undefined
        }
      >
        {showProblems && preview ? (
          <ScrollView style={styles.problemList} showsVerticalScrollIndicator={false}>
            {preview.errors.map((row) => (
              <View key={`e-${row.row}`} style={[styles.errorRow, { borderColor: t.color.line }]}>
                <Text style={[t.type.metaStrong, { color: t.color.text }]}>
                  {`Row ${row.row}${row.name ? ` · ${row.name}` : ''} — skipped`}
                </Text>
                {row.problems.map((problem, i) => (
                  <Text key={i} style={[t.type.meta, { color: t.color.error, marginTop: 2 }]}>
                    {`${problem.column} — ${problem.message}`}
                  </Text>
                ))}
              </View>
            ))}
            {preview.warnings.map((w, i) => (
              <View key={`w-${i}`} style={[styles.errorRow, { borderColor: t.color.line }]}>
                <Text style={[t.type.metaStrong, { color: t.color.text }]}>
                  {`Row ${w.row}${w.name ? ` · ${w.name}` : ''}`}
                </Text>
                <Text style={[t.type.meta, { color: t.color.sub, marginTop: 2 }]}>
                  {`${w.column} — ${w.message}`}
                </Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <>
            {preview?.warningSummary.map((w) => (
              <Text
                key={w.message}
                style={[t.type.meta, styles.summaryRow, { color: t.color.sub }]}
              >
                {`${w.count} × ${w.message}`}
              </Text>
            ))}
            <Button
              label="Review the problems"
              variant="secondary"
              block
              onPress={() => setShowProblems(true)}
              style={styles.action}
            />
          </>
        )}

        <Button
          label={`Import the other ${willWrite} anyway`}
          block
          loading={commit.isPending}
          onPress={() => commit.mutate()}
          style={styles.action}
        />
        <Button
          label="Cancel"
          variant="link"
          block
          onPress={() => {
            setConfirming(false);
            setShowProblems(false);
          }}
          style={styles.action}
        />
      </BottomSheet>
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
  summaryRow: { marginBottom: 5, lineHeight: 16 },
  errorRow: { borderWidth: 1, borderRadius: 12, padding: 11, marginBottom: 8 },
  errorLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  problemList: { maxHeight: 300, marginBottom: 4 },
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
