import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { Button, Field, useErrorAnchor } from '@/components/ui';
import { apiRequest } from '@/services/api';
import { OtpTimer, useCountdown, type OtpSent } from './OtpTimer';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Proves a sign-up email is real: sends a 6-digit code to it, then checks the code. Placed under
 * the email box on the registration screens. Reports the verification token (or null when the
 * email changes and must be verified again); registration sends that token.
 */
export function EmailVerifier({
  email,
  purpose,
  token,
  onVerified,
  error,
}: {
  email: string;
  purpose: 'register_user' | 'register_shelter';
  token: string | null;
  onVerified: (token: string | null) => void;
  /** Set by the form on submit when the email is not verified yet; scrolled to like any error. */
  error?: string;
}) {
  const [sent, setSent] = useState<(OtpSent & { at: number; email: string }) | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const anchor = useErrorAnchor(error || problem);
  const normalized = email.trim().toLowerCase();
  const expiresIn = useCountdown(sent?.expiresAt ?? null);

  // A different address must be verified again.
  useEffect(() => {
    if (sent && sent.email !== normalized) {
      setSent(null);
      setCode('');
      setProblem(null);
      if (token) onVerified(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized]);

  const send = async () => {
    setProblem(null);
    if (!EMAIL_PATTERN.test(normalized)) {
      setProblem('Enter a valid email address first.');
      return;
    }
    setBusy('send');
    try {
      const res = await apiRequest<OtpSent>('/auth/email-code', {
        method: 'POST',
        body: JSON.stringify({ email: normalized, purpose }),
      });
      setSent({ ...res, at: Date.now(), email: normalized });
      setCode('');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not send the code. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    setProblem(null);
    if (!/^\d{6}$/.test(code)) {
      setProblem('Enter the 6-digit code from your email.');
      return;
    }
    if (expiresIn <= 0) {
      setProblem('This code has expired. Send a new one.');
      return;
    }
    setBusy('verify');
    try {
      const res = await apiRequest<{ verificationToken: string }>('/auth/email-code/verify', {
        method: 'POST',
        body: JSON.stringify({ email: normalized, purpose, code }),
      });
      onVerified(res.verificationToken);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not check the code. Try again.');
    } finally {
      setBusy(null);
    }
  };

  if (token) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="checkmark-circle" size={17} color={theme.colors.primary} />
        <Text style={{ ...theme.type.captionMedium, color: theme.colors.primaryDark }}>Email verified</Text>
      </View>
    );
  }

  return (
    <View ref={anchor} collapsable={false} style={{ gap: theme.spacing(1) }}>
      {!sent ? (
        <Button
          label="Send verification code"
          variant="secondary"
          icon="mail-unread-outline"
          loading={busy === 'send'}
          onPress={() => void send()}
        />
      ) : (
        <>
          <Text style={{ ...theme.type.caption, color: theme.colors.textSoft }}>
            We sent a 6-digit code to {sent.email}. Check your inbox (and spam folder).
          </Text>
          <Field
            label="Verification code"
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            only="digits"
            maxLength={6}
            icon="key-outline"
          />
          <OtpTimer sent={sent} sentAtMs={sent.at} onResend={() => void send()} resending={busy === 'send'} />
          <Button
            label="Verify email"
            variant="secondary"
            icon="shield-checkmark-outline"
            loading={busy === 'verify'}
            disabled={expiresIn <= 0}
            onPress={() => void verify()}
          />
        </>
      )}
      {problem || error ? (
        <Text style={{ ...theme.type.captionMedium, color: theme.colors.danger }}>{problem ?? error}</Text>
      ) : null}
    </View>
  );
}
