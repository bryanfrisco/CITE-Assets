/**
 * Scan a label.
 *
 * The camera resolves a sticker to one of four states, and each one has a
 * different next step. Getting that wrong is how a device ends up with the
 * wrong record attached to it, so the screen never guesses: `scan_tag()`
 * answers all four in one round trip and this screen only routes.
 *
 *   not ours        a sticker this system never issued — refuse it
 *   untagged        blank stock; go and register the device
 *   tagged          open the asset it belongs to
 *   out of scope    tagged, but to an asset at a location you cannot see
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { AlertCircle, Camera, ChevronLeft, ScanLine } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { Badge, Button, Card, EmptyState, Screen } from '@/components/ui';
import { scanTag, type ScanResult } from '@/api/tags';
import { usePermissions } from '@/auth';

export default function ScanScreen() {
  const t = useTheme();
  const router = useRouter();
  const { can } = usePermissions();
  const [permission, requestPermission] = useCameraPermissions();

  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The camera fires continuously while a code is in frame; without this the
  // same sticker would be resolved dozens of times a second.
  const [busy, setBusy] = useState(false);

  const handleScan = async (value: string) => {
    if (busy || result) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await scanTag(value));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that label');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  // ------------------------------------------------------------- permission
  if (!permission) {
    // Permission state is still resolving; an empty frame beats a flash of UI.
    return (
      <Screen>
        <View />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <BackLink />
        <Text style={[t.type.screenTitle, { color: t.color.text }]}>Scan label</Text>
        <View style={styles.permission}>
          <EmptyState
            icon={<Camera size={26} color={t.color.royal} strokeWidth={1.7} />}
            title="Camera access is needed"
            description="CITE Assets uses the camera only to read the QR code on an asset label."
            actionLabel="Allow camera"
            onAction={() => void requestPermission()}
          />
        </View>
      </Screen>
    );
  }

  // ----------------------------------------------------------------- result
  if (result) {
    return (
      <Screen>
        <BackLink />
        <Text style={[t.type.screenTitle, { color: t.color.text }]}>Scan label</Text>
        <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
          {result.code}
        </Text>

        {!result.found ? (
          <Card padding={16}>
            <Badge label="Not recognised" tone="broken" />
            <Text style={[t.type.body, styles.resultTitle, { color: t.color.text }]}>
              This label is not one of ours
            </Text>
            <Text style={[t.type.meta, styles.resultBody, { color: t.color.sub }]}>
              Nothing in the register was ever printed with this code. Use a label from a batch
              printed by CITE Assets, or print a new sheet.
            </Text>
            <Button label="Scan another" block style={styles.action} onPress={reset} />
          </Card>
        ) : result.status === 'untagged' ? (
          <Card padding={16}>
            <Badge label="Blank label" tone="available" />
            <Text style={[t.type.body, styles.resultTitle, { color: t.color.text }]}>
              Ready to be registered
            </Text>
            <Text style={[t.type.meta, styles.resultBody, { color: t.color.sub }]}>
              Stick it on the device, then record what the device is. The asset is created and the
              label claimed together.
            </Text>
            {can('asset.create') ? (
              <Button
                label="Register this asset"
                block
                style={styles.action}
                onPress={() => router.replace(`/add-asset?tag=${result.code}`)}
              />
            ) : (
              <Text style={[t.type.meta, styles.resultBody, { color: t.color.sub }]}>
                You do not have permission to register assets.
              </Text>
            )}
            <Button label="Scan another" variant="secondary" block onPress={reset} />
          </Card>
        ) : result.status === 'void' ? (
          <Card padding={16}>
            <Badge label="Voided" tone="retired" />
            <Text style={[t.type.body, styles.resultTitle, { color: t.color.text }]}>
              This label was taken out of use
            </Text>
            <Text style={[t.type.meta, styles.resultBody, { color: t.color.sub }]}>
              It cannot be attached to an asset. Peel it off and use a fresh one.
            </Text>
            <Button label="Scan another" block style={styles.action} onPress={reset} />
          </Card>
        ) : result.outOfScope ? (
          <Card padding={16}>
            <Badge label="Another location" tone="maintenance" />
            <Text style={[t.type.body, styles.resultTitle, { color: t.color.text }]}>
              This asset is outside your scope
            </Text>
            <Text style={[t.type.meta, styles.resultBody, { color: t.color.sub }]}>
              The label is in use, but the asset belongs to a location you are not allowed to see.
            </Text>
            <Button label="Scan another" block style={styles.action} onPress={reset} />
          </Card>
        ) : (
          <Card padding={16}>
            <Badge label={result.statusName ?? 'Assigned'} />
            <Text style={[t.type.assetCode, styles.resultCode, { color: t.color.royal }]}>
              {result.assetCode}
            </Text>
            <Text style={[t.type.body, { color: t.color.text }]}>{result.assetName}</Text>
            <Text style={[t.type.meta, styles.resultBody, { color: t.color.sub }]}>
              {[result.locationName, result.holderName ?? 'Unassigned'].filter(Boolean).join(' · ')}
            </Text>
            <Button
              label="Open asset"
              block
              style={styles.action}
              onPress={() => router.replace(`/asset/${result.assetCode}`)}
            />
            <Button label="Scan another" variant="secondary" block onPress={reset} />
          </Card>
        )}
      </Screen>
    );
  }

  // ----------------------------------------------------------------- camera
  return (
    <Screen scroll={false}>
      <BackLink />
      <Text style={[t.type.screenTitle, { color: t.color.text }]}>Scan label</Text>
      <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
        Point the camera at the QR code on the sticker
      </Text>

      <View
        style={[
          styles.viewfinder,
          { borderRadius: t.radii.cardLarge, backgroundColor: t.color.navy },
        ]}
      >
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'code39'] }}
          onBarcodeScanned={({ data }) => void handleScan(data)}
        />
        <View style={styles.reticle} pointerEvents="none">
          <ScanLine size={44} color={t.color.onNavy} strokeWidth={1.4} />
        </View>
      </View>

      {error ? (
        <View style={styles.errorRow}>
          <AlertCircle size={14} color={t.color.error} strokeWidth={2} />
          <Text style={[t.type.meta, { color: t.color.error }]}>{error}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

function BackLink() {
  const t = useTheme();
  const router = useRouter();
  return (
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
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 3, marginBottom: 16 },
  permission: { marginTop: 20 },
  viewfinder: { flex: 1, overflow: 'hidden' },
  reticle: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultCode: { marginTop: 12 },
  resultTitle: { marginTop: 12 },
  resultBody: { marginTop: 6, lineHeight: 16 },
  action: { marginTop: 14, marginBottom: 9 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
});
