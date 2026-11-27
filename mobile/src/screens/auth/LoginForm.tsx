import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '@/constants/theme';
import {
  AuthHeader,
  Banner,
  Button,
  COLUMN,
  Caption,
  Field,
  useBottomInset,
} from '@/components/ui';
import { DEMO_ACCOUNTS, DEMO_MODE, useAuth, type MobileRole } from '@/context/AuthContext';
import { SocialButtons } from '@/components/domain/SocialButtons';
import type { SocialResult } from '@/services/facebook';

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
  const { signIn, signInWithTicket } = useAuth();
  const navigation = useNavigation<any>();
  const bottomInset = useBottomInset();
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

  /** Continue with Facebook / Google (residents only): sign in, or sign up with the details filled in. */
  const onSocial = async (r: SocialResult) => {
    if (r.status === 'signed_in' && r.ticket) {
      try {
        await signInWithTicket(r.ticket);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Sign in failed.');
      }
      return;
    }
    if (r.token) navigation.navigate('UserRegister', { social: r });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      // Android draws edge-to-edge, so the window no longer shrinks for the keyboard by itself:
      // without 'height' here the keyboard covered the password box.
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomInset }} keyboardShouldPersistTaps="handled">
        <AuthHeader title={title} subtitle={subtitle} />

        <View style={{ padding: theme.spacing(2.5), gap: theme.spacing(2), width: '100%', maxWidth: COLUMN, alignSelf: 'center' }}>
          {error ? <Banner tone="danger" icon="alert-circle" title="Cannot sign in" message={error} /> : null}

          {role === 'user' && !DEMO_MODE ? <SocialButtons intent="login" onResult={onSocial} dividerLabel="or sign in with email" /> : null}

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

          <Pressable
            onPress={() => navigation.navigate('ForgotPassword', { role })}
            hitSlop={8}
            style={{ alignSelf: 'center' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.primary }}>
              Forgot password?
            </Text>
          </Pressable>

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
