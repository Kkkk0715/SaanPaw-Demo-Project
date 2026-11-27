import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { resolveImageUrl, type AnimalReport, type Shelter } from '@saanpaw/shared';
import { theme } from '@/constants/theme';
import { Banner, Button, Caption, Card, EmptyState, ErrorText, Field, Pager, Row, Screen, Segmented, usePagination } from '@/components/ui';
import { ReportCard, ShelterCard } from '@/components/domain';
import { API_BASE_URL, apiRequest } from '@/services/api';
import { confirmAsync } from '@/services/confirm';
import { ReportForm } from '@/screens/user/ReportForm';
import { deleteGuestReport, listGuestReports, setGuestReportStatus, type SavedGuestReport } from '@/services/guestReports';

type Tab = 'reports' | 'shelters';
type KindFilter = 'all' | 'lost' | 'found';
type Order = 'newest' | 'oldest' | 'barangay';
const PAGE = 10;

/** "Today", "Yesterday", "This week", "This month", or the month and year, for the list headings. */
function whenGroup(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - +d) / 86_400_000);
  const sameDay = new Date().toDateString() === d.toDateString();
  if (sameDay) return 'Today';
  if (days < 2) return 'Yesterday';
  if (days < 7) return 'This week';
  if (days < 30) return 'This month';
  return d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

const withPhotos = <T extends { imageUrls?: string[]; photoUrl?: string }>(item: T): T => ({
  ...item,
  imageUrls: (item.imageUrls ?? []).map((u) => resolveImageUrl(u, API_BASE_URL)),
  photoUrl: item.photoUrl ? resolveImageUrl(item.photoUrl, API_BASE_URL) : item.photoUrl,
});

/**
 * Guest mode: look around without an account - open lost and found reports and the shelters in
 * San Jose Del Monte. Reporting, messaging and alerts need an account, so those ask to sign up.
 * Contact numbers and full names of reporters are never shown to guests.
 */
export function GuestHomeScreen({ navigation }: NativeStackScreenProps<any>) {
  const [tab, setTab] = useState<Tab>('reports');
  const [kind, setKind] = useState<KindFilter>('all');
  const [order, setOrder] = useState<Order>('newest');
  const scrollRef = useRef<ScrollView>(null);
  const [query, setQuery] = useState('');
  const [reports, setReports] = useState<AnimalReport[] | null>(null);
  const [shelters, setShelters] = useState<Shelter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([
        apiRequest<AnimalReport[]>('/public/reports?limit=200'),
        apiRequest<Shelter[]>('/public/shelters'),
      ]);
      setReports(r.map(withPhotos));
      setShelters(s.map(withPhotos));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const shownReports = useMemo(
    () =>
      (reports ?? []).filter((r) => {
        if (kind !== 'all' && r.kind !== kind) return false;
        if (!q) return true;
        const hay = [r.animalType, r.breed, r.color, r.size, r.barangay, r.address, r.landmark, r.description, ...(r.aiTags ?? [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return q.split(/\s+/).every((w) => hay.includes(w));
      }),
    [reports, kind, q],
  );
  const counts = useMemo(
    () => ({
      lost: (reports ?? []).filter((r) => r.kind === 'lost').length,
      found: (reports ?? []).filter((r) => r.kind === 'found').length,
    }),
    [reports],
  );
  // Sorted, split into pages, and each page cut into headed groups (by when, or by barangay).
  const sorted = useMemo(
    () =>
      [...shownReports].sort((a, b) =>
      order === 'barangay'
        ? a.barangay.localeCompare(b.barangay) || +new Date(b.reportedAt) - +new Date(a.reportedAt)
        : order === 'oldest'
          ? +new Date(a.reportedAt) - +new Date(b.reportedAt)
          : +new Date(b.reportedAt) - +new Date(a.reportedAt),
      ),
    [shownReports, order],
  );
  const page = usePagination<AnimalReport>(sorted, PAGE, `${kind}|${q}|${order}`);
  const groups = useMemo(() => {
    const out: { title: string; items: AnimalReport[] }[] = [];
    for (const r of page.items) {
      const title = order === 'barangay' ? `Brgy. ${r.barangay}` : whenGroup(r.reportedAt);
      const last = out[out.length - 1];
      if (last && last.title === title) last.items.push(r);
      else out.push({ title, items: [r] });
    }
    return out;
  }, [page.items, order]);
  /** Next / previous page: back to the top of the list. */
  const goToPage = (p: number) => {
    page.setPage(p);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };
  const shownShelters = useMemo(
    () => (shelters ?? []).filter((s) => !q || `${s.name} ${s.address} ${s.barangay}`.toLowerCase().includes(q)),
    [shelters, q],
  );

  const signUp = () => navigation.navigate('UserRegister');

  return (
    <Screen scroll={false} padded={false}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <Text style={styles.heading}>Report now - no account needed</Text>
        <Row gap={1} align="stretch">
          <QuickReport
            icon="alert-circle"
            title="Lost my pet"
            color={theme.colors.danger}
            soft={theme.colors.dangerSoft}
            onPress={() => navigation.navigate('GuestReportLost')}
          />
          <QuickReport
            icon="paw"
            title="Found an animal"
            color={theme.colors.found}
            soft={theme.colors.foundSoft}
            onPress={() => navigation.navigate('GuestReportFound')}
          />
        </Row>

        <MyGuestReports navigation={navigation} />

        <Banner
          title="You're using SaanPaw as a guest"
          message="Create a free account to message shelters, see possible matches for your pet, and get alerts near you."
        />
        <Row gap={1}>
          <View style={{ flex: 1 }}>
            <Button label="Create account" icon="person-add-outline" onPress={signUp} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Sign in" variant="secondary" icon="log-in-outline" onPress={() => navigation.navigate('UserLogin')} />
          </View>
        </Row>

        <Segmented
          options={[
            { label: 'Reports', value: 'reports' },
            { label: 'Shelters', value: 'shelters' },
          ]}
          value={tab}
          onChange={setTab}
        />
        <Field
          label="Search"
          value={query}
          onChangeText={setQuery}
          icon="search"
          placeholder={tab === 'reports' ? 'e.g. brown dog Muzon' : 'Shelter name or barangay'}
        />
        {tab === 'reports' ? (
          <>
            <Segmented
              options={[
                { label: `All (${counts.lost + counts.found})`, value: 'all' },
                { label: `Lost (${counts.lost})`, value: 'lost', color: theme.colors.danger },
                { label: `Found (${counts.found})`, value: 'found', color: theme.colors.found },
              ]}
              value={kind}
              onChange={setKind}
            />
            <Segmented
              options={[
                { label: 'Newest', value: 'newest' },
                { label: 'Oldest', value: 'oldest' },
                { label: 'By barangay', value: 'barangay' },
              ]}
              value={order}
              onChange={setOrder}
            />
          </>
        ) : null}
        <ErrorText error={error} />

        {(tab === 'reports' ? reports : shelters) === null && !error ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginTop: theme.spacing(3) }} />
        ) : tab === 'reports' ? (
          shownReports.length ? (
            <>
              <Caption>
                {shownReports.length} open {kind === 'lost' ? 'lost-pet ' : kind === 'found' ? 'found-animal ' : ''}
                {shownReports.length === 1 ? 'report' : 'reports'} ·{' '}
                {order === 'barangay' ? 'grouped by barangay' : order === 'oldest' ? 'oldest first' : 'newest first'}
              </Caption>
              {groups.map((g) => (
                <View key={g.title} style={{ gap: theme.spacing(1) }}>
                  <Text style={styles.groupTitle}>
                    {g.title} · {g.items.length}
                  </Text>
                  {g.items.map((r) => (
                    <ReportCard key={`${r.kind}-${r.id}`} report={r} onPress={() => navigation.navigate('PublicReport', { kind: r.kind, id: r.id })} />
                  ))}
                </View>
              ))}
              <Pager {...page} setPage={goToPage} />
            </>
          ) : (
            <Card>
              <EmptyState icon="search-outline" title="No reports found" message="Try other words, or clear the search." />
            </Card>
          )
        ) : shownShelters.length ? (
          shownShelters.map((s) => (
            <View key={s.id} style={{ gap: 6 }}>
              <ShelterCard shelter={s} />
              {s.contactNumber ? (
                <Text style={styles.link} onPress={() => void Linking.openURL(`tel:${s.contactNumber}`)}>
                  Call {s.name}: {s.contactNumber}
                </Text>
              ) : null}
            </View>
          ))
        ) : (
          <Card>
            <EmptyState icon="home-outline" title="No shelters found" message="Try another name or barangay." />
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

function QuickReport({
  icon,
  title,
  color,
  soft,
  onPress,
}: {
  icon: 'alert-circle' | 'paw';
  title: string;
  color: string;
  soft: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.quick, { borderColor: color, backgroundColor: soft }, pressed && { opacity: 0.8 }]}
    >
      <Ionicons name={icon} size={30} color={color} />
      <Text style={[styles.quickTitle, { color }]}>{title}</Text>
      <Text style={styles.quickHint}>Report in a minute</Text>
    </Pressable>
  );
}

const STATUS_LABEL: Record<string, string> = { active: 'Open', matched: 'Possible match', recovered: 'Resolved', closed: 'Closed' };

/** Reports this phone made as a guest: open them, mark them resolved, or delete them. */
function MyGuestReports({ navigation }: { navigation: NativeStackScreenProps<any>['navigation'] }) {
  const [saved, setSaved] = useState<SavedGuestReport[]>([]);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await listGuestReports();
    setSaved(list);
    const entries = await Promise.all(
      list.map(async (r) => {
        try {
          const live = await apiRequest<{ status: string }>(`/public/reports/${r.kind}/${r.id}`);
          return [r.id, live.status] as const;
        } catch {
          return [r.id, 'gone'] as const;
        }
      }),
    );
    setStatus(Object.fromEntries(entries));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!saved.length) return null;

  const act = async (r: SavedGuestReport, what: 'resolve' | 'delete') => {
    const ok = await confirmAsync(
      what === 'resolve'
        ? {
            title: 'Mark as resolved?',
            message: r.kind === 'lost' ? 'Your pet is home. The report is closed and alerts stop.' : 'The animal is safe or back with its owner. The report is closed.',
            confirmLabel: 'Mark resolved',
            cancelLabel: 'Cancel',
          }
        : { title: 'Delete this report?', message: 'It is removed from SaanPaw for good.', confirmLabel: 'Delete', cancelLabel: 'Cancel' },
    );
    if (!ok) return;
    setBusy(r.id);
    setError(null);
    try {
      if (what === 'resolve') await setGuestReportStatus(r, 'recovered');
      else await deleteGuestReport(r);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <Text style={styles.subheading}>My guest reports</Text>
      <Caption>Saved on this phone only. Uninstalling the app or clearing its data loses them.</Caption>
      {saved.map((r) => {
        const s = status[r.id];
        const open = s === 'active' || s === 'matched';
        return (
          <View key={r.id} style={styles.mine}>
            <Text style={styles.mineTitle} onPress={() => s !== 'gone' && navigation.navigate('PublicReport', { kind: r.kind, id: r.id })}>
              {r.kind === 'lost' ? 'Lost' : 'Found'}: {r.title}
            </Text>
            <Caption>{s === 'gone' ? 'Removed' : s ? STATUS_LABEL[s] ?? s : 'Checking...'}</Caption>
            <Row gap={1}>
              {open ? (
                <Button label="Mark resolved" variant="secondary" full={false} loading={busy === r.id} onPress={() => void act(r, 'resolve')} />
              ) : null}
              <Button label="Delete" variant="ghost" full={false} disabled={busy === r.id} onPress={() => void act(r, 'delete')} />
            </Row>
          </View>
        );
      })}
      <ErrorText error={error} />
    </Card>
  );
}

export function GuestReportLostScreen({ navigation }: NativeStackScreenProps<any>) {
  return <ReportForm kind="lost" navigation={navigation} guest />;
}
export function GuestReportFoundScreen({ navigation }: NativeStackScreenProps<any>) {
  return <ReportForm kind="found" navigation={navigation} guest />;
}

/** Shown when a guest tries something that needs an account. */
export function GuestNeedAccountScreen({ navigation }: NativeStackScreenProps<any>) {
  return (
    <Screen>
      <Card>
        <EmptyState
          icon="lock-closed-outline"
          title="An account is needed for this"
          message="Reports carry your contact details so owners, finders and shelters can reach you, and SaanPaw checks every report for misuse. It only takes a minute to sign up."
        />
        <View style={{ gap: theme.spacing(1) }}>
          <Button label="Create account" icon="person-add-outline" onPress={() => navigation.navigate('UserRegister')} />
          <Button label="I already have an account" variant="secondary" onPress={() => navigation.navigate('UserLogin')} />
          <Button label="Keep browsing" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing(2), gap: theme.spacing(1.5), paddingBottom: theme.spacing(6), width: '100%', maxWidth: 520, alignSelf: 'center' },
  heading: { ...theme.type.h2, color: theme.colors.text },
  groupTitle: { ...theme.type.h3, color: theme.colors.muted, marginTop: theme.spacing(0.5) },
  subheading: { ...theme.type.h3, color: theme.colors.text },
  quick: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: theme.spacing(2),
    paddingHorizontal: theme.spacing(1),
    borderRadius: theme.radius.xl,
    borderWidth: 1.5,
  },
  quickTitle: { ...theme.type.h3, textAlign: 'center' },
  quickHint: { ...theme.type.caption, color: theme.colors.muted, fontSize: 11 },
  mine: { gap: 4, paddingVertical: theme.spacing(1), borderTopWidth: 1, borderTopColor: theme.colors.border },
  mineTitle: { ...theme.type.body, color: theme.colors.primary, fontWeight: '700' },
  link: { ...theme.type.caption, color: theme.colors.primary, fontWeight: '700', textDecorationLine: 'underline', paddingHorizontal: 4 },
});
