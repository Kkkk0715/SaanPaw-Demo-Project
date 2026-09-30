import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, reportKindStyle } from '@/constants/theme';
import {
  approvalMeta,
  caseStatusMeta,
  describeAnimal,
  formatDistance,
  reportStatusMeta,
  timeAgo,
} from '@saanpaw/shared';
import { AnimalPhoto, Badge, Card, Row, ScoreBar } from '@/components/ui';
export { describeAnimal, timeAgo } from '@saanpaw/shared';
export { AnimalTypeAndBreed } from './AnimalTypeAndBreed';

import type {
  AnimalCaseStatus,
  AnimalReport,
  NotificationItem,
  Shelter,
  ShelterAnimal,
} from '@saanpaw/shared';

/** Labels and colours live in shared; only the icon is specific to this app. */
export const CASE_ICONS: Record<AnimalCaseStatus, keyof typeof Ionicons.glyphMap> = {
  under_rescue: 'medkit',
  reunited: 'heart',
  adopted: 'home',
  inconclusive: 'help-circle',
};

export function CaseStatusPill({ status }: { status: AnimalCaseStatus }) {
  const m = caseStatusMeta[status];
  return <Badge label={m.label} color={m.color} soft={m.soft} icon={CASE_ICONS[status]} />;
}

/** The standard report row, used on every screen that lists reports. */
export function ReportCard({
  report,
  distance,
  onPress,
  footer,
}: {
  report: AnimalReport;
  distance?: number;
  onPress?: () => void;
  footer?: React.ReactNode;
}) {
  const kind = reportKindStyle[report.kind];
  const status = reportStatusMeta[report.status];
  const heading = describeAnimal(report);

  return (
    <Card onPress={onPress}>
      <Row gap={1.5} align="flex-start">
        <AnimalPhoto uri={report.imageUrls[0]} size={76} tint={kind.soft} iconColor={kind.color} />
        <View style={{ flex: 1, gap: 6 }}>
          <Row gap={0.75}>
            <Badge label={kind.label} color={kind.color} soft={kind.soft} icon="paw" />
            <Badge label={status.label} color={status.color} soft={status.soft} />
          </Row>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {heading}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {[report.breed, report.sex !== 'unknown' ? report.sex : null, report.size]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Row gap={1}>
            <Row gap={0.4}>
              <Ionicons name="location-outline" size={12} color={theme.colors.muted} />
              <Text style={styles.cardMeta}>{report.barangay}</Text>
            </Row>
            {distance !== undefined ? (
              <Row gap={0.4}>
                <Ionicons name="navigate-outline" size={12} color={theme.colors.muted} />
                <Text style={styles.cardMeta}>{formatDistance(distance)}</Text>
              </Row>
            ) : null}
            <Row gap={0.4}>
              <Ionicons name="time-outline" size={12} color={theme.colors.muted} />
              <Text style={styles.cardMeta}>{timeAgo(report.reportedAt)}</Text>
            </Row>
          </Row>
        </View>
      </Row>
      {report.description ? (
        <Text style={styles.cardBody} numberOfLines={2}>
          {report.description}
        </Text>
      ) : null}
      {footer}
    </Card>
  );
}

export function ShelterCard({
  shelter,
  distance,
  onPress,
  right,
}: {
  shelter: Shelter;
  distance?: number;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  const approval = approvalMeta[shelter.approvalStatus];
  return (
    <Card onPress={onPress}>
      <Row gap={1.5} align="flex-start">
        <View style={[styles.shelterLogo, { backgroundColor: shelter.logoColor }]}>
          <Ionicons name="home" size={19} color="#fff" />
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={styles.cardTitle}>{shelter.name}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {shelter.address}
          </Text>
          <Row gap={0.75}>
            <Badge label={approval.label} color={approval.color} soft={approval.soft} />
            <Text style={styles.cardMeta}>
              {shelter.currentOccupancy}/{shelter.capacity} animals
            </Text>
            {distance !== undefined ? (
              <Text style={styles.cardMeta}>{formatDistance(distance)} away</Text>
            ) : null}
          </Row>
        </View>
        {right}
      </Row>
    </Card>
  );
}

export function ShelterAnimalCard({
  animal,
  onPress,
  right,
}: {
  animal: ShelterAnimal;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <Card onPress={onPress}>
      <Row gap={1.5} align="flex-start">
        <AnimalPhoto uri={animal.imageUrls[0]} size={68} />
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={styles.cardTitle}>{animal.name}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {[animal.breed, animal.color, animal.size].filter(Boolean).join(' · ')}
          </Text>
          <Row gap={0.75}>
            <CaseStatusPill status={animal.caseStatus} />
            {animal.postedPublicly ? (
              <Badge label="Public" color={theme.colors.info} soft={theme.colors.infoSoft} icon="eye" />
            ) : (
              <Badge label="Private" color={theme.colors.muted} soft={theme.colors.surfaceAlt} icon="eye-off" />
            )}
          </Row>
        </View>
        {right}
      </Row>
      {animal.notes ? (
        <Text style={styles.cardBody} numberOfLines={2}>
          {animal.notes}
        </Text>
      ) : null}
    </Card>
  );
}

/** A candidate match, with its score and the reasons behind it. */
export function MatchCard({
  title,
  subtitle,
  imageUri,
  score,
  reasons,
  sourceLabel,
  onPress,
  actions,
}: {
  title: string;
  subtitle: string;
  imageUri?: string;
  score: number;
  reasons: string[];
  sourceLabel: string;
  onPress?: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <Card onPress={onPress}>
      <Row gap={1.5} align="flex-start">
        <AnimalPhoto uri={imageUri} size={76} tint={theme.colors.accentSoft} iconColor={theme.colors.accent} />
        <View style={{ flex: 1, gap: 7 }}>
          <Badge
            label={sourceLabel}
            color={theme.colors.accent}
            soft={theme.colors.accentSoft}
            icon="sparkles"
          />
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardMeta}>{subtitle}</Text>
          <ScoreBar score={score} />
        </View>
      </Row>
      <View style={styles.reasons}>
        {reasons.map((r) => (
          <Row key={r} gap={0.6} align="flex-start">
            <Ionicons name="checkmark-circle" size={13} color={theme.colors.primary} style={{ marginTop: 2 }} />
            <Text style={styles.reasonText}>{r}</Text>
          </Row>
        ))}
      </View>
      {actions}
    </Card>
  );
}

export function NotificationRow({
  item,
  onPress,
}: {
  item: NotificationItem;
  onPress?: () => void;
}) {
  const meta = {
    lost_nearby: { icon: 'alert-circle' as const, color: theme.colors.danger, soft: theme.colors.dangerSoft },
    found_nearby: { icon: 'paw' as const, color: theme.colors.accent, soft: theme.colors.accentSoft },
    match_found: { icon: 'sparkles' as const, color: theme.colors.primary, soft: theme.colors.primarySoft },
    case_update: { icon: 'refresh-circle' as const, color: theme.colors.info, soft: theme.colors.infoSoft },
    message: { icon: 'chatbubble-ellipses' as const, color: theme.colors.info, soft: theme.colors.infoSoft },
    system: { icon: 'settings' as const, color: theme.colors.muted, soft: theme.colors.surfaceAlt },
  }[item.type];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.notification,
        !item.isRead && styles.notificationUnread,
        pressed && { opacity: 0.75 },
      ]}
    >
      <View style={[styles.notifIcon, { backgroundColor: meta.soft }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.notifTitle}>{item.title}</Text>
        <Text style={styles.notifBody}>{item.body}</Text>
        <Row gap={1}>
          <Text style={styles.cardMeta}>{timeAgo(item.createdAt)}</Text>
          {item.distanceMeters !== undefined ? (
            <Text style={styles.cardMeta}>{formatDistance(item.distanceMeters)} away</Text>
          ) : null}
        </Row>
      </View>
      {!item.isRead ? <View style={styles.unreadDot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...theme.type.h3, color: theme.colors.text },
  cardMeta: { ...theme.type.caption, color: theme.colors.muted },
  cardBody: { ...theme.type.body, fontSize: 13, color: theme.colors.textSoft },

  shelterLogo: { width: 44, height: 44, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },

  reasons: {
    gap: 5,
    backgroundColor: theme.colors.primaryFaint,
    padding: theme.spacing(1.25),
    borderRadius: theme.radius.sm,
  },
  reasonText: { flex: 1, ...theme.type.caption, color: theme.colors.textSoft },

  notification: {
    flexDirection: 'row',
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.5),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  notificationUnread: { borderColor: theme.colors.primarySoft, backgroundColor: theme.colors.primaryFaint },
  notifIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  notifTitle: { ...theme.type.h3, fontSize: 14, color: theme.colors.text },
  notifBody: { ...theme.type.caption, fontSize: 12.5, color: theme.colors.textSoft },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary, marginTop: 6 },
});
