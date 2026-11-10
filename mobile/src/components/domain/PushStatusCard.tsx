import { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { Button, Card } from '@/components/ui';
import { describePushStatus, usePushStatus } from '@/services/pushNotifications';
import { apiRequest } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

/**
 * Whether this phone can receive SaanPaw alerts, and why not when it can't - plus a test button
 * that asks the server to push to this phone and shows exactly what came back.
 */
export function PushStatusCard() {
  const status = usePushStatus();
  const info = describePushStatus(status);
  const { role, token } = useAuth();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const sendTest = async () => {
    if (!token || !role) return;
    setTesting(true);
    setResult(null);
    try {
      const path = role === 'user' ? '/user/push-test' : '/shelter/push-test';
      setResult(await apiRequest<{ ok: boolean; message: string }>(path, { method: 'POST' }, token));
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: theme.spacing(1), alignItems: 'flex-start' }}>
        <Ionicons
          name={info.ok ? 'notifications' : 'notifications-off-outline'}
          size={18}
          color={info.ok ? theme.colors.primary : theme.colors.accent}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ ...theme.type.bodyMedium, color: theme.colors.text }}>{info.title}</Text>
          <Text style={{ ...theme.type.caption, color: theme.colors.textSoft }}>{info.detail}</Text>
        </View>
      </View>
      {status.state === 'on' ? (
        <Button
          label="Send a test notification"
          variant="secondary"
          icon="paper-plane-outline"
          loading={testing}
          onPress={() => void sendTest()}
        />
      ) : null}
      {result ? (
        <Text style={{ ...theme.type.caption, color: result.ok ? theme.colors.primary : theme.colors.danger }}>
          {result.message}
        </Text>
      ) : null}
    </Card>
  );
}
