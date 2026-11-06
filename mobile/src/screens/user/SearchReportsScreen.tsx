import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/constants/theme';
import { SJDM_ALL_BARANGAY_NAMES, distanceMeters, useApp } from '@saanpaw/shared';
import type { AnimalType, ReportKind } from '@saanpaw/shared';
import {
  Button,
  Card,
  Caption,
  Choice,
  EmptyState,
  Field,
  Pager,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Select,
  usePagination,
} from '@/components/ui';
import { ReportCard } from '@/components/domain';

type KindFilter = ReportKind | 'all';
type Sort = 'recent' | 'nearest';

/** Figure 20 specifies filtering by animal type, date, and location. */
type DateFilter = 'any' | 'today' | 'week' | 'month';

const DATE_WINDOWS: Record<Exclude<DateFilter, 'any'>, number> = {
  today: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

/**
 * User Module - Search and Filter Reports.
 * Filters mirror the report form fields, so you can narrow down to the animal
 * you are actually looking for.
 */
export function SearchReportsScreen() {
  const { reports, currentUser } = useApp();

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [animalType, setAnimalType] = useState<AnimalType | 'any'>('any');
  const [barangay, setBarangay] = useState<string | null>(null);
  const [reportedWithin, setReportedWithin] = useState<DateFilter>('any');
  const [sort, setSort] = useState<Sort>('recent');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports
      .filter((r) => r.status !== 'closed')
      .filter((r) => (kind === 'all' ? true : r.kind === kind))
      .filter((r) => (animalType === 'any' ? true : r.animalType === animalType))
      .filter((r) => (barangay ? r.barangay === barangay : true))
      .filter((r) =>
        reportedWithin === 'any'
          ? true
          : Date.now() - +new Date(r.reportedAt) <= DATE_WINDOWS[reportedWithin],
      )
      .filter((r) =>
        q
          ? [r.name, r.breed, r.color, r.description, r.distinctMarks, r.barangay, r.address, r.landmark]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(q)
          : true,
      )
      .map((r) => ({ ...r, distance: distanceMeters(currentUser.location, r.location) }))
      .sort((a, b) =>
        sort === 'nearest' ? a.distance - b.distance : +new Date(b.reportedAt) - +new Date(a.reportedAt),
      );
  }, [reports, query, kind, animalType, barangay, reportedWithin, sort, currentUser.location]);

  const page = usePagination(results, undefined, [query, kind, animalType, barangay, reportedWithin, sort].join('|'));

  const clear = () => {
    setQuery('');
    setKind('all');
    setAnimalType('any');
    setBarangay(null);
    setReportedWithin('any');
    setSort('recent');
  };

  const filtersActive = Boolean(
    query || kind !== 'all' || animalType !== 'any' || barangay || reportedWithin !== 'any' || sort !== 'recent',
  );

  return (
    <Screen>
      <Field
        label="Search reports"
        value={query}
        onChangeText={setQuery}
        placeholder="Name, breed, colour, markings, barangay..."
        icon="search-outline"
        autoCapitalize="none"
      />

      <Segmented
        options={[
          { label: 'All', value: 'all' },
          { label: 'Lost', value: 'lost', color: theme.colors.danger },
          { label: 'Found', value: 'found', color: theme.colors.found },
        ]}
        value={kind}
        onChange={(v) => setKind(v as KindFilter)}
      />

      <Card>
        <Choice
          label="Animal type"
          options={[
            { label: 'Any', value: 'any' },
            { label: 'Dog', value: 'dog', icon: 'paw' },
            { label: 'Cat', value: 'cat', icon: 'logo-octocat' },
            { label: 'Other', value: 'other' },
          ]}
          value={animalType}
          onChange={(v) => setAnimalType(v as AnimalType | 'any')}
        />
        <Select
          label="Barangay"
          value={barangay}
          options={['Any barangay', ...SJDM_ALL_BARANGAY_NAMES]}
          onChange={(v) => setBarangay(v === 'Any barangay' ? null : v)}
          placeholder="Any barangay"
        />
        <Choice
          label="Date reported"
          options={[
            { label: 'Any time', value: 'any' },
            { label: 'Today', value: 'today' },
            { label: 'Past week', value: 'week' },
            { label: 'Past month', value: 'month' },
          ]}
          value={reportedWithin}
          onChange={(v) => setReportedWithin(v as DateFilter)}
        />
        <Choice
          label="Sort by"
          options={[
            { label: 'Most recent', value: 'recent' },
            { label: 'Nearest to me', value: 'nearest' },
          ]}
          value={sort}
          onChange={(v) => setSort(v as Sort)}
        />
        {filtersActive ? (
          <Button label="Clear filters" variant="ghost" icon="close-circle-outline" onPress={clear} />
        ) : null}
      </Card>

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
            footer={
              r.kind === 'found' ? (
                <View style={styles.footerRow}>
                  <Text style={styles.contactHint}>
                    Reported by {r.reporterName}
                    {r.reporterPhone ? ` · ${r.reporterPhone}` : ''}
                  </Text>
                </View>
              ) : undefined
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
  },
  contactHint: { fontSize: 12, color: theme.colors.muted },
});
