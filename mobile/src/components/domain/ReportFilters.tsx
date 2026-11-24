import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { SJDM_ALL_BARANGAY_NAMES, type AnimalReport, type AnimalType, type ReportKind } from '@saanpaw/shared';
import { Button, Caption, Card, Choice, Field, Row, Segmented, Select } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/services/api';

export type DateWindow = 'any' | 'today' | '3d' | 'week' | 'month' | '90d';
const WINDOW_DAYS: Record<Exclude<DateWindow, 'any'>, number> = { today: 1, '3d': 3, week: 7, month: 30, '90d': 90 };

/** What the AI made of a typed search ("brown aspin found near Muzon last week"). */
export interface AiFilters {
  kind: ReportKind | null;
  animalType: AnimalType | null;
  color: string | null;
  breed: string | null;
  size: 'small' | 'medium' | 'large' | null;
  barangay: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  keywords: string[];
  summary: string;
}

/** Everything a report is searched on: its fields, place and AI tags. */
export const haystack = (r: AnimalReport) =>
  [r.name, r.animalType, r.breed, r.color, r.size, r.description, r.distinctMarks, r.barangay, r.address, r.landmark, ...(r.aiTags ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

const words = (s?: string | null) => (s ?? '').toLowerCase().split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2);

/**
 * Search and filter state for a list of reports: text (matches fields and AI tags), lost/found,
 * animal, location (barangay or a street/landmark), how recent, and an optional AI search that
 * turns a sentence into these filters. `apply` filters any list of reports.
 */
export function useReportFilters() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ReportKind | 'all'>('all');
  const [animalType, setAnimalType] = useState<AnimalType | 'any'>('any');
  const [barangay, setBarangay] = useState<string | null>(null);
  const [place, setPlace] = useState('');
  const [when, setWhen] = useState<DateWindow>('any');
  const [ai, setAi] = useState<AiFilters | null>(null);

  const apply = useMemo(() => {
    const q = query.trim().toLowerCase();
    const placeQ = place.trim().toLowerCase();
    const since = when === 'any' ? 0 : Date.now() - WINDOW_DAYS[when] * 86_400_000;
    const aiFrom = ai?.dateFrom ? +new Date(`${ai.dateFrom}T00:00:00+08:00`) : 0;
    const aiTo = ai?.dateTo ? +new Date(`${ai.dateTo}T23:59:59+08:00`) : Infinity;
    const aiTerms = ai ? [words(ai.color), words(ai.breed), ai.keywords.flatMap((k) => words(k))].filter((g) => g.length) : [];
    return <T extends AnimalReport>(list: T[]): T[] =>
      list.filter((r) => {
        if (kind !== 'all' && r.kind !== kind) return false;
        if (animalType !== 'any' && r.animalType !== animalType) return false;
        if (barangay && r.barangay !== barangay) return false;
        if (placeQ && ![r.barangay, r.address, r.landmark].filter(Boolean).join(' ').toLowerCase().includes(placeQ)) return false;
        const at = +new Date(r.reportedAt);
        if (since && at < since) return false;
        const text = haystack(r);
        if (q && !q.split(/\s+/).every((w) => text.includes(w))) return false;
        if (ai) {
          if (ai.kind && r.kind !== ai.kind) return false;
          if (ai.animalType && r.animalType !== ai.animalType) return false;
          if (ai.barangay && r.barangay !== ai.barangay) return false;
          if (ai.size && r.size && r.size !== ai.size) return false;
          if (at < aiFrom || at > aiTo) return false;
          // Each thing the search described (colour, breed, other features) must show up somewhere.
          if (!aiTerms.every((group) => group.some((w) => text.includes(w)))) return false;
        }
        return true;
      });
  }, [query, kind, animalType, barangay, place, when, ai]);

  const active = Boolean(query || kind !== 'all' || animalType !== 'any' || barangay || place || when !== 'any' || ai);
  const clear = () => {
    setQuery('');
    setKind('all');
    setAnimalType('any');
    setBarangay(null);
    setPlace('');
    setWhen('any');
    setAi(null);
  };

  return {
    query, setQuery, kind, setKind, animalType, setAnimalType, barangay, setBarangay,
    place, setPlace, when, setWhen, ai, setAi, apply, active, clear,
    resetKey: [query, kind, animalType, barangay, place, when, ai?.summary].join('|'),
  };
}

export type ReportFilterState = ReturnType<typeof useReportFilters>;

/** The search box (with "Ask AI"), lost/found switch, and the date / location / animal filters. */
export function ReportFilterPanel({ f, showKind = true }: { f: ReportFilterState; showKind?: boolean }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  /** Sends the typed sentence to the AI and applies what it understood as filters. */
  const askAi = async () => {
    const text = f.query.trim();
    if (text.length < 3) {
      setAiNote('Type what you are looking for first, e.g. "brown aspin found near Muzon last week".');
      return;
    }
    setAiBusy(true);
    setAiNote(null);
    try {
      const res = await apiRequest<{ available: boolean; filters: AiFilters | null }>(
        '/ai/search',
        { method: 'POST', body: JSON.stringify({ query: text }) },
        token ?? undefined,
      );
      if (!res.available || !res.filters) {
        setAiNote('AI search is busy right now. The words you typed are still searched normally.');
        return;
      }
      f.setAi(res.filters);
      f.setQuery('');
    } catch (e) {
      setAiNote(e instanceof Error ? e.message : 'AI search failed. Try again.');
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <View style={{ gap: theme.spacing(1.25) }}>
      <Field
        label="Search reports"
        value={f.query}
        onChangeText={f.setQuery}
        placeholder="e.g. brown aspin with white paws near Muzon"
        icon="search-outline"
        autoCapitalize="none"
        hint="Matches names, breed, colour, markings, place and AI tags."
      />
      <Row gap={1} style={{ flexWrap: 'wrap' }}>
        <Button label={aiBusy ? 'Asking AI…' : 'Search with AI'} icon="sparkles-outline" variant="secondary" full={false} loading={aiBusy} onPress={() => void askAi()} />
        <Button
          label={open ? 'Hide filters' : 'Date, place & animal'}
          icon="options-outline"
          variant="ghost"
          full={false}
          onPress={() => setOpen((v) => !v)}
        />
        {f.active ? <Button label="Clear all" icon="close-circle-outline" variant="ghost" full={false} onPress={f.clear} /> : null}
      </Row>
      {aiNote ? <Caption>{aiNote}</Caption> : null}
      {f.ai ? (
        <Pressable style={styles.aiChip} onPress={() => f.setAi(null)} accessibilityLabel="Remove the AI filter">
          <Ionicons name="sparkles" size={15} color={theme.colors.info} />
          <Text style={styles.aiText} numberOfLines={3}>
            AI: {f.ai.summary || 'filters from your search'}
          </Text>
          <Ionicons name="close" size={16} color={theme.colors.muted} />
        </Pressable>
      ) : null}

      {showKind ? (
        <Segmented
          options={[
            { label: 'All', value: 'all' },
            { label: 'Lost', value: 'lost', color: theme.colors.danger },
            { label: 'Found', value: 'found', color: theme.colors.found },
          ]}
          value={f.kind}
          onChange={(v) => f.setKind(v as ReportKind | 'all')}
        />
      ) : null}

      {open ? (
        <Card>
          <View style={{ gap: theme.spacing(1.5) }}>
            <Choice
              label="Reported"
              options={[
                { label: 'Any time', value: 'any' },
                { label: 'Today', value: 'today' },
                { label: '3 days', value: '3d' },
                { label: '7 days', value: 'week' },
                { label: '30 days', value: 'month' },
                { label: '90 days', value: '90d' },
              ]}
              value={f.when}
              onChange={(v) => f.setWhen(v as DateWindow)}
            />
            <Select
              label="Barangay where it was lost or found"
              value={f.barangay}
              options={['Any barangay', ...SJDM_ALL_BARANGAY_NAMES]}
              onChange={(v) => f.setBarangay(v === 'Any barangay' ? null : v)}
              placeholder="Any barangay"
            />
            <Field label="Street or landmark" value={f.place} onChangeText={f.setPlace} placeholder="e.g. Quirino Hwy, chapel, market" icon="map-outline" />
            <Choice
              label="Animal"
              options={[
                { label: 'Any', value: 'any' },
                { label: 'Dog', value: 'dog', icon: 'paw' },
                { label: 'Cat', value: 'cat', icon: 'paw' },
                { label: 'Other', value: 'other' },
              ]}
              value={f.animalType}
              onChange={(v) => f.setAnimalType(v as AnimalType | 'any')}
            />
          </View>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.infoSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  aiText: { flex: 1, fontSize: 13, color: theme.colors.text },
});
