import { useState } from 'react';
import { View } from 'react-native';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { theme } from '@/constants/theme';
import {
  AuthHeader,
  Banner,
  Button,
  COLUMN,
  Caption,
  Field,
} from '@/components/ui';
import { DEMO_ACCOUNTS, DEMO_MODE, useAuth, type MobileRole } from '@/context/AuthContext';

/** One login form for both modules. Only the wording differs. */
export function LoginForm({
  role,
  title,
  subtitle,
  footer,
}: {
  role: MobileRole;
  title: string;
  subtitle: string;
  footer?: React.ReactNode;
}) {
  const { signIn } = useAuth();
  const demo = DEMO_ACCOUNTS[role];

  // Demo accounts only exist in the static demo build, so a real deployment starts blank.
  const [email, setEmail] = useState(DEMO_MODE ? demo.email : '');
  const [password, setPassword] = useState(DEMO_MODE ? demo.password : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await signIn(role, email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <AuthHeader title={title} subtitle={subtitle} />

        <View style={{ padding: theme.spacing(2.5), gap: theme.spacing(2), width: '100%', maxWidth: COLUMN, alignSelf: 'center' }}>
          {error ? <Banner tone="danger" icon="alert-circle" title="Cannot sign in" message={error} /> : null}

          <Field
            label="Email address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.ph"
            keyboardType="email-address"
            icon="mail-outline"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry
            icon="lock-closed-outline"
          />

          <Button label="Sign in" onPress={submit} loading={busy} icon="log-in-outline" />

          {DEMO_MODE ? (
            <Banner
              tone="info"
              icon="key-outline"
              title="Demo credentials pre-filled"
              message={`${demo.email} / ${demo.password} — ${demo.label}`}
            />
          ) : null}

          {footer}

          <Caption style={{ textAlign: 'center' }}>
            SaanPaw · San Jose Del Monte, Bulacan
          </Caption>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
