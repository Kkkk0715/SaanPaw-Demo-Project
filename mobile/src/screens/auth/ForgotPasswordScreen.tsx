import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '@/constants/theme';
import { passwordMeetsRules } from '@saanpaw/shared';
import {
  AuthHeader,
  Banner,
  Button,
  COLUMN,
  Caption,
  Field,
  FormScrollView,
  PasswordRules,
  useBottomInset,
} from '@/components/ui';
import { OtpTimer, useCountdown, type OtpSent } from '@/components/domain/OtpTimer';
import { apiRequest } from '@/services/api';
import type { MobileRole } from '@/context/AuthContext';

/**
 * Shared by both modules (role comes from the route param). Three steps on one screen, so going
 * back keeps the email already typed:
 *   1. email - request a 6-digit code;
 *   2. code - enter it, with its countdown (it expires after 10 minutes) and a resend button;
 *   3. password - shown only after the server has accepted the code; sets the new password.
 */
export function ForgotPasswordScreen({ route, navigation }: NativeStackScreenProps<any>) {
  const role = (route.params as { role: MobileRole }).role;
  const bottomInset = useBottomInset();

  const [step, setStep] = useState<'request' | 'code' | 'password'>('request');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<(OtpSent & { at: number }) | null>(null);
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ email?: string; code?: string; password?: string }>({});
  const [busy, setBusy] = useState<'send' | 'verify' | 'save' | null>(null);
  const [done, setDone] = useState(false);
  const expiresIn = useCountdown(sent?.expiresAt ?? null);

  const requestCode = async () => {
    setError(null);
    setFieldError({});
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setFieldError({ email: 'Enter the email address of your account.' });
      return;
    }
    setBusy('send');
    try {
      const res = await apiRequest<OtpSent>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ role, email: email.trim() }),
      });
      // Older servers answer without a timer: assume the 10-minute code and 60 s resend wait.
      setSent({
        expiresAt: res?.expiresAt ?? new Date(Date.now() + 10 * 60_000).toISOString(),
        resendAfterSeconds: res?.resendAfterSeconds ?? 60,
        at: Date.now(),
      });
      setCode('');
      setStep('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const verifyCode = async () => {
    setError(null);
    setFieldError({});
    if (!/^\d{6}$/.test(code)) {
      setFieldError({ code: 'Enter the 6-digit code from your email.' });
      return;
    }
    if (expiresIn <= 0) {
      setFieldError({ code: 'This code has expired. Tap "Resend code" for a new one.' });
      return;
    }
    setBusy('verify');
    try {
      const res = await apiRequest<{ resetToken: string }>('/auth/verify-reset-code', {
        method: 'POST',
        body: JSON.stringify({ role, email: email.trim(), code }),
      });
      setResetToken(res.resetToken);
      setStep('password');
    } catch (e) {
      setFieldError({ code: e instanceof Error ? e.message : 'Could not check the code. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  const savePassword = async () => {
    setError(null);
    setFieldError({});
    if (!passwordMeetsRules(newPassword)) {
      setFieldError({ password: 'Your new password does not meet all the requirements yet.' });
      return;
    }
    setBusy('save');
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ role, email: email.trim(), resetToken, newPassword }),
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset your password. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const startOver = () => {
    setStep('request');
    setSent(null);
    setCode('');
    setResetToken(null);
    setNewPassword('');
    setError(null);
    setFieldError({});
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

  const subtitle =
    step === 'request'
      ? "Enter your email and we'll send you a 6-digit code."
      : step === 'code'
        ? `Enter the code sent to ${email.trim()}.`
        : 'Code verified. Choose your new password.';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FormScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomInset }} keyboardShouldPersistTaps="handled">
        <AuthHeader title="Forgot password" subtitle={subtitle} />

        <View style={{ padding: theme.spacing(2.5), gap: theme.spacing(2), width: '100%', maxWidth: COLUMN, alignSelf: 'center' }}>
          {error ? <Banner tone="danger" icon="alert-circle" title="Something went wrong" message={error} /> : null}

          <Caption style={{ textAlign: 'center' }}>
            Step {step === 'request' ? 1 : step === 'code' ? 2 : 3} of 3 ·{' '}
            {step === 'request' ? 'Your email' : step === 'code' ? 'Verify the code' : 'New password'}
          </Caption>

          {step === 'request' ? (
            <>
              <Field
                label="Email address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                icon="mail-outline"
                error={fieldError.email}
              />
              <Button label="Send code" onPress={() => void requestCode()} loading={busy === 'send'} icon="send-outline" />
            </>
          ) : step === 'code' ? (
            <>
              <Field
                label="6-digit code"
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                only="digits"
                maxLength={6}
                icon="key-outline"
                error={fieldError.code}
              />
              {sent ? (
                <OtpTimer sent={sent} sentAtMs={sent.at} onResend={() => void requestCode()} resending={busy === 'send'} />
              ) : null}
              <Button
                label="Verify code"
                onPress={() => void verifyCode()}
                loading={busy === 'verify'}
                disabled={expiresIn <= 0}
                icon="shield-checkmark-outline"
              />
              <Button label="Use a different email" variant="ghost" onPress={startOver} />
            </>
          ) : (
            <>
              <Field
                label="New password"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Create a new password"
                secureTextEntry
                icon="lock-closed-outline"
                error={fieldError.password}
              />
              <PasswordRules password={newPassword} />
              <Button label="Change password" onPress={() => void savePassword()} loading={busy === 'save'} icon="checkmark-outline" />
              <Button label="Start over" variant="ghost" onPress={startOver} />
            </>
          )}
        </View>
      </FormScrollView>
    </KeyboardAvoidingView>
  );
}
