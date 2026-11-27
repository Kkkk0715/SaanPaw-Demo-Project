import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  SJDM_BARANGAY_NAMES,
  colors,
  describeAnimal,
  reportKindStyle,
  reportPlace,
  reportStatusMeta,
  timeAgo,
  useApp,
  type AnimalReport,
} from '@saanpaw/shared';
import { Badge, Banner, BreakdownBars, Card, CardHead, EmptyState, Thumb, TrendChart } from '@/components/ui';
import { ReportDetailModal } from '@/components/ReportDetailModal';
import { useApi } from '@/lib/useApi';

interface AnalyticsResult {
  from: string;
  to: string;
  interval: 'day' | 'week' | 'month';
  totals: { users: number; bannedUsers: number; shelters: number; approvedShelters: number; reports?: number };
  inRange: { newUsers: number; newShelters: number; lost: number; found: number; recovered: number };
  series: { label: string; newUsers: number; totalUsers: number; newShelters: number; lost: number; found: number; recovered: number }[];
  byAnimalType: { name: string; count: number }[];
  byStatus?: { name: string; count: number }[];
  topBarangays: { name: string; count: number }[];
}

type Kind = '' | 'lost' | 'found';
type Status = '' | keyof typeof reportStatusMeta;

/** Today in Manila as YYYY-MM-DD, and n days before it. */
const manilaToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() + 8 * 3600_000 - n * 86_400_000).toISOString().slice(0, 10);
const PRESETS = [
  { label: '7 days', days: 6 },
  { label: '30 days', days: 29 },
  { label: '90 days', days: 89 },
  { label: '1 year', days: 364 },
];
const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

interface SystemAlert {
  id: string;
  title: string;
  body: string;
  when?: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
  /** Already dealt with: kept for context, shown faded. */
  done?: boolean;
  to?: string;
}

const TONE_COLOR = {
  danger: colors.danger,
  warning: colors.accent,
  info: colors.info,
  success: colors.primary,
} as const;

/**
 * Developer Module - Dashboard & Analytics in one page: the filters at the top (date range,
 * report type, animal, status, barangay) drive every chart and number below them, then the
 * newest matching reports and everything needing review.
 */
export function DashboardPage() {
  const { shelters, flags, users, reports, notificationsFor, issuedLogin } = useApp();
  const [selected, setSelected] = useState<AnimalReport | null>(null);
  const api = useApi();

  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(manilaToday());
  const [interval, setInterval] = useState<'auto' | 'day' | 'week' | 'month'>('auto');
  const [kind, setKind] = useState<Kind>('');
  const [animalType, setAnimalType] = useState('');
  const [status, setStatus] = useState<Status>('');
  const [barangay, setBarangay] = useState('');
  const [data, setData] = useState<AnalyticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to });
    if (interval !== 'auto') params.set('interval', interval);
    if (kind) params.set('kind', kind);
    if (animalType) params.set('animalType', animalType);
    if (status) params.set('status', status);
    if (barangay) params.set('barangay', barangay);
    api<AnalyticsResult>(`/developer/analytics?${params}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [api, from, to, interval, kind, animalType, status, barangay]);

  const filtersOn = Boolean(kind || animalType || status || barangay);
  const clearFilters = () => {
    setKind('');
    setAnimalType('');
    setStatus('');
    setBarangay('');
  };
  const activePreset = PRESETS.find((p) => from === daysAgo(p.days) && to === manilaToday())?.label;
  const labels = useMemo(() => data?.series.map((x) => x.label) ?? [], [data]);

  const pendingShelters = shelters.filter((s) => s.approvalStatus === 'pending');
  const pendingFlags = flags.filter((f) => f.resolution === 'pending');

  // The newest reports that match the same filters and dates.
  const recent = useMemo(() => {
    const start = new Date(`${from}T00:00:00+08:00`).getTime();
    const end = new Date(`${to}T23:59:59.999+08:00`).getTime();
    return reports
      .filter((r) => {
        const at = +new Date(r.reportedAt);
        return (
          at >= start &&
          at <= end &&
          (!kind || r.kind === kind) &&
          (!animalType || r.animalType === animalType) &&
          (!status || r.status === status) &&
          (!barangay || r.barangay === barangay)
        );
      })
      .sort((a, b) => +new Date(b.reportedAt) - +new Date(a.reportedAt))
      .slice(0, 8);
  }, [reports, from, to, kind, animalType, status, barangay]);

  /**
   * Review items first (the old banner at the top of the page), then anything the system logged.
   * A shelter-approval alert fades once there is nothing left to approve, because the shelter's
   * credentials have already been emailed to it.
   */
  const alerts = useMemo<SystemAlert[]>(() => {
    const list: SystemAlert[] = [];
    for (const s of pendingShelters) {
      list.push({
        id: `shelter-${s.id}`,
        tone: 'warning',
        title: `Shelter application: ${s.name}`,
        body: `Brgy. ${s.barangay} - check its proof documents with the city veterinary office before approving.`,
        when: s.registeredAt,
        to: '/shelters',
      });
    }
    if (pendingFlags.length) {
      list.push({
        id: 'flags',
        tone: 'danger',
        title: `${pendingFlags.length} AI-flagged ${pendingFlags.length === 1 ? 'report' : 'reports'} to review`,
        body: 'Dismiss the legitimate ones and remove the false ones. Three upheld flags delete an account.',
        when: pendingFlags[0]?.flaggedAt,
        to: '/reports',
      });
    }
    if (issuedLogin) {
      const name = shelters.find((s) => s.id === issuedLogin.shelterId)?.name ?? 'A shelter';
      list.push({
        id: 'issued',
        tone: 'success',
        title: `${name} approved`,
        body: issuedLogin.emailSent
          ? `Sign-in credentials were emailed to ${issuedLogin.email}.`
          : `The credentials could not be emailed - copy them from Shelter Approvals.`,
        done: issuedLogin.emailSent,
      });
    }
    for (const n of notificationsFor('developer')) {
      const aboutApprovals = /shelter (registration|application)/i.test(n.title);
      list.push({
        id: n.id,
        tone: aboutApprovals ? 'warning' : 'info',
        title: n.title,
        body: n.body,
        when: n.createdAt,
        done: aboutApprovals && pendingShelters.length === 0,
      });
    }
    if (!list.some((a) => !a.done)) {
      list.unshift({
        id: 'clear',
        tone: 'success',
        title: 'Nothing awaiting review',
        body: 'All shelter applications are processed and no reports are currently flagged.',
      });
    }
    return list;
  }, [pendingShelters, pendingFlags, issuedLogin, shelters, notificationsFor]);

  const statusRows = (Object.keys(reportStatusMeta) as (keyof typeof reportStatusMeta)[]).map((k) => ({
    label: reportStatusMeta[k].label,
    value: data?.byStatus?.find((x) => x.name === k)?.count ?? 0,
    color: reportStatusMeta[k].color,
  }));

  const accountRows = [
    { label: 'Registered users', value: users.length, color: colors.info },
    { label: 'Approved shelters', value: shelters.filter((s) => s.approvalStatus === 'approved').length, color: colors.primary },
    { label: 'Pending shelters', value: pendingShelters.length, color: colors.accent },
    { label: 'Open flags', value: pendingFlags.length, color: colors.danger },
    { label: 'Banned accounts', value: users.filter((u) => u.isBanned).length, color: colors.muted },
  ];

  return (
    <>
      <Card>
        <div className="card-pad toolbar">
          <div className="row row-wrap" style={{ gap: 6 }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className={`chip ${activePreset === p.label ? 'active' : ''}`.trim()}
                onClick={() => {
                  setFrom(daysAgo(p.days));
                  setTo(manilaToday());
                }}
              >
                Last {p.label}
              </button>
            ))}
          </div>
          <div className="row row-wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
            <label className="mini-field">
              From
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="mini-field">
              To
              <input type="date" value={to} min={from} max={manilaToday()} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="mini-field">
              Group by
              <select value={interval} onChange={(e) => setInterval(e.target.value as typeof interval)}>
                <option value="auto">Automatic</option>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </label>
          </div>
        </div>
        <div className="card-pad filter-bar" style={{ borderTop: '1px solid var(--border)' }}>
          <label className="mini-field">
            Report type
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              <option value="">Lost and found</option>
              <option value="lost">Lost only</option>
              <option value="found">Found only</option>
            </select>
          </label>
          <label className="mini-field">
            Animal
            <select value={animalType} onChange={(e) => setAnimalType(e.target.value)}>
              <option value="">All animals</option>
              <option value="dog">Dogs</option>
              <option value="cat">Cats</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="mini-field">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="">Any status</option>
              {(Object.keys(reportStatusMeta) as (keyof typeof reportStatusMeta)[]).map((k) => (
                <option key={k} value={k}>
                  {reportStatusMeta[k].label}
                </option>
              ))}
            </select>
          </label>
          <label className="mini-field">
            Barangay
            <select value={barangay} onChange={(e) => setBarangay(e.target.value)}>
              <option value="">All of San Jose Del Monte</option>
              {SJDM_BARANGAY_NAMES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          {filtersOn ? (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
      </Card>

      {error ? (
        <Banner tone="danger" title="Could not load the statistics">
          {error}
        </Banner>
      ) : null}

      {data ? (
        <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity .15s', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="stat-grid">
            <Stat value={data.inRange.lost + data.inRange.found} label={filtersOn ? 'Matching reports in this range' : 'Reports in this range'} tone={colors.text} />
            <Stat value={data.inRange.lost} label="Lost" tone={reportKindStyle.lost.color} />
            <Stat value={data.inRange.found} label="Found" tone={reportKindStyle.found.color} />
            <Stat value={data.inRange.recovered} label="Marked recovered" tone={colors.primaryDark} />
            <Stat value={data.inRange.newUsers} label={`New users (${data.totals.users.toLocaleString()} in total)`} tone={colors.info} />
            <Stat value={data.totals.approvedShelters} label={`Approved shelters (${data.totals.shelters} registered)`} tone={colors.primary} />
          </div>

          <Card>
            <CardHead
              title="Reports and recoveries"
              sub={`Lost and found reports filed, and reports marked recovered, per ${data.interval}${filtersOn ? ' - filtered' : ''}`}
            />
            <div className="card-pad">
              <TrendChart
                ariaLabel="Lost, found and recovered reports per period"
                labels={labels}
                series={[
                  ...(kind !== 'found' ? [{ label: 'Lost', color: reportKindStyle.lost.color, values: data.series.map((x) => x.lost) }] : []),
                  ...(kind !== 'lost' ? [{ label: 'Found', color: reportKindStyle.found.color, values: data.series.map((x) => x.found) }] : []),
                  { label: 'Recovered', color: colors.accent, kind: 'line' as const, values: data.series.map((x) => x.recovered) },
                ]}
              />
            </div>
          </Card>

          <div className="chart-grid">
            <Card>
              <CardHead title="Number of users" sub={`New sign-ups per ${data.interval} and the running total`} />
              <div className="card-pad">
                <TrendChart
                  ariaLabel="New users per period and total users"
                  labels={labels}
                  series={[
                    { label: 'New users', color: colors.info, values: data.series.map((x) => x.newUsers) },
                    { label: 'Total users', color: colors.primary, kind: 'line', values: data.series.map((x) => x.totalUsers) },
                  ]}
                />
              </div>
            </Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Card>
                <CardHead title="Reports by status" sub="Reports filed in this range" />
                <div className="card-pad">
                  <BreakdownBars rows={statusRows} />
                </div>
              </Card>
              <Card>
                <CardHead title="Accounts & moderation" sub="Right now" />
                <div className="card-pad">
                  <BreakdownBars rows={accountRows} />
                </div>
              </Card>
            </div>
          </div>

          <div className="chart-grid">
            <Card>
              <CardHead title="Reports by animal" sub="Matching reports in this range" />
              <div className="card-pad">
                {data.byAnimalType.length ? (
                  <BreakdownBars rows={data.byAnimalType.map((r) => ({ label: capitalize(r.name), value: r.count, color: colors.primary }))} />
                ) : (
                  <p className="muted">No reports match.</p>
                )}
              </div>
            </Card>
            <Card>
              <CardHead title="Busiest barangays" sub="Where the matching reports came from" />
              <div className="card-pad">
                {data.topBarangays.length ? (
                  <BreakdownBars rows={data.topBarangays.map((r) => ({ label: r.name, value: r.count, color: colors.accent }))} />
                ) : (
                  <p className="muted">No reports match.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : loading ? (
        <Card>
          <div className="card-pad muted">Loading statistics…</div>
        </Card>
      ) : null}

      <div className="split">
        <Card>
          <CardHead
            title="Recent reports"
            sub={filtersOn ? 'Newest reports matching the filters and dates' : 'Newest submissions in the date range'}
            actions={
              <Link className="btn btn-secondary btn-sm" to="/reports">
                Open report monitoring
              </Link>
            }
          />
          {recent.length ? (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 62 }}>Photo</th>
                  <th>Animal</th>
                  <th>Report Status</th>
                  <th>Location</th>
                  <th>Reported by</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => {
                  const status = reportStatusMeta[r.status];
                  return (
                    <tr key={r.id} onClick={() => setSelected(r)} style={{ cursor: 'pointer' }}>
                      <td>
                        <Thumb src={r.imageUrls[0]} alt={describeAnimal(r)} />
                      </td>
                      <td>
                        <div className="cell-title">{describeAnimal(r)}</div>
                        <div className="cell-sub">
                          {[reportKindStyle[r.kind].label, r.breed, r.size].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td>
                        <Badge label={status.label} color={status.color} soft={status.soft} />
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        <div className="cell-sub" style={{ color: 'var(--text)' }}>
                          {reportPlace(r)}
                        </div>
                      </td>
                      <td>{r.reporterName}</td>
                      <td style={{ color: 'var(--muted)' }}>{timeAgo(r.reportedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No matching reports">Change the dates or filters above to see more.</EmptyState>
          )}
        </Card>

        <Card>
          <CardHead title="System alerts" sub="Items awaiting review and events needing attention" />
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {alerts.map((a) => {
              const content = (
                <>
                  <span className="alert-dot" style={{ background: TONE_COLOR[a.tone] }} aria-hidden />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {a.title}
                      {a.done ? <span style={{ fontWeight: 500, color: 'var(--muted)' }}> · done</span> : null}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-soft)', lineHeight: 1.5 }}>{a.body}</div>
                    {a.when ? (
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{timeAgo(a.when)}</div>
                    ) : null}
                  </div>
                </>
              );
              return a.to ? (
                <Link key={a.id} to={a.to} className={`alert-item ${a.done ? 'is-done' : ''}`.trim()}>
                  {content}
                </Link>
              ) : (
                <div key={a.id} className={`alert-item ${a.done ? 'is-done' : ''}`.trim()}>
                  {content}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {selected ? <ReportDetailModal report={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="stat">
      <div className="value" style={{ color: tone }}>
        {value.toLocaleString()}
      </div>
      <div className="label">{label}</div>
    </div>
  );
}
