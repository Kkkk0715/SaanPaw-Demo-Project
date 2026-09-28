import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { formatDistance, useApp } from '@saanpaw/shared';
import { theme } from '@/constants/theme';
import { Card, EmptyState, Row, Screen, SectionHeader } from '@/components/ui';
import { ReportCard } from '@/components/domain';

/** User Module - Dashboard. Daily stats, plus the way in to every user feature. */
export function UserDashboardScreen({ navigation }: BottomTabScreenProps<any>) {
  const { stats, currentUser, myReports, nearbyReports, notificationsFor } = useApp();

  const nearby = nearbyReports();
  const unread = notificationsFor('user').filter((n) => !n.isRead).length;
  const activeOwn = myReports.filter((r) => r.status === 'active' || r.status === 'matched');
  const firstName = currentUser.fullName.split(' ')[0];

  const actions = [
    { label: 'Report a\nlost pet', icon: 'alert-circle' as const, bg: theme.colors.danger, route: 'ReportLostPet' },
    { label: 'Report a\nfound animal', icon: 'paw' as const, bg: theme.colors.accent, route: 'ReportFoundAnimal' },
    { label: 'Match a\nphoto', icon: 'sparkles' as const, bg: theme.colors.primary, route: 'ImageRecognition' },
    { label: 'Browse\nshelters', icon: 'home' as const, bg: theme.colors.info, route: 'ShelterView' },
  ];

  const counters = [
    { value: stats.lostToday, label: 'Lost today', color: theme.colors.danger, soft: theme.colors.dangerSoft, icon: 'alert-circle' as const },
    { value: stats.foundToday, label: 'Found today', color: theme.colors.accent, soft: theme.colors.accentSoft, icon: 'paw' as const },
    { value: stats.reunitedThisMonth, label: 'Reunited', color: theme.colors.primary, soft: theme.colors.primarySoft, icon: 'heart' as const },
  ];

  return (
    <Screen padded={false}>
      {/* Green hero, so the screen opens with colour instead of a wall of cards. */}
      <SafeAreaView edges={['top']} style={styles.hero}>
        <Row gap={1.25}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Kumusta, {firstName}!</Text>
            <Row gap={0.4}>
              <Ionicons name="location" size={12} color="rgba(255,255,255,0.72)" />
              <Text style={styles.greetingMeta}>
                {currentUser.barangay} · {formatDistance(currentUser.alertRadiusMeters)} radius
              </Text>
            </Row>
          </View>
          <Pressable style={styles.bell} onPress={() => navigation.navigate('Alerts')}>
            <Ionicons name="notifications" size={19} color={theme.colors.onPrimary} />
            {unread ? (
              <View style={styles.bellDot}>
                <Text style={styles.bellDotText}>{unread}</Text>
              </View>
            ) : null}
          </Pressable>
        </Row>

        <View style={styles.counterStrip}>
          {counters.map((c, i) => (
            <View key={c.label} style={[styles.counter, i < counters.length - 1 && styles.counterEdge]}>
              <View style={[styles.counterIcon, { backgroundColor: c.soft }]}>
                <Ionicons name={c.icon} size={13} color={c.color} />
              </View>
              <Text style={styles.counterValue}>{c.value}</Text>
              <Text style={styles.counterLabel}>{c.label}</Text>
            </View>
          ))}
        </View>
      </SafeAreaView>

      <View style={styles.body}>
        <Text style={styles.prompt}>What do you need?</Text>
        <View style={styles.actionGrid}>
          {actions.map((a) => (
            <Pressable
              key={a.route}
              style={({ pressed }) => [styles.action, { backgroundColor: a.bg }, pressed && styles.pressed]}
              onPress={() => navigation.navigate(a.route as never)}
            >
              <View style={styles.actionIcon}>
                <Ionicons name={a.icon} size={20} color="#fff" />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        <SectionHeader
          title="My reports"
          action={myReports.length ? 'See all' : undefined}
          onAction={() => navigation.navigate('LostPetStatus' as never)}
        />
        {activeOwn.length ? (
          activeOwn
            .slice(0, 2)
            .map((r) => (
              <ReportCard key={r.id} report={r} onPress={() => navigation.navigate('LostPetStatus' as never)} />
            ))
        ) : (
          <Card>
            <EmptyState
              icon="clipboard-outline"
              title={myReports.length ? 'No open reports' : 'Nothing reported yet'}
              message={
                myReports.length
                  ? 'All your reports are resolved. See all shows the full history.'
                  : 'Report a lost pet or a stray you found, and track it here.'
              }
              action="Report a lost pet"
              onAction={() => navigation.navigate('ReportLostPet' as never)}
            />
          </Card>
        )}

        <SectionHeader
          title={`Near you · ${formatDistance(currentUser.alertRadiusMeters)}`}
          action="Map"
          onAction={() => navigation.navigate('Map')}
        />
        {nearby.length ? (
          nearby
            .slice(0, 4)
            .map((r) => (
              <ReportCard key={r.id} report={r} distance={r.distance} onPress={() => navigation.navigate('Search')} />
            ))
        ) : (
          <Card>
            <EmptyState
              icon="map-outline"
              title="All quiet nearby"
              message={`Nothing open within ${formatDistance(currentUser.alertRadiusMeters)} of ${currentUser.barangay}. Widen your radius in Profile to see more of the city.`}
            />
          </Card>
        )}

        <View style={styles.tip}>
          <Ionicons name="bulb" size={17} color={theme.colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.tipTitle}>Clear photos match better</Text>
            <Text style={styles.tipBody}>
              The matcher compares coat colour, markings, and build. A well-lit shot of the whole
              animal raises the confidence score.
            </Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: theme.colors.primaryDark,
    paddingHorizontal: theme.spacing(2),
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(2),
    borderBottomLeftRadius: theme.radius.xl,
    borderBottomRightRadius: theme.radius.xl,
    gap: theme.spacing(2),
  },
  greeting: { ...theme.type.hero, color: theme.colors.onPrimary },
  greetingMeta: { ...theme.type.caption, color: 'rgba(255,255,255,0.72)' },
  bell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 6,
    right: 5,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: theme.colors.danger,
    borderWidth: 1.5,
    borderColor: theme.colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDotText: { color: '#fff', fontFamily: theme.fonts.bold, fontSize: 9 },

  counterStrip: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing(1.25),
    ...theme.shadow.card,
  },
  counter: { flex: 1, alignItems: 'center', gap: 3 },
  counterEdge: { borderRightWidth: 1, borderRightColor: theme.colors.border },
  counterIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  counterValue: { ...theme.type.stat, fontSize: 21, color: theme.colors.text },
  counterLabel: { ...theme.type.tiny, color: theme.colors.muted },

  body: { padding: theme.spacing(2), gap: theme.spacing(1.5) },
  prompt: { ...theme.type.h2, color: theme.colors.text },

  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1.25) },
  action: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: theme.radius.xl,
    padding: theme.spacing(1.75),
    gap: theme.spacing(1.5),
    minHeight: 118,
    justifyContent: 'space-between',
    ...theme.shadow.card,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { ...theme.type.h3, color: '#fff', lineHeight: 19 },

  tip: {
    flexDirection: 'row',
    gap: theme.spacing(1.25),
    padding: theme.spacing(1.75),
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.accentSoft,
    marginTop: theme.spacing(0.5),
  },
  tipTitle: { ...theme.type.label, color: theme.colors.text },
  tipBody: { ...theme.type.caption, color: theme.colors.textSoft, marginTop: 2 },
});
