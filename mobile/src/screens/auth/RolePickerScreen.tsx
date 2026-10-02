import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '@/constants/theme';
import { useBottomInset } from '@/components/ui';

/** Entry screen. Each module has its own login, so ask which one first. */
export function RolePickerScreen({ navigation }: NativeStackScreenProps<any>) {
  const bottomInset = useBottomInset();
  const modules = [
    {
      title: 'Pet Owner',
      tagline: 'Community',
      description: 'Report a lost pet or a stray you found, search reports, and get alerts near you.',
      icon: 'people' as const,
      color: theme.colors.primary,
      soft: theme.colors.primarySoft,
      route: 'UserLogin',
    },
    {
      title: 'Shelter Admin',
      tagline: 'Verified shelters',
      description: 'Manage reports in your operating radius, shelter animals, and case statuses.',
      icon: 'home' as const,
      color: theme.colors.accent,
      soft: theme.colors.accentSoft,
      route: 'ShelterLogin',
    },
  ];

  const notes = [
    {
      icon: 'shield-checkmark-outline' as const,
      text: 'Covers San Jose Del Monte, Bulacan only. Identification is image-based — no GPS collars, RFID tags, or microchips.',
    },
    {
      icon: 'desktop-outline' as const,
      text: 'System administration runs in the SaanPaw Developer Console, a separate web app.',
    },
  ];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: theme.spacing(5) + bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          {/* Soft shapes and paw marks, so the header is not a flat block of green. */}
          <View pointerEvents="none" style={styles.blobA} />
          <View pointerEvents="none" style={styles.blobB} />
          <Ionicons name="paw" size={92} color="rgba(255,255,255,0.06)" style={styles.pawGhostA} />
          <Ionicons name="paw" size={58} color="rgba(255,255,255,0.05)" style={styles.pawGhostB} />

          <SafeAreaView edges={['top']} style={styles.heroInner}>
            <View style={styles.logo}>
              <Ionicons name="paw" size={36} color={theme.colors.onPrimary} />
            </View>
            <Text style={styles.brand}>SaanPaw</Text>
            <Text style={styles.tagline}>
              Lost pet and stray animal recovery for{'\n'}San Jose Del Monte, Bulacan
            </Text>
          </SafeAreaView>
        </View>

        <View style={styles.column}>
          <Text style={styles.prompt}>Choose your module</Text>

          {modules.map((m) => (
            <Pressable
              key={m.route}
              onPress={() => navigation.navigate(m.route)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={[styles.stripe, { backgroundColor: m.color }]} />
              <View style={[styles.cardIcon, { backgroundColor: m.soft }]}>
                <Ionicons name={m.icon} size={25} color={m.color} />
              </View>
              <View style={styles.cardText}>
                <Text style={[styles.cardTagline, { color: m.color }]}>{m.tagline.toUpperCase()}</Text>
                <Text style={styles.cardTitle}>{m.title}</Text>
                <Text style={styles.cardDesc}>{m.description}</Text>
              </View>
              <View style={[styles.chevron, { backgroundColor: m.soft }]}>
                <Ionicons name="arrow-forward" size={16} color={m.color} />
              </View>
            </Pressable>
          ))}

          <View style={styles.notes}>
            {notes.map((n) => (
              <View key={n.text} style={styles.note}>
                <Ionicons name={n.icon} size={14} color={theme.colors.muted} />
                <Text style={styles.noteText}>{n.text}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** Phone-width column, so the app stays readable in a desktop browser. */
const COLUMN = 460;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { paddingBottom: theme.spacing(5) },

  hero: {
    backgroundColor: theme.colors.primaryDark,
    borderBottomLeftRadius: theme.radius.xl * 1.6,
    borderBottomRightRadius: theme.radius.xl * 1.6,
    overflow: 'hidden',
  },
  heroInner: {
    alignItems: 'center',
    paddingTop: theme.spacing(5),
    paddingBottom: theme.spacing(4.5),
    paddingHorizontal: theme.spacing(3),
  },
  blobA: {
    position: 'absolute',
    top: -70,
    right: -50,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: 'rgba(34,197,94,0.22)',
  },
  blobB: {
    position: 'absolute',
    bottom: -80,
    left: -60,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pawGhostA: { position: 'absolute', top: 24, left: 18, transform: [{ rotate: '-18deg' }] },
  pawGhostB: { position: 'absolute', bottom: 22, right: 26, transform: [{ rotate: '22deg' }] },

  logo: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.26)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing(1.5),
  },
  brand: { ...theme.type.hero, fontSize: 34, lineHeight: 41, color: theme.colors.onPrimary },
  tagline: {
    ...theme.type.body,
    marginTop: 6,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
  },

  column: {
    width: '100%',
    maxWidth: COLUMN,
    alignSelf: 'center',
    paddingHorizontal: theme.spacing(2),
    paddingTop: theme.spacing(3),
    gap: theme.spacing(1.5),
  },
  prompt: { ...theme.type.h2, color: theme.colors.text },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing(2),
    paddingLeft: theme.spacing(2.25),
    overflow: 'hidden',
    ...theme.shadow.card,
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  /** Colour bar down the left edge, so the two modules read apart instantly. */
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  cardIcon: { width: 54, height: 54, borderRadius: theme.radius.lg, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: 1 },
  cardTagline: { ...theme.type.tiny, fontSize: 10, letterSpacing: 0.7 },
  cardTitle: { ...theme.type.h2, color: theme.colors.text },
  cardDesc: { ...theme.type.caption, color: theme.colors.muted, marginTop: 2 },
  chevron: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  notes: { gap: theme.spacing(1), marginTop: theme.spacing(1.5), paddingHorizontal: theme.spacing(0.5) },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  noteText: { flex: 1, ...theme.type.caption, fontSize: 11.5, color: theme.colors.muted },
});
