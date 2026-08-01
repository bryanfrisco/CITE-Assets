/**
 * E-BAST detail — README § Screens 5.
 *
 * Header row (number, "Serah Terima Aset", status badge), the paper preview,
 * `PDF` + `Preview` actions, the two signature blocks, the signed-document card,
 * and the version history rail.
 *
 * The paper preview stays white in both themes: it is a printed document, not
 * app chrome. Its palette lives in `t.paper`, and the Edge Function that
 * renders the real PDF uses the same values — including the signatures, which
 * are the same stroke data drawn by both.
 */

import React, { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import Svg, { Path } from 'react-native-svg';
import { Check, ChevronLeft, Download, PenLine, Upload } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/theme';
import { Badge, Button, Card, EmptyState, Screen, Skeleton } from '@/components/ui';
import {
  BAST_STATUS_LABEL,
  MAX_SIGNED_BAST_BYTES,
  SIGNATURE_ROLE_LABEL,
  attachSignedBast,
  fetchBastDetail,
  generateBastPdf,
  signedBastUrl,
  uploadSignedScan,
  type BastDetail,
  type BastSignature,
  type BastVersion,
  type SignatureRole,
} from '@/api/bast';
import { fitSignaturePaths } from '@/lib/signature';
import { queryKeys } from '@/lib/queryClient';
import { useToast } from '@/store/useUiStore';
import { usePermissions } from '@/auth';

const LOGO = require('../../../assets/cite-logo.png');

/**
 * The company mark, printed before the CITE mark.
 *
 * The file is a committed 1×1 transparent placeholder until the real artwork is
 * dropped in — Metro has to resolve the require either way. Anything that small
 * is treated as "no logo yet" rather than drawn invisible, which is why the
 * dimensions are checked instead of assumed.
 */
const ASPIRE = require('../../../assets/aspire-logo.png');
const aspireSource = Image.resolveAssetSource(ASPIRE);
const HAS_ASPIRE = (aspireSource?.width ?? 0) > 2;
const ASPIRE_RATIO = HAS_ASPIRE ? aspireSource.width / aspireSource.height : 1;

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
      toast('Signed document uploaded · status set to Signed');
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
          title="Could not load this E-BAST"
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
          title="E-BAST not found"
          description="It may have been removed, or it is outside your location scope."
          actionLabel="All E-BAST"
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
        accessibilityLabel="All E-BAST"
        hitSlop={8}
        style={styles.back}
      >
        <ChevronLeft size={15} color={t.color.royal} strokeWidth={2} />
        <Text style={[t.type.metaStrong, { color: t.color.royal }]}>All E-BAST</Text>
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

      {can('bast.write') && b.status !== 'void' ? (
        <Card radius="cardMedium" padding={16} title="Tanda tangan" style={styles.uploadCard}>
          <Text style={[t.type.meta, styles.signHint, { color: t.color.sub }]}>
            Both parties sign here on the screen. When the second signature is given the document is
            issued automatically.
          </Text>

          {(['handover', 'receiver'] as SignatureRole[]).map((role) => {
            const signature = b.signatures?.[role];
            return (
              <Pressable
                key={role}
                onPress={() => router.push(`/bast/sign?id=${b.id}&role=${role}`)}
                accessibilityRole="button"
                accessibilityLabel={`Sign as ${SIGNATURE_ROLE_LABEL[role]}`}
                style={({ pressed }) => [
                  styles.signRow,
                  {
                    borderColor: t.color.line,
                    borderRadius: t.radii.inputLarge,
                    backgroundColor: pressed ? t.color.soft : 'transparent',
                  },
                ]}
              >
                <View
                  style={[
                    styles.signIcon,
                    { backgroundColor: signature ? t.upload.successWash : t.color.soft },
                  ]}
                >
                  {signature ? (
                    <Check size={16} color={t.color.success} strokeWidth={2.4} />
                  ) : (
                    <PenLine size={16} color={t.color.royal} strokeWidth={1.8} />
                  )}
                </View>

                <View style={styles.fileText}>
                  <Text style={[t.type.bodySmall, { color: t.color.text }]}>
                    {SIGNATURE_ROLE_LABEL[role]}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[t.type.metaStrong, styles.fileMeta, { color: t.color.sub }]}
                  >
                    {signature
                      ? `${signature.signerName} · ${shortDate(signature.signedAt)}`
                      : role === 'handover'
                        ? 'Not signed yet · Corporate IT'
                        : `Not signed yet · ${b.employeeName}`}
                  </Text>
                </View>

                <Text style={[t.type.metaStrong, { color: t.color.royal }]}>
                  {signature ? 'Re-sign' : 'Sign'}
                </Text>
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      <Card radius="cardMedium" padding={16} style={styles.uploadCard}>
        <Text style={[t.type.sectionLabel, { color: t.color.sub }]}>Signed document</Text>

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
            accessibilityLabel="Upload a signed paper copy"
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
              Upload a signed paper copy
            </Text>
            <Text style={[t.type.metaStrong, { color: t.color.sub }]}>PDF or JPG · max 10 MB</Text>
          </Pressable>
        ) : (
          <Text style={[t.type.meta, styles.readOnly, { color: t.color.sub }]}>
            This E-BAST is still waiting to be signed.
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
        {HAS_ASPIRE ? (
          <>
            <Image
              source={ASPIRE}
              style={[styles.paperAspire, { width: 34 * ASPIRE_RATIO }]}
              resizeMode="contain"
            />
            {/* A hairline, not a gap: ASPIRE is the company and CITE is the
                department, and neither should read as the other's sub-brand. */}
            <View style={[styles.paperDivider, { backgroundColor: p.tableBorder }]} />
          </>
        ) : null}
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
            ['handover', bast.handedOverBy, bast.handedOverDept],
            ['receiver', bast.employeeName, bast.departmentName],
          ] as const
        ).map(([role, fallbackName, fallbackDept]) => {
          const signature = bast.signatures?.[role];
          return (
            <View key={role} style={styles.signature}>
              <Text style={[styles.signatureCaption, { color: p.muted }]}>
                {SIGNATURE_ROLE_LABEL[role]}
              </Text>
              <PreviewSignature signature={signature} />
              <Text style={[styles.signatureName, { color: p.ink }]}>
                {signature?.signerName ?? fallbackName}
              </Text>
              <Text style={[styles.signatureDept, { color: p.muted }]}>
                {signature?.signerTitle ?? fallbackDept}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * The ink above the ruled line. Empty until someone signs, so the preview of an
 * unsigned document looks exactly like the blank sheet it is.
 */
function PreviewSignature({ signature }: { signature?: BastSignature }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const height = 34;

  const paths =
    signature && width > 0 ? fitSignaturePaths(signature.strokes, width - 8, height - 4) : [];

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.signatureSpace, { height, borderBottomColor: t.paper.signatureLine }]}
    >
      {paths.length > 0 ? (
        <Svg width={width - 8} height={height - 4} style={styles.signatureInk}>
          {paths.map((d, i) => (
            <Path
              key={i}
              d={d}
              stroke={t.paper.ink}
              strokeWidth={1.1}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>
      ) : null}
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
  // Taller than the CITE mark on purpose: the ASPIRE artwork is a stacked
  // lockup whose bottom line is "member of ASTRA", and matching the CITE
  // height would render that line as a smudge. Same proportion as the PDF.
  paperAspire: { height: 34 },
  paperDivider: { width: 1, height: 30, marginHorizontal: 2 },
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
  signatureSpace: {
    alignSelf: 'stretch',
    marginTop: 4,
    borderBottomWidth: 1,
    justifyContent: 'flex-end',
  },
  signatureInk: { alignSelf: 'center' },
  signatureName: { fontSize: 8, fontWeight: '600', marginTop: 4 },
  signatureDept: { fontSize: 7 },

  // --- signing ---------------------------------------------------------
  signHint: { marginTop: 2, marginBottom: 12, lineHeight: 16 },
  signRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  signIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

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
