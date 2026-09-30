import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatDistance, useApp } from '@saanpaw/shared';
import { theme } from '@/constants/theme';
import { Card, ListRow, Row, Screen, SectionHeader } from '@/components/ui';
import { MapCanvas, type MapMarker } from '@/components/map/MapCanvas';
import { ReportCard, describeAnimal } from '@/components/domain';

/** Shelter Admin Module - Dashboard. Active reports, ongoing rescues, occupancy. */
export function ShelterDashboardScreen({ navigation }: NativeStackScreenProps<any>) {
  const { currentShelter, shelterAreaReports, shelterAnimals, cases, notificationsFor, conversations } =
    useApp();

  const areaReports = shelterAreaReports();
  const mine = shelterAnimals.filter((a) => a.shelterId === currentShelter.id);
  const openCases = cases.filter((c) => c.shelterId === currentShelter.id && c.status === 'under_rescue');
  const unreadAlerts = notificationsFor('shelter_admin').filter((n) => !n.isRead).length;
  const unreadMessages = conversations
    .filter((c) => c.shelterId === currentShelter.id)
    .reduce((sum, c) => sum + c.unreadForShelter, 0);
  const unhandled = areaReports.filter((r) => !r.caseId).length;

  const occupancyPct = Math.min(
    100,
    Math.round((currentShelter.currentOccupancy / Math.max(1, currentShelter.capacity)) * 100),
  );

  const markers: MapMarker[] = [
    ...areaReports.map((r) => ({
      id: r.id,
      coordinate: r.location,
      kind: r.kind,
      label: describeAnimal(r),
    })),
    { id: currentShelter.id, coordinate: currentShelter.location, kind: 'shelter' as const, label: currentShelter.name },
  ];

  const counters = [
    { value: areaReports.length, label: 'In radius', color: theme.colors.danger, soft: theme.colors.dangerSoft, icon: 'documents' as const },
    { value: openCases.length, label: 'Rescuing', color: theme.colors.info, soft: theme.colors.infoSoft, icon: 'medkit' as const },
    { value: mine.filter((a) => a.caseStatus === 'reunited').length, label: 'Reunited', color: theme.colors.primary, soft: theme.colors.primarySoft, icon: 'heart' as const },
  ];

  /** The four daily jobs get colour; everything else sits in the list below. */
  const actions = [
    { label: 'Animal\nreports', icon: 'documents' as const, bg: theme.colors.danger, route: 'AnimalReports', badge: unhandled },
    { label: 'Case\nstatus', icon: 'pulse' as const, bg: theme.colors.info, route: 'AnimalStatus', badge: 0 },
    { label: 'Shelter\nanimals', icon: 'paw' as const, bg: theme.colors.primary, route: 'ShelterAnimals', badge: 0 },
    { label: 'Post\nrecovered', icon: 'megaphone' as const, bg: theme.colors.accent, route: 'RecoveredAnimals', badge: 0 },
  ];

  return (
    <Screen padded={false}>
      <SafeAreaView edges={['top']} style={styles.hero}>
        <Row gap={1.25} align="flex-start">
          <View style={styles.logo}>
            <Ionicons name="home" size={21} color={theme.colors.onPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.shelterName} numberOfLines={2}>
              {currentShelter.name}
            </Text>
            <Text style={styles.shelterMeta} numberOfLines={1}>
              {currentShelter.barangay} · {formatDistance(currentShelter.operatingRadiusMeters)} radius
            </Text>
          </View>
          <Pressable style={styles.heroBtn} onPress={() => navigation.navigate('ShelterNotifications')}>
            <Ionicons name="notifications" size={18} color={theme.colors.onPrimary} />
            {unreadAlerts ? (
              <View style={styles.heroDot}>
                <Text style={styles.heroDotText}>{unreadAlerts}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable style={styles.heroBtn} onPress={() => navigation.navigate('ShelterProfile')}>
            <Ionicons name="person" size={18} color={theme.colors.onPrimary} />
          </Pressable>
        </Row>

        <View style={styles.badgeRow}>
          <View style={styles.heroBadge}>
            <Ionicons name="checkmark-circle" size={12} color={theme.colors.primaryVivid} />
            <Text style={styles.heroBadgeText}>Approved shelter</Text>
          </View>
        </View>

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
        {/* Occupancy reads better as a bar than as one more number in the row. */}
        <Card>
          <Row>
            <View style={{ flex: 1 }}>
              <Text style={styles.occTitle}>Shelter occupancy</Text>
              <Text style={styles.occMeta}>
                {currentShelter.currentOccupancy} of {currentShelter.capacity} places used
              </Text>
            </View>
            <Text style={styles.occPct}>{occupancyPct}%</Text>
          </Row>
          <View style={styles.occTrack}>
            <View
              style={[
                styles.occFill,
                {
                  width: `${occupancyPct}%`,
                  backgroundColor: occupancyPct > 85 ? theme.colors.danger : theme.colors.primary,
                },
              ]}
            />
          </View>
        </Card>

        <Text style={styles.prompt}>Daily tasks</Text>
        <View style={styles.actionGrid}>
          {actions.map((a) => (
            <Pressable
              key={a.route}
              style={({ pressed }) => [styles.action, { backgroundColor: a.bg }, pressed && styles.pressed]}
              onPress={() => navigation.navigate(a.route)}
            >
              <Row>
                <View style={styles.actionIcon}>
                  <Ionicons name={a.icon} size={19} color="#fff" />
                </View>
                {a.badge ? (
                  <View style={styles.actionBadge}>
                    <Text style={styles.actionBadgeText}>{a.badge}</Text>
                  </View>
                ) : null}
              </Row>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        <SectionHeader
          title="Reports in your radius"
          action="View all"
          onAction={() => navigation.navigate('AnimalReports')}
        />
        <MapCanvas
          height={220}
          initialCenter={currentShelter.location}
          initialZoom={12}
          markers={markers}
          radiusMeters={currentShelter.operatingRadiusMeters}
          radiusCenter={currentShelter.location}
        />
        {areaReports.slice(0, 2).map((r) => (
          <ReportCard
            key={r.id}
            report={r}
            distance={r.distance}
            onPress={() => navigation.navigate('AnimalReports')}
          />
        ))}

        <SectionHeader title="Shelter management" />
        <ListRow
          icon="chatbubbles"
          title="Message box"
          subtitle="Chat with pet owners"
          iconColor={theme.colors.info}
          iconSoft={theme.colors.infoSoft}
          badge={unreadMessages}
          onPress={() => navigation.navigate('Messages')}
        />
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
    gap: theme.spacing(1.5),
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shelterName: { ...theme.type.h2, color: theme.colors.onPrimary },
  shelterMeta: { ...theme.type.caption, color: 'rgba(255,255,255,0.72)', marginTop: 1 },
  heroBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDot: {
    position: 'absolute',
    top: 4,
    right: 3,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: theme.colors.danger,
    borderWidth: 1.5,
    borderColor: theme.colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDotText: { color: '#fff', fontFamily: theme.fonts.bold, fontSize: 9 },

  badgeRow: { flexDirection: 'row' },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroBadgeText: { ...theme.type.tiny, color: 'rgba(255,255,255,0.92)' },

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
  prompt: { ...theme.type.h2, color: theme.colors.text, marginTop: theme.spacing(0.5) },

  occTitle: { ...theme.type.h3, color: theme.colors.text },
  occMeta: { ...theme.type.caption, color: theme.colors.muted, marginTop: 1 },
  occPct: { ...theme.type.stat, fontSize: 22, color: theme.colors.primary },
  occTrack: {
    height: 9,
    borderRadius: 5,
    backgroundColor: theme.colors.surfaceAlt,
    overflow: 'hidden',
    marginTop: theme.spacing(0.5),
  },
  occFill: { height: 9, borderRadius: 5 },

  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1.25) },
  action: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: theme.radius.xl,
    padding: theme.spacing(1.75),
    gap: theme.spacing(1.5),
    minHeight: 112,
    justifyContent: 'space-between',
    ...theme.shadow.card,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBadge: {
    marginLeft: 'auto',
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBadgeText: { ...theme.type.tiny, color: theme.colors.text },
  actionLabel: { ...theme.type.h3, color: '#fff', lineHeight: 19 },
});
