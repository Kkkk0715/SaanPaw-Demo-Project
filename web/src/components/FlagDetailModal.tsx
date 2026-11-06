import {
  colors,
  describeAnimal,
  flagReasonLabel,
  humanizeStatus,
  type AnimalReport,
  type ModerationFlag,
  type ShelterAnimal,
} from '@saanpaw/shared';
import { ReportDetails } from './ReportDetailModal';
import { Badge, Button, Meter, Modal } from './ui';

const isReport = (item: AnimalReport | ShelterAnimal): item is AnimalReport => 'kind' in item;

/** A shelter's own animal posting, which has its own fields rather than a report's. */
function ShelterAnimalDetails({ animal }: { animal: ShelterAnimal }) {
  const row = (label: string, value?: string, capitalize = false) =>
    value ? (
      <>
        <dt>{label}</dt>
        <dd style={capitalize ? { textTransform: 'capitalize' } : undefined}>{value}</dd>
      </>
    ) : null;
  return (
    <>
      {animal.imageUrls[0] ? (
        <img
          src={animal.imageUrls[0]}
          alt={describeAnimal(animal)}
          style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
        />
      ) : null}
      <dl className="kv">
        {row('Animal type', animal.animalType, true)}
        {row('Name', animal.name)}
        {row('Breed', animal.breed)}
        {row('Fur color', animal.color)}
        {row('Size', animal.size, true)}
        {row('Sex', animal.sex, true)}
        {row('Distinct marks', animal.distinctMarks)}
        {row('Intake', animal.intakeType, true)}
        {row('Intake date', new Date(animal.intakeDate).toLocaleDateString())}
        {row('Notes', animal.notes)}
        <dt>Reference</dt>
        <dd style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}>{animal.id.toUpperCase()}</dd>
      </dl>
    </>
  );
}

/**
 * Opened by clicking a row in Report Monitoring's "Awaiting review" or "Resolved" table: why the AI
 * flagged it, what was decided, and the full report (or shelter posting) it is about.
 */
export function FlagDetailModal({
  flag,
  item,
  onClose,
  onTakeAction,
}: {
  flag: ModerationFlag;
  /** Undefined once the report or posting has been deleted. */
  item: AnimalReport | ShelterAnimal | undefined;
  onClose: () => void;
  /** Only for an open flag: closes this and opens the moderation actions. */
  onTakeAction?: () => void;
}) {
  const isShelterFlag = flag.reportType === 'shelter_animal';
  const open = flag.resolution === 'pending';
  const noun = isShelterFlag ? 'posting' : 'report';

  return (
    <Modal
      title={item ? describeAnimal(item) : isShelterFlag ? 'Removed posting' : 'Removed report'}
      sub={`${flagReasonLabel[flag.reason]} · ${isShelterFlag ? 'Shelter posting' : `${flag.reportType === 'lost' ? 'Lost' : 'Found'} report`}`}
      onClose={onClose}
      actions={
        open && onTakeAction ? (
          <Button variant="danger" onClick={onTakeAction}>
            Take action
          </Button>
        ) : undefined
      }
    >
      <div className="flag-summary">
        <div className="row row-wrap">
          <Badge label={flagReasonLabel[flag.reason]} color={colors.danger} soft={colors.dangerSoft} />
          {open ? (
            <Badge label="Awaiting review" color={colors.accent} soft={colors.accentSoft} />
          ) : (
            <Badge
              label={humanizeStatus(flag.resolution)}
              color={flag.resolution === 'dismissed' ? colors.primary : colors.danger}
              soft={flag.resolution === 'dismissed' ? colors.primarySoft : colors.dangerSoft}
            />
          )}
        </div>
        <dl className="kv">
          <dt>Why it was flagged</dt>
          <dd>{flag.detail || '—'}</dd>
          <dt>AI confidence</dt>
          <dd style={{ maxWidth: 220 }}>
            <Meter score={flag.confidence} tone="risk" />
          </dd>
          <dt>Reporter</dt>
          <dd>{flag.reporterName}</dd>
          <dt>Flagged</dt>
          <dd>{new Date(flag.flaggedAt).toLocaleString()}</dd>
        </dl>
      </div>

      <h3 className="flag-section-title">Flagged {noun}</h3>
      {item ? (
        isReport(item) ? (
          <ReportDetails report={item} />
        ) : (
          <ShelterAnimalDetails animal={item} />
        )
      ) : (
        <p style={{ color: 'var(--muted)' }}>
          This {noun} has been deleted, so only the flag record above remains.
        </p>
      )}
    </Modal>
  );
}
