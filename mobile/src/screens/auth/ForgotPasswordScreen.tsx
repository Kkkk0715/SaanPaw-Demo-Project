import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '@/constants/theme';
import { AuthHeader, Banner, Button, COLUMN, Caption, Field } from '@/components/ui';
import { apiRequest } from '@/services/api';
import type { MobileRole } from '@/context/AuthContext';

/**
 * Shared by both modules (role comes from the route param): request a 6-digit code by email,
 * then enter it alongside a new password. One screen, two steps, rather than two screens, so
 * going back from the code step keeps the email already typed.
 */
export function ForgotPasswordScreen({ route, navigation }: NativeStackScreenProps<any>) {
  const role = (route.params as { role: MobileRole }).role;

  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const requestCode = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }
    setBusy(true);
    try {
      await apiRequest('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ role, email }) });
      setStep('reset');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setError(null);
    if (code.trim().length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Use at least 8 characters for the new password.');
      return;
    }
    setBusy(true);
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ role, email, code: code.trim(), newPassword }),
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset your password. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <AuthHeader title="Password changed" subtitle="Sign in with your new password." />
        <View style={{ padding: theme.spacing(2.5), gap: theme.spacing(2), maxWidth: COLUMN, alignSelf: 'center', width: '100%' }}>
          <Banner
            tone="success"
            icon="checkmark-circle"
            title="You're all set"
            message="Your password has been changed. Sign in with it below."
          />
          <Button label="Back to sign in" icon="log-in-outline" onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <AuthHeader
          title="Forgot password"
          subtitle={
            step === 'request'
              ? 'Enter your email and we\'ll send you a 6-digit code.'
              : `Enter the code sent to ${email} and choose a new password.`
          }
        />

        <View style={{ padding: theme.spacing(2.5), gap: theme.spacing(2), width: '100%', maxWidth: COLUMN, alignSelf: 'center' }}>
          {error ? <Banner tone="danger" icon="alert-circle" title="Something went wrong" message={error} /> : null}

          {step === 'request' ? (
            <>
              <Field
                label="Email address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@gmail.com"
                keyboardType="email-address"
                icon="mail-outline"
              />
              <Button label="Send code" onPress={requestCode} loading={busy} icon="send-outline" />
            </>
          ) : (
            <>
              <Field
                label="6-digit code"
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                keyboardType="numeric"
                icon="key-outline"
              />
              <Field
                label="New password"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="At least 8 characters"
                secureTextEntry
                icon="lock-closed-outline"
              />
              <Button label="Reset password" onPress={resetPassword} loading={busy} icon="checkmark-outline" />
              <Button
                label="Use a different email"
                variant="ghost"
                onPress={() => {
                  setStep('request');
                  setCode('');
                  setNewPassword('');
                  setError(null);
                }}
              />
            </>
          )}

          <Caption style={{ textAlign: 'center' }}>SaanPaw · San Jose Del Monte, Bulacan</Caption>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
