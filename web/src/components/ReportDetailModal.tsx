import {
  colors,
  describeAnimal,
  reportKindStyle,
  reportStatusMeta,
  useApp,
  type AnimalReport,
} from '@saanpaw/shared';
import { Badge, Button, Modal, useConfirm } from './ui';
import { printReportPdf } from '../lib/printReport';

/** Photo, badges and every field of one report - shared by this modal and the flag detail. */
export function ReportDetails({ report }: { report: AnimalReport }) {
  const kind = reportKindStyle[report.kind];
  const status = reportStatusMeta[report.status];
  return (
    <>
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
            <dt>Fur color</dt>
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
        <dt>Address</dt>
        <dd>{report.address || '—'}</dd>
        {report.landmark ? (
          <>
            <dt>Landmark</dt>
            <dd>{report.landmark}</dd>
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
    </>
  );
}

/** Full detail for one report, opened by clicking a row in Recent reports / All reports. */
export function ReportDetailModal({ report, onClose }: { report: AnimalReport; onClose: () => void }) {
  const { deleteReport, caseForReport, shelterById } = useApp();
  const { ask, dialog } = useConfirm();

  const kind = reportKindStyle[report.kind];

  const confirmDelete = () =>
    ask(
      <>
        Are you sure you want to delete this report? Any match suggestions, linked case and moderation flag tied
        to it are removed too. This cannot be undone.
      </>,
      () => {
        deleteReport(report.id);
        onClose();
      },
      { title: 'Are you sure you want to delete this?', confirmLabel: 'Yes, delete' },
    );

  return (
    <Modal
      title={describeAnimal(report)}
      sub={`${kind.label} report · ${report.barangay}`}
      onClose={onClose}
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              const animalCase = caseForReport(report.id);
              printReportPdf(report, {
                caseStatus: animalCase?.status,
                caseShelterName: animalCase ? shelterById(animalCase.shelterId)?.name : undefined,
              });
            }}
          >
            Export PDF
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            Delete report
          </Button>
        </>
      }
    >
      <ReportDetails report={report} />

      {dialog}
    </Modal>
  );
}
