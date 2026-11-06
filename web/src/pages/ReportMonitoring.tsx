import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  colors,
  describeAnimal,
  flagReasonLabel,
  humanizeStatus,
  reportKindStyle,
  reportPlace,
  reportStatusMeta,
  timeAgo,
  useApp,
  type AnimalReport,
  type ModerationFlag,
  type ShelterAnimal,
} from '@saanpaw/shared';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardHead,
  EmptyState,
  Meter,
  Pagination,
  Tabs,
  Thumb,
  useConfirm,
  usePagination,
} from '@/components/ui';
import { ReportDetailModal } from '@/components/ReportDetailModal';
import { FlagDetailModal } from '@/components/FlagDetailModal';

/** Upheld flags at which the server deletes the account and emails the person why. */
const BAN_THRESHOLD = 3;

/**
 * Developer Module - Review reports the AI flagged as false or inappropriate,
 * remove bad entries, and ban accounts that keep posting them.
 */
export function ReportMonitoringPage() {
  const { flags, reports, shelterAnimals, users, reportById, resolveFlag, banUser, deleteUserAccount } = useApp();
  const [tab, setTab] = useState<'flagged' | 'all' | 'accounts'>('flagged');
  const [acting, setActing] = useState<ModerationFlag | null>(null);
  const [selectedReport, setSelectedReport] = useState<AnimalReport | null>(null);
  const [viewingFlag, setViewingFlag] = useState<ModerationFlag | null>(null);
  const moderateRef = useRef<HTMLDivElement>(null);

  // "Take action" from the detail popup: bring the moderation card (below the table) into view.
  useEffect(() => {
    if (acting) moderateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [acting]);

  /** Rows open the flag detail on click, or on Enter / Space for keyboard users. */
  const openRow = (f: ModerationFlag) => ({
    onClick: () => setViewingFlag(f),
    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setViewingFlag(f);
      }
    },
    tabIndex: 0,
    className: 'clickable-row',
    title: 'View report details',
  });
  const { ask, dialog } = useConfirm();

  const pending = flags.filter((f) => f.resolution === 'pending');
  const resolved = flags.filter((f) => f.resolution !== 'pending');
  const accountRows = [...users].sort((a, b) => b.flaggedReportCount - a.flaggedReportCount);
  const allReports = [...reports].sort((a, b) => +new Date(b.reportedAt) - +new Date(a.reportedAt));

  const pendingPage = usePagination(pending, 10, tab);
  const resolvedPage = usePagination(resolved, 10, tab);
  const reportsPage = usePagination(allReports, 10, tab);
  const accountsPage = usePagination(accountRows, 10, tab);

  /** A flag's target: a citizen's lost/found report, or a shelter's own animal posting. */
  const flaggedItem = (f: ModerationFlag): AnimalReport | ShelterAnimal | undefined =>
    f.reportType === 'shelter_animal' ? shelterAnimals.find((a) => a.id === f.reportId) : reportById(f.reportId);

  const act = (resolution: ModerationFlag['resolution']) => {
    const target = acting;
    if (!target) return;
    const reporter = users.find((u) => u.id === target.reporterId);
    const upheldAfter = (reporter?.flaggedReportCount ?? 0) + 1;
    const run = () => {
      resolveFlag(target.id, resolution);
      setActing(null);
    };
    if (resolution === 'dismissed') {
      ask(<>Are you sure you want to dismiss this flag? The {target.reportType === 'shelter_animal' ? 'posting' : 'report'} stays live.</>, run, {
        title: 'Dismiss this flag?',
        tone: 'primary',
      });
      return;
    }
    const warning =
      target.reportType !== 'shelter_animal' && upheldAfter >= BAN_THRESHOLD ? (
        <>
          {' '}
          This will be upheld flag {upheldAfter} for <strong>{target.reporterName}</strong>, so their account will be
          deleted and they will be emailed the reason.
        </>
      ) : null;
    ask(
      resolution === 'account_banned' ? (
        <>Are you sure you want to remove this report and ban <strong>{target.reporterName}</strong>?{warning}</>
      ) : (
        <>Are you sure you want to remove this {target.reportType === 'shelter_animal' ? 'posting' : 'report'}?{warning}</>
      ),
      run,
      { title: 'Are you sure you want to delete this?' },
    );
  };

  const confirmBan = (id: string, name: string) =>
    ask(<>Are you sure you want to ban <strong>{name}</strong>? Their reports will be hidden and they can no longer sign in.</>, () => banUser(id), {
      title: 'Ban this account?',
    });

  const confirmDeleteUser = (id: string, name: string) =>
    ask(
      <>
        Are you sure you want to delete <strong>{name}</strong>&apos;s account? Their reports, messages and notifications are
        deleted too. This cannot be undone.
      </>,
      () => deleteUserAccount(id),
      { title: 'Are you sure you want to delete this?', confirmLabel: 'Yes, delete' },
    );

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
                  {pendingPage.items.map((f) => {
                    const item = flaggedItem(f);
                    const isShelterFlag = f.reportType === 'shelter_animal';
                    const note = item ? (item as AnimalReport).description ?? (item as ShelterAnimal).notes : undefined;
                    return (
                      <tr key={f.id} {...openRow(f)}>
                        <td>
                          <Thumb src={item?.imageUrls[0]} alt="Flagged item" />
                        </td>
                        <td style={{ maxWidth: 320 }}>
                          <div className="cell-title">
                            {item ? describeAnimal(item) : isShelterFlag ? 'Removed posting' : 'Removed report'}
                          </div>
                          {isShelterFlag ? (
                            <div className="cell-sub">Shelter posting</div>
                          ) : null}
                          {note ? (
                            <div className="cell-sub" style={{ fontStyle: 'italic' }}>
                              “{note.slice(0, 90)}
                              {note.length > 90 ? '…' : ''}”
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
                        {/* Its own click, not the row's "view details". */}
                        <td onClick={(e) => e.stopPropagation()}>
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
            <Pagination {...pendingPage} />
          </Card>

          {acting ? (
            <div ref={moderateRef}>
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
                  {acting.reportType === 'shelter_animal'
                    ? 'Dismissing keeps the posting live. Removing unpublishes it. A shelter account itself is revoked by hand from Manage Shelters, not from here.'
                    : `Dismissing keeps the report live. Removing deletes it and counts as an upheld flag - at ${BAN_THRESHOLD} upheld flags the account is deleted and the person is emailed why. Banning also locks the account now.`}
                </p>
                <div className="row row-wrap">
                  <Button variant="secondary" onClick={() => act('dismissed')}>
                    Dismiss — {acting.reportType === 'shelter_animal' ? 'posting is legitimate' : 'report is legitimate'}
                  </Button>
                  <Button variant="danger" onClick={() => act('removed')}>
                    {acting.reportType === 'shelter_animal' ? 'Remove this posting' : 'Remove this report'}
                  </Button>
                  {acting.reportType === 'shelter_animal' ? null : (
                    <Button variant="danger" onClick={() => act('account_banned')}>
                      Remove and ban the account
                    </Button>
                  )}
                </div>
              </div>
            </Card>
            </div>
          ) : null}

          {resolved.length ? (
            <Card>
              <CardHead title={`Resolved (${resolved.length})`} />
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 62 }}>Photo</th>
                    <th>Report</th>
                    <th>Reason</th>
                    <th>Outcome</th>
                    <th>Reporter</th>
                    <th>Detail</th>
                    <th>Flagged</th>
                  </tr>
                </thead>
                <tbody>
                  {resolvedPage.items.map((f) => {
                    const item = flaggedItem(f);
                    return (
                    <tr key={f.id} {...openRow(f)}>
                      <td>
                        <Thumb src={item?.imageUrls[0]} alt="Flagged item" />
                      </td>
                      <td>
                        <div className="cell-title">
                          {item ? describeAnimal(item) : f.reportType === 'shelter_animal' ? 'Removed posting' : 'Removed report'}
                        </div>
                      </td>
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
                    );
                  })}
                </tbody>
              </table>
              <Pagination {...resolvedPage} />
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
                <th>Report Status</th>
                <th>Location</th>
                <th>Reporter</th>
                <th>Reported</th>
                <th>Flag</th>
              </tr>
            </thead>
            <tbody>
              {reportsPage.items.map((r) => {
                  const kind = reportKindStyle[r.kind];
                  const status = reportStatusMeta[r.status];
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
                      <td>
                        <Badge label={status.label} color={status.color} soft={status.soft} />
                      </td>
                      <td style={{ maxWidth: 220 }}>{reportPlace(r)}</td>
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
          <Pagination {...reportsPage} />
        </Card>
      ) : null}

      {tab === 'accounts' ? (
        <Card>
          <CardHead
            title="Accounts"
            sub={`Every registered user, sorted by upheld flags. At ${BAN_THRESHOLD} upheld flags an account is deleted automatically and the person is emailed why`}
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
                {accountsPage.items.map((u) => {
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
                            onClick={() => confirmBan(u.id, u.fullName)}
                          >
                            {atThreshold ? 'Ban (threshold reached)' : 'Ban account'}
                          </Button>
                        )}
                      </td>
                      <td>
                        <Button variant="danger" small onClick={() => confirmDeleteUser(u.id, u.fullName)}>
                          Delete account
                        </Button>
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
          <Pagination {...accountsPage} />
        </Card>
      ) : null}

      {viewingFlag ? (
        <FlagDetailModal
          flag={viewingFlag}
          item={flaggedItem(viewingFlag)}
          onClose={() => setViewingFlag(null)}
          onTakeAction={() => {
            setActing(viewingFlag);
            setViewingFlag(null);
          }}
        />
      ) : null}
      {selectedReport ? (
        <ReportDetailModal report={selectedReport} onClose={() => setSelectedReport(null)} />
      ) : null}
      {dialog}
    </>
  );
}
