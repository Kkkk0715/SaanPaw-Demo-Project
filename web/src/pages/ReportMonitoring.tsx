import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  SJDM_BARANGAY_NAMES,
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
import { ReportSearch } from '@/components/ReportSearch';
import { inDateRange, matchesText } from '@/lib/filters';

/** Upheld flags at which the server deletes the account and emails the person why. */
const BAN_THRESHOLD = 3;

/**
 * Developer Module - Review reports the AI flagged as false or inappropriate,
 * remove bad entries, and ban accounts that keep posting them.
 */
export function ReportMonitoringPage() {
  const { flags, shelterAnimals, users, reportById, resolveFlag, banUser, deleteUserAccount } = useApp();
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

  // ---- Flag filters (both the "awaiting review" and "resolved" lists)
  const [flagQuery, setFlagQuery] = useState('');
  const [flagReason, setFlagReason] = useState<'' | ModerationFlag['reason']>('');
  const [flagType, setFlagType] = useState<'' | ModerationFlag['reportType']>('');
  const [minConfidence, setMinConfidence] = useState(0);
  const [flagFrom, setFlagFrom] = useState('');
  const [flagTo, setFlagTo] = useState('');
  const [outcome, setOutcome] = useState<'' | Exclude<ModerationFlag['resolution'], 'pending'>>('');
  const [flagSort, setFlagSort] = useState<'newest' | 'oldest' | 'confidence'>('newest');
  const flagFiltersOn = Boolean(flagQuery || flagReason || flagType || minConfidence || flagFrom || flagTo || outcome);
  const clearFlagFilters = () => {
    setFlagQuery('');
    setFlagReason('');
    setFlagType('');
    setMinConfidence(0);
    setFlagFrom('');
    setFlagTo('');
    setOutcome('');
  };
  const filteredFlags: ModerationFlag[] = useMemo(
    () =>
      flags
        .filter((f) => {
          const item = f.reportType === 'shelter_animal' ? shelterAnimals.find((a) => a.id === f.reportId) : reportById(f.reportId);
          return (
            matchesText(flagQuery, [f.reporterName, f.detail, f.reportId, item ? describeAnimal(item) : '', (item as AnimalReport | undefined)?.barangay]) &&
            (!flagReason || f.reason === flagReason) &&
            (!flagType || f.reportType === flagType) &&
            f.confidence >= minConfidence &&
            inDateRange(f.flaggedAt, flagFrom, flagTo)
          );
        })
        .sort((a, b) =>
          flagSort === 'confidence'
            ? b.confidence - a.confidence
            : flagSort === 'oldest'
              ? +new Date(a.flaggedAt) - +new Date(b.flaggedAt)
              : +new Date(b.flaggedAt) - +new Date(a.flaggedAt),
        ),
    [flags, shelterAnimals, reportById, flagQuery, flagReason, flagType, minConfidence, flagFrom, flagTo, flagSort],
  );
  const allPending = flags.filter((f) => f.resolution === 'pending');
  const pending = filteredFlags.filter((f) => f.resolution === 'pending');
  const resolved = filteredFlags.filter((f) => f.resolution !== 'pending' && (!outcome || f.resolution === outcome));
  const flagKey = `${tab}|${flagQuery}|${flagReason}|${flagType}|${minConfidence}|${flagFrom}|${flagTo}|${outcome}|${flagSort}`;

  // ---- Account filters
  const [accountQuery, setAccountQuery] = useState('');
  const [accountStatus, setAccountStatus] = useState<'' | 'active' | 'banned'>('');
  const [accountFlags, setAccountFlags] = useState<'' | 'none' | 'some' | 'threshold'>('');
  const [accountBarangay, setAccountBarangay] = useState('');
  const [joinedFrom, setJoinedFrom] = useState('');
  const [joinedTo, setJoinedTo] = useState('');
  const [accountSort, setAccountSort] = useState<'flags' | 'newest' | 'oldest' | 'name'>('flags');
  const accountFiltersOn = Boolean(accountQuery || accountStatus || accountFlags || accountBarangay || joinedFrom || joinedTo);
  const clearAccountFilters = () => {
    setAccountQuery('');
    setAccountStatus('');
    setAccountFlags('');
    setAccountBarangay('');
    setJoinedFrom('');
    setJoinedTo('');
  };
  const accountRows = [...users]
    .filter(
      (u) =>
        matchesText(accountQuery, [u.fullName, u.email, u.barangay, u.phone]) &&
        (!accountStatus || (accountStatus === 'banned' ? u.isBanned : !u.isBanned)) &&
        (!accountFlags ||
          (accountFlags === 'none'
            ? u.flaggedReportCount === 0
            : accountFlags === 'threshold'
              ? u.flaggedReportCount >= BAN_THRESHOLD
              : u.flaggedReportCount > 0)) &&
        (!accountBarangay || u.barangay === accountBarangay) &&
        inDateRange(u.joinedAt, joinedFrom, joinedTo),
    )
    .sort((a, b) =>
      accountSort === 'newest'
        ? +new Date(b.joinedAt) - +new Date(a.joinedAt)
        : accountSort === 'oldest'
          ? +new Date(a.joinedAt) - +new Date(b.joinedAt)
          : accountSort === 'name'
            ? a.fullName.localeCompare(b.fullName)
            : b.flaggedReportCount - a.flaggedReportCount,
    );
  const pendingPage = usePagination(pending, 10, flagKey);
  const resolvedPage = usePagination(resolved, 10, flagKey);
  const accountsPage = usePagination(
    accountRows,
    10,
    `${tab}|${accountQuery}|${accountStatus}|${accountFlags}|${accountBarangay}|${joinedFrom}|${joinedTo}|${accountSort}`,
  );

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
    ask(
      <>Are you sure you want to ban <strong>{name}</strong>? Their reports will be hidden and they can no longer sign in.</>,
      (reason) => banUser(id, reason),
      {
        title: 'Ban this account?',
        reason: {
          label: 'Reason for banning',
          placeholder: 'e.g. Repeatedly posted fake lost-pet reports.',
          hint: 'Sent to them by email, word for word.',
          required: true,
        },
      },
    );

  const confirmDeleteUser = (id: string, name: string) =>
    ask(
      <>
        Are you sure you want to delete <strong>{name}</strong>&apos;s account? Their reports, messages and notifications are
        deleted too. This cannot be undone.
      </>,
      (reason) => deleteUserAccount(id, reason),
      {
        title: 'Are you sure you want to delete this?',
        confirmLabel: 'Yes, delete',
        reason: {
          label: 'Reason for deleting',
          placeholder: 'e.g. Posted inappropriate images after a warning.',
          hint: 'Sent to them by email, word for word.',
          required: true,
        },
      },
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
          { label: `Flagged (${allPending.length})`, value: 'flagged' },
          { label: 'All reports (search)', value: 'all' },
          { label: `Accounts (${users.length})`, value: 'accounts' },
        ]}
      />

      {tab === 'flagged' ? (
        <>
          <Card>
            <div className="card-pad filter-bar" style={{ paddingTop: 16 }}>
              <label className="mini-field" style={{ flex: '1 1 220px' }}>
                Search
                <input
                  type="search"
                  placeholder="Animal, reporter, detail, barangay..."
                  value={flagQuery}
                  onChange={(e) => setFlagQuery(e.target.value)}
                />
              </label>
              <label className="mini-field">
                Reason
                <select value={flagReason} onChange={(e) => setFlagReason(e.target.value as typeof flagReason)}>
                  <option value="">Any reason</option>
                  {(Object.keys(flagReasonLabel) as ModerationFlag['reason'][]).map((r) => (
                    <option key={r} value={r}>
                      {flagReasonLabel[r]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mini-field">
                Type
                <select value={flagType} onChange={(e) => setFlagType(e.target.value as typeof flagType)}>
                  <option value="">Any type</option>
                  <option value="lost">Lost report</option>
                  <option value="found">Found report</option>
                  <option value="shelter_animal">Shelter posting</option>
                </select>
              </label>
              <label className="mini-field">
                AI confidence
                <select value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))}>
                  <option value={0}>Any</option>
                  <option value={0.5}>50% or more</option>
                  <option value={0.7}>70% or more</option>
                  <option value={0.9}>90% or more</option>
                </select>
              </label>
              <label className="mini-field">
                Flagged from
                <input type="date" value={flagFrom} max={flagTo || undefined} onChange={(e) => setFlagFrom(e.target.value)} />
              </label>
              <label className="mini-field">
                To
                <input type="date" value={flagTo} min={flagFrom || undefined} onChange={(e) => setFlagTo(e.target.value)} />
              </label>
              <label className="mini-field">
                Outcome (resolved)
                <select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
                  <option value="">Any outcome</option>
                  <option value="dismissed">Dismissed</option>
                  <option value="removed">Removed</option>
                  <option value="account_banned">Account banned</option>
                </select>
              </label>
              <label className="mini-field">
                Sort by
                <select value={flagSort} onChange={(e) => setFlagSort(e.target.value as typeof flagSort)}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="confidence">Highest AI confidence</option>
                </select>
              </label>
              {flagFiltersOn ? (
                <button className="btn btn-ghost btn-sm" onClick={clearFlagFilters}>
                  Clear filters
                </button>
              ) : null}
            </div>
          </Card>
          <Card>
            <CardHead
              title={flagFiltersOn ? `Awaiting review (${pending.length} of ${allPending.length})` : `Awaiting review (${pending.length})`}
            />
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
              <EmptyState title={flagFiltersOn && allPending.length ? 'No flags match' : 'Nothing to review'}>
                {flagFiltersOn && allPending.length
                  ? 'Change or clear the filters above.'
                  : 'The AI moderation pass has not flagged any open reports.'}
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

      {tab === 'all' ? <ReportSearch onOpen={setSelectedReport} /> : null}

      {tab === 'accounts' ? (
        <Card>
          <CardHead
            title="Accounts"
            sub={`Every registered user, sorted by upheld flags. At ${BAN_THRESHOLD} upheld flags an account is deleted automatically and the person is emailed why`}
            actions={
              <input
                type="search"
                placeholder="Search name, email, phone, barangay..."
                value={accountQuery}
                onChange={(e) => setAccountQuery(e.target.value)}
                className="table-search"
                aria-label="Search accounts"
              />
            }
          />
          <div className="card-pad filter-bar">
            <label className="mini-field">
              Status
              <select value={accountStatus} onChange={(e) => setAccountStatus(e.target.value as typeof accountStatus)}>
                <option value="">Any status</option>
                <option value="active">Active</option>
                <option value="banned">Banned</option>
              </select>
            </label>
            <label className="mini-field">
              Upheld flags
              <select value={accountFlags} onChange={(e) => setAccountFlags(e.target.value as typeof accountFlags)}>
                <option value="">Any</option>
                <option value="none">None</option>
                <option value="some">At least 1</option>
                <option value="threshold">{BAN_THRESHOLD} or more (ban threshold)</option>
              </select>
            </label>
            <label className="mini-field">
              Barangay
              <select value={accountBarangay} onChange={(e) => setAccountBarangay(e.target.value)}>
                <option value="">All barangays</option>
                {SJDM_BARANGAY_NAMES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="mini-field">
              Joined from
              <input type="date" value={joinedFrom} max={joinedTo || undefined} onChange={(e) => setJoinedFrom(e.target.value)} />
            </label>
            <label className="mini-field">
              To
              <input type="date" value={joinedTo} min={joinedFrom || undefined} onChange={(e) => setJoinedTo(e.target.value)} />
            </label>
            <label className="mini-field">
              Sort by
              <select value={accountSort} onChange={(e) => setAccountSort(e.target.value as typeof accountSort)}>
                <option value="flags">Most upheld flags</option>
                <option value="newest">Newest joined</option>
                <option value="oldest">Oldest joined</option>
                <option value="name">Name A-Z</option>
              </select>
            </label>
            {accountFiltersOn ? (
              <button className="btn btn-ghost btn-sm" onClick={clearAccountFilters}>
                Clear filters
              </button>
            ) : null}
          </div>
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
            <EmptyState title={users.length ? 'No accounts match' : 'No registered accounts'}>
              {users.length ? 'Change or clear the filters above.' : 'No user has registered yet.'}
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
