import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  approvalMeta,
  formatDistance,
  maskPrivate,
  timeAgo,
  useApp,
  type Shelter,
  type ShelterApprovalStatus,
} from '@saanpaw/shared';
import { Banner, Button, Card, CardHead, EmptyState, Pagination, Tabs, useConfirm, usePagination } from '@/components/ui';

/** How long the "credentials emailed" banner stays before fading out. */
const ISSUED_BANNER_MS = 8000;
import { ShelterDetailPanel } from '@/components/ShelterDetailPanel';

/**
 * Developer Module - The pending-decision queue: approve or reject new
 * applications after checking the permit with the local government. Once a
 * shelter is approved or rejected, "Review" sends you to Manage Shelters
 * instead - this page stays focused on applications still awaiting a decision.
 */
export function ShelterApprovalsPage() {
  const { shelters, issuedLogin, clearIssuedLogin } = useApp();
  const { ask, dialog } = useConfirm();
  const navigate = useNavigate();
  const [tab, setTab] = useState<ShelterApprovalStatus>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = shelters.filter((s) => s.approvalStatus === tab);
  const pager = usePagination(rows, 10, tab);
  const [fading, setFading] = useState(false);

  // The credentials are already in the shelter's inbox, so the banner fades away on its own.
  // When the email could not be sent it stays: the Developer still needs to copy them.
  useEffect(() => {
    setFading(false);
    if (!issuedLogin?.emailSent) return;
    const fade = setTimeout(() => setFading(true), ISSUED_BANNER_MS);
    const clear = setTimeout(clearIssuedLogin, ISSUED_BANNER_MS + 1000);
    return () => {
      clearTimeout(fade);
      clearTimeout(clear);
    };
  }, [issuedLogin, clearIssuedLogin]);
  const selected: Shelter | undefined =
    shelters.find((s) => s.id === selectedId && s.approvalStatus === tab) ?? rows[0];

  const count = (s: ShelterApprovalStatus) =>
    shelters.filter((x) => x.approvalStatus === s).length;

  /** Pending applications are reviewed right here; a decided shelter's full management lives on its own page. */
  const openShelter = (id: string) => {
    if (tab === 'pending') setSelectedId(id);
    else navigate(`/shelters/manage?id=${id}`);
  };

  return (
    <>
      {issuedLogin ? (
        <div className={fading ? 'fade-out' : undefined}>
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
          <Button
            variant="ghost"
            small
            onClick={() =>
              // The password is only shown here, once - make sure it was copied before it goes.
              ask(
                <>
                  The temporary password is shown only here. Make sure it was copied or emailed before you dismiss
                  it.
                </>,
                clearIssuedLogin,
                { title: 'Dismiss these sign-in details?', confirmLabel: 'Dismiss', tone: 'primary' },
              )
            }
          >
            Dismiss
          </Button>
        </Banner>
        </div>
      ) : null}

      <Banner tone={count('pending') ? 'warning' : 'success'} title="Verification is a manual step">
        Check each application's proof documents and confirm its permit with the San Jose Del Monte
        city veterinary office before approving. An approved shelter immediately starts receiving smart alerts for every report
        inside its operating radius.
      </Banner>

      <Tabs
        value={tab}
        onChange={(v) => {
          setTab(v);
          setSelectedId(null);
        }}
        options={[
          { label: `Pending (${count('pending')})`, value: 'pending' },
          { label: `Approved (${count('approved')})`, value: 'approved' },
          { label: `Rejected (${count('rejected')})`, value: 'rejected' },
        ]}
      />

      <div className={tab === 'pending' ? 'split' : ''}>
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
                {pager.items.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => openShelter(s.id)}
                    data-selected={tab === 'pending' && selected?.id === s.id}
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
                    <td style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}>
                      {maskPrivate(s.permitNumber)}
                    </td>
                    <td>{s.barangay}</td>
                    <td>{formatDistance(s.operatingRadiusMeters)}</td>
                    <td>{s.capacity}</td>
                    <td style={{ color: 'var(--muted)' }}>{timeAgo(s.registeredAt)}</td>
                    <td>
                      <Button variant="secondary" small onClick={() => openShelter(s.id)}>
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
          <Pagination {...pager} />
        </Card>

        {tab === 'pending' ? (
          <Card>
            <CardHead title="Application detail" />
            {selected ? (
              <ShelterDetailPanel shelter={selected} onAfterAction={() => setSelectedId(null)} />
            ) : (
              <EmptyState title="Nothing selected">
                Choose a shelter from the list to review its application.
              </EmptyState>
            )}
          </Card>
        ) : null}
      </div>
      {dialog}
    </>
  );
}
