/**
 * Reports & Export — Phase 7.
 *
 * Filters, then the two things people leave with: a CSV that Excel opens and a
 * printable PDF. Both are built from the same rows the summary counted, so the
 * total on the sheet and the number of lines under it cannot disagree.
 *
 * Everything is inside the caller's scope before it reaches this screen, which
 * is the whole risk with an export: a file is the one thing that leaves the app
 * and keeps being read after everybody has forgotten who could see what.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { AlertCircle, ChevronLeft, FileDown, Printer } from 'lucide-react-native';

import { useTheme } from '@/theme';
import {
  Button,
  Card,
  Chip,
  ChipRow,
  DateField,
  EmptyState,
  PickerSheet,
  Screen,
  SelectField,
  Skeleton,
} from '@/components/ui';
import {
  buildReportCsv,
  buildReportHtml,
  fetchReport,
  fetchReportSummary,
  fetchValueAnalytics,
  type ReportFilters,
  type ValueBreakdown,
} from '@/api/reports';
import { fetchAssetFormOptions } from '@/api/assets';
import { Bars } from '@/components/charts/Bars';
import { Donut } from '@/components/charts/Donut';
import { todayIso } from '@/lib/dates';
import { useScopeLabel, useScopeStore } from '@/store/useScopeStore';
import { useToast } from '@/store/useUiStore';

function money(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return n ? `Rp ${n.toLocaleString('id-ID')}` : 'Rp 0';
}

export default function ReportsScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const scope = useScopeStore((s) => s.scope);
  const scopeLabel = useScopeLabel();

  const [filters, setFilters] = useState<ReportFilters>({});
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [picker, setPicker] = useState<'status' | 'category' | 'department' | null>(null);
  // Which breakdown the charts show. One set of charts with a switch rather
  // than three sets stacked: the question is almost always "by what", and
  // three charts down the screen makes nobody compare them anyway.
  const [lens, setLens] = useState<'category' | 'location' | 'department'>('category');
  const [error, setError] = useState('');

  const options = useQuery({ queryKey: ['assetFormOptions'], queryFn: fetchAssetFormOptions });

  const analytics = useQuery({
    queryKey: ['valueAnalytics', scope, filters, from, to],
    queryFn: () => fetchValueAnalytics(scope, filters, from, to),
    enabled: scope.length > 0,
  });

  const totalValue =
    Number(analytics.data?.assets.value ?? 0) + Number(analytics.data?.accessories.value ?? 0);

  // Assets and accessories are counted in the same units on purpose: one is a
  // thing, the other is a quantity of things, and a breakdown that showed only
  // half the stock would be read as if it showed all of it.
  const lensRows: ValueBreakdown[] = (() => {
    const a = analytics.data;
    if (!a) return [];
    if (lens === 'department') return a.assets.byDepartment;
    const assetRows = lens === 'category' ? a.assets.byCategory : a.assets.byLocation;
    const accRows = lens === 'category' ? a.accessories.byCategory : a.accessories.byLocation;
    const merged = new Map<string, number>();
    for (const r of [...assetRows, ...accRows]) {
      merged.set(r.name, (merged.get(r.name) ?? 0) + Number(r.count));
    }
    return [...merged.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((x, y) => y.count - x.count);
  })();

  const lensTotal = lensRows.reduce((sum: number, r: ValueBreakdown) => sum + r.count, 0);

  const summary = useQuery({
    queryKey: ['reportSummary', scope],
    queryFn: () => fetchReportSummary(scope),
    enabled: scope.length > 0,
  });

  const applied: ReportFilters = {
    ...filters,
    from: from || null,
    to: to || null,
  };

  const rows = useQuery({
    queryKey: ['report', scope, applied],
    queryFn: () => fetchReport(scope, applied),
    enabled: scope.length > 0,
  });

  const exportCsv = useMutation({
    mutationFn: async () => {
      const data = rows.data ?? [];
      if (data.length === 0) throw new Error('Nothing matches these filters');

      const file = new File(
        Paths.cache,
        `cite-assets-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      if (file.exists) file.delete();
      file.create();
      file.write(buildReportCsv(data));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/csv',
          dialogTitle: 'Asset register',
        });
      }
      return data.length;
    },
    onSuccess: (n) => toast(`${n} rows exported`),
    onError: (e: Error) => setError(e.message),
  });

  const exportPdf = useMutation({
    mutationFn: async () => {
      const data = rows.data ?? [];
      if (data.length === 0) throw new Error('Nothing matches these filters');
      if (!summary.data) throw new Error('The summary is still loading');

      const html = buildReportHtml(data, summary.data, scopeLabel);
      const { uri } = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Asset register',
        });
      }
      return data.length;
    },
    onSuccess: (n) => toast(`Report of ${n} assets created`),
    onError: (e: Error) => setError(e.message),
  });

  const statuses = options.data?.statuses ?? [];
  const categories = options.data?.categories ?? [];
  const departments = options.data?.departments ?? [];

  const clearable = Boolean(
    filters.statusId || filters.categoryId || filters.departmentId || from || to,
  );

  return (
    <Screen
      refreshing={rows.isFetching || summary.isFetching}
      onRefresh={() => {
        void rows.refetch();
        void summary.refetch();
      }}
    >
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

      <Text style={[t.type.screenTitle, { color: t.color.text }]}>Reports</Text>
      <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
        {`${scopeLabel} · everything you can see, and nothing you cannot`}
      </Text>

      {summary.isPending ? (
        <Skeleton height={92} radius={t.radii.cardMedium} />
      ) : summary.isError ? (
        <EmptyState
          variant="error"
          title="Could not load the summary"
          description={(summary.error as Error).message}
          actionLabel="Try again"
          onAction={() => summary.refetch()}
        />
      ) : (
        <>
          <View style={styles.kpis}>
            {(
              [
                ['Assets', String(summary.data?.total ?? 0)],
                ['Available', String(summary.data?.unassigned ?? 0)],
                ['Warranty < 90d', String(summary.data?.warrantyExpiring ?? 0)],
              ] as const
            ).map(([label, value]) => (
              <Card key={label} radius="kpiTile" padding={12} style={styles.kpiTile}>
                <Text style={[t.type.kpiNumber, styles.kpiValue, { color: t.color.text }]}>
                  {value}
                </Text>
                <Text style={[t.type.kpiLabel, styles.kpiLabel, { color: t.color.sub }]}>
                  {label}
                </Text>
              </Card>
            ))}
          </View>

          <Card padding={13} style={styles.valueCard}>
            <Text style={[t.type.fieldLabel, { color: t.color.sub }]}>Acquisition value</Text>

            {analytics.isPending ? (
              <Skeleton height={74} radius={t.radii.cardMedium} />
            ) : analytics.isError ? (
              <Text style={[t.type.meta, styles.valueHint, { color: t.color.error }]}>
                {(analytics.error as Error).message}
              </Text>
            ) : (
              <>
                {/* Three figures at once. A picker would make somebody remember
                    which of the three they were looking at, and the whole point
                    of putting them side by side is that nobody has to. */}
                <View style={styles.valueRows}>
                  {(
                    [
                      ['Assets', analytics.data?.assets.value ?? 0, false],
                      ['Accessories', analytics.data?.accessories.value ?? 0, false],
                      ['Total', totalValue, true],
                    ] as const
                  ).map(([label, amount, strong]) => (
                    <View
                      key={label}
                      style={[
                        styles.valueRow,
                        strong ? { borderTopWidth: 1, borderTopColor: t.color.line } : null,
                      ]}
                    >
                      <Text
                        style={[
                          strong ? t.type.metaStrong : t.type.meta,
                          { color: strong ? t.color.text : t.color.sub },
                        ]}
                      >
                        {label}
                      </Text>
                      <Text
                        style={[strong ? t.type.detailTitle : t.type.body, { color: t.color.text }]}
                      >
                        {money(amount)}
                      </Text>
                    </View>
                  ))}
                </View>

                <Text style={[t.type.meta, styles.valueHint, { color: t.color.sub }]}>
                  What was paid, not a depreciated figure — this app has no depreciation policy, and
                  inventing one would put an authoritative-looking number in front of Finance.
                  Accessories are counted at their unit price times the quantity owned.
                </Text>
              </>
            )}
          </Card>

          {analytics.data ? (
            <Card padding={15} title="Breakdown" style={styles.card}>
              <ChipRow style={styles.lensRow}>
                {(['category', 'location', 'department'] as const).map((k) => (
                  <Chip
                    key={k}
                    label={
                      k === 'category' ? 'Category' : k === 'location' ? 'Location' : 'Department'
                    }
                    active={lens === k}
                    onPress={() => setLens(k)}
                  />
                ))}
              </ChipRow>

              {lensRows.length === 0 ? (
                <Text style={[t.type.meta, styles.valueHint, { color: t.color.sub }]}>
                  Nothing to break down with these filters.
                </Text>
              ) : lens === 'category' ? (
                <Donut data={lensRows} centreLabel="ITEMS" />
              ) : (
                <Bars rows={lensRows} total={lensTotal} />
              )}

              {lens === 'department' ? (
                <Text style={[t.type.meta, styles.valueHint, { color: t.color.sub }]}>
                  Accessories belong to a shelf, not a team, so this breakdown counts assets only.
                </Text>
              ) : null}
            </Card>
          ) : null}
        </>
      )}

      <Card padding={15} title="Filters" style={styles.card}>
        <SelectField
          label="Status"
          value={statuses.find((s) => s.id === filters.statusId)?.name ?? null}
          placeholder="Any"
          onPress={() => setPicker('status')}
          containerStyle={styles.field}
        />
        <SelectField
          label="Category"
          value={categories.find((c) => c.id === filters.categoryId)?.name ?? null}
          placeholder="Any"
          onPress={() => setPicker('category')}
          containerStyle={styles.field}
        />
        <SelectField
          label="Department"
          value={departments.find((d) => d.id === filters.departmentId)?.name ?? null}
          placeholder="Any"
          onPress={() => setPicker('department')}
          containerStyle={styles.field}
        />

        <View style={styles.dates}>
          <DateField
            label="Bought from"
            value={from || null}
            onChange={(value) => setFrom(value ?? '')}
            placeholder="Any"
            maximum={to || todayIso()}
            containerStyle={styles.dateField}
          />
          <DateField
            label="Bought to"
            value={to || null}
            onChange={(value) => setTo(value ?? '')}
            placeholder="Any"
            minimum={from || null}
            maximum={todayIso()}
            containerStyle={styles.dateField}
          />
        </View>

        {clearable ? (
          <Button
            label="Clear filters"
            variant="secondary"
            size="sm"
            onPress={() => {
              setFilters({});
              setFrom('');
              setTo('');
              setError('');
            }}
            style={styles.clear}
          />
        ) : null}
      </Card>

      <Card padding={15} title="Export" style={styles.card}>
        <Text style={[t.type.meta, styles.hint, { color: t.color.sub }]}>
          {rows.isPending
            ? 'Counting…'
            : `${(rows.data ?? []).length} asset${(rows.data ?? []).length === 1 ? '' : 's'} match. The CSV opens in Excel; the PDF is laid out to be printed and filed.`}
        </Text>

        <Button
          label="Export CSV"
          block
          loading={exportCsv.isPending}
          disabled={rows.isPending || (rows.data ?? []).length === 0}
          icon={<FileDown size={15} color={t.color.onNavy} strokeWidth={1.8} />}
          onPress={() => {
            setError('');
            exportCsv.mutate();
          }}
          style={styles.action}
        />
        <Button
          label="Printable PDF"
          variant="secondary"
          block
          loading={exportPdf.isPending}
          disabled={rows.isPending || (rows.data ?? []).length === 0}
          icon={<Printer size={15} color={t.color.text} strokeWidth={1.8} />}
          onPress={() => {
            setError('');
            exportPdf.mutate();
          }}
          style={styles.action}
        />
      </Card>

      {error ? (
        <View style={styles.errorRow}>
          <AlertCircle size={14} color={t.color.error} strokeWidth={2} />
          <Text style={[t.type.meta, { color: t.color.error }]}>{error}</Text>
        </View>
      ) : null}

      <PickerSheet
        visible={picker === 'status'}
        title="Status"
        options={statuses.map((s) => ({ id: s.id, name: s.name }))}
        selectedId={filters.statusId}
        onSelect={(o) => setFilters({ ...filters, statusId: o.id })}
        onDismiss={() => setPicker(null)}
        clearLabel="Any"
        onClear={() => setFilters({ ...filters, statusId: null })}
      />
      <PickerSheet
        visible={picker === 'category'}
        title="Category"
        options={categories.map((c) => ({ id: c.id, name: c.name }))}
        selectedId={filters.categoryId}
        onSelect={(o) => setFilters({ ...filters, categoryId: o.id })}
        onDismiss={() => setPicker(null)}
        clearLabel="Any"
        onClear={() => setFilters({ ...filters, categoryId: null })}
      />
      <PickerSheet
        visible={picker === 'department'}
        title="Department"
        options={departments.map((d) => ({ id: d.id, name: d.name }))}
        selectedId={filters.departmentId}
        onSelect={(o) => setFilters({ ...filters, departmentId: o.id })}
        onDismiss={() => setPicker(null)}
        clearLabel="Any"
        onClear={() => setFilters({ ...filters, departmentId: null })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 3, marginBottom: 14, lineHeight: 17 },
  kpis: { flexDirection: 'row', gap: 9, marginBottom: 10 },
  kpiTile: { flex: 1 },
  kpiValue: { fontSize: 20 },
  kpiLabel: { marginTop: 3 },
  valueCard: { marginBottom: 12 },
  value: { marginTop: 4 },
  valueHint: { marginTop: 8, lineHeight: 16 },
  valueRows: { marginTop: 8, gap: 8 },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  lensRow: { marginBottom: 14 },
  card: { marginBottom: 12 },
  field: { marginBottom: 12 },
  dates: { flexDirection: 'row', gap: 10 },
  dateField: { flex: 1 },
  hint: { marginTop: 10, lineHeight: 16 },
  clear: { marginTop: 12, alignSelf: 'flex-start' },
  action: { marginTop: 12 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
});
