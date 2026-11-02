import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  colors,
  countBy,
  describeAnimal,
  reportKindStyle,
  reportPlace,
  reportStatusMeta,
  reportsPerDay,
  timeAgo,
  useApp,
  type AnimalReport,
} from '@saanpaw/shared';
import { Badge, BarChart, BreakdownBars, Card, CardHead, EmptyState, Thumb } from '@/components/ui';
import { ReportDetailModal } from '@/components/ReportDetailModal';

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

/** Developer Module - Dashboard. System-wide statistics as charts, and everything needing review. */
export function DashboardPage() {
  const { shelters, flags, users, reports, notificationsFor, issuedLogin } = useApp();
  const [selected, setSelected] = useState<AnimalReport | null>(null);

  const pendingShelters = shelters.filter((s) => s.approvalStatus === 'pending');
  const pendingFlags = flags.filter((f) => f.resolution === 'pending');

  const recent = [...reports]
    .sort((a, b) => +new Date(b.reportedAt) - +new Date(a.reportedAt))
    .slice(0, 8);

  const perDay = useMemo(() => reportsPerDay(reports, 7), [reports]);
  const byStatus = useMemo(() => countBy(reports, (r) => r.status), [reports]);

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
    value: byStatus[k] ?? 0,
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
      <div className="chart-grid">
        <Card>
          <CardHead
            title="Reports in the last 7 days"
            sub={`${perDay.reduce((n, d) => n + d.lost + d.found, 0)} lost and found reports across San Jose Del Monte`}
          />
          <div className="card-pad">
            <BarChart
              ariaLabel="Lost and found reports per day for the last 7 days"
              categories={perDay.map((d) => d.label)}
              series={[
                { label: 'Lost', color: reportKindStyle.lost.color, values: perDay.map((d) => d.lost) },
                { label: 'Found', color: reportKindStyle.found.color, values: perDay.map((d) => d.found) },
              ]}
            />
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card>
            <CardHead title="Reports by status" sub={`${reports.length} reports in total`} />
            <div className="card-pad">
              <BreakdownBars rows={statusRows} />
            </div>
          </Card>
          <Card>
            <CardHead title="Accounts & moderation" />
            <div className="card-pad">
              <BreakdownBars rows={accountRows} />
            </div>
          </Card>
        </div>
      </div>

      <div className="split">
        <Card>
          <CardHead
            title="Recent reports"
            sub="Newest submissions across the city"
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
            <EmptyState title="No reports yet">Lost and found reports from the mobile app appear here.</EmptyState>
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
