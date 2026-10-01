import { useState } from 'react';
import {
  colors,
  describeAnimal,
  flagReasonLabel,
  humanizeStatus,
  reportKindStyle,
  timeAgo,
  useApp,
  type AnimalReport,
  type ModerationFlag,
} from '@saanpaw/shared';
import { Badge, Banner, Button, Card, CardHead, EmptyState, Meter, Tabs, Thumb } from '@/components/ui';
import { ReportDetailModal } from '@/components/ReportDetailModal';

/** Upheld flags needed before an account is banned. */
const BAN_THRESHOLD = 3;

/**
 * Developer Module - Review reports the AI flagged as false or inappropriate,
 * remove bad entries, and ban accounts that keep posting them.
 */
export function ReportMonitoringPage() {
  const { flags, reports, users, reportById, resolveFlag, banUser, deleteUserAccount } = useApp();
  const [tab, setTab] = useState<'flagged' | 'all' | 'accounts'>('flagged');
  const [acting, setActing] = useState<ModerationFlag | null>(null);
  const [selectedReport, setSelectedReport] = useState<AnimalReport | null>(null);
  const [confirmingUserId, setConfirmingUserId] = useState<string | null>(null);

  const pending = flags.filter((f) => f.resolution === 'pending');
  const resolved = flags.filter((f) => f.resolution !== 'pending');
  const accountRows = [...users].sort((a, b) => b.flaggedReportCount - a.flaggedReportCount);

  const act = (resolution: ModerationFlag['resolution']) => {
    if (!acting) return;
    resolveFlag(acting.id, resolution);
    setActing(null);
  };

  const removeUser = (id: string) => {
    deleteUserAccount(id);
    setConfirmingUserId(null);
  };

  return (
    <>
      <Banner tone={pending.length ? 'danger' : 'success'} title={pending.length ? `${pending.length} flagged ${pending.length === 1 ? 'report' : 'reports'}` : 'No open flags'}>
        The AI moderation pass scores every submission for false content, inappropriate images, and
        duplicates. Anything above the review threshold appears here for a human decision.
      </Banner>

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { label: `Flagged (${pending.length})`, value: 'flagged' },
          { label: `All reports (${reports.length})`, value: 'all' },
          { label: `Accounts (${accountRows.length})`, value: 'accounts' },
        ]}
      />

      {tab === 'flagged' ? (
        <>
          <Card>
            <CardHead title={`Awaiting review (${pending.length})`} />
            {pending.length ? (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 62 }}>Photo</th>
                    <th>Report</th>
                    <th>Reason</th>
                    <th style={{ width: 170 }}>AI confidence</th>
                    <th>Reporter</th>
                    <th>Flagged</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pending.map((f) => {
                    const report = reportById(f.reportId);
                    return (
                      <tr key={f.id}>
                        <td>
                          <Thumb src={report?.imageUrls[0]} alt="Flagged report" />
                        </td>
                        <td style={{ maxWidth: 320 }}>
                          <div className="cell-title">
                            {report ? describeAnimal(report) : 'Removed report'}
                          </div>
                          {report?.description ? (
                            <div className="cell-sub" style={{ fontStyle: 'italic' }}>
                              “{report.description.slice(0, 90)}
                              {report.description.length > 90 ? '…' : ''}”
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <Badge
                            label={flagReasonLabel[f.reason]}
                            color={colors.danger}
                            soft={colors.dangerSoft}
                          />
                          <div className="cell-sub" style={{ maxWidth: 280 }}>
                            {f.detail}
                          </div>
                        </td>
                        <td>
                          <Meter score={f.confidence} tone="risk" />
                        </td>
                        <td>{f.reporterName}</td>
                        <td style={{ color: 'var(--muted)' }}>{timeAgo(f.flaggedAt)}</td>
                        <td>
                          <Button variant="danger" small onClick={() => setActing(f)}>
                            Take action
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <EmptyState title="Nothing to review">
                The AI moderation pass has not flagged any open reports.
              </EmptyState>
            )}
          </Card>

          {acting ? (
            <Card>
              <CardHead
                title="Moderate report"
                sub={`${flagReasonLabel[acting.reason]} · ${Math.round(acting.confidence * 100)}% AI confidence`}
                actions={
                  <Button variant="ghost" small onClick={() => setActing(null)}>
                    Cancel
                  </Button>
                }
              />
              <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ color: 'var(--text-soft)' }}>
                  Dismissing keeps the report live. Removing deletes it. Banning removes the account
                  and every report it has submitted.
                </p>
                <div className="row row-wrap">
                  <Button variant="secondary" onClick={() => act('dismissed')}>
                    Dismiss — report is legitimate
                  </Button>
                  <Button variant="danger" onClick={() => act('removed')}>
                    Remove this report
                  </Button>
                  <Button variant="danger" onClick={() => act('account_banned')}>
                    Remove and ban the account
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          {resolved.length ? (
            <Card>
              <CardHead title={`Resolved (${resolved.length})`} />
              <table>
                <thead>
                  <tr>
                    <th>Reason</th>
                    <th>Outcome</th>
                    <th>Reporter</th>
                    <th>Detail</th>
                    <th>Flagged</th>
                  </tr>
                </thead>
                <tbody>
                  {resolved.map((f) => (
                    <tr key={f.id}>
                      <td>{flagReasonLabel[f.reason]}</td>
                      <td>
                        <Badge
                          label={humanizeStatus(f.resolution)}
                          color={f.resolution === 'dismissed' ? colors.primary : colors.danger}
                          soft={f.resolution === 'dismissed' ? colors.primarySoft : colors.dangerSoft}
                        />
                      </td>
                      <td>{f.reporterName}</td>
                      <td style={{ color: 'var(--muted)', maxWidth: 420 }}>{f.detail}</td>
                      <td style={{ color: 'var(--muted)' }}>{timeAgo(f.flaggedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'all' ? (
        <Card>
          <CardHead title={`All submissions (${reports.length})`} sub="Every lost and found report in the system, newest first" />
          <table>
            <thead>
              <tr>
                <th style={{ width: 62 }}>Photo</th>
                <th>Reference</th>
                <th>Animal</th>
                <th>Kind</th>
                <th>Barangay</th>
                <th>Reporter</th>
                <th>Reported</th>
                <th>Flag</th>
              </tr>
            </thead>
            <tbody>
              {[...reports]
                .sort((a, b) => +new Date(b.reportedAt) - +new Date(a.reportedAt))
                .map((r) => {
                  const kind = reportKindStyle[r.kind];
                  return (
                    <tr key={r.id} onClick={() => setSelectedReport(r)} style={{ cursor: 'pointer' }}>
                      <td>
                        <Thumb src={r.imageUrls[0]} alt={describeAnimal(r)} />
                      </td>
                      <td style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}>
                        {r.id.toUpperCase()}
                      </td>
                      <td className="cell-title">{describeAnimal(r)}</td>
                      <td>
                        <Badge label={kind.label} color={kind.color} soft={kind.soft} />
                      </td>
                      <td>{r.barangay}</td>
                      <td>{r.reporterName}</td>
                      <td style={{ color: 'var(--muted)' }}>{timeAgo(r.reportedAt)}</td>
                      <td>
                        {r.moderationFlagId ? (
                          <Badge label="AI flagged" color={colors.danger} soft={colors.dangerSoft} />
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </Card>
      ) : null}

      {tab === 'accounts' ? (
        <Card>
          <CardHead
            title="Accounts"
            sub={`Every registered user, sorted by upheld flags. Accounts are banned at ${BAN_THRESHOLD} or more`}
          />
          {accountRows.length ? (
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Barangay</th>
                  <th>Upheld flags</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th />
                  <th />
                </tr>
              </thead>
              <tbody>
                {accountRows.map((u) => {
                  const atThreshold = u.flaggedReportCount >= BAN_THRESHOLD;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="cell-title">{u.fullName}</div>
                        <div className="cell-sub">{u.email}</div>
                      </td>
                      <td>{u.barangay}</td>
                      <td>
                        <Badge
                          label={String(u.flaggedReportCount)}
                          color={atThreshold ? colors.danger : colors.accent}
                          soft={atThreshold ? colors.dangerSoft : colors.accentSoft}
                        />
                      </td>
                      <td style={{ color: 'var(--muted)' }}>
                        {new Date(u.joinedAt).toLocaleDateString()}
                      </td>
                      <td>
                        {u.isBanned ? (
                          <Badge label="Banned" color={colors.danger} soft={colors.dangerSoft} />
                        ) : (
                          <Badge label="Active" color={colors.primary} soft={colors.primarySoft} />
                        )}
                      </td>
                      <td>
                        {u.isBanned ? (
                          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                            Reports removed
                          </span>
                        ) : (
                          <Button
                            variant={atThreshold ? 'danger' : 'secondary'}
                            small
                            onClick={() => banUser(u.id)}
                          >
                            {atThreshold ? 'Ban (threshold reached)' : 'Ban account'}
                          </Button>
                        )}
                      </td>
                      <td>
                        {confirmingUserId === u.id ? (
                          <div className="row" style={{ flexWrap: 'nowrap' }}>
                            <Button variant="secondary" small onClick={() => setConfirmingUserId(null)}>
                              Cancel
                            </Button>
                            <Button variant="danger" small onClick={() => removeUser(u.id)}>
                              Confirm delete
                            </Button>
                          </div>
                        ) : (
                          <Button variant="danger" small onClick={() => setConfirmingUserId(u.id)}>
                            Delete account
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No registered accounts">
              No user has registered yet.
            </EmptyState>
          )}
        </Card>
      ) : null}

      {selectedReport ? (
        <ReportDetailModal report={selectedReport} onClose={() => setSelectedReport(null)} />
      ) : null}
    </>
  );
}
