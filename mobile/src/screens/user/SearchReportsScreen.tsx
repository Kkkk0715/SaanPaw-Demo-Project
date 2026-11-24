import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/constants/theme';
import { distanceMeters, useApp } from '@saanpaw/shared';
import {
  Card,
  Caption,
  Choice,
  EmptyState,
  Pager,
  Row,
  Screen,
  SectionHeader,
  usePagination,
} from '@/components/ui';
import { ReportCard } from '@/components/domain';
import { ReportFilterPanel, useReportFilters } from '@/components/domain/ReportFilters';
import { useNavigation } from '@react-navigation/native';

type Sort = 'recent' | 'nearest';

/**
 * User Module - Search and Filter Reports: text (fields, place and AI tags), "Search with AI" for
 * a typed sentence, lost/found, date, barangay or street, animal type, and sort.
 */
export function SearchReportsScreen() {
  const navigation = useNavigation<any>();
  const { reports, currentUser } = useApp();
  const f = useReportFilters();
  const [sort, setSort] = useState<Sort>('recent');

  const results = useMemo(
    () =>
      f
        .apply(reports.filter((r) => r.status !== 'closed'))
        .map((r) => ({ ...r, distance: distanceMeters(currentUser.location, r.location) }))
        .sort((a, b) => (sort === 'nearest' ? a.distance - b.distance : +new Date(b.reportedAt) - +new Date(a.reportedAt))),
    [reports, f, sort, currentUser.location],
  );

  const page = usePagination(results, undefined, `${f.resetKey}|${sort}`);
  const clear = () => {
    f.clear();
    setSort('recent');
  };

  return (
    <Screen>
      <ReportFilterPanel f={f} />
      <Choice
        label="Sort by"
        options={[
          { label: 'Most recent', value: 'recent' },
          { label: 'Nearest to me', value: 'nearest' },
        ]}
        value={sort}
        onChange={(v) => setSort(v as Sort)}
      />

      <SectionHeader title={`${results.length} ${results.length === 1 ? 'result' : 'results'}`} />
      <Row gap={0.5}>
        <Caption>
          Showing open reports across San Jose Del Monte
          {sort === 'nearest' ? `, nearest to ${currentUser.barangay} first` : ', newest first'}.
        </Caption>
      </Row>

      {results.length ? (
        page.items.map((r) => (
          <ReportCard
            key={r.id}
            report={r}
            distance={r.distance}
            // The full report: photos, every detail, where and when, who to contact, the map.
            onPress={() => navigation.navigate('ReportDetail', { reportId: r.id })}
            footer={
              <View style={styles.footerRow}>
                <Text style={styles.contactHint} numberOfLines={1}>
                  {r.kind === 'found' ? `Reported by ${r.reporterName}` : 'Tap to see the full report'}
                </Text>
                <Text style={styles.viewDetails}>View details ›</Text>
              </View>
            }
          />
        ))
      ) : (
        <Card>
          <EmptyState
            icon="search-outline"
            title="No reports match"
            message="Try widening the filters, or check the map view for everything currently open in the city."
            action="Clear filters"
            onAction={clear}
          />
        </Card>
      )}
      <Pager {...page} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  footerRow: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing(1),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
  },
  contactHint: { fontSize: 12, color: theme.colors.muted, flex: 1 },
  viewDetails: { ...theme.type.label, color: theme.colors.primary },
});
