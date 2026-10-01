import { useState } from 'react';
import {
  colors,
  describeAnimal,
  reportKindStyle,
  reportStatusMeta,
  useApp,
  type AnimalReport,
} from '@saanpaw/shared';
import { Badge, Banner, Button, Modal } from './ui';

/** Full detail for one report, opened by clicking a row in Recent reports / All reports. */
export function ReportDetailModal({ report, onClose }: { report: AnimalReport; onClose: () => void }) {
  const { deleteReport } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const kind = reportKindStyle[report.kind];
  const status = reportStatusMeta[report.status];

  const confirmDelete = () => {
    setDeleting(true);
    deleteReport(report.id);
    onClose();
  };

  return (
    <Modal
      title={describeAnimal(report)}
      sub={`${kind.label} report · ${report.barangay}`}
      onClose={onClose}
      actions={
        confirming ? (
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={deleting} onClick={confirmDelete}>
              {deleting ? 'Deleting…' : 'Yes, delete permanently'}
            </Button>
          </>
        ) : (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Delete report
          </Button>
        )
      }
    >
      {report.imageUrls[0] ? (
        <img
          src={report.imageUrls[0]}
          alt={describeAnimal(report)}
          style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
        />
      ) : null}

      <div className="row row-wrap">
        <Badge label={kind.label} color={kind.color} soft={kind.soft} />
        <Badge label={status.label} color={status.color} soft={status.soft} />
        {report.moderationFlagId ? (
          <Badge label="AI flagged" color={colors.danger} soft={colors.dangerSoft} />
        ) : null}
      </div>

      <dl className="kv">
        <dt>Animal type</dt>
        <dd style={{ textTransform: 'capitalize' }}>{report.animalType}</dd>
        {report.name ? (
          <>
            <dt>Name</dt>
            <dd>{report.name}</dd>
          </>
        ) : null}
        {report.breed ? (
          <>
            <dt>Breed</dt>
            <dd>{report.breed}</dd>
          </>
        ) : null}
        {report.color ? (
          <>
            <dt>Coat colour</dt>
            <dd>{report.color}</dd>
          </>
        ) : null}
        {report.size ? (
          <>
            <dt>Size</dt>
            <dd style={{ textTransform: 'capitalize' }}>{report.size}</dd>
          </>
        ) : null}
        {report.sex ? (
          <>
            <dt>Sex</dt>
            <dd style={{ textTransform: 'capitalize' }}>{report.sex}</dd>
          </>
        ) : null}
        {report.distinctMarks ? (
          <>
            <dt>Distinct marks</dt>
            <dd>{report.distinctMarks}</dd>
          </>
        ) : null}
        {report.description ? (
          <>
            <dt>Description</dt>
            <dd>{report.description}</dd>
          </>
        ) : null}
        <dt>Barangay</dt>
        <dd>{report.barangay}</dd>
        <dt>Coordinates</dt>
        <dd>
          {report.location.latitude.toFixed(4)}, {report.location.longitude.toFixed(4)}
        </dd>
        <dt>Reported by</dt>
        <dd>
          {report.reporterName}
          {report.reporterPhone ? ` · ${report.reporterPhone}` : ''}
        </dd>
        <dt>Reported</dt>
        <dd>{new Date(report.reportedAt).toLocaleString()}</dd>
        <dt>Reference</dt>
        <dd style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}>
          {report.id.toUpperCase()}
        </dd>
      </dl>

      {confirming ? (
        <Banner tone="danger" title="This permanently deletes the report">
          Any match suggestions, linked case, and moderation flag tied to it are removed too. This
          cannot be undone.
        </Banner>
      ) : null}
    </Modal>
  );
}
