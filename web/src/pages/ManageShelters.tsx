import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { approvalMeta, useApp, type Shelter } from '@saanpaw/shared';
import { Badge, Card, CardHead, EmptyState } from '@/components/ui';
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

  const selectedId = params.get('id');
  const rows = useMemo(
    () =>
      [...shelters]
        .filter((s) => !query.trim() || s.name.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [shelters, query],
  );
  const selected: Shelter | undefined = shelters.find((s) => s.id === selectedId) ?? rows[0];

  const select = (id: string | null) => setParams(id ? { id } : {}, { replace: true });

  return (
    <div className="split">
      <Card>
        <CardHead
          title={`All shelters (${rows.length})`}
          sub="Every shelter that has ever registered, any status"
          actions={
            <input
              type="search"
              placeholder="Search by name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="table-search"
            />
          }
        />
        {rows.length ? (
          <table>
            <thead>
              <tr>
                <th>Shelter</th>
                <th>Status</th>
                <th>Barangay</th>
                <th>Capacity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
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
                  <td>{s.capacity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No shelters match">Try a different search term.</EmptyState>
        )}
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
