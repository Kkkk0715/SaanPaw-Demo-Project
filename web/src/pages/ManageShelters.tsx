import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SJDM_BARANGAY_NAMES, approvalMeta, useApp, type Shelter, type ShelterApprovalStatus } from '@saanpaw/shared';
import { inDateRange, matchesText } from '@/lib/filters';
import { Badge, Card, CardHead, EmptyState, Pagination, usePagination } from '@/components/ui';
import { ShelterDetailPanel } from '@/components/ShelterDetailPanel';

/**
 * Developer Module - Every registered shelter, regardless of approval status: a
 * directory for day-to-day account management (view full registration detail,
 * revoke access, delete the account), separate from Shelter Approvals' job of
 * deciding new applications. "Review" on an already-decided shelter lands here,
 * pre-selected via ?id=.
 */
export function ManageSheltersPage() {
  const { shelters } = useApp();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | ShelterApprovalStatus>('');
  const [barangay, setBarangay] = useState('');
  const [space, setSpace] = useState<'' | 'available' | 'nearly_full' | 'full'>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<'name' | 'newest' | 'oldest' | 'fullest' | 'capacity'>('name');

  const selectedId = params.get('id');
  const fill = (s: Shelter) => s.currentOccupancy / Math.max(1, s.capacity);
  const rows: Shelter[] = useMemo(
    () =>
      [...shelters]
        .filter(
          (s) =>
            matchesText(query, [s.name, s.email, s.barangay, s.address, s.contactNumber, s.permitNumber]) &&
            (!status || s.approvalStatus === status) &&
            (!barangay || s.barangay === barangay) &&
            (!space ||
              (space === 'full' ? fill(s) >= 1 : space === 'nearly_full' ? fill(s) >= 0.8 && fill(s) < 1 : fill(s) < 0.8)) &&
            inDateRange(s.registeredAt, from, to),
        )
        .sort((a, b) =>
          sort === 'newest'
            ? +new Date(b.registeredAt) - +new Date(a.registeredAt)
            : sort === 'oldest'
              ? +new Date(a.registeredAt) - +new Date(b.registeredAt)
              : sort === 'fullest'
                ? fill(b) - fill(a)
                : sort === 'capacity'
                  ? b.capacity - a.capacity
                  : a.name.localeCompare(b.name),
        ),
    [shelters, query, status, barangay, space, from, to, sort],
  );
  const filtersOn = Boolean(query || status || barangay || space || from || to);
  const clear = () => {
    setQuery('');
    setStatus('');
    setBarangay('');
    setSpace('');
    setFrom('');
    setTo('');
  };
  const selected: Shelter | undefined = shelters.find((s) => s.id === selectedId) ?? rows[0];
  const pager = usePagination(rows, 10, `${query}|${status}|${barangay}|${space}|${from}|${to}|${sort}`);
  const count = (st: ShelterApprovalStatus) => shelters.filter((s) => s.approvalStatus === st).length;

  const select = (id: string | null) => setParams(id ? { id } : {}, { replace: true });

  return (
    <div className="split">
      <Card>
        <CardHead
          title={filtersOn ? `Shelters (${rows.length} of ${shelters.length})` : `All shelters (${rows.length})`}
          sub="Every shelter that has ever registered, any status"
          actions={
            <input
              type="search"
              placeholder="Search name, email, address, permit..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="table-search"
            />
          }
        />
        <div className="card-pad filter-bar">
          <label className="mini-field">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="">Any status ({shelters.length})</option>
              <option value="approved">Approved ({count('approved')})</option>
              <option value="pending">Pending review ({count('pending')})</option>
              <option value="rejected">Rejected / revoked ({count('rejected')})</option>
            </select>
          </label>
          <label className="mini-field">
            Barangay
            <select value={barangay} onChange={(e) => setBarangay(e.target.value)}>
              <option value="">All barangays</option>
              {SJDM_BARANGAY_NAMES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="mini-field">
            Space
            <select value={space} onChange={(e) => setSpace(e.target.value as typeof space)}>
              <option value="">Any</option>
              <option value="available">Has space (under 80%)</option>
              <option value="nearly_full">Nearly full (80-99%)</option>
              <option value="full">Full</option>
            </select>
          </label>
          <label className="mini-field">
            Registered from
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="mini-field">
            To
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="mini-field">
            Sort by
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="name">Name A-Z</option>
              <option value="newest">Newest registered</option>
              <option value="oldest">Oldest registered</option>
              <option value="fullest">Fullest first</option>
              <option value="capacity">Largest capacity</option>
            </select>
          </label>
          {filtersOn ? (
            <button className="btn btn-ghost btn-sm" onClick={clear}>
              Clear filters
            </button>
          ) : null}
        </div>
        {rows.length ? (
          <table>
            <thead>
              <tr>
                <th>Shelter</th>
                <th>Status</th>
                <th>Barangay</th>
                <th>Occupancy</th>
              </tr>
            </thead>
            <tbody>
              {pager.items.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => select(s.id)}
                  data-selected={selected?.id === s.id}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <div className="row">
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: s.logoColor,
                          flexShrink: 0,
                        }}
                        aria-hidden
                      />
                      <div className="cell-clip">
                        <div className="cell-title">{s.name}</div>
                        <div className="cell-sub">{s.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge
                      label={approvalMeta[s.approvalStatus].label}
                      color={approvalMeta[s.approvalStatus].color}
                      soft={approvalMeta[s.approvalStatus].soft}
                    />
                  </td>
                  <td>{s.barangay}</td>
                  <td>
                    {s.currentOccupancy} / {s.capacity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No shelters match">Try a different search, or clear the filters.</EmptyState>
        )}
        <Pagination {...pager} />
      </Card>

      <Card>
        <CardHead title="Shelter detail" />
        {selected ? (
          <ShelterDetailPanel shelter={selected} onAfterAction={() => select(null)} />
        ) : (
          <EmptyState title="Nothing selected">
            Choose a shelter from the list to view and manage its account.
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
