import { useEffect, useMemo, useState } from 'react';
import { colors, reportKindStyle } from '@saanpaw/shared';
import { Banner, BreakdownBars, Card, CardHead, TrendChart } from '@/components/ui';
import { useApi } from '@/lib/useApi';

interface AnalyticsResult {
  from: string;
  to: string;
  interval: 'day' | 'week' | 'month';
  totals: { users: number; bannedUsers: number; shelters: number; approvedShelters: number };
  inRange: { newUsers: number; newShelters: number; lost: number; found: number; recovered: number };
  series: { label: string; newUsers: number; totalUsers: number; newShelters: number; lost: number; found: number; recovered: number }[];
  byAnimalType: { name: string; count: number }[];
  topBarangays: { name: string; count: number }[];
}

/** Today in Manila as YYYY-MM-DD, and n days before it. */
const manilaToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() + 8 * 3600_000 - n * 86_400_000).toISOString().slice(0, 10);

const PRESETS = [
  { label: '7 days', days: 6 },
  { label: '30 days', days: 29 },
  { label: '90 days', days: 89 },
  { label: '1 year', days: 364 },
];

/**
 * Analytics with a date range the admin chooses: how many users there are and how that grew, and
 * lost / found / recovered reports over the same period, by day, week or month.
 */
export function AnalyticsPage() {
  const api = useApi();
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(manilaToday());
  const [interval, setInterval] = useState<'auto' | 'day' | 'week' | 'month'>('auto');
  const [data, setData] = useState<AnalyticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to, ...(interval !== 'auto' ? { interval } : {}) });
    api<AnalyticsResult>(`/developer/analytics?${params}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [api, from, to, interval]);

  const labels = useMemo(() => data?.series.map((s) => s.label) ?? [], [data]);
  const activePreset = PRESETS.find((p) => from === daysAgo(p.days) && to === manilaToday())?.label;

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
      </Card>

      {error ? (
        <Banner tone="danger" title="Could not load analytics">
          {error}
        </Banner>
      ) : null}

      {data ? (
        <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity .15s', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="stat-grid">
            <Stat value={data.totals.users} label="Registered users (all time)" tone={colors.info} />
            <Stat value={data.inRange.newUsers} label="New users in this range" tone={colors.info} />
            <Stat value={data.totals.approvedShelters} label={`Approved shelters (${data.totals.shelters} registered)`} tone={colors.primary} />
            <Stat value={data.inRange.lost} label="Lost reports in this range" tone={reportKindStyle.lost.color} />
            <Stat value={data.inRange.found} label="Found reports in this range" tone={reportKindStyle.found.color} />
            <Stat value={data.inRange.recovered} label="Animals recovered or reunited" tone={colors.primaryDark} />
          </div>

          <Card>
            <CardHead title="Number of users" sub={`New sign-ups per ${data.interval} and the running total of registered users`} />
            <div className="card-pad">
              <TrendChart
                ariaLabel="New users per period and total users"
                labels={labels}
                series={[
                  { label: 'New users', color: colors.info, values: data.series.map((s) => s.newUsers) },
                  { label: 'Total users', color: colors.primary, kind: 'line', values: data.series.map((s) => s.totalUsers) },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHead title="Reports and recoveries" sub={`Lost and found reports filed, and animals recovered, per ${data.interval}`} />
            <div className="card-pad">
              <TrendChart
                ariaLabel="Lost, found and recovered per period"
                labels={labels}
                series={[
                  { label: 'Lost', color: reportKindStyle.lost.color, values: data.series.map((s) => s.lost) },
                  { label: 'Found', color: reportKindStyle.found.color, values: data.series.map((s) => s.found) },
                  { label: 'Recovered', color: colors.primaryDark, values: data.series.map((s) => s.recovered) },
                ]}
              />
            </div>
          </Card>

          <div className="chart-grid">
            <Card>
              <CardHead title="Reports by animal" sub="Lost and found reports in this range" />
              <div className="card-pad">
                {data.byAnimalType.length ? (
                  <BreakdownBars rows={data.byAnimalType.map((r) => ({ label: capitalize(r.name), value: r.count, color: colors.primary }))} />
                ) : (
                  <p className="muted">No reports in this range.</p>
                )}
              </div>
            </Card>
            <Card>
              <CardHead title="Busiest barangays" sub="Where reports in this range came from" />
              <div className="card-pad">
                {data.topBarangays.length ? (
                  <BreakdownBars rows={data.topBarangays.map((r) => ({ label: r.name, value: r.count, color: colors.accent }))} />
                ) : (
                  <p className="muted">No reports in this range.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : loading ? (
        <Card>
          <div className="card-pad muted">Loading analytics…</div>
        </Card>
      ) : null}
    </>
  );
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

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
