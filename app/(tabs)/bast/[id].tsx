/**
 * BAST detail — README § Screens 5.
 *
 * Header row (number, "Serah Terima Aset", status badge), the paper preview,
 * `PDF` + `Preview` actions, the signed-scan upload card with real progress,
 * and the version history rail.
 *
 * The paper preview stays white in both themes: it is a printed document, not
 * app chrome. Its palette lives in `t.paper`, and the Edge Function that
 * renders the real PDF uses the same values.
 */

import React, { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Check, ChevronLeft, Download, Upload } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/theme';
import { Badge, Button, Card, EmptyState, Screen, Skeleton } from '@/components/ui';
import {
  BAST_STATUS_LABEL,
  MAX_SIGNED_BAST_BYTES,
  attachSignedBast,
  fetchBastDetail,
  generateBastPdf,
  signedBastUrl,
  uploadSignedScan,
  type BastDetail,
  type BastVersion,
} from '@/api/bast';
import { queryKeys } from '@/lib/queryClient';
import { useToast } from '@/store/useUiStore';
import { usePermissions } from '@/auth';

const LOGO = require('../../../assets/cite-logo.png');

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function fileSize(bytes: number | null): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export default function BastDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { id } = useLocalSearchParams<{ id: string }>();

  const detail = useQuery({
    queryKey: ['bastDetail', id],
    queryFn: () => fetchBastDetail(id),
    enabled: Boolean(id),
  });

  const [progress, setProgress] = useState<number | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  const invalidate = (bast: BastDetail) => {
    void queryClient.invalidateQueries({ queryKey: ['bastDetail', bast.id] });
    void queryClient.invalidateQueries({ queryKey: ['bast'] });
    void queryClient.invalidateQueries({ queryKey: ['bastStats'] });
    // The signed scan mirrors into the asset's Documents tab.
    void queryClient.invalidateQueries({ queryKey: queryKeys.asset(bast.assetCode) });
  };

  const openFile = async (path: string) => {
    const url = await signedBastUrl(path);
    if (!url) {
      toast('Could not open the document', 'error');
      return;
    }
    await Linking.openURL(url);
  };

  const generate = useMutation({
    mutationFn: async () => {
      const result = await generateBastPdf(id);
      // The function deliberately returns only the path; the signed URL is
      // minted here so it points at the host this device can actually reach.
      return { ...result, url: await signedBastUrl(result.filePath) };
    },
    onSuccess: (result) => {
      toast(`${result.bastNumber} generated`);
      if (detail.data) invalidate(detail.data);
      if (result.url) void Linking.openURL(result.url);
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const upload = useMutation({
    mutationFn: async () => {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return null;

      const file = picked.assets[0];
      if ((file.size ?? 0) > MAX_SIGNED_BAST_BYTES) {
        throw new Error('The file is larger than 10 MB');
      }

      setUploadedName(file.name);
      setProgress(0);

      const response = await fetch(file.uri);
      const blob = await response.blob();

      const nextVersion = (detail.data?.versions[0]?.version ?? 0) + 1;
      const stored = await uploadSignedScan(id, nextVersion, blob, file.name, setProgress);
      return attachSignedBast(id, stored.path, stored.size, stored.mimeType);
    },
    onSuccess: (result) => {
      setProgress(null);
      if (!result) {
        setUploadedName(null);
        return;
      }
      // README § Interactions: "BAST upload complete → BAST status → Signed…"
      toast('Signed BAST uploaded · status set to Signed');
      if (detail.data) invalidate(detail.data);
    },
    onError: (e: Error) => {
      setProgress(null);
      setUploadedName(null);
      toast(e.message, 'error');
    },
  });

  if (detail.isPending) {
    return (
      <Screen>
        <View style={styles.skeletons}>
          <Skeleton height={420} radius={t.radii.cardLarge} />
          <Skeleton height={180} radius={t.radii.cardMedium} />
        </View>
      </Screen>
    );
  }

  if (detail.isError) {
    return (
      <Screen>
        <EmptyState
          variant="error"
          title="Could not load this BAST"
          description={(detail.error as Error).message}
          actionLabel="Try again"
          onAction={() => detail.refetch()}
        />
      </Screen>
    );
  }

  if (!detail.data) {
    return (
      <Screen>
        <EmptyState
          title="BAST not found"
          description="It may have been removed, or it is outside your location scope."
          actionLabel="All BAST"
          onAction={() => router.replace('/bast')}
        />
      </Screen>
    );
  }

  const b = detail.data;
  const generated = b.versions.find((v) => v.kind === 'generated');
  const latest = b.versions[0];
  const busy = progress !== null;

  return (
    <Screen>
      <Pressable
        onPress={() => router.push('/bast')}
        accessibilityRole="button"
        accessibilityLabel="All BAST"
        hitSlop={8}
        style={styles.back}
      >
        <ChevronLeft size={15} color={t.color.royal} strokeWidth={2} />
        <Text style={[t.type.metaStrong, { color: t.color.royal }]}>All BAST</Text>
      </Pressable>

      <Card radius="cardLarge" padding={0} style={styles.sheetCard}>
        <View style={[styles.sheetHeader, { borderBottomColor: t.color.line }]}>
          <View style={styles.sheetHeaderText}>
            <Text style={[t.type.assetCode, { color: t.color.royal }]}>{b.bastNumber}</Text>
            <Text style={[t.type.cardHeading, styles.sheetTitle, { color: t.color.text }]}>
              Serah Terima Aset
            </Text>
          </View>
          <Badge label={BAST_STATUS_LABEL[b.status]} />
        </View>

        <View style={[styles.paperWrap, { backgroundColor: t.color.soft }]}>
          <PaperPreview bast={b} />
        </View>

        <View style={styles.sheetActions}>
          <Button
            label="PDF"
            block
            icon={<Download size={15} color={t.color.onNavy} strokeWidth={1.8} />}
            loading={generate.isPending}
            style={styles.sheetButton}
            onPress={() => {
              // Generated once, then downloaded; regenerating replaces v1.
              if (generated) void openFile(generated.filePath);
              else generate.mutate();
            }}
          />
          <Button
            label={generated ? 'Regenerate' : 'Preview'}
            variant="secondary"
            block
            style={styles.sheetButton}
            onPress={() => {
              if (generated) generate.mutate();
              else toast('Generate the PDF first to preview it');
            }}
          />
        </View>
      </Card>

      <Card radius="cardMedium" padding={16} style={styles.uploadCard}>
        <Text style={[t.type.sectionLabel, { color: t.color.sub }]}>Signed BAST</Text>

        {busy ? (
          <View style={styles.progressBlock}>
            <View style={styles.progressRow}>
              <View style={[styles.fileChip, { backgroundColor: t.documentChip.pdf }]}>
                <Text style={[t.type.badge, { color: t.color.onNavy }]}>PDF</Text>
              </View>
              <View style={styles.fileText}>
                <Text numberOfLines={1} style={[t.type.bodySmall, { color: t.color.text }]}>
                  {uploadedName ?? 'Signed scan'}
                </Text>
                <Text style={[t.type.metaStrong, styles.fileMeta, { color: t.color.sub }]}>
                  {`Uploading · ${progress}%`}
                </Text>
              </View>
            </View>
            <View style={[styles.track, { backgroundColor: t.color.soft }]}>
              <LinearGradient
                colors={[...t.gradients.progress.colors]}
                start={t.gradients.progress.start}
                end={t.gradients.progress.end}
                style={[styles.fill, { width: `${progress}%` }]}
              />
            </View>
          </View>
        ) : b.status === 'signed' && latest?.kind === 'signed' ? (
          <View
            style={[
              styles.uploadedRow,
              { backgroundColor: t.upload.successWash, borderColor: t.upload.successBorder },
            ]}
          >
            <View style={[styles.fileChip, { backgroundColor: t.color.success }]}>
              <Check size={17} color={t.color.onNavy} strokeWidth={2.4} />
            </View>
            <View style={styles.fileText}>
              <Text numberOfLines={1} style={[t.type.bodySmall, { color: t.color.text }]}>
                {uploadedName ?? `Signed ${b.bastNumber}`}
              </Text>
              <Text style={[t.type.metaStrong, styles.fileMeta, { color: t.color.sub }]}>
                {['Uploaded', fileSize(latest.fileSize), `v${latest.version}`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <Button
              label="Open"
              variant="secondary"
              size="sm"
              onPress={() => void openFile(latest.filePath)}
            />
          </View>
        ) : can('bast.write') ? (
          <Pressable
            onPress={() => upload.mutate()}
            accessibilityRole="button"
            accessibilityLabel="Upload scanned signed BAST"
            style={({ pressed }) => [
              styles.dropTarget,
              {
                borderColor: t.color.line,
                borderRadius: t.radii.inputLarge + 1,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View style={[styles.dropIcon, { backgroundColor: t.color.soft }]}>
              <Upload size={19} color={t.color.royal} strokeWidth={1.8} />
            </View>
            <Text style={[t.type.bodySmall, { color: t.color.text }]}>
              Upload scanned signed BAST
            </Text>
            <Text style={[t.type.metaStrong, { color: t.color.sub }]}>PDF or JPG · max 10 MB</Text>
          </Pressable>
        ) : (
          <Text style={[t.type.meta, styles.readOnly, { color: t.color.sub }]}>
            This BAST is still waiting for its signed scan.
          </Text>
        )}

        <View style={[styles.divider, { backgroundColor: t.color.line }]} />

        <Text style={[t.type.sectionLabel, styles.historyLabel, { color: t.color.sub }]}>
          Version history
        </Text>

        {b.versions.length === 0 ? (
          <Text style={[t.type.meta, { color: t.color.sub }]}>
            No document has been generated yet.
          </Text>
        ) : (
          b.versions.map((version, i) => (
            <VersionRow
              key={version.id}
              version={version}
              newest={i === 0}
              last={i === b.versions.length - 1}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}

/**
 * The paper preview. Recreated with React Native views, not copied from the
 * prototype's HTML — same letterhead, same rule, same table, same two
 * signature blocks as the generated PDF.
 */
function PaperPreview({ bast }: { bast: BastDetail }) {
  const t = useTheme();
  const p = t.paper;

  const rows: [string, string][] = [
    ['Asset Code', bast.assetCode],
    ['Nama Aset', bast.assetName],
    ['Penerima', bast.employeeName],
    ['Departemen', bast.departmentName],
    ['Lokasi', bast.locationName],
    ['Kondisi', bast.conditionText],
  ];

  return (
    <View
      style={[
        styles.paper,
        { backgroundColor: p.sheet, borderColor: p.border, borderRadius: t.radii.paper },
        t.shadow.paper,
      ]}
    >
      <View style={[styles.letterhead, { borderBottomColor: p.rule }]}>
        <Image source={LOGO} style={styles.paperLogo} resizeMode="contain" />
        <View>
          <Text style={[styles.paperBrand, { color: p.ink }]}>CORPORATE IT — CITE</Text>
          <Text style={[styles.paperBrandSub, { color: p.muted }]}>IT ASSET MANAGEMENT</Text>
        </View>
      </View>

      <View style={styles.paperTitleBlock}>
        <Text style={[styles.paperTitle, { color: p.ink }]}>BERITA ACARA SERAH TERIMA</Text>
        <Text style={[styles.paperNumber, { color: p.muted }]}>{`No. ${bast.bastNumber}`}</Text>
      </View>

      <Text style={[styles.paperSentence, { color: p.body }]}>
        {`Pada hari ini, ${bast.longDate}, telah dilakukan serah terima aset IT sebagai berikut:`}
      </Text>

      <View style={[styles.paperTable, { borderColor: p.tableBorder }]}>
        {rows.map(([label, value], i) => (
          <View
            key={label}
            style={[
              styles.paperRow,
              {
                borderBottomWidth: i === rows.length - 1 ? 0 : 1,
                borderBottomColor: p.tableBorder,
              },
            ]}
          >
            <Text
              style={[styles.paperCellKey, { color: p.muted, backgroundColor: p.tableLabelBg }]}
            >
              {label}
            </Text>
            <Text style={[styles.paperCellValue, { color: p.ink }]}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.signatures}>
        {(
          [
            ['Yang Menyerahkan', bast.handedOverBy, bast.handedOverDept],
            ['Yang Menerima', bast.employeeName, bast.departmentName],
          ] as const
        ).map(([caption, name, dept]) => (
          <View key={caption} style={styles.signature}>
            <Text style={[styles.signatureCaption, { color: p.muted }]}>{caption}</Text>
            <View style={[styles.signatureSpace, { borderBottomColor: p.signatureLine }]} />
            <Text style={[styles.signatureName, { color: p.ink }]}>{name}</Text>
            <Text style={[styles.signatureDept, { color: p.muted }]}>{dept}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function VersionRow({
  version,
  newest,
  last,
}: {
  version: BastVersion;
  newest: boolean;
  last: boolean;
}) {
  const t = useTheme();

  return (
    <View style={styles.versionRow}>
      <View style={styles.versionRail}>
        <View
          style={[styles.versionDot, { backgroundColor: newest ? t.color.royal : t.chart.others }]}
        />
        {last ? null : <View style={[styles.versionLine, { backgroundColor: t.color.line }]} />}
      </View>

      <View style={styles.versionBody}>
        <View style={styles.versionTop}>
          <Text style={[t.type.bodySmall, { color: t.color.text }]}>
            {version.note ?? `Version ${version.version}`}
          </Text>
          <Text style={[t.type.metaStrong, styles.versionDate, { color: t.color.sub }]}>
            {shortDate(version.createdAt)}
          </Text>
        </View>
        <Text style={[t.type.meta, styles.versionBy, { color: t.color.sub }]}>
          {`${version.uploadedByName} · ${version.uploadedByDept}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  skeletons: { gap: 12 },
  sheetCard: { overflow: 'hidden' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  sheetHeaderText: { flex: 1, minWidth: 0 },
  sheetTitle: { marginTop: 3 },
  paperWrap: { padding: 16 },
  sheetActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  sheetButton: { height: 40 },

  // --- paper -----------------------------------------------------------
  paper: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 18 },
  letterhead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 2,
  },
  paperLogo: { width: 22, height: 22 },
  paperBrand: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4 },
  paperBrandSub: { fontSize: 7.5, letterSpacing: 0.5, textTransform: 'uppercase' },
  paperTitleBlock: { alignItems: 'center', marginTop: 12 },
  paperTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
  },
  paperNumber: { fontSize: 8.5, marginTop: 3, fontVariant: ['tabular-nums'] },
  paperSentence: { fontSize: 8.5, lineHeight: 14.5, marginTop: 12 },
  paperTable: { marginTop: 10, borderWidth: 1, borderRadius: 4, overflow: 'hidden' },
  paperRow: { flexDirection: 'row' },
  paperCellKey: { width: 88, paddingHorizontal: 8, paddingVertical: 6, fontSize: 8 },
  paperCellValue: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 8,
    fontWeight: '600',
  },
  signatures: { flexDirection: 'row', gap: 20, marginTop: 16 },
  signature: { flex: 1, alignItems: 'center' },
  signatureCaption: { fontSize: 8 },
  signatureSpace: { height: 34, alignSelf: 'stretch', marginTop: 4, borderBottomWidth: 1 },
  signatureName: { fontSize: 8, fontWeight: '600', marginTop: 4 },
  signatureDept: { fontSize: 7 },

  // --- upload ----------------------------------------------------------
  uploadCard: { marginTop: 12 },
  dropTarget: {
    marginTop: 11,
    padding: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    gap: 8,
  },
  dropIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readOnly: { marginTop: 11 },
  progressBlock: { marginTop: 12 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fileChip: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileText: { flex: 1, minWidth: 0 },
  fileMeta: { marginTop: 1 },
  track: { height: 6, borderRadius: 6, marginTop: 11, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
  uploadedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  divider: { height: 1, marginTop: 15, marginBottom: 12 },
  historyLabel: { marginBottom: 10 },
  versionRow: { flexDirection: 'row', gap: 11 },
  versionRail: { width: 22, alignItems: 'center' },
  versionDot: { width: 9, height: 9, borderRadius: 9 },
  versionLine: { flex: 1, width: 1.5, marginVertical: 3 },
  versionBody: { flex: 1, paddingBottom: 16 },
  versionTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  versionDate: { marginLeft: 'auto' },
  versionBy: { marginTop: 2 },
});
