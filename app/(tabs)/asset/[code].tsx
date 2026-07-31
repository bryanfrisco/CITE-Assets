/**
 * Asset Detail — README § Screens 3.
 *
 * Back link "‹ Assets" · hero card (150px navy gradient with a radial gold glow
 * and the asset photo) · code, name, "Brand · Category · SN <serial>" ·
 * status/condition/location badges · primary Return/Assign button, BAST
 * secondary, ⋯ overflow · six scrollable tabs.
 *
 * Tab content is one asset_detail() round trip, so switching tabs never
 * refetches — README § Interactions: "Content cross-fades 180ms; no scroll
 * reset on Asset Detail."
 */

import React, { useEffect, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ChevronLeft, Download, FileText, MoreHorizontal } from 'lucide-react-native';

import { useTheme } from '@/theme';
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Screen,
  Skeleton,
} from '@/components/ui';
import { Avatar } from '@/components/chrome';
import { CategoryIcon } from '@/components/CategoryIcon';
import {
  fetchAssetDetail,
  signedPhotoUrl,
  uploadAssetPhoto,
  type AssetDetail,
  type TimelineKind,
} from '@/api/assets';
import { queryKeys } from '@/lib/queryClient';
import { useToast } from '@/store/useUiStore';
import { usePermissions } from '@/auth';

const TABS = ['Overview', 'Specs', 'Timeline', 'Documents', 'Assignments', 'Maintenance'] as const;
type Tab = (typeof TABS)[number];

export default function AssetDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { code } = useLocalSearchParams<{ code: string }>();

  const [tab, setTab] = useState<Tab>('Overview');
  const [overflowOpen, setOverflowOpen] = useState(false);

  const detail = useQuery({
    queryKey: queryKeys.asset(code ?? ''),
    queryFn: () => fetchAssetDetail(code ?? ''),
    enabled: Boolean(code),
  });

  if (detail.isPending) {
    return (
      <Screen>
        <Skeleton height={190} radius={t.radii.cardLarge} />
        <View style={styles.loadingRows}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={58} radius={t.radii.card} />
          ))}
        </View>
      </Screen>
    );
  }

  if (detail.isError) {
    return (
      <Screen>
        <EmptyState
          variant="error"
          title="Could not load this asset"
          description={(detail.error as Error).message}
          actionLabel="Try again"
          onAction={() => detail.refetch()}
        />
      </Screen>
    );
  }

  if (!detail.data) {
    // asset_detail() returns null both when the asset is missing and when RLS
    // hides it — the user gets the same answer either way.
    return (
      <Screen>
        <BackLink onPress={() => router.back()} />
        <EmptyState
          title="Asset not found"
          description="It may have been removed, or it sits outside the locations you can see."
          actionLabel="Back to Assets"
          onAction={() => router.replace('/assets')}
        />
      </Screen>
    );
  }

  const data = detail.data;
  const a = data.asset;
  const isAssigned = a.statusName === 'Assigned';

  return (
    <Screen>
      <BackLink onPress={() => router.back()} />

      <Hero
        detail={data}
        onPhotoChanged={() => queryClient.invalidateQueries({ queryKey: queryKeys.asset(code!) })}
      />

      <Text style={[t.type.assetCode, styles.code, { color: t.color.royal }]}>{a.assetCode}</Text>
      <Text style={[t.type.detailTitle, { color: t.color.text }]}>{a.name}</Text>
      <Text style={[t.type.meta, styles.subline, { color: t.color.sub }]}>
        {[a.brandName, a.categoryName].filter(Boolean).join(' · ')} · SN {a.serialNumber}
      </Text>

      <View style={styles.badges}>
        <Badge label={a.statusName} />
        <Badge label={a.conditionName} />
        <View
          style={[
            styles.locationChip,
            {
              borderRadius: t.radii.badge,
              backgroundColor: t.color.soft,
              borderColor: t.color.line,
            },
          ]}
        >
          <Text style={[t.type.badge, { color: t.color.sub }]}>{a.locationName}</Text>
        </View>
      </View>

      {can('assignment.write') ? (
        <View style={styles.actions}>
          <Button
            label={isAssigned ? 'Return Asset' : 'Assign Asset'}
            block
            // README § Interactions: "`Assigned` → Return flow (asset
            // pre-selected); otherwise → Assign flow."
            onPress={() =>
              router.push(
                isAssigned
                  ? `/assign?mode=return&asset=${a.assetCode}`
                  : `/assign?asset=${a.assetCode}`,
              )
            }
          />
          <Button
            label="E-BAST"
            variant="secondary"
            icon={<FileText size={15} color={t.color.text} strokeWidth={1.8} />}
            onPress={() => router.push('/bast')}
          />
          <Pressable
            onPress={() => setOverflowOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="More actions"
            hitSlop={8}
            style={[
              styles.overflow,
              {
                borderRadius: t.radii.button,
                backgroundColor: t.color.card,
                borderColor: t.color.line,
              },
            ]}
          >
            <MoreHorizontal size={18} color={t.color.text} strokeWidth={1.9} />
          </Pressable>
        </View>
      ) : null}

      <ChipRow style={styles.tabs}>
        {TABS.map((name) => (
          <Chip key={name} label={name} active={tab === name} onPress={() => setTab(name)} />
        ))}
      </ChipRow>

      <TabFade tab={tab}>
        {tab === 'Overview' ? <Overview detail={data} /> : null}
        {tab === 'Specs' ? <Specs detail={data} /> : null}
        {tab === 'Timeline' ? <Timeline detail={data} /> : null}
        {tab === 'Documents' ? <Documents detail={data} /> : null}
        {tab === 'Assignments' ? <Assignments detail={data} /> : null}
        {tab === 'Maintenance' ? <Maintenance detail={data} /> : null}
      </TabFade>

      <BottomSheet
        visible={overflowOpen}
        onDismiss={() => setOverflowOpen(false)}
        title="Asset actions"
      >
        <View style={styles.sheetActions}>
          {can('asset.edit') ? (
            <Button
              label="Edit asset"
              variant="secondary"
              block
              onPress={() => {
                setOverflowOpen(false);
                router.push(`/add-asset?edit=${a.assetCode}`);
              }}
            />
          ) : null}
          {can('asset.edit') ? (
            <Button
              label="Change status"
              variant="secondary"
              block
              onPress={() => {
                setOverflowOpen(false);
                router.push(`/asset/status?code=${a.assetCode}`);
              }}
            />
          ) : null}
          <Button
            label="Transfer"
            variant="secondary"
            block
            onPress={() => {
              setOverflowOpen(false);
              router.push(`/transfer?asset=${a.assetCode}`);
            }}
          />
          {can('asset.delete') ? (
            <Button
              label="Delete asset"
              variant="destructive"
              block
              onPress={() => {
                setOverflowOpen(false);
                toast('Asset deletion arrives with the audit review in Phase 8');
              }}
            />
          ) : null}
        </View>
      </BottomSheet>
    </Screen>
  );
}

function BackLink({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Back to Assets"
      hitSlop={8}
      style={styles.back}
    >
      <ChevronLeft size={17} color={t.color.royal} strokeWidth={1.9} />
      <Text style={[t.type.metaStrong, { color: t.color.royal }]}>Assets</Text>
    </Pressable>
  );
}

/**
 * Hero — README § Asset Detail: "150px navy gradient with a radial gold glow
 * and a dashed asset-photo placeholder → replace with real photo + upload."
 */
function Hero({ detail, onPhotoChanged }: { detail: AssetDetail; onPhotoChanged: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const { can } = usePermissions();
  const [url, setUrl] = useState<string | null>(null);
  const a = detail.asset;

  // The bucket is private, so the image renders through a short-lived signed
  // URL. setUrl only ever fires from the promise callback; the "no photo yet"
  // case is derived below instead of being written back into state.
  useEffect(() => {
    if (!a.photoPath) return;
    let cancelled = false;
    void signedPhotoUrl(a.photoPath).then((signed) => {
      if (!cancelled) setUrl(signed);
    });
    return () => {
      cancelled = true;
    };
  }, [a.photoPath]);

  const photoUrl = a.photoPath ? url : null;

  const upload = useMutation({
    mutationFn: async (source: 'camera' | 'library') => {
      const picker =
        source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;

      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('Permission denied');

      const result = await picker({ quality: 0.7, mediaTypes: ['images'] });
      if (result.canceled || !result.assets[0]) return null;

      const picked = result.assets[0];
      const response = await fetch(picked.uri);
      const bytes = await response.arrayBuffer();
      return uploadAssetPhoto(a.id, bytes, picked.mimeType ?? 'image/jpeg');
    },
    onSuccess: (path) => {
      if (!path) return;
      toast('Photo updated');
      onPhotoChanged();
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  return (
    <Card radius="cardLarge" padding={0} style={styles.hero}>
      <LinearGradient
        colors={[...t.gradients.navy.colors]}
        locations={[...t.gradients.navy.locations]}
        start={t.gradients.navy.start}
        end={t.gradients.navy.end}
        style={styles.heroGradient}
      >
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={[styles.placeholder, { borderColor: 'rgba(212,175,55,0.34)' }]}>
            <CategoryIcon name={a.categoryIcon} size={28} color={t.color.gold} />
            <Text style={[t.type.meta, { color: t.color.gold, marginTop: 6 }]}>No photo yet</Text>
          </View>
        )}

        {can('asset.edit') ? (
          <Pressable
            onPress={() => upload.mutate('library')}
            onLongPress={() => upload.mutate('camera')}
            accessibilityRole="button"
            accessibilityLabel="Upload asset photo"
            hitSlop={8}
            style={[styles.photoButton, { borderRadius: t.radii.iconChip }]}
          >
            <Camera size={16} color={t.color.gold} strokeWidth={1.8} />
          </Pressable>
        ) : null}
      </LinearGradient>
    </Card>
  );
}

/** README § Interactions: tab content cross-fades over 180ms. */
function TabFade({ tab, children }: { tab: Tab; children: React.ReactNode }) {
  const t = useTheme();
  const [fade] = useState(() => new Animated.Value(1));

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: t.motion.fade.duration,
      easing: t.motion.fade.easing,
      useNativeDriver: true,
    }).start();
  }, [tab, fade, t.motion.fade]);

  return <Animated.View style={{ opacity: fade }}>{children}</Animated.View>;
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  const t = useTheme();
  return (
    <View style={[styles.kvRow, { borderBottomColor: t.color.line }]}>
      <Text style={[t.type.meta, styles.kvLabel, { color: t.color.sub }]}>{label}</Text>
      <Text style={[t.type.bodySmall, styles.kvValue, { color: t.color.text }]}>
        {value || '—'}
      </Text>
    </View>
  );
}

function formatIdr(value: string | number | null): string {
  if (value == null) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  return `Rp ${n.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
}

function Overview({ detail }: { detail: AssetDetail }) {
  const t = useTheme();
  const a = detail.asset;
  return (
    <>
      <Card padding={14}>
        <Row label="Assigned to" value={a.assignedToName} />
        <Row label="Department" value={a.departmentName} />
        <Row label="Current location" value={a.locationName} />
        <Row label="Purchase date" value={a.purchaseDate} />
        <Row label="Purchase price" value={formatIdr(a.purchasePrice)} />
        <Row
          label="Warranty"
          value={a.warrantyStart && a.warrantyEnd ? `${a.warrantyStart} → ${a.warrantyEnd}` : null}
        />
        <Row label="Vendor" value={a.vendorName} />
        <Row label="Model" value={a.modelName} />
      </Card>

      <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>Notes</Text>
      <Card padding={14}>
        <Text style={[t.type.bodySmall, { color: a.notes ? t.color.text : t.color.sub }]}>
          {a.notes || 'No notes recorded.'}
        </Text>
      </Card>
    </>
  );
}

function Specs({ detail }: { detail: AssetDetail }) {
  const specs = detail.asset.specifications ?? [];
  if (specs.length === 0) {
    return (
      <EmptyState title="No specifications yet" description="Add them from the Edit asset form." />
    );
  }
  return (
    <Card padding={14}>
      {specs.map((spec, i) => (
        <Row key={i} label={spec.key} value={spec.value} />
      ))}
    </Card>
  );
}

function Timeline({ detail }: { detail: AssetDetail }) {
  const t = useTheme();
  const events = detail.timeline ?? [];

  if (events.length === 0) {
    return <EmptyState title="Nothing recorded yet" description="Events appear as they happen." />;
  }

  const dotColor = (kind: TimelineKind) => t.timeline[kind] ?? t.color.neutral;

  return (
    <Card padding={14}>
      {events.map((event, i) => (
        <View key={i} style={styles.timelineRow}>
          <View style={styles.rail}>
            <View style={[styles.halo, { backgroundColor: `${dotColor(event.kind)}22` }]}>
              <View style={[styles.dot, { backgroundColor: dotColor(event.kind) }]} />
            </View>
            {i < events.length - 1 ? (
              <View style={[styles.connector, { backgroundColor: t.color.line }]} />
            ) : null}
          </View>

          <View style={styles.timelineBody}>
            <View style={styles.timelineHead}>
              <Text style={[t.type.timelineTitle, { color: t.color.text }]}>{event.title}</Text>
              <Text style={[t.type.meta, { color: t.color.sub }]}>
                {new Date(event.at).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <Text style={[t.type.meta, { color: t.color.sub, marginTop: 3 }]}>{event.detail}</Text>
            {event.tag ? (
              <View
                style={[
                  styles.tag,
                  {
                    borderRadius: t.radii.badge,
                    backgroundColor: t.color.soft,
                    borderColor: t.color.line,
                  },
                ]}
              >
                <Text style={[t.type.badge, { color: t.color.royal }]}>{event.tag}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </Card>
  );
}

function Documents({ detail }: { detail: AssetDetail }) {
  const t = useTheme();
  const toast = useToast();
  const docs = detail.documents ?? [];

  const extColor = (doc: { kind: string; mimeType: string | null }) => {
    if (doc.kind === 'signed_bast') return t.documentChip.signedBast;
    if (doc.mimeType?.includes('pdf')) return t.documentChip.pdf;
    return t.documentChip.jpg;
  };

  if (docs.length === 0) {
    return (
      <EmptyState
        title="No documents yet"
        description="Invoices, warranty cards and signed E-BAST documents appear here."
      />
    );
  }

  return (
    <View style={styles.docList}>
      {docs.map((doc) => (
        <Card key={doc.id} padding={13} style={styles.docRow}>
          <View style={[styles.extChip, { backgroundColor: extColor(doc), borderRadius: 7 }]}>
            <Text style={[t.type.badge, { color: t.color.onNavy }]}>
              {(doc.mimeType?.split('/')[1] ?? 'FILE').slice(0, 3).toUpperCase()}
            </Text>
          </View>
          <View style={styles.docText}>
            <Text numberOfLines={1} style={[t.type.body, { color: t.color.text }]}>
              {doc.title}
            </Text>
            <Text style={[t.type.meta, { color: t.color.sub, marginTop: 2 }]}>
              {[
                doc.kind.replace(/_/g, ' '),
                doc.fileSize ? `${(doc.fileSize / 1_048_576).toFixed(1)} MB` : null,
                new Date(doc.createdAt).toLocaleDateString('en-GB'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Pressable
            onPress={() => toast('Document download arrives in Phase 6')}
            accessibilityRole="button"
            accessibilityLabel={`Download ${doc.title}`}
            hitSlop={8}
          >
            <Download size={17} color={t.color.sub} strokeWidth={1.8} />
          </Pressable>
        </Card>
      ))}
    </View>
  );
}

function Assignments({ detail }: { detail: AssetDetail }) {
  const t = useTheme();
  const rows = detail.assignments ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Never assigned"
        description="Assignment history appears once this asset is handed over."
      />
    );
  }

  return (
    <View style={styles.docList}>
      {rows.map((row) => (
        <Card key={row.id} padding={13} style={styles.docRow}>
          <Avatar name={row.accountName} size={t.sizes.avatarHistory} />
          <View style={styles.docText}>
            <View style={styles.timelineHead}>
              <Text numberOfLines={1} style={[t.type.body, { color: t.color.text }]}>
                {row.accountName}
              </Text>
              <Badge label={row.state === 'active' ? 'Active' : 'Returned'} />
            </View>
            <Text style={[t.type.meta, { color: t.color.sub, marginTop: 2 }]}>
              {row.departmentName ?? '—'} · {row.assignedDate}
              {row.returnedDate ? ` → ${row.returnedDate}` : ''}
            </Text>
            {row.bastNumber ? (
              <Text style={[t.type.assetCode, { color: t.color.royal, marginTop: 4 }]}>
                {row.bastNumber}
              </Text>
            ) : null}
          </View>
        </Card>
      ))}
    </View>
  );
}

function Maintenance({ detail }: { detail: AssetDetail }) {
  const t = useTheme();
  const rows = detail.maintenance ?? [];

  const stateLabel: Record<string, string> = {
    open: 'Maintenance',
    in_progress: 'Maintenance',
    completed: 'Good',
    cancelled: 'Retired',
  };

  if (rows.length === 0) {
    return (
      <EmptyState title="No service records" description="Maintenance history appears here." />
    );
  }

  return (
    <View style={styles.docList}>
      {rows.map((row) => (
        <Card key={row.id} padding={14}>
          <View style={styles.timelineHead}>
            <Badge label={stateLabel[row.state] ?? 'Maintenance'} />
            <Text style={[t.type.meta, { color: t.color.sub }]}>{row.startedAt}</Text>
          </View>
          <Text style={[t.type.body, { color: t.color.text, marginTop: 9 }]}>{row.title}</Text>
          {row.detail ? (
            <Text style={[t.type.meta, { color: t.color.sub, marginTop: 3 }]}>{row.detail}</Text>
          ) : null}
          <View style={[styles.maintFooter, { borderTopColor: t.color.line }]}>
            <Text style={[t.type.meta, { color: t.color.sub }]}>
              Vendor · {row.vendorName ?? 'Internal'}
            </Text>
            <Text style={[t.type.meta, { color: t.color.sub }]}>Cost · {formatIdr(row.cost)}</Text>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 10, minHeight: 24 },
  loadingRows: { marginTop: 14, gap: 9 },
  hero: { overflow: 'hidden', marginBottom: 14 },
  heroGradient: { height: 150, alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', height: '100%' },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingHorizontal: 26,
    paddingVertical: 18,
  },
  photoButton: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(4,8,22,0.42)',
  },
  code: { marginBottom: 3 },
  subline: { marginTop: 5 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11, flexWrap: 'wrap' },
  locationChip: { paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  overflow: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  tabs: { marginTop: 18, marginBottom: 14 },
  sectionLabel: { marginTop: 18, marginBottom: 9, marginLeft: 2 },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  kvLabel: { width: 104 },
  kvValue: { flex: 1, textAlign: 'right' },
  timelineRow: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 17 },
  halo: { width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 11, height: 11, borderRadius: 6 },
  connector: { width: 1.5, flex: 1, marginVertical: 2 },
  timelineBody: { flex: 1, minWidth: 0, paddingBottom: 16 },
  timelineHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tag: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  docList: { gap: 9 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  extChip: { paddingHorizontal: 8, paddingVertical: 6 },
  docText: { flex: 1, minWidth: 0 },
  maintFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: 1,
    marginTop: 11,
    paddingTop: 10,
  },
  sheetActions: { gap: 10, paddingBottom: 4 },
});
