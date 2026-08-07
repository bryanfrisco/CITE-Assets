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
 *
 * LABEL STOCK IS PER LOCATION
 * ---------------------------
 * `CTH-000001` is Head Office stock, `CTS-000001` is Site. A batch is printed
 * FOR a location, never with a chosen prefix — the prefix is a property of the
 * location (migration 0033), so it cannot be typed wrong. With one location in
 * scope the choice is made for you; with both, you pick, because a roll of tape
 * comes out of one printer and belongs to one store cupboard.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { AlertCircle, Check, ChevronLeft, FileDown, Printer, Search, X } from 'lucide-react-native';
import { SvgXml } from 'react-native-svg';

import { useTheme } from '@/theme';
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Input,
  Screen,
  Skeleton,
} from '@/components/ui';
import {
  createTagBatch,
  fetchTagDetail,
  fetchTagPrefixes,
  fetchTagStock,
  listTags,
  type TagRow,
  type TagStatus,
} from '@/api/tags';
import {
  DEFAULT_SYMBOLOGY,
  DEFAULT_TAPE,
  TAPE_WIDTHS,
  buildLabelCsv,
  buildLabelSheetA4Html,
  buildLabelSheetHtml,
  labelLengthMm,
  symbolSvg,
} from '@/lib/labels';
import type { LabelLayout, Symbology, TapeWidth } from '@/lib/labels';
import { formatDate } from '@/lib/dates';
import { useScopeStore } from '@/store/useScopeStore';
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
  const scope = useScopeStore((s) => s.scope);

  const [count, setCount] = useState('20');
  const [tape, setTape] = useState<TapeWidth>(DEFAULT_TAPE);
  const [symbology, setSymbology] = useState<Symbology>(DEFAULT_SYMBOLOGY);
  const [layout, setLayout] = useState<LabelLayout>('tape');
  const [filter, setFilter] = useState<TagStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [locationId, setLocationId] = useState<string | null>(null);

  const stock = useQuery({
    queryKey: ['tagStock', scope],
    queryFn: () => fetchTagStock(scope),
    enabled: scope.length > 0,
  });
  const tags = useQuery({
    queryKey: ['tags', filter, scope],
    queryFn: () => listTags(filter === 'all' ? undefined : filter, scope),
    enabled: scope.length > 0,
  });
  const prefixes = useQuery({
    queryKey: ['tagPrefixes', scope],
    queryFn: () => fetchTagPrefixes(scope),
    enabled: scope.length > 0,
  });

  // With one location in scope there is nothing to choose. Adjusted during
  // render rather than in an effect so the first paint already has an answer.
  const options = prefixes.data ?? [];
  const chosen = options.find((o) => o.location_id === locationId) ?? options[0] ?? null;
  if (chosen && locationId !== chosen.location_id) setLocationId(chosen.location_id);

  /**
   * Matches the sticker code AND what it is stuck to.
   *
   * Filtered here rather than in the database on purpose: `list_tags` already
   * returns the whole set and the screen already renders every row, so a search
   * box over what has been fetched is strictly better than what was here — and
   * it costs no migration. If the register ever outgrows that, the fix is a
   * `p_search` on list_tags, which means dropping the two-argument overload
   * rather than adding beside it (see migration 0029).
   */
  const needle = search.trim().toLowerCase();
  const matched = (tags.data ?? []).filter((row) => {
    if (!needle) return true;
    return [row.code, row.asset_code, row.asset_name]
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(needle));
  });
  const VISIBLE = 100;
  const shown = matched.slice(0, VISIBLE);

  const share = async (codes: string[], batchLabel: string) => {
    // CSV first — it is the one that reaches the LW-700.
    const csv = new File(Paths.cache, `labels-${batchLabel}.csv`);
    if (csv.exists) csv.delete();
    csv.create();
    csv.write(buildLabelCsv(codes, 'CITE ASSETS'));

    const options = { tape, caption: 'CITE ASSETS', symbology };
    const html =
      layout === 'a4'
        ? await buildLabelSheetA4Html(codes, options)
        : await buildLabelSheetHtml(codes, options);
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
      if (!chosen) throw new Error('Choose which location these labels are for');
      const batch = await createTagBatch(n, chosen.location_id);
      await share(batch.codes, batch.batchId.slice(0, 8));
      return batch;
    },
    onSuccess: (batch) => {
      toast(`${batch.codes.length} ${batch.prefix} labels issued for ${batch.locationName}`);
      void queryClient.invalidateQueries({ queryKey: ['tagStock'] });
      void queryClient.invalidateQueries({ queryKey: ['tags'] });
      void queryClient.invalidateQueries({ queryKey: ['tagPrefixes'] });
      setError('');
    },
    onError: (e: Error) => setError(e.message),
  });

  /**
   * Re-print stickers that already exist.
   *
   * Any status, deliberately. A sticker peels off a laptop, or goes through a
   * washing machine in a jacket pocket — the CODE is still the right one, and
   * reprinting it is how the device keeps the identity it already had. Limiting
   * this to blank stock would mean the only fix for a damaged label was issuing
   * a new one, which renames the device for no reason.
   *
   * This issues nothing. It exports codes the database already knows.
   */
  const reexport = useMutation({
    mutationFn: async (rows: TagRow[]) => {
      if (rows.length === 0) throw new Error('Tick the labels you want to re-export');
      await share(
        rows.map((r) => r.code),
        'reprint',
      );
      return rows.length;
    },
    onSuccess: (n) => {
      toast(`${n} label${n === 1 ? '' : 's'} re-exported`);
      setPicked(new Set());
      setError('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Screen
      refreshing={tags.isFetching || stock.isFetching}
      onRefresh={() => {
        void tags.refetch();
        void stock.refetch();
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
          {/* One location in scope: shown, not asked. Two: asked, because a
              roll of tape belongs to one store cupboard. */}
          {options.length > 1 ? (
            <>
              <Text style={[t.type.fieldLabel, styles.tapeLabel, { color: t.color.sub }]}>
                Label stock for
              </Text>
              <ChipRow style={styles.tapes}>
                {options.map((o) => (
                  <Chip
                    key={o.location_id}
                    label={`${o.location_name} · ${o.prefix}`}
                    active={chosen?.location_id === o.location_id}
                    onPress={() => setLocationId(o.location_id)}
                  />
                ))}
              </ChipRow>
            </>
          ) : chosen ? (
            <Text style={[t.type.meta, styles.stockLine, { color: t.color.sub }]}>
              {`${chosen.location_name} stock · codes will start ${chosen.prefix}- · ${chosen.blank} blank left`}
            </Text>
          ) : null}

          <Input
            label="How many labels"
            value={count}
            onChangeText={setCount}
            keyboardType="number-pad"
            placeholder="20"
            containerStyle={styles.field}
          />

          <Text style={[t.type.fieldLabel, styles.tapeLabel, { color: t.color.sub }]}>Symbol</Text>
          <ChipRow style={styles.tapes}>
            <Chip
              label="Barcode"
              active={symbology === 'barcode'}
              onPress={() => setSymbology('barcode')}
            />
            <Chip label="QR" active={symbology === 'qr'} onPress={() => setSymbology('qr')} />
          </ChipRow>

          <Text style={[t.type.fieldLabel, styles.tapeLabel, { color: t.color.sub }]}>
            PDF layout
          </Text>
          <ChipRow style={styles.tapes}>
            <Chip label="Tape roll" active={layout === 'tape'} onPress={() => setLayout('tape')} />
            <Chip label="A4 sheet" active={layout === 'a4'} onPress={() => setLayout('a4')} />
          </ChipRow>

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

          <LabelPreview tape={tape} symbology={symbology} />

          <Button
            label={chosen ? `Issue ${chosen.prefix} labels and export` : 'Issue and export'}
            block
            disabled={!chosen}
            loading={print.isPending}
            icon={<Printer size={15} color={t.color.onNavy} strokeWidth={1.8} />}
            onPress={() => print.mutate()}
            style={styles.action}
          />

          <Text style={[t.type.meta, styles.hint, { color: t.color.sub }]}>
            Two files are shared: a CSV for Epson Label Editor on a PC — the LW-700 has no
            Bluetooth, so it prints over USB — and a ready-made PDF for any other printer. In Label
            Editor the symbol is drawn at printer resolution from the `code` column, so it comes out
            sharper than any picture this phone could send.
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

      <Input
        size="search"
        value={search}
        onChangeText={setSearch}
        placeholder="CT-000001, asset code, name…"
        autoCapitalize="characters"
        autoCorrect={false}
        icon={<Search size={17} color={t.color.sub} strokeWidth={1.8} />}
        accessory={
          search ? (
            <Pressable
              onPress={() => setSearch('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={10}
            >
              <X size={16} color={t.color.sub} strokeWidth={1.9} />
            </Pressable>
          ) : null
        }
        containerStyle={styles.search}
      />

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
      ) : matched.length === 0 ? (
        <EmptyState
          title={needle ? 'Nothing matches that' : 'No labels yet'}
          description={
            needle
              ? `No label, asset code or name contains "${search.trim()}".`
              : 'Print a batch, stick them on your devices, then scan each one to register it.'
          }
          actionLabel={needle ? 'Clear the search' : undefined}
          onAction={needle ? () => setSearch('') : undefined}
        />
      ) : (
        <>
          {can('asset.create') ? (
            <View style={styles.selectBar}>
              <Pressable
                onPress={() =>
                  setPicked(
                    picked.size === shown.length ? new Set() : new Set(shown.map((r) => r.id)),
                  )
                }
                accessibilityRole="button"
                accessibilityLabel={picked.size === shown.length ? 'Clear selection' : 'Select all'}
                hitSlop={8}
              >
                <Text style={[t.type.metaStrong, { color: t.color.royal }]}>
                  {picked.size === shown.length && shown.length > 0 ? 'Clear' : 'Select all'}
                </Text>
              </Pressable>
              <Text style={[t.type.meta, { color: t.color.sub }]}>
                {picked.size > 0 ? `${picked.size} selected` : 'Tick to re-export'}
              </Text>
            </View>
          ) : null}

          <Card padding={0} radius="listContainer">
            {shown.map((row, i) => (
              <TagRowView
                key={row.id}
                row={row}
                last={i === shown.length - 1}
                selectable={can('asset.create')}
                checked={picked.has(row.id)}
                onToggle={() => toggle(row.id)}
                onPress={() => setOpenCode(row.code)}
              />
            ))}
          </Card>

          {matched.length > shown.length ? (
            <Text style={[t.type.meta, styles.more, { color: t.color.sub }]}>
              {`Showing ${shown.length} of ${matched.length}. Narrow the search to see the rest.`}
            </Text>
          ) : null}

          {can('asset.create') ? (
            <Button
              label={
                picked.size > 0
                  ? `Re-export ${picked.size} label${picked.size === 1 ? '' : 's'}`
                  : 'Re-export selected labels'
              }
              variant="secondary"
              block
              disabled={picked.size === 0}
              loading={reexport.isPending}
              icon={<FileDown size={15} color={t.color.text} strokeWidth={1.8} />}
              onPress={() => reexport.mutate(matched.filter((r) => picked.has(r.id)))}
              style={styles.action}
            />
          ) : null}
        </>
      )}
      <LabelSheet code={openCode} onDismiss={() => setOpenCode(null)} />
    </Screen>
  );
}

/**
 * What one sticker will look like, at the proportions of the chosen tape.
 *
 * Rendered from the same builder the PDF uses, so this is a preview rather than
 * an impression of one. The code shown is a placeholder — real codes are only
 * issued when the button is pressed, and drawing an unissued code here would
 * put a number on screen that does not exist yet.
 */
function LabelPreview({ tape, symbology }: { tape: TapeWidth; symbology: Symbology }) {
  const t = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [width, setWidth] = useState(0);

  const lengthMm = labelLengthMm(tape, symbology);
  const heightMm = tape * 0.75;
  const height = width > 0 ? (width * heightMm) / lengthMm : 0;

  const symbolWidth = symbology === 'qr' ? height * 0.7 : width * 0.9;
  const symbolHeight = symbology === 'qr' ? height * 0.7 : height * 0.5;

  useEffect(() => {
    if (width <= 0) return;
    let live = true;
    void symbolSvg('CT-000123', symbology, symbolWidth, symbolHeight).then((markup) => {
      if (live) setSvg(markup);
    });
    return () => {
      live = false;
    };
  }, [symbology, symbolWidth, symbolHeight, width]);

  return (
    <View style={styles.previewWrap}>
      <Text style={[t.type.fieldLabel, styles.tapeLabel, { color: t.color.sub }]}>
        {`Preview · ${lengthMm} × ${tape} mm`}
      </Text>

      <View
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={[
          styles.preview,
          {
            height: height || undefined,
            backgroundColor: t.paper.sheet,
            borderColor: t.color.line,
            borderRadius: t.radii.inputLarge,
            flexDirection: symbology === 'qr' ? 'row' : 'column',
          },
        ]}
      >
        {svg ? <SvgXml xml={svg} /> : null}
        <Text
          numberOfLines={1}
          style={[
            styles.previewCode,
            {
              color: t.paper.ink,
              fontSize: Math.max(8, height * 0.16),
              marginTop: symbology === 'qr' ? 0 : 4,
              marginLeft: symbology === 'qr' ? 8 : 0,
            },
          ]}
        >
          CT-000123
        </Text>
      </View>
    </View>
  );
}

/**
 * One label, and what is on it.
 *
 * Shows BOTH identities without suggesting either replaced the other:
 * `CT-000001` is the sticker, `SPRLAP24-HO-006` is the asset. Attaching one to
 * the other renames neither — which is exactly what makes a mislabelled device
 * recoverable, because voiding the sticker leaves the asset's own code alone.
 */
function LabelSheet({ code, onDismiss }: { code: string | null; onDismiss: () => void }) {
  const t = useTheme();
  const router = useRouter();

  const detail = useQuery({
    queryKey: ['tagDetail', code],
    queryFn: () => fetchTagDetail(code!),
    enabled: Boolean(code),
  });

  const d = detail.data;

  const status =
    d?.status === 'untagged'
      ? { label: 'Blank', tone: 'available' as const }
      : d?.status === 'void'
        ? { label: 'Voided', tone: 'retired' as const }
        : { label: 'In use', tone: undefined };

  return (
    <BottomSheet visible={Boolean(code)} onDismiss={onDismiss} title={code ?? 'Label'}>
      {detail.isPending ? (
        <Skeleton height={120} radius={t.radii.cardMedium} />
      ) : !d ? (
        <Text style={[t.type.meta, styles.sheetEmpty, { color: t.color.sub }]}>
          That label is not one of ours.
        </Text>
      ) : (
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={[t.type.assetCode, { color: t.color.royal }]}>{d.code}</Text>
            <Badge label={status.label} tone={status.tone} />
          </View>

          <SymbolPreview code={d.code} />

          {d.asset ? (
            <>
              <Text style={[t.type.sectionLabel, styles.sheetLabel, { color: t.color.sub }]}>
                On this asset
              </Text>
              <Pressable
                onPress={() => {
                  onDismiss();
                  router.push(`/asset/${d.asset!.assetCode}`);
                }}
                accessibilityRole="button"
                accessibilityLabel={d.asset.assetCode}
                style={({ pressed }) => [
                  styles.sheetAsset,
                  {
                    borderColor: t.color.line,
                    borderRadius: t.radii.inputLarge,
                    backgroundColor: pressed ? t.color.soft : 'transparent',
                  },
                ]}
              >
                <Text style={[t.type.assetCode, { color: t.color.royal }]}>
                  {d.asset.assetCode}
                </Text>
                <Text numberOfLines={1} style={[t.type.body, { color: t.color.text }]}>
                  {d.asset.name}
                </Text>
                <Text numberOfLines={1} style={[t.type.meta, { color: t.color.sub }]}>
                  {`SN ${d.asset.serialNumber}`}
                </Text>
                <View style={styles.sheetBadges}>
                  <Badge label={d.asset.statusName} />
                  <Badge label={d.asset.conditionName} />
                </View>
                <Text style={[t.type.meta, { color: t.color.sub }]}>
                  {[d.asset.locationName, d.asset.holderName ?? 'Nobody holding it']
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={[t.type.bodySmall, styles.sheetLabel, { color: t.color.sub }]}>
              {d.status === 'void'
                ? 'Voided and out of use. It cannot be attached to anything.'
                : 'Not on a device yet. Scan it to register what it goes on.'}
            </Text>
          )}

          <Text style={[t.type.sectionLabel, styles.sheetLabel, { color: t.color.sub }]}>
            History
          </Text>
          <View style={styles.sheetFacts}>
            <Fact label="Issued" value={formatDate(d.printedAt ?? d.createdAt)} />
            {d.taggedAt ? (
              <Fact
                label="Attached"
                value={`${formatDate(d.taggedAt)}${d.taggedByName ? ` · ${d.taggedByName}` : ''}`}
              />
            ) : null}
            {d.voidedAt ? (
              <Fact
                label="Voided"
                value={`${formatDate(d.voidedAt)}${d.voidedByName ? ` · ${d.voidedByName}` : ''}`}
              />
            ) : null}
            {d.voidReason ? <Fact label="Why" value={d.voidReason} /> : null}
          </View>

          {d.status === 'untagged' ? (
            <Button
              label="Scan it onto a device"
              block
              onPress={() => {
                onDismiss();
                router.push('/scan');
              }}
              style={styles.sheetAction}
            />
          ) : null}
        </View>
      )}
    </BottomSheet>
  );
}

/**
 * What is actually printed on this sticker, in both symbologies.
 *
 * Both are shown rather than whichever was selected up in the print form,
 * because the sticker in someone's hand was printed at some point in the past
 * and the form only says what the NEXT batch will look like. Seeing the symbol
 * next to the code is also the fastest way to tell a scanner fault ("it will
 * not read") from a data fault ("it reads, but the register disagrees").
 *
 * Drawn from the same builders the PDF and the CSV use, so this is a preview of
 * the real thing rather than an impression of one.
 */
function SymbolPreview({ code }: { code: string }) {
  const t = useTheme();
  const [barcode, setBarcode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [width, setWidth] = useState(0);

  const barcodeWidth = Math.max(0, width - 24);
  const barcodeHeight = 52;
  const qrSize = 104;

  useEffect(() => {
    if (barcodeWidth <= 0) return;
    let live = true;
    void Promise.all([
      symbolSvg(code, 'barcode', barcodeWidth, barcodeHeight),
      symbolSvg(code, 'qr', qrSize, qrSize),
    ]).then(([bars, square]) => {
      if (!live) return;
      setBarcode(bars);
      setQr(square);
    });
    return () => {
      live = false;
    };
  }, [code, barcodeWidth]);

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Text style={[t.type.sectionLabel, styles.sheetLabel, { color: t.color.sub }]}>
        What is on the sticker
      </Text>

      {/* Always white with black ink. It is a preview of something printed, and
          a dark-mode barcode is a preview of nothing — no scanner reads it. */}
      <View
        style={[
          styles.symbolCard,
          {
            backgroundColor: t.paper.sheet,
            borderColor: t.color.line,
            borderRadius: t.radii.inputLarge,
          },
        ]}
      >
        {barcode ? <SvgXml xml={barcode} /> : <Skeleton height={barcodeHeight} radius={4} />}
        <Text style={[styles.symbolCode, { color: t.paper.ink }]}>{code}</Text>

        <View style={[styles.symbolDivider, { backgroundColor: t.color.line }]} />

        {qr ? <SvgXml xml={qr} /> : <Skeleton height={qrSize} width={qrSize} radius={4} />}
        <Text style={[styles.symbolCaption, { color: t.paper.muted }]}>
          Code 128 above, QR below — both encode this code and nothing else
        </Text>
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={styles.factRow}>
      <Text style={[t.type.meta, styles.factLabel, { color: t.color.sub }]}>{label}</Text>
      <Text style={[t.type.metaStrong, styles.factValue, { color: t.color.text }]}>{value}</Text>
    </View>
  );
}

/**
 * One row: a tick box, then the sticker, then its state.
 *
 * The tick box is its own touch target rather than part of the row, because the
 * row already means "show me this label" and one gesture cannot mean two things.
 */
function TagRowView({
  row,
  last,
  selectable,
  checked,
  onToggle,
  onPress,
}: {
  row: TagRow;
  last: boolean;
  selectable: boolean;
  checked: boolean;
  onToggle: () => void;
  onPress: () => void;
}) {
  const t = useTheme();
  const label = row.status === 'untagged' ? 'Blank' : row.status === 'tagged' ? 'In use' : 'Voided';
  const tone =
    row.status === 'untagged' ? 'available' : row.status === 'void' ? 'retired' : undefined;

  return (
    <View
      style={[styles.row, { borderBottomWidth: last ? 0 : 1, borderBottomColor: t.color.line }]}
    >
      {selectable ? (
        <Pressable
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={`Select ${row.code}`}
          hitSlop={10}
          style={[
            styles.tick,
            {
              borderColor: checked ? t.color.royal : t.color.line,
              backgroundColor: checked ? t.color.royal : 'transparent',
            },
          ]}
        >
          {checked ? <Check size={13} color={t.color.onNavy} strokeWidth={3} /> : null}
        </Pressable>
      ) : null}

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={row.code}
        style={styles.rowText}
      >
        <Text style={[t.type.assetCode, { color: t.color.royal }]}>{row.code}</Text>
        <Text numberOfLines={1} style={[t.type.metaStrong, styles.rowMeta, { color: t.color.sub }]}>
          {[
            row.location_name,
            row.asset_code ? `${row.asset_code} · ${row.asset_name}` : 'Not yet on a device',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Pressable>

      <Badge label={label} tone={tone} />
    </View>
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
  tapes: { marginBottom: 12 },
  previewWrap: { marginTop: 4 },
  // Always white with black ink: it is a preview of something printed, and
  // a dark-mode sticker would be a preview of nothing.
  preview: {
    alignItems: 'center',
    justifyContent: 'center',

    borderWidth: 1,
    overflow: 'hidden',
  },
  previewCode: { fontWeight: '700', letterSpacing: 1.2 },
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
  search: { marginBottom: 10 },
  filters: { marginBottom: 12 },
  more: { marginTop: 10, textAlign: 'center' },
  skeletons: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  rowText: { flex: 1, minWidth: 0 },
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
    paddingHorizontal: 2,
  },
  stockLine: { marginBottom: 12, lineHeight: 16 },
  tick: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMeta: { marginTop: 3 },
  symbolCard: { borderWidth: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 12 },
  symbolCode: { marginTop: 6, fontWeight: '700', letterSpacing: 1.4, fontSize: 12 },
  symbolDivider: { alignSelf: 'stretch', height: 1, marginVertical: 16 },
  symbolCaption: { marginTop: 10, fontSize: 10, textAlign: 'center', lineHeight: 14 },
  sheet: { gap: 4 },
  sheetEmpty: { paddingVertical: 18, textAlign: 'center' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  sheetLabel: { marginTop: 14, marginBottom: 8 },
  sheetAsset: { borderWidth: 1, padding: 13, gap: 4 },
  sheetBadges: { flexDirection: 'row', gap: 7, marginTop: 4, marginBottom: 4 },
  sheetFacts: { gap: 7 },
  sheetAction: { marginTop: 16 },
  factRow: { flexDirection: 'row', gap: 10 },
  factLabel: { width: 74 },
  factValue: { flex: 1, minWidth: 0 },
});
