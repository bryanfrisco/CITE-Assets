/**
 * E-BAST detail — README § Screens 5.
 *
 * Header row (number, document kind, status badge), the paper preview, the
 * goods-table editor, `PDF` + `Preview` actions, the two signature blocks, the
 * signed-document card, and the version history rail.
 *
 * The paper preview stays white in both themes: it is a printed document, not
 * app chrome. Its palette lives in `t.paper`, and the Edge Function that
 * renders the real PDF draws the same blocks in the same order from the same
 * `bast_detail()` payload — including the signatures, which are the same stroke
 * data drawn by both. If the two ever look different, one of them has a bug.
 */

import React, { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import Svg, { Path } from 'react-native-svg';
import { Check, ChevronLeft, Download, PenLine, Plus, Trash2, Upload } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/theme';
import { Badge, Button, Card, EmptyState, Input, Screen, Skeleton } from '@/components/ui';
import {
  BAST_KIND_LABEL,
  BAST_KIND_TITLE,
  BAST_STATUS_LABEL,
  MAX_SIGNED_BAST_BYTES,
  attachSignedBast,
  fetchBastDetail,
  generateBastPdf,
  setBastItems,
  signatureCaption,
  signedBastUrl,
  uploadSignedScan,
  type BastDetail,
  type BastItem,
  type BastSignature,
  type BastVersion,
  type SignatureRole,
} from '@/api/bast';
import { fitSignaturePaths } from '@/lib/signature';
import { queryKeys } from '@/lib/queryClient';
import { useToast } from '@/store/useUiStore';
import { usePermissions } from '@/auth';

/**
 * The company mark. It is now the ONLY mark on the letterhead — the CITE
 * roundel and the "CORPORATE IT" wordmark were removed at the client's
 * instruction, because the department that raised the document is named in the
 * body sentence ("dari Divisi IT") on their own paperwork and a second logo up
 * there reads as a second company.
 *
 * The file may still be a committed 1×1 transparent placeholder — Metro has to
 * resolve the require either way. Anything that small is treated as "no logo
 * yet" rather than drawn invisible, which is why the dimensions are checked
 * instead of assumed.
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
              {BAST_KIND_LABEL[b.kind]}
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

      {can('bast.write') && b.status !== 'signed' && b.status !== 'void' ? (
        <GoodsEditor bast={b} />
      ) : null}

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
                accessibilityLabel={`Sign as ${signatureCaption(b.kind, role)}`}
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
                    {signatureCaption(b.kind, role)}
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
 * The paper preview — the same blocks, in the same order, as the PDF.
 *
 * The four things that differ between a handover and a withdrawal are the
 * title, the verb in the opening sentence, the verb in the second paragraph,
 * and the two signature captions. Everything else is one layout, which is why
 * this reads from `bast.kind` rather than branching into two components.
 */
function PaperPreview({ bast }: { bast: BastDetail }) {
  const t = useTheme();
  const p = t.paper;

  const isReturn = bast.kind === 'return';
  const company = `${bast.companyName} ${bast.officeLabel}`;

  const opening = isReturn
    ? `Pada hari ini ${bast.dateWords}, telah diberikan 1 (Satu) unit ${bast.assetName} kepada Divisi IT dari :`
    : `Pada hari ini ${bast.dateWords}, telah diserah terimakan 1 (Satu) unit ${bast.assetName} dari Divisi IT kepada :`;

  const purpose = isReturn
    ? `Alat Tersebut akan dikembalikan ke perusahaan ${company} dengan rincian sebagai berikut :`
    : `Alat Tersebut akan dipergunakan untuk kegiatan operasional perusahaan ${company} dengan rincian sebagai berikut :`;

  const closing = isReturn
    ? 'Demikian Berita Acara penarikan barang ini buat, agar dapat diketahui serta ditandatangani bersama serta diketahui oleh pihak - pihak yang berkepentingan.'
    : 'Demikian Berita Acara serah terima barang ini buat, agar dapat diketahui serta ditandatangani bersama serta diketahui oleh pihak - pihak yang berkepentingan.';

  const party: [string, string][] = [
    ['Nama', bast.employeeName],
    ['NIK', bast.employeeNik],
    ['Jabatan', bast.employeeTitle],
    ['Dept./Divisi', bast.departmentName],
  ];

  const items = bast.items ?? [];

  return (
    <View
      style={[
        styles.paper,
        { backgroundColor: p.sheet, borderColor: p.border, borderRadius: t.radii.paper },
        t.shadow.paper,
      ]}
    >
      {HAS_ASPIRE ? (
        <Image
          source={ASPIRE}
          style={[styles.paperAspire, { width: 38 * ASPIRE_RATIO }]}
          resizeMode="contain"
        />
      ) : null}

      <View style={styles.paperTitleBlock}>
        <Text style={[styles.paperTitle, { color: p.ink }]}>{BAST_KIND_TITLE[bast.kind]}</Text>
        <Text style={[styles.paperNumber, { color: p.muted }]}>{`No. ${bast.bastNumber}`}</Text>
      </View>

      <Text style={[styles.paperSentence, { color: p.body }]}>{opening}</Text>

      <View style={styles.paperParty}>
        {party.map(([label, value]) => (
          <View key={label} style={styles.paperPartyRow}>
            <Text style={[styles.paperPartyKey, { color: p.body }]}>{label}</Text>
            <Text style={[styles.paperPartyColon, { color: p.body }]}>:</Text>
            <Text style={[styles.paperPartyValue, { color: p.ink }]}>{value}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.paperSentence, { color: p.body }]}>{purpose}</Text>

      {/* The goods table. Fully ruled, like the scan — this sheet gets
          photocopied, and a table held together by whitespace does not
          survive that. */}
      <View style={[styles.goodsTable, { borderColor: p.tableBorder }]}>
        <View style={[styles.goodsRow, { borderBottomColor: p.tableBorder }]}>
          <Text style={[styles.goodsNo, styles.goodsHead, { color: p.ink }]}>No</Text>
          <Text
            style={[
              styles.goodsJenis,
              styles.goodsHead,
              styles.goodsCentre,
              { color: p.ink, borderLeftColor: p.tableBorder },
            ]}
          >
            Jenis/Type
          </Text>
          <Text
            style={[
              styles.goodsSerial,
              styles.goodsHead,
              { color: p.ink, borderLeftColor: p.tableBorder },
            ]}
          >
            Serial Number
          </Text>
          <Text
            style={[
              styles.goodsKondisi,
              styles.goodsHead,
              { color: p.ink, borderLeftColor: p.tableBorder },
            ]}
          >
            Kondisi
          </Text>
        </View>

        {items.map((item, i) => (
          <View
            key={`${item.jenis}-${i}`}
            style={[
              styles.goodsRow,
              {
                borderBottomWidth: i === items.length - 1 ? 0 : 1,
                borderBottomColor: p.tableBorder,
              },
            ]}
          >
            <Text style={[styles.goodsNo, styles.goodsCell, { color: p.ink }]}>{i + 1}</Text>
            <Text
              style={[
                styles.goodsJenis,
                styles.goodsCell,
                { color: p.ink, borderLeftColor: p.tableBorder },
              ]}
            >
              {item.jenis}
            </Text>
            <Text
              style={[
                styles.goodsSerial,
                styles.goodsCell,
                { color: p.ink, borderLeftColor: p.tableBorder },
              ]}
            >
              {item.serial}
            </Text>
            <Text
              style={[
                styles.goodsKondisi,
                styles.goodsCell,
                { color: p.ink, borderLeftColor: p.tableBorder },
              ]}
            >
              {item.kondisi}
            </Text>
          </View>
        ))}
      </View>

      <Text style={[styles.paperSentence, { color: p.body }]}>{closing}</Text>
      <Text style={[styles.paperPlace, { color: p.body }]}>{bast.placeDate}</Text>

      <View style={styles.signatures}>
        {(
          [
            ['handover', bast.handedOverBy],
            ['receiver', bast.employeeName],
          ] as const
        ).map(([role, fallbackName]) => {
          const signature = bast.signatures?.[role];
          return (
            <View key={role} style={styles.signature}>
              <Text style={[styles.signatureCaption, { color: p.body }]}>
                {signatureCaption(bast.kind, role)}
              </Text>
              <PreviewSignature signature={signature} />
              <Text style={[styles.signatureName, { color: p.ink, borderBottomColor: p.ink }]}>
                {signature?.signerName ?? fallbackName}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={[styles.paperFooter, { borderTopColor: p.tableBorder }]}>
        <Text style={[styles.paperFooterName, { color: p.body }]}>
          {bast.companyName.toUpperCase()}
        </Text>
        {bast.addressLine ? (
          <Text style={[styles.paperFooterAddress, { color: p.muted }]}>{bast.addressLine}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The goods table, editable.
 *
 * The scans carry three lines for one handover — laptop, charger, mouse — and
 * only the laptop is an asset. The other two have no serial and nobody wants
 * them in the register, so they exist on the document and nowhere else. Until
 * this card there was nowhere to put the charger, which is the whole reason the
 * generated sheet did not match the paper one.
 *
 * Editing is refused once the document is signed; that guard is in the RPC too,
 * so hiding the button is a courtesy rather than the rule.
 */
function GoodsEditor({ bast }: { bast: BastDetail }) {
  const t = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BastItem[]>([]);
  const [error, setError] = useState('');

  const begin = () => {
    setDraft(bast.items.map((item) => ({ ...item })));
    setError('');
    setEditing(true);
  };

  const update = (index: number, key: keyof BastItem, value: string) => {
    setDraft((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const save = useMutation({
    mutationFn: () =>
      setBastItems(
        bast.id,
        draft.map((row) => ({
          jenis: row.jenis.trim(),
          serial: row.serial.trim(),
          kondisi: row.kondisi.trim() || 'Baik',
        })),
      ),
    onSuccess: () => {
      setEditing(false);
      toast('Rincian barang saved');
      void queryClient.invalidateQueries({ queryKey: ['bastDetail', bast.id] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!editing) {
    return (
      <Card radius="cardMedium" padding={16} title="Rincian barang" style={styles.uploadCard}>
        <Text style={[t.type.meta, styles.itemsHint, { color: t.color.sub }]}>
          {`${bast.items.length} line${bast.items.length === 1 ? '' : 's'} on the sheet. Add the charger, the bag, the mouse — anything that went with the device but is not an asset of its own.`}
        </Text>
        <Button label="Edit the list" variant="secondary" block onPress={begin} />
      </Card>
    );
  }

  return (
    <Card radius="cardMedium" padding={16} title="Rincian barang" style={styles.uploadCard}>
      {draft.map((row, index) => (
        <View
          key={index}
          style={[
            styles.itemBlock,
            { borderColor: t.color.line, borderRadius: t.radii.inputLarge },
          ]}
        >
          <View style={styles.itemHead}>
            <Text style={[t.type.metaStrong, { color: t.color.sub }]}>{`No. ${index + 1}`}</Text>
            <Pressable
              onPress={() => setDraft((rows) => rows.filter((_, i) => i !== index))}
              accessibilityRole="button"
              accessibilityLabel={`Remove line ${index + 1}`}
              hitSlop={8}
            >
              <Trash2 size={15} color={t.color.error} strokeWidth={1.8} />
            </Pressable>
          </View>

          <Input
            label="Jenis/Type"
            value={row.jenis}
            onChangeText={(v) => update(index, 'jenis', v)}
            placeholder="e.g. Charger Adaptor"
            containerStyle={styles.itemField}
          />
          <Input
            label="Serial Number"
            value={row.serial}
            onChangeText={(v) => update(index, 'serial', v)}
            placeholder="- if it has none"
            autoCapitalize="characters"
            autoCorrect={false}
            containerStyle={styles.itemField}
          />
          <Input
            label="Kondisi"
            value={row.kondisi}
            onChangeText={(v) => update(index, 'kondisi', v)}
            placeholder="Baru / Baik / Bekas"
          />
        </View>
      ))}

      <Button
        label="Add a line"
        variant="secondary"
        block
        icon={<Plus size={15} color={t.color.text} strokeWidth={1.8} />}
        onPress={() => setDraft((rows) => [...rows, { jenis: '', serial: '-', kondisi: 'Baik' }])}
        style={styles.itemAction}
      />

      {error ? (
        <Text style={[t.type.meta, styles.itemsHint, { color: t.color.error }]}>{error}</Text>
      ) : null}

      <Button
        label="Save the list"
        block
        loading={save.isPending}
        disabled={draft.length === 0 || draft.some((row) => !row.jenis.trim())}
        onPress={() => {
          setError('');
          save.mutate();
        }}
        style={styles.itemAction}
      />
      <Button
        label="Cancel"
        variant="secondary"
        block
        onPress={() => setEditing(false)}
        style={styles.itemAction}
      />
    </Card>
  );
}

/**
 * The ink above the ruled line. Empty until someone signs, so the preview of an
 * unsigned document looks exactly like the blank sheet it is.
 */
function PreviewSignature({ signature }: { signature?: BastSignature }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  // Room for a real signature, not a scribble. 34px cramped anything with a
  // descender or a long flourish into a smear, and this box is the only place
  // the signature is checked before the sheet is printed.
  const height = 64;

  const paths =
    signature && width > 0 ? fitSignaturePaths(signature.strokes, width - 8, height - 8) : [];

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.signatureSpace, { height, borderBottomColor: t.paper.signatureLine }]}
    >
      {paths.length > 0 ? (
        <Svg width={width - 8} height={height - 8} style={styles.signatureInk}>
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
  sheetButton: { height: 40, minHeight: 40 },

  // --- paper -----------------------------------------------------------
  // Proportions mirror the PDF: the A4 content column is 471pt wide, so a
  // 8.5pt body here reads at roughly the size 10pt does on the sheet.
  paper: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 18 },
  // The ASPIRE artwork is a stacked lockup whose bottom line is "member of
  // ASTRA"; anything shorter renders that line as a smudge.
  paperAspire: { height: 38 },
  paperTitleBlock: { alignItems: 'center', marginTop: 18 },
  paperTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  paperNumber: { fontSize: 7.5, marginTop: 3, fontVariant: ['tabular-nums'] },
  paperSentence: { fontSize: 8.5, lineHeight: 14.5, marginTop: 12 },
  paperParty: { marginTop: 8, marginLeft: 14 },
  paperPartyRow: { flexDirection: 'row', paddingVertical: 1.5 },
  paperPartyKey: { width: 74, fontSize: 8.5 },
  paperPartyColon: { width: 10, fontSize: 8.5 },
  paperPartyValue: { flex: 1, fontSize: 8.5, fontWeight: '600' },

  goodsTable: { marginTop: 10, borderWidth: 1 },
  goodsRow: { flexDirection: 'row', borderBottomWidth: 1 },
  goodsHead: { fontSize: 8, fontWeight: '700', textAlign: 'center' },
  goodsCell: { fontSize: 8 },
  goodsCentre: { textAlign: 'center' },
  goodsNo: { width: 26, paddingVertical: 5, paddingHorizontal: 3, textAlign: 'center' },
  goodsJenis: { flex: 3, paddingVertical: 5, paddingHorizontal: 6, borderLeftWidth: 1 },
  goodsSerial: {
    flex: 2.4,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderLeftWidth: 1,
    textAlign: 'center',
  },
  goodsKondisi: {
    flex: 1.5,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderLeftWidth: 1,
    textAlign: 'center',
  },

  paperPlace: { fontSize: 8.5, marginTop: 14 },
  // Left column is the CITE side on BOTH documents — the caption changes, the
  // side does not. Left-aligned within each column, as on the scans.
  signatures: { flexDirection: 'row', gap: 14, marginTop: 10 },
  signature: { flex: 1 },
  signatureCaption: { fontSize: 8.5 },
  signatureSpace: { alignSelf: 'stretch', marginTop: 6, justifyContent: 'flex-end' },
  signatureInk: { alignSelf: 'flex-start' },
  signatureName: {
    fontSize: 8.5,
    fontWeight: '700',
    marginTop: 2,
    alignSelf: 'flex-start',
    borderBottomWidth: 1,
  },
  paperFooter: { marginTop: 22, paddingTop: 8, borderTopWidth: 1 },
  paperFooterName: { fontSize: 7.5, fontWeight: '700' },
  paperFooterAddress: { fontSize: 6.5, marginTop: 1.5, lineHeight: 9 },

  // --- goods editor ----------------------------------------------------
  itemsHint: { marginTop: 2, marginBottom: 12, lineHeight: 16 },
  itemBlock: { borderWidth: 1, padding: 12, marginBottom: 10 },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  itemField: { marginBottom: 10 },
  itemAction: { marginTop: 8 },

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
