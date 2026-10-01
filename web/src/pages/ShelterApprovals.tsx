import { useState } from 'react';
import {
  approvalMeta,
  formatDistance,
  timeAgo,
  useApp,
  type Shelter,
  type ShelterApprovalStatus,
} from '@saanpaw/shared';
import { Badge, Banner, Button, Card, CardHead, EmptyState, Tabs } from '@/components/ui';

/**
 * Developer Module - Approve or reject shelter applications after checking
 * their permit with the local government. The queue sits beside the detail pane
 * so a permit can be read without losing your place.
 */
export function ShelterApprovalsPage() {
  const { shelters, setShelterApproval, deleteShelterAccount, issuedLogin, clearIssuedLogin } = useApp();
  const [tab, setTab] = useState<ShelterApprovalStatus>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const rows = shelters.filter((s) => s.approvalStatus === tab);
  const selected: Shelter | undefined =
    shelters.find((s) => s.id === selectedId && s.approvalStatus === tab) ?? rows[0];

  const count = (s: ShelterApprovalStatus) =>
    shelters.filter((x) => x.approvalStatus === s).length;

  const decide = (status: 'approved' | 'rejected') => {
    if (!selected) return;
    setShelterApproval(selected.id, status);
    selectShelter(null);
  };

  const confirmDelete = () => {
    if (!selected) return;
    deleteShelterAccount(selected.id);
    setSelectedId(null);
    setConfirmingDelete(false);
  };

  const selectShelter = (id: string | null) => {
    setSelectedId(id);
    setConfirmingDelete(false);
  };

  return (
    <>
      {issuedLogin ? (
        <Banner tone="success" title="Shelter login issued - shown once">
          {issuedLogin.emailSent ? (
            <>
              Credentials were emailed to <strong>{issuedLogin.email}</strong>. Backup copy:{' '}
              <strong>{issuedLogin.email}</strong> / <strong>{issuedLogin.password}</strong>.{' '}
            </>
          ) : (
            <>
              Could not email this automatically - give{' '}
              {shelters.find((s) => s.id === issuedLogin.shelterId)?.name ?? 'the shelter'} these credentials
              yourself: <strong>{issuedLogin.email}</strong> / <strong>{issuedLogin.password}</strong>.{' '}
            </>
          )}
          <Button variant="ghost" small onClick={clearIssuedLogin}>
            Dismiss
          </Button>
        </Banner>
      ) : null}

      <Banner tone={count('pending') ? 'warning' : 'success'} title="Verification is a manual step">
        Confirm each permit number with the San Jose Del Monte city veterinary office before
        approving. An approved shelter immediately starts receiving smart alerts for every report
        inside its operating radius.
      </Banner>

      <Tabs
        value={tab}
        onChange={(v) => {
          setTab(v);
          selectShelter(null);
        }}
        options={[
          { label: `Pending (${count('pending')})`, value: 'pending' },
          { label: `Approved (${count('approved')})`, value: 'approved' },
          { label: `Rejected (${count('rejected')})`, value: 'rejected' },
        ]}
      />

      <div className="split">
        <Card>
          <CardHead title={`${approvalMeta[tab].label} (${rows.length})`} />
          {rows.length ? (
            <table>
              <thead>
                <tr>
                  <th>Shelter</th>
                  <th>Permit no.</th>
                  <th>Barangay</th>
                  <th>Radius</th>
                  <th>Capacity</th>
                  <th>Applied</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => selectShelter(s.id)}
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
                        <div>
                          <div className="cell-title">{s.name}</div>
                          <div className="cell-sub">{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}>
                      {s.permitNumber}
                    </td>
                    <td>{s.barangay}</td>
                    <td>{formatDistance(s.operatingRadiusMeters)}</td>
                    <td>{s.capacity}</td>
                    <td style={{ color: 'var(--muted)' }}>{timeAgo(s.registeredAt)}</td>
                    <td>
                      <Button variant="secondary" small onClick={() => selectShelter(s.id)}>
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title={`No ${approvalMeta[tab].label.toLowerCase()} shelters`}>
              Applications submitted from the Shelter Admin module arrive here for permit
              verification.
            </EmptyState>
          )}
        </Card>

        <Card>
          <CardHead title="Application detail" />
          {selected ? (
            <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{selected.name}</div>
                <Badge
                  label={approvalMeta[selected.approvalStatus].label}
                  color={approvalMeta[selected.approvalStatus].color}
                  soft={approvalMeta[selected.approvalStatus].soft}
                />
              </div>

              <dl className="kv">
                <dt>Permit number</dt>
                <dd>{selected.permitNumber}</dd>
                <dt>Address</dt>
                <dd>{selected.address}</dd>
                <dt>Barangay</dt>
                <dd>{selected.barangay}</dd>
                <dt>Contact</dt>
                <dd>{selected.contactNumber}</dd>
                <dt>Email</dt>
                <dd>{selected.email}</dd>
                <dt>Capacity</dt>
                <dd>{selected.capacity} animals</dd>
                <dt>Operating radius</dt>
                <dd>{formatDistance(selected.operatingRadiusMeters)}</dd>
                <dt>Coordinates</dt>
                <dd>
                  {selected.location.latitude.toFixed(4)}, {selected.location.longitude.toFixed(4)}
                </dd>
                <dt>Applied</dt>
                <dd>{new Date(selected.registeredAt).toLocaleDateString()}</dd>
              </dl>

              <Banner tone="info" title="Verification checklist">
                Confirm the permit with the city veterinary office; confirm the address is inside
                San Jose Del Monte; confirm the contact number reaches the shelter.
              </Banner>

              {selected.approvalStatus === 'pending' ? (
                <div className="row">
                  <Button variant="danger" onClick={() => decide('rejected')}>
                    Reject
                  </Button>
                  <Button onClick={() => decide('approved')}>Approve access</Button>
                </div>
              ) : (
                <Button
                  variant={selected.approvalStatus === 'approved' ? 'danger' : 'primary'}
                  onClick={() => decide(selected.approvalStatus === 'approved' ? 'rejected' : 'approved')}
                >
                  {selected.approvalStatus === 'approved' ? 'Revoke access' : 'Approve instead'}
                </Button>
              )}

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                {confirmingDelete ? (
                  <Banner tone="danger" title="Permanently delete this shelter account?">
                    Its animals, cases, conversations, and notifications are deleted too. This cannot
                    be undone.
                    <div className="row" style={{ marginTop: 10 }}>
                      <Button variant="secondary" small onClick={() => setConfirmingDelete(false)}>
                        Cancel
                      </Button>
                      <Button variant="danger" small onClick={confirmDelete}>
                        Yes, delete permanently
                      </Button>
                    </div>
                  </Banner>
                ) : (
                  <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
                    Delete shelter account
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <EmptyState title="Nothing selected">
              Choose a shelter from the list to review its application.
            </EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
