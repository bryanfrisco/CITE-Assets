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
import {
  Animated,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  Barcode,
  Camera,
  ChevronLeft,
  Download,
  FileText,
  Image as ImageIcon,
  MoreHorizontal,
  Trash2,
  X,
  Upload,
  Wrench,
} from 'lucide-react-native';

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
  PickerSheet,
  Screen,
  SelectField,
  Skeleton,
} from '@/components/ui';
import { Avatar } from '@/components/chrome';
import { CategoryIcon } from '@/components/CategoryIcon';
import {
  MAX_ASSET_PHOTOS,
  addAssetPhoto,
  deleteAsset,
  fetchAssetDetail,
  fetchAssetPhotos,
  removeAssetPhoto,
  signedPhotoUrl,
  type AssetDetail,
  type AssetPhoto,
  type TimelineKind,
} from '@/api/assets';
import { attachTag, fetchAssetTagCode } from '@/api/tags';
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABEL,
  MAX_DOCUMENT_BYTES,
  addDocument,
  signedDocumentUrl,
  uploadDocumentFile,
  type DocumentKind,
} from '@/api/documents';
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelCode, setLabelCode] = useState('');
  const [labelError, setLabelError] = useState('');

  const detail = useQuery({
    queryKey: queryKeys.asset(code ?? ''),
    queryFn: () => fetchAssetDetail(code ?? ''),
    enabled: Boolean(code),
  });

  // The label physically on this device, if any. An asset added through the
  // form has none — scanning a blank sticker is the other way in, and this is
  // how the two paths meet.
  const tag = useQuery({
    queryKey: ['assetTag', detail.data?.asset.id],
    queryFn: () => fetchAssetTagCode(detail.data!.asset.id),
    enabled: Boolean(detail.data?.asset.id),
  });

  const attach = useMutation({
    mutationFn: () => attachTag(labelCode.trim().toUpperCase(), detail.data!.asset.id),
    onSuccess: (result) => {
      setLabelOpen(false);
      setLabelCode('');
      void queryClient.invalidateQueries({ queryKey: ['assetTag'] });
      void queryClient.invalidateQueries({ queryKey: ['tags'] });
      void queryClient.invalidateQueries({ queryKey: ['tagStock'] });
      toast(result.alreadyAttached ? 'That label was already on it' : 'Label attached');
    },
    onError: (e: Error) => setLabelError(e.message),
  });

  // The database refuses this for anything with an assignment, a movement, an
  // E-BAST, a document, a maintenance record, a label or a status change behind
  // it, and says which. That message is shown verbatim rather than softened,
  // because it names the thing the person needs to look at.
  const remove = useMutation({
    mutationFn: () => deleteAsset(detail.data!.asset.id, deleteReason),
    onSuccess: (result) => {
      setDeleteOpen(false);
      setDeleteReason('');
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['assetCount'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast(`${result.assetCode} deleted`);
      router.replace('/assets');
    },
    onError: (e: Error) => setDeleteError(e.message),
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

      {tag.data ? (
        <Pressable
          onPress={() => router.push('/labels')}
          accessibilityRole="button"
          accessibilityLabel={`Label ${tag.data}`}
          style={styles.labelRow}
        >
          <Barcode size={13} color={t.color.sub} strokeWidth={1.8} />
          <Text style={[t.type.metaStrong, { color: t.color.royal }]}>{tag.data}</Text>
          <Text style={[t.type.meta, { color: t.color.sub }]}>label on this device</Text>
        </Pressable>
      ) : can('asset.edit') ? (
        <Pressable
          onPress={() => {
            setLabelError('');
            setLabelOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Attach a label"
          style={styles.labelRow}
        >
          <Barcode size={13} color={t.color.sub} strokeWidth={1.8} />
          <Text style={[t.type.metaStrong, { color: t.color.royal }]}>Attach a label</Text>
          <Text style={[t.type.meta, { color: t.color.sub }]}>no barcode on this one yet</Text>
        </Pressable>
      ) : null}

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
            onPress={() => {
              // Newest first, as asset_detail() returns them. One tap should
              // land on this asset's document, not on a list to search.
              const newest = data.bast?.[0];
              if (newest) router.push(`/bast/${newest.id}`);
              else toast('No E-BAST for this asset yet');
            }}
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
                setDeleteError('');
                setDeleteOpen(true);
              }}
            />
          ) : null}
        </View>
      </BottomSheet>

      <BottomSheet visible={labelOpen} onDismiss={() => setLabelOpen(false)} title="Attach a label">
        <View style={styles.sheetActions}>
          <Text style={[t.type.bodySmall, { color: t.color.text, lineHeight: 18 }]}>
            Type the code printed on a blank sticker, or scan it. The label keeps its own code —
            attaching it does not rename this asset, and the asset keeps {a.assetCode}.
          </Text>

          <Input
            label="Label code"
            required
            value={labelCode}
            onChangeText={(value) => {
              setLabelCode(value);
              setLabelError('');
            }}
            placeholder="CT-000001"
            autoCapitalize="characters"
            autoCorrect={false}
          />

          {labelError ? (
            <Text style={[t.type.meta, { color: t.color.error, lineHeight: 16 }]}>
              {labelError}
            </Text>
          ) : null}

          <Button
            label="Attach"
            block
            disabled={labelCode.trim().length === 0}
            loading={attach.isPending}
            onPress={() => attach.mutate()}
          />
          <Button
            label="Scan it instead"
            variant="secondary"
            block
            onPress={() => {
              setLabelOpen(false);
              router.push('/scan');
            }}
          />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={deleteOpen}
        onDismiss={() => setDeleteOpen(false)}
        title={`Delete ${a.assetCode}?`}
      >
        <View style={styles.sheetActions}>
          <Text style={[t.type.bodySmall, { color: t.color.text, lineHeight: 18 }]}>
            This removes the record entirely. It is for something entered by mistake — anything with
            history behind it is refused, and should be retired instead.
          </Text>

          <Input
            label="Why"
            required
            value={deleteReason}
            onChangeText={(value) => {
              setDeleteReason(value);
              setDeleteError('');
            }}
            placeholder="e.g. Duplicate of LPT004-26-011, entered twice"
            multiline
            numberOfLines={2}
          />

          {deleteError ? (
            <Text style={[t.type.meta, { color: t.color.error, lineHeight: 16 }]}>
              {deleteError}
            </Text>
          ) : null}

          <Button
            label="Delete permanently"
            variant="destructive"
            block
            disabled={deleteReason.trim().length === 0}
            loading={remove.isPending}
            onPress={() => remove.mutate()}
          />
          <Button label="Keep it" variant="secondary" block onPress={() => setDeleteOpen(false)} />
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
 *
 * An asset has PHOTOS now (migration 0036), so the band is a carousel. A
 * laptop needs the lid, the label, the broken port and the dent it arrived
 * with, and the fourth is the one somebody wants six months later when the
 * vendor argues about who broke it.
 *
 * The bucket is private, so every frame renders through a short-lived signed
 * URL. They are minted together and kept in one map keyed by path — one state
 * write for the whole gallery rather than one per frame, so swiping never
 * lands on a blank while a URL is still in flight.
 */
function Hero({ detail, onPhotoChanged }: { detail: AssetDetail; onPhotoChanged: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { width: screenW } = useWindowDimensions();

  const [urls, setUrls] = useState<Record<string, string>>({});
  const [photoSheet, setPhotoSheet] = useState(false);
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  // Which button should show the spinner. Both call the same mutation, so the
  // mutation alone cannot say which one the person pressed.
  const [photoSource, setPhotoSource] = useState<'camera' | 'library'>('camera');
  const a = detail.asset;

  const photos = useQuery({
    queryKey: ['assetPhotos', a.id],
    queryFn: () => fetchAssetPhotos(a.id),
  });

  const rows = photos.data ?? [];
  const paths = rows.map((r) => r.file_path).join('|');

  useEffect(() => {
    if (!paths) return;
    let cancelled = false;
    const list = paths.split('|');
    void Promise.all(list.map((path) => signedPhotoUrl(path))).then((signed) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      list.forEach((path, i) => {
        const url = signed[i];
        if (url) next[path] = url;
      });
      setUrls(next);
    });
    return () => {
      cancelled = true;
    };
  }, [paths]);

  // A deleted last photo must not leave the carousel parked past the end.
  const safePage = Math.min(page, Math.max(0, rows.length - 1));
  const current = rows[safePage] ?? null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['assetPhotos', a.id] });
    onPhotoChanged();
  };

  const upload = useMutation({
    mutationFn: async (source: 'camera' | 'library') => {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        // Naming what was refused, because "Permission denied" on a phone with
        // two separate permissions tells nobody which one to go and turn on.
        throw new Error(
          source === 'camera'
            ? 'Camera access is off for CITE Assets. Turn it on in the phone settings.'
            : 'Photo access is off for CITE Assets. Turn it on in the phone settings.',
        );
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.7, mediaTypes: ['images'] })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });
      if (result.canceled || !result.assets[0]) return null;

      const picked = result.assets[0];
      const response = await fetch(picked.uri);
      const bytes = await response.arrayBuffer();
      return addAssetPhoto(a.id, bytes, picked.mimeType ?? 'image/jpeg');
    },
    onSuccess: (added) => {
      setPhotoSheet(false);
      if (!added) return;
      toast('Photo added');
      refresh();
    },
    onError: (e: Error) => {
      setPhotoSheet(false);
      toast(e.message, 'error');
    },
  });

  const remove = useMutation({
    mutationFn: (photoId: string) => removeAssetPhoto(photoId),
    onSuccess: (result) => {
      setPhotoSheet(false);
      setPage((current) => Math.max(0, Math.min(current, result.remaining - 1)));
      toast('Photo removed');
      refresh();
    },
    onError: (e: Error) => {
      setPhotoSheet(false);
      toast(e.message, 'error');
    },
  });

  const heroWidth = Math.max(1, screenW - 32);
  // The RPC refuses the sixth anyway; disabling the buttons means nobody has to
  // open the camera to be told no.
  const full = rows.length >= MAX_ASSET_PHOTOS;

  return (
    <Card radius="cardLarge" padding={0} style={styles.hero}>
      <LinearGradient
        colors={[...t.gradients.navy.colors]}
        locations={[...t.gradients.navy.locations]}
        start={t.gradients.navy.start}
        end={t.gradients.navy.end}
        style={styles.heroGradient}
      >
        {rows.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              setPage(Math.round(event.nativeEvent.contentOffset.x / heroWidth));
            }}
          >
            {rows.map((photo) => (
              <Pressable
                key={photo.id}
                onPress={() => setViewerAt(rows.indexOf(photo))}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Open photo ${photo.sort_order} of ${a.name}`}
                style={{ width: heroWidth, height: '100%' }}
              >
                {urls[photo.file_path] ? (
                  <Image
                    source={{ uri: urls[photo.file_path] }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.placeholder, { borderColor: 'rgba(212,175,55,0.34)' }]}>
            <CategoryIcon name={a.categoryIcon} size={28} color={t.color.gold} />
            <Text style={[t.type.meta, { color: t.color.gold, marginTop: 6 }]}>No photo yet</Text>
          </View>
        )}

        {/* Dots, not a counter: at these sizes a person is checking "is there
            another one", not counting to seven. */}
        {rows.length > 1 ? (
          <View style={styles.heroDots} pointerEvents="none">
            {rows.map((photo, i) => (
              <View
                key={photo.id}
                style={[
                  styles.heroDot,
                  {
                    backgroundColor: i === safePage ? t.color.gold : t.viewer.dotIdle,
                    width: i === safePage ? 16 : 6,
                  },
                ]}
              />
            ))}
          </View>
        ) : null}

        {/* Tapping used to open the GALLERY, with the camera hidden behind a
            long press — on a button drawn as a camera. Nobody discovers a long
            press, and the icon was promising the one thing it did not do. */}
        {can('asset.edit') ? (
          <Pressable
            onPress={() => setPhotoSheet(true)}
            accessibilityRole="button"
            accessibilityLabel="Asset photos"
            hitSlop={8}
            style={[styles.photoButton, { borderRadius: t.radii.iconChip }]}
          >
            <Camera size={16} color={t.color.gold} strokeWidth={1.8} />
          </Pressable>
        ) : null}
      </LinearGradient>

      <BottomSheet
        visible={photoSheet}
        onDismiss={() => setPhotoSheet(false)}
        title="Photos"
        subtitle={
          rows.length > 0
            ? `${rows.length} of ${MAX_ASSET_PHOTOS} · showing ${safePage + 1}`
            : `${a.assetCode} · ${a.name}`
        }
      >
        {full ? (
          <Text style={[t.type.meta, styles.photoFull, { color: t.color.sub }]}>
            {`Five is the limit. Remove one to make room.`}
          </Text>
        ) : null}

        <View style={styles.photoChoices}>
          <Button
            label="Take a photo"
            block
            disabled={full}
            loading={upload.isPending && photoSource === 'camera'}
            icon={<Camera size={15} color={t.color.onNavy} strokeWidth={1.8} />}
            onPress={() => {
              setPhotoSource('camera');
              upload.mutate('camera');
            }}
          />
          <Button
            label="Choose from gallery"
            variant="secondary"
            block
            disabled={full}
            loading={upload.isPending && photoSource === 'library'}
            icon={<ImageIcon size={15} color={t.color.text} strokeWidth={1.8} />}
            onPress={() => {
              setPhotoSource('library');
              upload.mutate('library');
            }}
          />
          {current ? (
            <Button
              label={`Remove photo ${safePage + 1}`}
              variant="destructive"
              block
              loading={remove.isPending}
              icon={<Trash2 size={15} color={t.color.error} strokeWidth={1.8} />}
              onPress={() => remove.mutate(current.id)}
            />
          ) : null}
        </View>
      </BottomSheet>

      <PhotoViewer
        photos={rows}
        urls={urls}
        startAt={viewerAt}
        caption={`${a.assetCode} · ${a.name}`}
        onDismiss={() => setViewerAt(null)}
      />
    </Card>
  );
}

/**
 * The photos, uncropped, on a black sheet.
 *
 * `contain` rather than `cover`: the hero band crops to fill, which is the
 * right choice there and the wrong one the moment somebody taps to actually
 * look — a serial number near the edge of the frame is exactly what gets
 * cropped away, and exactly what they opened it to read.
 *
 * Black in both themes, because everything around a photograph changes how it
 * reads.
 */
function PhotoViewer({
  photos,
  urls,
  startAt,
  caption,
  onDismiss,
}: {
  photos: AssetPhoto[];
  urls: Record<string, string>;
  startAt: number | null;
  caption: string;
  onDismiss: () => void;
}) {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const [at, setAt] = useState(0);

  // Opening always starts on the frame that was tapped. Adjusted during render
  // rather than in an effect, so the first paint is already the right photo.
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  if (startAt !== null && openedAt !== startAt) {
    setOpenedAt(startAt);
    setAt(startAt);
  }
  if (startAt === null && openedAt !== null) setOpenedAt(null);

  const visible = startAt !== null && photos.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={[styles.viewerFill, { backgroundColor: t.viewer.sheet }]}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: (startAt ?? 0) * width, y: 0 }}
          onMomentumScrollEnd={(event) => {
            setAt(Math.round(event.nativeEvent.contentOffset.x / width));
          }}
        >
          {photos.map((photo) => (
            <Pressable
              key={photo.id}
              onPress={onDismiss}
              accessibilityLabel="Close the photo"
              style={{ width, height }}
            >
              {urls[photo.file_path] ? (
                <Image
                  source={{ uri: urls[photo.file_path] }}
                  style={{ width, height }}
                  resizeMode="contain"
                />
              ) : null}
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.viewerCaption} pointerEvents="none">
          <Text numberOfLines={1} style={[t.type.metaStrong, { color: t.viewer.caption }]}>
            {photos.length > 1 ? `${caption} · ${at + 1} of ${photos.length}` : caption}
          </Text>
        </View>

        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
          style={[styles.viewerClose, { backgroundColor: t.viewer.chip }]}
        >
          <X size={20} color={t.viewer.ink} strokeWidth={2} />
        </Pressable>
      </View>
    </Modal>
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
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const docs = detail.documents ?? [];

  const [progress, setProgress] = useState<number | null>(null);
  const [kindOpen, setKindOpen] = useState(false);
  const [kind, setKind] = useState<DocumentKind>('invoice');

  const extColor = (doc: { kind: string; mimeType: string | null }) => {
    if (doc.kind === 'signed_bast') return t.documentChip.signedBast;
    if (doc.mimeType?.includes('pdf')) return t.documentChip.pdf;
    return t.documentChip.jpg;
  };

  const upload = useMutation({
    mutationFn: async () => {
      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return null;

      const file = picked.assets[0];
      if ((file.size ?? 0) > MAX_DOCUMENT_BYTES) {
        throw new Error('The file is larger than 20 MB');
      }

      setProgress(0);
      const response = await fetch(file.uri);
      const blob = await response.blob();

      const stored = await uploadDocumentFile(detail.asset.id, blob, file.name, setProgress);
      // The title defaults to the file name: it is what the person chose, and
      // making them type it again is a step that adds nothing.
      return addDocument(
        detail.asset.id,
        kind,
        file.name.replace(/\.[^.]+$/, ''),
        stored.path,
        stored.size,
        stored.mimeType,
      );
    },
    onSuccess: (result) => {
      setProgress(null);
      if (!result) return;
      toast('Document added');
      void queryClient.invalidateQueries({ queryKey: queryKeys.asset(detail.asset.assetCode) });
    },
    onError: (e: Error) => {
      setProgress(null);
      toast(e.message, 'error');
    },
  });

  const open = async (path: string, title: string) => {
    const url = await signedDocumentUrl(path);
    if (!url) {
      toast(`Could not open ${title}`, 'error');
      return;
    }
    await Linking.openURL(url);
  };

  const uploader = can('asset.edit') ? (
    <Card padding={13} style={styles.docUpload}>
      <SelectField
        label="Kind"
        value={DOCUMENT_KIND_LABEL[kind]}
        onPress={() => setKindOpen(true)}
      />
      <Button
        label={progress === null ? 'Add a document' : `Uploading · ${progress}%`}
        block
        loading={upload.isPending}
        icon={<Upload size={15} color={t.color.onNavy} strokeWidth={1.8} />}
        onPress={() => upload.mutate()}
        style={styles.docUploadButton}
      />
    </Card>
  ) : null;

  const picker = (
    <PickerSheet
      visible={kindOpen}
      title="Document kind"
      options={DOCUMENT_KINDS.map((k) => ({ id: k.id, name: k.name }))}
      selectedId={kind}
      onSelect={(o) => setKind(o.id as DocumentKind)}
      onDismiss={() => setKindOpen(false)}
    />
  );

  if (docs.length === 0) {
    return (
      <View>
        {uploader}
        <EmptyState
          title="No documents yet"
          description="Invoices, warranty cards and signed E-BAST documents appear here."
        />
        {picker}
      </View>
    );
  }

  return (
    <View style={styles.docList}>
      {uploader}
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
                DOCUMENT_KIND_LABEL[doc.kind as DocumentKind] ?? doc.kind.replace(/_/g, ' '),
                doc.fileSize ? `${(doc.fileSize / 1_048_576).toFixed(1)} MB` : null,
                new Date(doc.createdAt).toLocaleDateString('en-GB'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Pressable
            onPress={() => void open(doc.filePath, doc.title)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${doc.title}`}
            hitSlop={8}
          >
            <Download size={17} color={t.color.sub} strokeWidth={1.8} />
          </Pressable>
        </Card>
      ))}
      {picker}
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
  const router = useRouter();
  const { can } = usePermissions();
  const rows = detail.maintenance ?? [];

  // The tab's badge vocabulary is the asset's, not the ticket's: a device in
  // for repair reads as "Maintenance" to everyone looking at it.
  const stateLabel: Record<string, string> = {
    open: 'Maintenance',
    in_progress: 'Maintenance',
    completed: 'Good',
    cancelled: 'Retired',
  };

  const opener = can('asset.edit') ? (
    <Button
      label="Record a repair"
      variant="secondary"
      block
      icon={<Wrench size={15} color={t.color.text} strokeWidth={1.8} />}
      onPress={() => router.push(`/maintenance-log?asset=${detail.asset.assetCode}`)}
      style={styles.maintenanceOpen}
    />
  ) : null;

  if (rows.length === 0) {
    return (
      <View>
        {opener}
        <EmptyState title="No service records" description="Maintenance history appears here." />
      </View>
    );
  }

  return (
    <View style={styles.docList}>
      {opener}
      {rows.map((row) => (
        <Pressable
          key={row.id}
          onPress={() => router.push(`/maintenance-log?id=${row.id}`)}
          accessibilityRole="button"
          accessibilityLabel={row.title}
        >
          <Card padding={14}>
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
              <Text style={[t.type.meta, { color: t.color.sub }]}>
                Cost · {formatIdr(row.cost)}
              </Text>
            </View>
          </Card>
        </Pressable>
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
  photoChoices: { gap: 10, paddingBottom: 4 },
  photoFull: { marginBottom: 12, lineHeight: 16 },
  heroDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  heroDot: { height: 6, borderRadius: 3 },
  viewerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  viewerCaption: { position: 'absolute', left: 0, right: 0, bottom: 44, alignItems: 'center' },
  viewerClose: {
    position: 'absolute',
    top: 48,
    right: 18,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
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
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  maintenanceOpen: { marginBottom: 12 },
  docUpload: { marginBottom: 12 },
  docUploadButton: { marginTop: 12 },
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
