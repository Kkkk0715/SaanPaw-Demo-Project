import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/constants/theme';
import { Banner, Button } from '@/components/ui';
import { PROVIDER_LABEL, continueWith, socialAvailability, type Provider, type SocialResult } from '@/services/facebook';

/**
 * "Continue with Google" / "Continue with Facebook" buttons, for signing in or signing up.
 * Only providers set up on the server are shown; with none, nothing is drawn at all.
 */
export function SocialButtons({
  intent,
  onResult,
  dividerLabel = 'or',
  dividerPosition = 'below',
}: {
  intent: 'login' | 'register';
  /** Called with whatever the provider returned (cancelled and errors are shown here). */
  onResult: (r: SocialResult) => Promise<void> | void;
  dividerLabel?: string;
  dividerPosition?: 'above' | 'below';
}) {
  const [available, setAvailable] = useState<Record<Provider, boolean>>({ facebook: false, google: false });
  const [busy, setBusy] = useState<Provider | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void socialAvailability().then(setAvailable);
  }, []);

  const providers = (['google', 'facebook'] as Provider[]).filter((p) => available[p]);
  if (!providers.length) return null;

  const go = async (p: Provider) => {
    setBusy(p);
    setNote(null);
    try {
      const r = await continueWith(p, intent);
      if (r.status === 'cancelled') setNote(`${PROVIDER_LABEL[p]} sign-in was cancelled.`);
      else if (r.status === 'error') setNote(r.message ?? `${PROVIDER_LABEL[p]} sign-in failed. Try again.`);
      else await onResult(r);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const divider = (
    <View style={styles.divider}>
      <View style={styles.line} />
      <Text style={styles.or}>{dividerLabel}</Text>
      <View style={styles.line} />
    </View>
  );

  return (
    <View style={{ gap: theme.spacing(1) }}>
      {dividerPosition === 'above' ? divider : null}
      {providers.map((p) => (
        <Button
          key={p}
          label={`${intent === 'register' ? 'Sign up' : 'Continue'} with ${PROVIDER_LABEL[p]}`}
          icon={p === 'google' ? 'logo-google' : 'logo-facebook'}
          variant={p === 'google' ? 'secondary' : 'primary'}
          color={p === 'facebook' ? '#1877F2' : undefined}
          loading={busy === p}
          disabled={Boolean(busy && busy !== p)}
          onPress={() => void go(p)}
        />
      ))}
      {note ? <Banner tone="warning" icon="alert-circle-outline" title="Not signed in" message={note} /> : null}
      {dividerPosition === 'below' ? divider : null}
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), marginVertical: 4 },
  line: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  or: { ...theme.type.caption, color: theme.colors.muted },
});
