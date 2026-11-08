import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/constants/theme';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('../../../assets/icon.png');

/**
 * Full-screen loading state with the SaanPaw logo gently pulsing, instead of a bare spinner.
 * `withName` is off where the app's fonts aren't loaded yet, so no text flashes in the system font.
 */
export function LoadingLogo({ message, withName = true }: { message?: string; withName?: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.04] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });

  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel="Loading SaanPaw">
      <Animated.View style={{ transform: [{ scale }], opacity }}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      </Animated.View>
      {withName ? <Text style={styles.name}>SaanPaw</Text> : null}
      {withName && message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.colors.background,
  },
  logo: { width: 96, height: 96, borderRadius: 24 },
  name: { ...theme.type.h1, color: theme.colors.primary },
  message: { ...theme.type.caption, color: theme.colors.textSoft },
});
