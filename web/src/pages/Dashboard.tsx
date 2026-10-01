import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  colors,
  describeAnimal,
  reportKindStyle,
  reportStatusMeta,
  timeAgo,
  useApp,
  type AnimalReport,
} from '@saanpaw/shared';
import { Badge, Banner, Card, CardHead, EmptyState, Stat, Thumb } from '@/components/ui';
import { ReportDetailModal } from '@/components/ReportDetailModal';

/** Developer Module - Dashboard. System-wide stats and anything needing review. */
export function DashboardPage() {
  const { stats, shelters, flags, users, reports, notificationsFor } = useApp();
  const [selected, setSelected] = useState<AnimalReport | null>(null);

  const pendingShelters = shelters.filter((s) => s.approvalStatus === 'pending').length;
  const pendingFlags = flags.filter((f) => f.resolution === 'pending').length;
  const bannedUsers = users.filter((u) => u.isBanned).length;
  const alerts = notificationsFor('developer');

  const recent = [...reports]
    .sort((a, b) => +new Date(b.reportedAt) - +new Date(a.reportedAt))
    .slice(0, 8);

  return (
    <>
      {pendingShelters || pendingFlags ? (
        <Banner tone="warning" title="Items awaiting your review">
          {pendingShelters} shelter {pendingShelters === 1 ? 'application' : 'applications'} pending
          permit verification, and {pendingFlags} AI-flagged{' '}
          {pendingFlags === 1 ? 'report' : 'reports'} to moderate.
        </Banner>
      ) : (
        <Banner tone="success" title="Nothing awaiting review">
          All shelter applications are processed and no reports are currently flagged.
        </Banner>
      )}

      <div className="stat-grid">
        <Stat value={stats.lostToday} label="Lost reported (24h)" icon="!" color={colors.danger} soft={colors.dangerSoft} />
        <Stat value={stats.foundToday} label="Found reported (24h)" icon="🐾" color={colors.accent} soft={colors.accentSoft} />
        <Stat value={reports.length} label="Total reports" icon="▤" color={colors.info} soft={colors.infoSoft} />
        <Stat value={stats.reunitedThisMonth} label="Reunited" icon="♥" />
        <Stat value={stats.sheltersOnline} label="Approved shelters" icon="⌂" />
        <Stat value={users.length} label="Registered users" icon="👥" color={colors.info} soft={colors.infoSoft} />
        <Stat value={pendingFlags} label="Flagged reports" icon="⚑" color={colors.danger} soft={colors.dangerSoft} />
        <Stat value={bannedUsers} label="Banned accounts" icon="⊘" color={colors.danger} soft={colors.dangerSoft} />
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
          <table>
            <thead>
              <tr>
                <th style={{ width: 62 }}>Photo</th>
                <th>Animal</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Barangay</th>
                <th>Reported by</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => {
                const kind = reportKindStyle[r.kind];
                const status = reportStatusMeta[r.status];
                return (
                  <tr key={r.id} onClick={() => setSelected(r)} style={{ cursor: 'pointer' }}>
                    <td>
                      <Thumb src={r.imageUrls[0]} alt={describeAnimal(r)} />
                    </td>
                    <td>
                      <div className="cell-title">{describeAnimal(r)}</div>
                      <div className="cell-sub">
                        {[r.breed, r.size].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td>
                      <Badge label={kind.label} color={kind.color} soft={kind.soft} />
                    </td>
                    <td>
                      <Badge label={status.label} color={status.color} soft={status.soft} />
                    </td>
                    <td>{r.barangay}</td>
                    <td>{r.reporterName}</td>
                    <td style={{ color: 'var(--muted)' }}>{timeAgo(r.reportedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHead title="System alerts" sub="Events needing developer attention" />
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {alerts.length ? (
              alerts.map((n) => (
                <div key={n.id} style={{ display: 'flex', gap: 10 }}>
                  <span aria-hidden style={{ color: colors.muted }}>
                    ●
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{n.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-soft)', lineHeight: 1.5 }}>
                      {n.body}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                      {timeAgo(n.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No alerts">Nothing needs your attention right now.</EmptyState>
            )}
          </div>
        </Card>
      </div>

      {selected ? <ReportDetailModal report={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}
