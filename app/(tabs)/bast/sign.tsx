/**
 * Sign an E-BAST on the screen — client instruction, 2026-07-30:
 * "saya mau ttd digital dengan langsung tanda tangan dari layar secara langsung".
 *
 * One block per visit (`?id=…&role=handover|receiver`) rather than both at once.
 * The two signatures are given by two different people, usually minutes apart
 * and often with the phone changing hands, so a single form holding both would
 * mean each person watching the other sign before either was saved.
 *
 * Saving the last of the two signatures also finalises the PDF. That is one
 * action from the user's side, so it is one button — but it is two steps
 * underneath, and if the PDF step fails the signature is already recorded and
 * the screen says so instead of pretending nothing happened.
 */

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, ChevronLeft, Plus } from 'lucide-react-native';

import { useTheme } from '@/theme';
import {
  Button,
  Card,
  EmptyState,
  Input,
  PickerSheet,
  SelectField,
  SignaturePad,
  Skeleton,
} from '@/components/ui';
import {
  SIGNATURE_ROLE_LABEL,
  addSignatory,
  fetchBastDetail,
  fetchSignatories,
  generateBastPdf,
  signBast,
  type SignatureRole,
} from '@/api/bast';
import { isSignatureUsable, type SignatureStrokes } from '@/lib/signature';
import { queryKeys } from '@/lib/queryClient';
import { useToast } from '@/store/useUiStore';

export default function SignBastScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { id, role: roleParam } = useLocalSearchParams<{ id: string; role: string }>();
  const role: SignatureRole = roleParam === 'receiver' ? 'receiver' : 'handover';

  const detail = useQuery({
    queryKey: ['bastDetail', id],
    queryFn: () => fetchBastDetail(id),
    enabled: Boolean(id),
  });

  // Only the handover block needs a picker; the receiver is whoever the record
  // says the asset was assigned to, and letting that be edited here would let
  // the document disagree with the assignment it documents.
  const signatories = useQuery({
    queryKey: ['bastSignatories'],
    queryFn: fetchSignatories,
    enabled: role === 'handover',
  });

  const [strokes, setStrokes] = useState<SignatureStrokes>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [signatoryId, setSignatoryId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState('');

  const bast = detail.data;
  const chosen = signatories.data?.find((s) => s.id === signatoryId);

  const signerName = role === 'receiver' ? (bast?.employeeName ?? '') : (chosen?.full_name ?? '');
  const signerTitle =
    role === 'receiver'
      ? (bast?.departmentName ?? null)
      : (chosen?.title ?? chosen?.department_name ?? null);

  const addPerson = useMutation({
    mutationFn: () => addSignatory(newName, newTitle || null),
    onSuccess: async (result) => {
      const refreshed = await queryClient.fetchQuery({
        queryKey: ['bastSignatories'],
        queryFn: fetchSignatories,
      });
      setSignatoryId(result.id);
      setAdding(false);
      setNewName('');
      setNewTitle('');
      setError('');
      toast(
        result.created
          ? `${refreshed.find((s) => s.id === result.id)?.full_name ?? 'Person'} added`
          : 'That person was already on the list',
      );
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      const { complete } = await signBast(id, role, signerName, signerTitle, strokes);
      if (!complete) return { complete, finalised: false };

      // Both blocks are filled, so the document can be produced. A failure here
      // is reported rather than swallowed: the signature is safe either way and
      // finalising can be retried from the detail screen.
      try {
        await generateBastPdf(id, true);
        return { complete, finalised: true };
      } catch (e) {
        return { complete, finalised: false, reason: (e as Error).message };
      }
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['bastDetail', id] });
      void queryClient.invalidateQueries({ queryKey: ['bast'] });
      void queryClient.invalidateQueries({ queryKey: ['bastStats'] });
      if (bast) void queryClient.invalidateQueries({ queryKey: queryKeys.asset(bast.assetCode) });

      if (result.finalised) toast('Signed · the document has been issued');
      else if (result.complete)
        toast(result.reason ?? 'Signed, but the PDF was not issued', 'error');
      else toast(`${SIGNATURE_ROLE_LABEL[role]} signed`);

      router.replace(`/bast/${id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  if (detail.isPending) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Skeleton height={120} radius={t.radii.cardMedium} />
        <Skeleton height={200} radius={t.radii.cardMedium} />
      </ScrollView>
    );
  }

  if (!bast) {
    return (
      <View style={styles.centre}>
        <EmptyState
          variant="error"
          title="E-BAST not found"
          description="It may have been removed, or it is outside your location scope."
          actionLabel="All E-BAST"
          onAction={() => router.replace('/bast')}
        />
      </View>
    );
  }

  const already = bast.signatures?.[role];
  const ready = isSignatureUsable(strokes) && signerName.length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          // The floating nav sits OVER the content, so the last control on
          // the form would otherwise be underneath it. Same reserve the
          // Screen component uses.
          { paddingBottom: insets.bottom + t.spacing.screenBottom },
        ]}
        keyboardShouldPersistTaps="handled"
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

        <Text style={[t.type.screenTitle, { color: t.color.text }]}>
          {SIGNATURE_ROLE_LABEL[role]}
        </Text>
        <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
          {`${bast.bastNumber} · ${bast.assetCode} · ${bast.assetName}`}
        </Text>

        {already ? (
          <View
            style={[styles.notice, { backgroundColor: t.color.soft, borderColor: t.color.line }]}
          >
            <Text style={[t.type.meta, { color: t.color.sub }]}>
              {`Already signed by ${already.signerName}. Signing again replaces what the document shows; the earlier signature is kept in the record.`}
            </Text>
          </View>
        ) : null}

        <Card padding={15} title="Penanda tangan" style={styles.card}>
          {role === 'receiver' ? (
            <>
              <Text style={[t.type.fieldLabel, { color: t.color.sub }]}>Nama</Text>
              <Text style={[t.type.body, styles.fixedValue, { color: t.color.text }]}>
                {bast.employeeName}
              </Text>
              <Text style={[t.type.meta, { color: t.color.sub }]}>
                {`${bast.departmentName} · taken from the assignment, so the document and the record cannot disagree`}
              </Text>
            </>
          ) : signatories.isPending ? (
            <Skeleton height={44} radius={t.radii.inputLarge} />
          ) : (
            <>
              <SelectField
                label="Nama"
                required
                value={chosen ? chosen.full_name : null}
                placeholder="Choose who is handing over"
                onPress={() => setPickerOpen(true)}
              />

              {chosen?.title || chosen?.department_name ? (
                <Text style={[t.type.meta, styles.chosenMeta, { color: t.color.sub }]}>
                  {chosen.title ?? chosen.department_name}
                </Text>
              ) : null}

              {adding ? (
                <View style={styles.addBlock}>
                  <Input
                    label="Nama lengkap"
                    required
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="e.g. Dewi Lestari"
                    containerStyle={styles.field}
                  />
                  <Input
                    label="Jabatan"
                    value={newTitle}
                    onChangeText={setNewTitle}
                    placeholder="e.g. IT Support Officer"
                    containerStyle={styles.field}
                  />
                  <View style={styles.addActions}>
                    <Button
                      label="Cancel"
                      variant="secondary"
                      size="sm"
                      onPress={() => {
                        setAdding(false);
                        setError('');
                      }}
                    />
                    <Button
                      label="Add"
                      size="sm"
                      loading={addPerson.isPending}
                      onPress={() => addPerson.mutate()}
                    />
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => setAdding(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Add someone who is not on the list"
                  hitSlop={6}
                  style={styles.addLink}
                >
                  <Plus size={14} color={t.color.royal} strokeWidth={2} />
                  <Text style={[t.type.metaStrong, { color: t.color.royal }]}>
                    Add someone who is not on the list
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </Card>

        <Card padding={15} title="Tanda tangan" style={styles.card}>
          <View style={styles.padWrap}>
            <SignaturePad
              strokes={strokes}
              onChange={setStrokes}
              caption={signerName || 'Choose who is signing first'}
              disabled={!signerName}
            />
          </View>

          <Text style={[t.type.meta, styles.padHint, { color: t.color.sub }]}>
            Drawn here and printed straight onto the PDF — nothing is scanned, and the time of
            signing is recorded on the document.
          </Text>
        </Card>

        {error ? (
          <View style={styles.errorRow}>
            <AlertCircle size={14} color={t.color.error} strokeWidth={2} />
            <Text style={[t.type.meta, { color: t.color.error }]}>{error}</Text>
          </View>
        ) : null}

        <Button
          label="Simpan tanda tangan"
          block
          disabled={!ready}
          loading={submit.isPending}
          onPress={() => {
            setError('');
            submit.mutate();
          }}
          style={styles.submit}
        />

        {!ready && signerName ? (
          <Text style={[t.type.meta, styles.readyHint, { color: t.color.sub }]}>
            Sign in the box above to continue.
          </Text>
        ) : null}
      </ScrollView>

      <PickerSheet
        visible={pickerOpen}
        title="Yang Menyerahkan"
        options={(signatories.data ?? []).map((s) => ({
          id: s.id,
          name: s.full_name,
          detail: s.title ?? s.department_name,
        }))}
        selectedId={signatoryId}
        onSelect={(option) => setSignatoryId(option.id)}
        onDismiss={() => setPickerOpen(false)}
        emptyMessage="Nobody on the list yet — add the first person below."
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 12, gap: 0 },
  centre: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 3, marginBottom: 14, lineHeight: 17 },
  notice: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  card: { marginBottom: 12 },
  fixedValue: { marginTop: 4, marginBottom: 3 },
  chosenMeta: { marginTop: 6 },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12, minHeight: 24 },
  addBlock: { marginTop: 14 },
  field: { marginBottom: 10 },
  addActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 2 },
  padWrap: { marginTop: 4 },
  padHint: { marginTop: 10, lineHeight: 16 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
  },
  submit: { marginTop: 4 },
  readyHint: { marginTop: 8, textAlign: 'center' },
});
