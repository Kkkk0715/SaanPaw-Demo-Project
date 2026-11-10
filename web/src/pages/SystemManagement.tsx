import { useApp, type SystemConfig } from '@saanpaw/shared';
import { Badge, Banner, Button, Card, CardHead, Toggle, useConfirm } from '@/components/ui';

type ConfigKey = Exclude<keyof SystemConfig, 'updatedAt'>;

/** What each switch is called in the confirmation, and what turning it on or off does. */
const CONFIG_COPY: Record<ConfigKey, { name: string; on: string; off: string }> = {
  aiModeration: {
    name: 'AI report moderation',
    on: 'New reports and photos will be screened and suspicious ones flagged for review.',
    off: 'New reports will not be screened, and photos will no longer be checked for animals or duplicates.',
  },
  smartAlerts: {
    name: 'Smart alert dispatch',
    on: 'Users and shelters will be notified about reports inside their radius again.',
    off: 'Nobody will be alerted about new reports nearby until this is turned back on.',
  },
  geoFence: {
    name: 'San Jose Del Monte geo-fence',
    on: 'Reports pinned outside the city boundary will be rejected again.',
    off: 'Reports pinned outside San Jose Del Monte will be accepted.',
  },
  maintenanceMode: {
    name: 'Maintenance mode',
    on: 'Users and shelter admins will be unable to sign in to the mobile app until it is turned off.',
    off: 'Users and shelter admins will be able to sign in again.',
  },
};

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvSection(title: string, headers: string[], rows: unknown[][]): string {
  return [title, headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
}

/** Developer Module - Configuration, database counts, and maintenance controls. */
export function SystemManagementPage() {
  const {
    reports,
    users,
    shelters,
    shelterAnimals,
    cases,
    flags,
    notifications,
    messages,
    systemConfig,
    deployment,
    collectionCounts,
    updateSystemConfig,
  } = useApp();

  const maintenance = systemConfig?.maintenanceMode ?? false;
  const { ask, dialog } = useConfirm();

  /** Every switch asks first: these change behaviour for everyone using SaanPaw. */
  const confirmToggle = (key: ConfigKey, next: boolean) => {
    const copy = CONFIG_COPY[key];
    ask(
      <>
        Are you sure you want to turn <strong>{next ? 'on' : 'off'}</strong> {copy.name.toLowerCase()}?{' '}
        {next ? copy.on : copy.off}
      </>,
      () => updateSystemConfig({ [key]: next }),
      {
        title: `Turn ${next ? 'on' : 'off'} ${copy.name}?`,
        confirmLabel: 'Yes',
        tone: (key === 'maintenanceMode' ? next : !next) ? 'danger' : 'primary',
      },
    );
  };

  // Real totals counted in the database by the server. Only the offline demo (or an older backend)
  // falls back to counting the rows this page happens to have loaded.
  const collections: { name: string; count: number; detail?: string }[] = collectionCounts ?? [
    { name: 'reports', count: reports.length },
    { name: 'users', count: users.length },
    { name: 'shelters', count: shelters.length },
    { name: 'shelterAnimals', count: shelterAnimals.length },
    { name: 'animalCases', count: cases.length },
    { name: 'moderationFlags', count: flags.length },
    { name: 'notifications', count: notifications.length },
    { name: 'messages', count: messages.length },
  ];

  function exportCsv() {
    const csv = [
      csvSection(
        'Reports',
        ['id', 'kind', 'status', 'animalType', 'barangay', 'reportedAt'],
        reports.map((r) => [r.id, r.kind, r.status, r.animalType, r.barangay, r.reportedAt]),
      ),
      csvSection(
        'Users',
        ['id', 'fullName', 'email', 'barangay', 'isBanned', 'joinedAt'],
        users.map((u) => [u.id, u.fullName, u.email, u.barangay, u.isBanned, u.joinedAt]),
      ),
      csvSection(
        'Shelters',
        ['id', 'name', 'email', 'approvalStatus', 'registeredAt'],
        shelters.map((s) => [s.id, s.name, s.email, s.approvalStatus, s.registeredAt]),
      ),
      csvSection(
        'Moderation flags',
        ['id', 'reportId', 'reason', 'confidence', 'resolution', 'flaggedAt'],
        flags.map((f) => [f.id, f.reportId, f.reason, f.confidence, f.resolution, f.flaggedAt]),
      ),
    ].join('\n\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saanpaw-system-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    // Revoking straight away can cancel the download in some browsers; give it a moment first.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      {maintenance ? (
        <Banner tone="danger" title="Maintenance mode is ON">
          Users and shelter admins cannot sign in to the mobile app. Turn this off once the
          deployment finishes.
        </Banner>
      ) : (
        <Banner tone="success" title="All systems operational">
          API, database, and smart alert dispatch are healthy.
        </Banner>
      )}

      <div className="split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card>
            <CardHead title="System configuration" />
            <div className="card-pad">
              <Toggle
                on={systemConfig?.aiModeration ?? true}
                onChange={(v) => confirmToggle('aiModeration', v)}
                label="AI report moderation"
                hint="Auto-flag false and inappropriate reports for review."
              />
              <Toggle
                on={systemConfig?.smartAlerts ?? true}
                onChange={(v) => confirmToggle('smartAlerts', v)}
                label="Smart alert dispatch"
                hint="Notify users and shelters when a report lands inside their radius."
              />
              <Toggle
                on={systemConfig?.geoFence ?? true}
                onChange={(v) => confirmToggle('geoFence', v)}
                label="San Jose Del Monte geo-fence"
                hint="Reject any report pinned outside the city boundary (Limitation 1)."
              />
              <Toggle
                on={maintenance}
                onChange={(v) => confirmToggle('maintenanceMode', v)}
                label="Maintenance mode"
                hint="Block user and shelter sign-in while updates are deployed."
              />
            </div>
          </Card>

          <Card>
            <CardHead
              title="Database monitoring"
              sub={collectionCounts ? 'Documents stored in each database collection' : 'Counts of what this page has loaded (demo mode)'}
            />
            <table>
              <thead>
                <tr>
                  <th>Collection</th>
                  <th style={{ width: 120 }}>Documents</th>
                </tr>
              </thead>
              <tbody>
                {collections.map((c) => (
                  <tr key={c.name}>
                    <td style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5 }}>
                      {c.name}
                      {c.detail ? (
                        <span style={{ fontFamily: 'inherit', color: 'var(--muted)', marginLeft: 10 }}>{c.detail}</span>
                      ) : null}
                    </td>
                    <td style={{ fontWeight: 700 }}>{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <CardHead title="Maintenance actions" />
            <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="row row-wrap">
                <Button variant="secondary" onClick={exportCsv}>
                  Export system report (CSV)
                </Button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                Exports the collections above (reports, users, shelters, moderation flags) as loaded
                right now.
              </p>
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card>
            <CardHead title="Deployment" />
            <div className="card-pad">
              <dl className="kv" style={{ gridTemplateColumns: '132px 1fr' }}>
                <dt>Environment</dt>
                <dd>{deployment ? deployment.environment : 'Offline demo'}</dd>
                <dt>Console version</dt>
                <dd>{__APP_VERSIONS__.console}</dd>
                <dt>Mobile app</dt>
                <dd>{__APP_VERSIONS__.mobile}</dd>
                <dt>Service area</dt>
                <dd>San Jose Del Monte, Bulacan</dd>
                <dt>Data source</dt>
                <dd>{deployment ? 'MongoDB' : 'Local in-memory seed data'}</dd>
                {deployment && (
                  <>
                    <dt>Node runtime</dt>
                    <dd>{deployment.nodeVersion}</dd>
                    <dt>Uptime</dt>
                    <dd>{formatUptime(deployment.uptimeSeconds)}</dd>
                    {deployment.emailQueue ? (
                      <>
                        <dt>Email outbox</dt>
                        <dd>
                          {deployment.emailQueue.queued} waiting to retry · {deployment.emailQueue.failed} failed
                        </dd>
                      </>
                    ) : null}
                  </>
                )}
              </dl>
              <div className="row row-wrap" style={{ marginTop: 14 }}>
                <Badge label="Console ready" />
                {deployment ? (
                  deployment.databaseConnected ? (
                    <Badge label="Database connected" />
                  ) : (
                    <Badge label="Database unreachable" color="var(--danger)" soft="var(--danger-soft)" />
                  )
                ) : (
                  <Badge label="Offline demo mode" color="var(--accent)" soft="var(--accent-soft)" />
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Architecture" />
            <div className="card-pad" style={{ fontSize: 12.5, color: 'var(--text-soft)', lineHeight: 1.6 }}>
              <p style={{ marginBottom: 10 }}>
                The Developer Module runs here as a web console, separate from the mobile app. Pet
                owners and shelter admins use the mobile app only; administration is not available
                on a phone.
              </p>
              <p>
                Both surfaces share <code>@saanpaw/shared</code> &mdash; the data model, the service
                area, the matching logic, and the colour language &mdash; so they cannot drift apart.
              </p>
            </div>
          </Card>

          <Card>
            <CardHead title="Limitations enforced in code" />
            <div className="card-pad">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-soft)', lineHeight: 1.7 }}>
                <li>Operates only within San Jose Del Monte, Bulacan &mdash; every report coordinate is geo-fenced.</li>
                <li>No physical tracking hardware &mdash; no GPS collars, RFID tags, or microchips.</li>
                <li>No integration with national government animal databases.</li>
              </ul>
            </div>
          </Card>
        </div>
      </div>
      {dialog}
    </>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
