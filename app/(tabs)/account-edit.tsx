/**
 * Add or edit a person, and decide whether they sign in.
 *
 * The credentials section only appears once the person exists. That is not a
 * technical limit — issuing a password is a different decision from recording
 * who someone is, and putting both in one form invites the mistake of giving
 * every employee a login because the field was there.
 *
 * Nothing on this screen creates a password itself. The manage-account Edge
 * Function does, because that needs the service_role key and the app must
 * never hold it.
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
import { AlertCircle, ChevronLeft, KeyRound, ShieldOff } from 'lucide-react-native';

import { useTheme } from '@/theme';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PickerSheet,
  SelectField,
  Skeleton,
} from '@/components/ui';
import {
  MIN_PASSWORD_LENGTH,
  ROLE_LABEL,
  ROLE_SUMMARY,
  createAccount,
  fetchAccounts,
  manageCredentials,
  updateAccount,
} from '@/api/accounts';
import { fetchAssetFormOptions } from '@/api/assets';
import type { UserRole } from '@/store/useSessionStore';
import { useToast } from '@/store/useUiStore';

const ROLES: UserRole[] = ['super_admin', 'corporate_it', 'site_it', 'viewer'];

/** These two only ever see their own location, so one is required. */
const LOCATION_BOUND: UserRole[] = ['site_it', 'viewer'];

export default function AccountEditScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const editing = Boolean(id);

  const accounts = useQuery({ queryKey: ['accounts', ''], queryFn: () => fetchAccounts() });
  const options = useQuery({ queryKey: ['assetFormOptions'], queryFn: fetchAssetFormOptions });

  const existing = accounts.data?.find((a) => a.id === id);

  const [form, setForm] = useState<{
    fullName: string;
    nik: string;
    email: string;
    phone: string;
    departmentId: string | null;
    locationId: string | null;
    role: UserRole | null;
    isActive: boolean;
  } | null>(null);

  const [picker, setPicker] = useState<'department' | 'location' | 'role' | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Seeded from the record the first time it arrives. Adjusting state during
  // render rather than in an effect keeps the first paint correct — an effect
  // would show one frame of an empty form over a record that is already loaded.
  if (form === null && (!editing || existing)) {
    setForm({
      fullName: existing?.full_name ?? '',
      nik: existing?.nik ?? '',
      email: existing?.email ?? '',
      phone: existing?.phone ?? '',
      departmentId: existing?.department_id ?? null,
      locationId: existing?.location_id ?? null,
      role: existing?.role ?? null,
      isActive: existing?.is_active ?? true,
    });
  }

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    void queryClient.invalidateQueries({ queryKey: ['assignableEmployees'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const input = {
        fullName: form!.fullName,
        nik: form!.nik || null,
        email: form!.email || null,
        phone: form!.phone || null,
        departmentId: form!.departmentId,
        locationId: form!.locationId,
        role: form!.role,
        isActive: form!.isActive,
      };
      return editing ? updateAccount(id!, input) : createAccount(input);
    },
    onSuccess: () => {
      invalidate();
      toast(editing ? 'Account updated' : `${form!.fullName} added`);
      router.replace('/accounts');
    },
    onError: (e: Error) => setError(e.message),
  });

  const credentials = useMutation({
    mutationFn: (action: 'enable' | 'disable' | 'reset') =>
      manageCredentials(id!, action, action === 'disable' ? undefined : password),
    onSuccess: (_, action) => {
      invalidate();
      setPassword('');
      setError('');
      toast(
        action === 'disable'
          ? 'Sign-in removed'
          : action === 'reset'
            ? 'Password changed'
            : 'Sign-in created',
      );
    },
    onError: (e: Error) => setError(e.message),
  });

  if (accounts.isPending || options.isPending || !form) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Skeleton height={120} radius={t.radii.cardMedium} />
        <Skeleton height={240} radius={t.radii.cardMedium} />
      </ScrollView>
    );
  }

  if (editing && !existing) {
    return (
      <View style={styles.centre}>
        <EmptyState
          variant="error"
          title="Account not found"
          description="It may have been removed."
          actionLabel="All accounts"
          onAction={() => router.replace('/accounts')}
        />
      </View>
    );
  }

  const set = <K extends keyof NonNullable<typeof form>>(
    key: K,
    value: NonNullable<typeof form>[K],
  ) => {
    setForm({ ...form, [key]: value });
    setError('');
  };

  const departments = options.data?.departments ?? [];
  const locations = options.data?.locations ?? [];

  const needsLocation = form.role !== null && LOCATION_BOUND.includes(form.role);
  const ready = form.fullName.trim().length > 0 && (!needsLocation || Boolean(form.locationId));

  const canIssue =
    editing && form.role !== null && form.email.trim().length > 0 && !existing?.has_credentials;
  const passwordOk = password.length >= MIN_PASSWORD_LENGTH;

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
          {editing ? 'Edit person' : 'Add a person'}
        </Text>
        <Text style={[t.type.bodySmall, styles.subtitle, { color: t.color.sub }]}>
          {editing
            ? 'Changes apply everywhere this person appears, including past documents.'
            : 'A person can receive assets without ever signing in.'}
        </Text>

        <Card padding={15} title="Who" style={styles.card}>
          <Input
            label="Full name"
            required
            value={form.fullName}
            onChangeText={(v) => set('fullName', v)}
            placeholder="e.g. Andi Prasetyo"
            containerStyle={styles.field}
          />
          <Input
            label="NIK"
            value={form.nik}
            onChangeText={(v) => set('nik', v)}
            placeholder="e.g. 20481 or HO-2481"
            // Letters allowed: the column has always been text, and a
            // number-pad was the only thing insisting otherwise. Employee
            // numbers carry site prefixes here.
            autoCapitalize="characters"
            autoCorrect={false}
            containerStyle={styles.field}
          />
          <Input
            label="Email"
            value={form.email}
            onChangeText={(v) => set('email', v)}
            placeholder="name@aspire.id"
            autoCapitalize="none"
            keyboardType="email-address"
            helper="Required only if this person will sign in"
            containerStyle={styles.field}
          />
          <Input
            label="Phone"
            value={form.phone}
            onChangeText={(v) => set('phone', v)}
            placeholder="Optional"
            keyboardType="phone-pad"
            containerStyle={styles.field}
          />
          <SelectField
            label="Department"
            value={departments.find((d) => d.id === form.departmentId)?.name ?? null}
            placeholder="Choose a department"
            onPress={() => setPicker('department')}
            containerStyle={styles.field}
          />
          <SelectField
            label="Location"
            required={needsLocation}
            value={locations.find((l) => l.id === form.locationId)?.name ?? null}
            placeholder="Choose a location"
            onPress={() => setPicker('location')}
          />
        </Card>

        <Card padding={15} title="Role" style={styles.card}>
          <SelectField
            value={form.role ? ROLE_LABEL[form.role] : null}
            placeholder="No role · cannot sign in"
            onPress={() => setPicker('role')}
          />
          <Text style={[t.type.meta, styles.roleHint, { color: t.color.sub }]}>
            {form.role
              ? ROLE_SUMMARY[form.role]
              : 'Leave this empty for someone who only receives assets.'}
          </Text>
          {needsLocation ? (
            <Text style={[t.type.meta, styles.roleHint, { color: t.color.sub }]}>
              This role only sees its own location, so one must be chosen above.
            </Text>
          ) : null}
        </Card>

        {editing ? (
          <Card padding={15} title="Sign-in" style={styles.card}>
            <View style={styles.stateRow}>
              <Badge
                label={
                  !existing!.can_login
                    ? 'No login'
                    : existing!.has_credentials
                      ? 'Can sign in'
                      : 'No password yet'
                }
                tone={existing!.has_credentials ? 'gold' : undefined}
              />
              {existing!.email ? (
                <Text
                  numberOfLines={1}
                  style={[t.type.meta, styles.stateEmail, { color: t.color.sub }]}
                >
                  {existing!.email}
                </Text>
              ) : null}
            </View>

            {existing!.has_credentials ? (
              <>
                <Input
                  label="New password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  secureTextEntry
                  autoCapitalize="none"
                  containerStyle={styles.credField}
                />
                <Button
                  label="Change password"
                  variant="secondary"
                  block
                  disabled={!passwordOk}
                  loading={credentials.isPending && credentials.variables === 'reset'}
                  icon={<KeyRound size={15} color={t.color.text} strokeWidth={1.8} />}
                  onPress={() => credentials.mutate('reset')}
                  style={styles.credAction}
                />
                <Button
                  label="Remove sign-in"
                  variant="destructive"
                  block
                  loading={credentials.isPending && credentials.variables === 'disable'}
                  icon={<ShieldOff size={15} color={t.color.onNavy} strokeWidth={1.8} />}
                  onPress={() => credentials.mutate('disable')}
                  style={styles.credAction}
                />
                <Text style={[t.type.meta, styles.credHint, { color: t.color.sub }]}>
                  Removing the sign-in keeps the person and everything they are named on. Only the
                  password goes.
                </Text>
              </>
            ) : canIssue ? (
              <>
                <Input
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  secureTextEntry
                  autoCapitalize="none"
                  containerStyle={styles.credField}
                />
                <Button
                  label="Create the sign-in"
                  block
                  disabled={!passwordOk}
                  loading={credentials.isPending && credentials.variables === 'enable'}
                  icon={<KeyRound size={15} color={t.color.onNavy} strokeWidth={1.8} />}
                  onPress={() => credentials.mutate('enable')}
                  style={styles.credAction}
                />
                <Text style={[t.type.meta, styles.credHint, { color: t.color.sub }]}>
                  {`They sign in with ${form.email || 'their email'} and this password. Tell them in
person and have them change it — there is no email on this project to send it through.`}
                </Text>
              </>
            ) : (
              <Text style={[t.type.meta, styles.credHint, { color: t.color.sub }]}>
                {form.role === null
                  ? 'Choose a role above before this person can sign in.'
                  : 'Add an email address above before this person can sign in.'}
              </Text>
            )}
          </Card>
        ) : null}

        {editing ? (
          <Card padding={15} title="Active" style={styles.card}>
            <View style={styles.activeRow}>
              {[true, false].map((value) => (
                <Pressable
                  key={String(value)}
                  onPress={() => set('isActive', value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: form.isActive === value }}
                  accessibilityLabel={value ? 'Active' : 'Inactive'}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      borderColor: form.isActive === value ? t.color.royal : t.color.line,
                      borderWidth: form.isActive === value ? 1.5 : 1,
                      borderRadius: t.radii.inputLarge,
                      backgroundColor: pressed ? t.color.soft : 'transparent',
                    },
                  ]}
                >
                  <Text style={[t.type.bodySmall, { color: t.color.text }]}>
                    {value ? 'Active' : 'Inactive'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[t.type.meta, styles.credHint, { color: t.color.sub }]}>
              An inactive person cannot sign in and is not offered when assigning, but stays on
              every record they are already named on.
            </Text>
          </Card>
        ) : null}

        {error ? (
          <View style={styles.errorRow}>
            <AlertCircle size={14} color={t.color.error} strokeWidth={2} />
            <Text style={[t.type.meta, { color: t.color.error }]}>{error}</Text>
          </View>
        ) : null}

        <Button
          label={editing ? 'Save changes' : 'Add person'}
          block
          disabled={!ready}
          loading={save.isPending}
          onPress={() => save.mutate()}
        />
      </ScrollView>

      <PickerSheet
        visible={picker === 'department'}
        title="Department"
        options={departments.map((d) => ({ id: d.id, name: d.name }))}
        selectedId={form.departmentId}
        onSelect={(o) => set('departmentId', o.id)}
        onDismiss={() => setPicker(null)}
      />

      <PickerSheet
        visible={picker === 'location'}
        title="Location"
        options={locations.map((l) => ({ id: l.id, name: l.name }))}
        selectedId={form.locationId}
        onSelect={(o) => set('locationId', o.id)}
        onDismiss={() => setPicker(null)}
      />

      <PickerSheet
        visible={picker === 'role'}
        title="Role"
        options={ROLES.map((r) => ({ id: r, name: ROLE_LABEL[r], detail: ROLE_SUMMARY[r] }))}
        selectedId={form.role}
        onSelect={(o) => set('role', o.id as UserRole)}
        onDismiss={() => setPicker(null)}
        emptyMessage="No roles available"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 12 },
  centre: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 3, marginBottom: 14, lineHeight: 17 },
  card: { marginBottom: 12 },
  field: { marginBottom: 12 },
  roleHint: { marginTop: 9, lineHeight: 16 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  stateEmail: { flex: 1, minWidth: 0 },
  credField: { marginTop: 14 },
  credAction: { marginTop: 10 },
  credHint: { marginTop: 10, lineHeight: 16 },
  activeRow: { flexDirection: 'row', gap: 8 },
  option: { paddingHorizontal: 16, paddingVertical: 10, minHeight: 40, justifyContent: 'center' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
});
