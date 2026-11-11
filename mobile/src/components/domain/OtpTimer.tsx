import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

/** What the server says after sending a code: when it stops working, and when another can be sent. */
export interface OtpSent {
  expiresAt: string;
  resendAfterSeconds: number;
}

/** Seconds left until `target` (an ISO time or epoch ms), ticking once a second; 0 once passed. */
export function useCountdown(target: string | number | null): number {
  const end = target == null ? null : typeof target === 'number' ? target : Date.parse(target);
  const left = () => (end == null ? 0 : Math.max(0, Math.ceil((end - Date.now()) / 1000)));
  const [seconds, setSeconds] = useState(left);
  useEffect(() => {
    setSeconds(left());
    if (end == null) return;
    const id = setInterval(() => {
      const s = left();
      setSeconds(s);
      if (s <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end]);
  return seconds;
}

export const formatCountdown = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * The code's timer and the resend link under a code box: "Code expires in 9:41", then "This code
 * has expired" in red; "Resend code in 0:45" until the wait is over, then a tappable "Resend code".
 */
export function OtpTimer({
  sent,
  sentAtMs,
  onResend,
  resending,
}: {
  sent: OtpSent;
  /** When the answer arrived, so the resend wait counts from then. */
  sentAtMs: number;
  onResend: () => void;
  resending?: boolean;
}) {
  const expiresIn = useCountdown(sent.expiresAt);
  const resendIn = useCountdown(sentAtMs + sent.resendAfterSeconds * 1000);
  const expired = expiresIn <= 0;

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Ionicons name={expired ? 'alert-circle' : 'time-outline'} size={15} color={expired ? theme.colors.danger : theme.colors.muted} />
        <Text style={[styles.text, expired && styles.expired]}>
          {expired ? 'This code has expired. Send a new one.' : `Code expires in ${formatCountdown(expiresIn)}`}
        </Text>
      </View>
      {resendIn > 0 && !expired ? (
        <Text style={styles.text}>Resend in {formatCountdown(resendIn)}</Text>
      ) : (
        <Pressable onPress={onResend} disabled={resending} hitSlop={8}>
          <Text style={[styles.link, resending && { opacity: 0.5 }]}>{resending ? 'Sending...' : 'Resend code'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  left: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  text: { ...theme.type.caption, color: theme.colors.muted },
  expired: { color: theme.colors.danger },
  link: { ...theme.type.caption, fontWeight: '700', color: theme.colors.primary, textDecorationLine: 'underline' },
});
