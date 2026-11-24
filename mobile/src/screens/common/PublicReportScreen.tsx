import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { reportPlace, reportStatusMeta, resolveImageUrl, timeAgo, useApp, type AnimalReport } from '@saanpaw/shared';
import { theme, reportKindStyle } from '@/constants/theme';
import { AnimalPhoto, Badge, Button, Caption, Card, EmptyState, Row, Screen, SectionHeader } from '@/components/ui';
import { describeAnimal } from '@/components/domain';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL, apiRequest } from '@/services/api';
import { postReportToFacebook, shareReport } from '@/services/share';

/**
 * One report as anyone may see it - opened from a shared link (saanpaw://report?kind=..&id=..,
 * e.g. tapped on Facebook) or from guest mode. No reporter phone number or full name.
 */
export function PublicReportScreen({ route, navigation }: NativeStackScreenProps<any>) {
  const { kind, id } = (route.params ?? {}) as { kind?: 'lost' | 'found'; id?: string };
  const { role } = useAuth();
  const { reportById } = useApp();
  const [report, setReport] = useState<AnimalReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kind || !id) {
      setError('This link is incomplete.');
      return;
    }
    let cancelled = false;
    apiRequest<AnimalReport>(`/public/reports/${kind}/${id}`)
      .then((r) => {
        if (!cancelled) setReport({ ...r, imageUrls: (r.imageUrls ?? []).map((u) => resolveImageUrl(u, API_BASE_URL)) });
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [kind, id]);

  if (error) {
    return (
      <Screen>
        <Card>
          <EmptyState icon="document-text-outline" title="This report is not available" message={error} action="Back" onAction={() => navigation.goBack()} />
        </Card>
      </Screen>
    );
  }
  if (!report) {
    return (
      <Screen>
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: theme.spacing(6) }} />
      </Screen>
    );
  }

  const style = reportKindStyle[report.kind];
  const status = reportStatusMeta[report.status];
  const inApp = role ? reportById(report.id) : undefined;
  const title = `${report.kind === 'lost' ? 'LOST' : 'FOUND'}: ${describeAnimal(report)}`;
  const details = [
    ['Animal', report.animalType],
    ['Breed', report.breed],
    ['Fur color', report.color],
    ['Size', report.size],
    ['Sex', report.sex !== 'unknown' ? report.sex : undefined],
    ['Distinct marks', report.distinctMarks],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <Screen>
      <AnimalPhoto uri={report.imageUrls[0]} size="full" tint={style.soft} iconColor={style.color} />
      {report.imageUrls.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {report.imageUrls.slice(1).map((uri) => (
            <AnimalPhoto key={uri} uri={uri} size={64} tint={style.soft} iconColor={style.color} />
          ))}
        </ScrollView>
      ) : null}
      <Row gap={0.75}>
        <Badge label={style.label} color={style.color} soft={style.soft} icon="paw" />
        <Badge label={status.label} color={status.color} soft={status.soft} />
      </Row>
      <Text style={styles.title}>{describeAnimal(report)}</Text>
      <Caption>
        {report.kind === 'lost' ? 'Last seen' : 'Found'} at {reportPlace(report)} · {timeAgo(report.reportedAt)}
      </Caption>

      <Card>
        {details.map(([k, v]) => (
          <Row key={k} gap={1} style={styles.row}>
            <Text style={styles.key}>{k}</Text>
            <Text style={styles.value}>{v}</Text>
          </Row>
        ))}
        {report.description ? <Text style={styles.body}>{report.description}</Text> : null}
        <Caption>Reported by {report.reporterName}</Caption>
      </Card>

      <SectionHeader title="Help spread the word" />
      <View style={{ gap: theme.spacing(1) }}>
        <Button label="Post to Facebook" icon="logo-facebook" color="#1877F2" onPress={() => void postReportToFacebook(report.kind, report.id)} />
        <Button label="Share" variant="secondary" icon="share-social-outline" onPress={() => void shareReport(report.kind, report.id, title)} />
      </View>

      {inApp ? (
        <Button label="Open full details" variant="secondary" icon="open-outline" onPress={() => navigation.navigate('ReportDetail', { reportId: report.id })} />
      ) : !role ? (
        <Card>
          <Text style={styles.body}>Have you seen this animal, or is it yours?</Text>
          <Caption>Sign in or create a free account to contact the reporter, report a sighting or get alerts.</Caption>
          <Button label="Create account" icon="person-add-outline" onPress={() => navigation.navigate('UserRegister')} />
          <Button label="Sign in" variant="ghost" onPress={() => navigation.navigate('UserLogin')} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...theme.type.h1, color: theme.colors.text },
  row: { justifyContent: 'space-between', paddingVertical: 4 },
  key: { ...theme.type.caption, color: theme.colors.muted },
  value: { ...theme.type.body, color: theme.colors.text, flexShrink: 1, textAlign: 'right' },
  body: { ...theme.type.body, color: theme.colors.text, marginVertical: 6 },
});
