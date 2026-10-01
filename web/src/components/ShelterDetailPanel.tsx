import { useState } from 'react';
import { approvalMeta, formatDistance, useApp, type Shelter } from '@saanpaw/shared';
import { Badge, Banner, Button } from './ui';

/**
 * Full detail for one shelter plus every account-level action on it: the
 * approve/reject decision for a pending application, the revoke/approve toggle
 * for an already-decided one, and the true delete. Shared by Shelter Approvals
 * (the pending-decision queue) and Manage Shelters (the full directory), so the
 * same shelter looks and behaves identically regardless of which page got you
 * there - only the status-dependent buttons change, driven by the shelter's own
 * approvalStatus rather than which page is rendering it.
 */
export function ShelterDetailPanel({
  shelter,
  onAfterAction,
}: {
  shelter: Shelter;
  onAfterAction?: () => void;
}) {
  const { setShelterApproval, deleteShelterAccount } = useApp();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const decide = (status: 'approved' | 'rejected') => {
    setShelterApproval(shelter.id, status);
    onAfterAction?.();
  };

  const confirmDelete = () => {
    deleteShelterAccount(shelter.id);
    setConfirmingDelete(false);
    onAfterAction?.();
  };

  return (
    <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{shelter.name}</div>
        <Badge
          label={approvalMeta[shelter.approvalStatus].label}
          color={approvalMeta[shelter.approvalStatus].color}
          soft={approvalMeta[shelter.approvalStatus].soft}
        />
      </div>

      <dl className="kv">
        <dt>Permit number</dt>
        <dd>{shelter.permitNumber}</dd>
        <dt>Address</dt>
        <dd>{shelter.address}</dd>
        <dt>Barangay</dt>
        <dd>{shelter.barangay}</dd>
        <dt>Contact</dt>
        <dd>{shelter.contactNumber}</dd>
        <dt>Email</dt>
        <dd>{shelter.email}</dd>
        <dt>Capacity</dt>
        <dd>{shelter.capacity} animals</dd>
        <dt>Operating radius</dt>
        <dd>{formatDistance(shelter.operatingRadiusMeters)}</dd>
        <dt>Coordinates</dt>
        <dd>
          {shelter.location.latitude.toFixed(4)}, {shelter.location.longitude.toFixed(4)}
        </dd>
        <dt>Applied</dt>
        <dd>{new Date(shelter.registeredAt).toLocaleDateString()}</dd>
      </dl>

      <Banner tone="info" title="Verification checklist">
        Confirm the permit with the city veterinary office; confirm the address is inside San Jose
        Del Monte; confirm the contact number reaches the shelter.
      </Banner>

      {shelter.approvalStatus === 'pending' ? (
        <div className="row">
          <Button variant="danger" onClick={() => decide('rejected')}>
            Reject
          </Button>
          <Button onClick={() => decide('approved')}>Approve access</Button>
        </div>
      ) : (
        <Button
          variant={shelter.approvalStatus === 'approved' ? 'danger' : 'primary'}
          onClick={() => decide(shelter.approvalStatus === 'approved' ? 'rejected' : 'approved')}
        >
          {shelter.approvalStatus === 'approved' ? 'Revoke access' : 'Approve instead'}
        </Button>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        {confirmingDelete ? (
          <Banner tone="danger" title="Permanently delete this shelter account?">
            Its animals, cases, conversations, and notifications are deleted too. This cannot be
            undone.
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
  );
}
