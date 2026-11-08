import { useEffect, useState } from 'react';
import { approvalMeta, formatDistance, maskPrivate, useApp, type ProofDocument, type Shelter } from '@saanpaw/shared';
import { Badge, Banner, Button, Modal, useConfirm } from './ui';
import { Bone } from './Skeleton';

/**
 * Full detail for one shelter plus every account-level action on it: the
 * approve/reject decision for a pending application, the revoke/approve toggle
 * for an already-decided one, and the true delete. Shared by Shelter Approvals
 * (the pending-decision queue) and Manage Shelters (the full directory), so the
 * same shelter looks and behaves identically regardless of which page got you
 * there - only the status-dependent buttons change, driven by the shelter's own
 * approvalStatus rather than which page is rendering it.
 *
 * Every one of those actions asks "Are you sure?" first. The permit number is
 * private, so it stays masked until the Developer chooses to show it.
 */
export function ShelterDetailPanel({
  shelter,
  onAfterAction,
}: {
  shelter: Shelter;
  onAfterAction?: () => void;
}) {
  const { setShelterApproval, deleteShelterAccount } = useApp();
  const { ask, dialog } = useConfirm();
  const [showPermit, setShowPermit] = useState(false);

  useEffect(() => setShowPermit(false), [shelter.id]);

  const decide = (status: 'approved' | 'rejected', reason?: string) => {
    setShelterApproval(shelter.id, status, reason);
    onAfterAction?.();
  };

  const askDecision = (status: 'approved' | 'rejected') => {
    const pending = shelter.approvalStatus === 'pending';
    const message =
      status === 'approved'
        ? pending
          ? <>Are you sure you want to approve <strong>{shelter.name}</strong>? Sign-in credentials will be emailed to the shelter and it will start receiving smart alerts.</>
          : <>Are you sure you want to approve <strong>{shelter.name}</strong> again? It will be able to sign in.</>
        : pending
          ? <>Are you sure you want to reject the application from <strong>{shelter.name}</strong>?</>
          : <>Are you sure you want to revoke access for <strong>{shelter.name}</strong>? It will no longer be able to sign in or receive alerts.</>;
    ask(message, (reason) => decide(status, reason), {
      title: status === 'approved' ? 'Approve this shelter?' : pending ? 'Reject this application?' : 'Revoke access?',
      confirmLabel: 'Yes',
      tone: status === 'approved' ? 'primary' : 'danger',
      // Rejecting or revoking emails the shelter, so it says why.
      reason:
        status === 'rejected'
          ? {
              label: pending ? 'Reason for rejecting' : 'Reason for revoking access',
              placeholder: pending
                ? 'e.g. The permit number could not be confirmed with the city veterinary office.'
                : 'e.g. Repeated reports of animals not being cared for.',
              hint: 'Sent to them by email, word for word.',
              required: true,
            }
          : undefined,
    });
  };

  const askDelete = () =>
    ask(
      <>
        Are you sure you want to delete <strong>{shelter.name}</strong>? Its animals, cases, conversations,
        notifications and proof documents are deleted too. This cannot be undone.
      </>,
      (reason) => {
        deleteShelterAccount(shelter.id, reason);
        onAfterAction?.();
      },
      {
        title: 'Are you sure you want to delete this?',
        confirmLabel: 'Yes, delete',
        reason: {
          label: 'Reason for deleting',
          placeholder: 'e.g. The shelter has closed, or its credentials could not be verified.',
          hint: 'Sent to them by email, word for word.',
          required: true,
        },
      },
    );

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
        <dd>
          <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5, whiteSpace: 'nowrap' }}>
            {showPermit ? shelter.permitNumber || '—' : maskPrivate(shelter.permitNumber)}
          </span>{' '}
          {shelter.permitNumber ? (
            <button className="password-toggle" style={{ position: 'static', transform: 'none' }} onClick={() => setShowPermit((v) => !v)}>
              {showPermit ? 'Hide' : 'Show'}
            </button>
          ) : null}
        </dd>
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

      <ProofDocuments shelter={shelter} />

      <Banner tone="info" title="Verification checklist">
        Check the proof documents and confirm the permit with the city veterinary office; confirm the
        address is inside San Jose Del Monte; confirm the contact number reaches the shelter.
      </Banner>

      {shelter.approvalStatus === 'pending' ? (
        <div className="row">
          <Button variant="danger" onClick={() => askDecision('rejected')}>
            Reject
          </Button>
          <Button onClick={() => askDecision('approved')}>Approve access</Button>
        </div>
      ) : (
        <Button
          variant={shelter.approvalStatus === 'approved' ? 'danger' : 'primary'}
          onClick={() => askDecision(shelter.approvalStatus === 'approved' ? 'rejected' : 'approved')}
        >
          {shelter.approvalStatus === 'approved' ? 'Revoke access' : 'Approve instead'}
        </Button>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <Button variant="danger" onClick={askDelete}>
          Delete shelter account
        </Button>
      </div>
      {dialog}
    </div>
  );
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** The proof of credentials the shelter submitted, each openable in a viewer. */
function ProofDocuments({ shelter }: { shelter: Shelter }) {
  const { listShelterProofs, openProofDocument, sync } = useApp();
  const [docs, setDocs] = useState<ProofDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ doc: ProofDocument; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDocs(null);
    setError(null);
    listShelterProofs(shelter.id)
      .then((d) => !cancelled && setDocs(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load the documents.'));
    return () => {
      cancelled = true;
    };
  }, [shelter.id, listShelterProofs]);

  // Object URLs hold the file in memory until revoked.
  useEffect(() => () => {
    if (viewing) URL.revokeObjectURL(viewing.url);
  }, [viewing]);

  const open = async (doc: ProofDocument) => {
    try {
      const blob = await openProofDocument(doc.id);
      setError(null);
      setViewing({ doc, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the document.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Proof of credentials</div>
      {error ? <div style={{ color: 'var(--danger)', fontSize: 12.5 }}>{error}</div> : null}
      {docs === null && !error ? (
        sync.status === 'ready' ? (
          <div className="proof-list" aria-label="Loading documents">
            {[0, 1].map((i) => (
              <div key={i} className="proof-item">
                <Bone w={30} h={30} style={{ borderRadius: 7 }} />
                <div className="skeleton-stack" style={{ flex: 1 }}>
                  <Bone w="60%" h={11} />
                  <Bone w="25%" h={9} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>Documents load once the console is connected.</div>
        )
      ) : null}
      {docs && !docs.length ? (
        <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>
          No documents on file. Applications made before proof uploads were required have none.
        </div>
      ) : null}
      {docs?.length ? (
        <div className="proof-list">
          {docs.map((d) => (
            <div key={d.id} className="proof-item">
              <span className="proof-icon" aria-hidden>
                {d.contentType === 'application/pdf' ? 'PDF' : 'IMG'}
              </span>
              <div className="cell-clip" style={{ flex: 1 }}>
                <div className="cell-title" style={{ fontSize: 13 }}>
                  {d.filename}
                </div>
                <div className="cell-sub">{formatSize(d.size)}</div>
              </div>
              <Button variant="secondary" small onClick={() => void open(d)}>
                View
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {viewing ? (
        <Modal
          title={viewing.doc.filename}
          sub={`Proof submitted by ${shelter.name}`}
          onClose={() => setViewing(null)}
          actions={
            <a className="btn btn-secondary" href={viewing.url} download={viewing.doc.filename}>
              Download
            </a>
          }
        >
          {viewing.doc.contentType === 'application/pdf' ? (
            <iframe className="proof-frame" src={viewing.url} title={viewing.doc.filename} />
          ) : (
            <img className="proof-preview" src={viewing.url} alt={viewing.doc.filename} />
          )}
        </Modal>
      ) : null}
    </div>
  );
}
