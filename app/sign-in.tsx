/**
 * Sign in — Phase 1.
 *
 * The prototype has no login screen (it opens already signed in), so this
 * screen is built from the tokens rather than copied: navy hero gradient from
 * README § Colors, the wizard's field styling, and the error copy pattern used
 * throughout ("Full name is required" → "Email is required").
 */

import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lock, Mail } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { Button, Card, Input } from '@/components/ui';
import { signIn } from '@/api/session';

const logo = require('../assets/cite-logo.png');

export default function SignInScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setFormError(null);
    const missingEmail = email.trim() ? null : 'Email is required';
    const missingPassword = password ? null : 'Password is required';
    setEmailError(missingEmail);
    setPasswordError(missingPassword);
    if (missingEmail || missingPassword) {
      setFormError('Fill the required fields');
      return;
    }

    setBusy(true);
    try {
      await signIn(email, password);
      // SessionProvider picks up SIGNED_IN and the root layout routes onward.
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: t.color.bg }}
    >
      <LinearGradient
        colors={[...t.gradients.navy.colors]}
        locations={[...t.gradients.navy.locations]}
        start={t.gradients.navy.start}
        end={t.gradients.navy.end}
        style={[styles.hero, { paddingTop: insets.top + 44 }]}
      >
        <Image source={logo} style={styles.logo} resizeMode="contain" />
        <Text style={[t.type.screenTitle, styles.heroTitle, { color: t.color.onNavy }]}>
          CITE Assets
        </Text>
        <Text style={[t.type.appSubtitle, { color: t.color.gold }]}>IT ASSET MANAGEMENT</Text>
      </LinearGradient>

      <View style={styles.body}>
        <Card padding={18}>
          <Text style={[t.type.cardHeading, { color: t.color.text }]}>Sign in</Text>
          <Text style={[t.type.meta, styles.lead, { color: t.color.sub }]}>
            Use the credentials issued by Corporate IT.
          </Text>

          <Input
            label="Email"
            required
            value={email}
            onChangeText={setEmail}
            error={emailError}
            placeholder="name@cite.co.id"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            icon={<Mail size={16} color={t.color.sub} strokeWidth={1.7} />}
            containerStyle={styles.field}
          />

          <Input
            label="Password"
            required
            value={password}
            onChangeText={setPassword}
            error={passwordError}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
            icon={<Lock size={16} color={t.color.sub} strokeWidth={1.7} />}
            containerStyle={styles.field}
            onSubmitEditing={submit}
            returnKeyType="go"
          />

          <Button label="Sign in" onPress={submit} loading={busy} block style={styles.submit} />

          {formError ? (
            <Text style={[t.type.meta, styles.formError, { color: t.color.error }]}>
              {formError}
            </Text>
          ) : null}
        </Card>

        <Text style={[t.type.meta, styles.build, { color: t.color.sub }]}>
          CITE Assets v1.0.0 · Build 2026.07
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingBottom: 40, paddingHorizontal: 18 },
  logo: { width: 54, height: 54, marginBottom: 12 },
  heroTitle: { marginBottom: 2 },
  body: { flex: 1, paddingHorizontal: 18, marginTop: -22 },
  lead: { marginTop: 4, marginBottom: 16 },
  field: { marginBottom: 13 },
  submit: { marginTop: 4 },
  formError: { marginTop: 10, textAlign: 'center' },
  build: { marginTop: 20, textAlign: 'center' },
});
