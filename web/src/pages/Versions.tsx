import { useCallback, useEffect, useState } from 'react';
import { colors, useApp } from '@saanpaw/shared';
import { Badge, Banner, Button, Card, CardHead, EmptyState, Modal, Pagination, useConfirm, usePagination } from '@/components/ui';
import { useApi } from '@/lib/useApi';

interface Release {
  id: string;
  surface: 'api' | 'console' | 'mobile';
  version: string;
  notes: string;
  commitSha?: string;
  commitMessage?: string;
  commitAuthor?: string;
  deploymentUrl?: string;
  environment?: string;
  createdByEmail?: string;
  createdAt: string;
  rolledBackAt?: string;
}
interface ConfigState {
  aiModeration: boolean;
  smartAlerts: boolean;
  geoFence: boolean;
  maintenanceMode: boolean;
}
interface ConfigChange {
  id: string;
  before: ConfigState;
  after: ConfigState;
  kind: 'change' | 'rollback';
  changedByEmail?: string;
  createdAt: string;
}
interface Backup {
  id: string;
  label: string;
  kind: 'manual' | 'before_restore';
  sizeBytes: number;
  collections: { name: string; count: number }[];
  createdByEmail?: string;
  createdAt: string;
  restoredAt?: string;
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const SURFACE: Record<Release['surface'], string> = { api: 'API (server)', console: 'Developer Console', mobile: 'Mobile app' };
const SETTING: Record<keyof ConfigState, string> = {
  aiModeration: 'AI moderation',
  smartAlerts: 'Smart alerts',
  geoFence: 'Geo-fence',
  maintenanceMode: 'Maintenance mode',
};
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/**
 * Version control and "undo": every deployed update (recorded automatically for the API, added
 * for app and console releases), every System Management change, and full database backups -
 * each with a way back.
 */
export function VersionsPage() {
  return (
    <>
      <ReleasesCard />
      <SettingsHistoryCard />
      <BackupsCard />
    </>
  );
}

function ReleasesCard() {
  const api = useApi();
  const { ask, dialog } = useConfirm();
  const [data, setData] = useState<{ releases: Release[]; current: { commitSha: string | null; deploymentUrl: string | null }; rollbackEnabled: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => {
    api<NonNullable<typeof data>>('/developer/releases')
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [api]);
  useEffect(load, [load]);
  const page = usePagination(data?.releases ?? [], 8);

  const rollback = (r: Release) =>
    ask(
      <>
        Roll the API back to <strong>{r.version}</strong>
        {r.commitMessage ? <> ("{r.commitMessage}")</> : null}? The live server switches to that deployment within a minute. Database data is not changed.
      </>,
      async () => {
        try {
          await api(`/developer/releases/${r.id}/rollback`, { method: 'POST' });
          setNotice(`Rolled back to ${r.version}. Vercel is switching the live server now.`);
          load();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
      { title: 'Roll back the API?', confirmLabel: 'Roll back', tone: 'danger' },
    );

  return (
    <Card>
      <CardHead
        title="Version history"
        sub="Every API deployment is recorded automatically from GitHub; add app and console releases with their notes."
        actions={<Button onClick={() => setAdding(true)}>Add release</Button>}
      />
      <div className="card-pad" style={{ paddingTop: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error ? (
          <Banner tone="danger" title="Something went wrong">
            {error}
          </Banner>
        ) : null}
        {notice ? (
          <Banner tone="success" title="Rollback started">
            {notice}
          </Banner>
        ) : null}
        {data && !data.rollbackEnabled ? (
          <Banner tone="info" title="Rolling back the server">
            One-click rollback needs VERCEL_TOKEN and VERCEL_PROJECT_ID on the API project in Vercel. Until then: Vercel → the API project → Deployments → the
            version to go back to → ⋯ → Instant Rollback. The mobile app goes back by installing the earlier APK.
          </Banner>
        ) : null}
      </div>
      {data?.releases.length ? (
        <>
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Part</th>
                <th>What changed</th>
                <th>When</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {page.items.map((r) => {
                const live = r.surface === 'api' && r.deploymentUrl && r.deploymentUrl === data.current.deploymentUrl;
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-title">{r.version}</div>
                      <div className="cell-sub">{r.commitSha ? r.commitSha.slice(0, 7) : r.createdByEmail ?? ''}</div>
                    </td>
                    <td>
                      {SURFACE[r.surface]}
                      {live ? (
                        <div>
                          <Badge label="Live now" />
                        </div>
                      ) : null}
                    </td>
                    <td style={{ maxWidth: 360 }}>
                      <div>{r.notes || r.commitMessage || '—'}</div>
                      {r.commitAuthor ? <div className="cell-sub">by {r.commitAuthor}</div> : null}
                      {r.rolledBackAt ? <div className="cell-sub" style={{ color: colors.accent }}>Rolled back to on {when(r.rolledBackAt)}</div> : null}
                    </td>
                    <td className="cell-sub">{when(r.createdAt)}</td>
                    <td>
                      {r.surface === 'api' && r.deploymentUrl && !live && data.rollbackEnabled ? (
                        <Button small variant="secondary" onClick={() => rollback(r)}>
                          Roll back to this
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="card-pad">
            <Pagination {...page} />
          </div>
        </>
      ) : data ? (
        <EmptyState title="No versions recorded yet">The next deployment from GitHub is recorded automatically.</EmptyState>
      ) : null}
      {adding ? <AddReleaseModal onClose={() => setAdding(false)} onAdded={load} /> : null}
      {dialog}
    </Card>
  );
}

function AddReleaseModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const api = useApi();
  const [surface, setSurface] = useState<Release['surface']>('mobile');
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!version.trim()) return setError('Enter the version, e.g. 1.2.0.');
    try {
      await api('/developer/releases', { method: 'POST', json: { surface, version: version.trim(), notes: notes.trim() || undefined } });
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal
      title="Add a release"
      sub="Record an app or console update with what changed, so every version is accounted for."
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>Save release</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="mini-field">
          Part of the system
          <select value={surface} onChange={(e) => setSurface(e.target.value as Release['surface'])}>
            <option value="mobile">Mobile app (APK)</option>
            <option value="console">Developer Console</option>
            <option value="api">API (server)</option>
          </select>
        </label>
        <div className="field">
          <label htmlFor="rel-version">Version</label>
          <input id="rel-version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.2.0" />
        </div>
        <div className="field">
          <label htmlFor="rel-notes">What changed</label>
          <textarea id="rel-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Added guest mode and AI photo autofill…" />
        </div>
        {error ? (
          <Banner tone="danger" title="Check the details">
            {error}
          </Banner>
        ) : null}
      </div>
    </Modal>
  );
}

function SettingsHistoryCard() {
  const api = useApi();
  const { sync } = useApp();
  const { ask, dialog } = useConfirm();
  const [list, setList] = useState<ConfigChange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<ConfigChange[]>('/developer/system/history')
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [api]);
  useEffect(load, [load]);
  const page = usePagination(list, 6);

  const describe = (c: ConfigChange) =>
    (Object.keys(SETTING) as (keyof ConfigState)[])
      .filter((k) => c.before[k] !== c.after[k])
      .map((k) => `${SETTING[k]} ${c.after[k] ? 'on' : 'off'}`)
      .join(', ') || 'No change';

  const undo = (c: ConfigChange) =>
    ask(
      <>
        Put the settings back to how they were before this change? (
        {(Object.keys(SETTING) as (keyof ConfigState)[]).map((k) => `${SETTING[k]} ${c.before[k] ? 'on' : 'off'}`).join(', ')})
      </>,
      async () => {
        try {
          await api(`/developer/system/history/${c.id}/rollback`, { method: 'POST' });
          load();
          void sync.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
      { title: 'Undo this change?', confirmLabel: 'Undo', tone: 'primary' },
    );

  return (
    <Card>
      <CardHead title="Settings history" sub="Every change on System Management, newest first. Undo puts the settings back to before that change." />
      {error ? (
        <div className="card-pad">
          <Banner tone="danger" title="Something went wrong">
            {error}
          </Banner>
        </div>
      ) : null}
      {list.length ? (
        <>
          <table>
            <thead>
              <tr>
                <th>Change</th>
                <th>By</th>
                <th>When</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {page.items.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.kind === 'rollback' ? <Badge label="Undo" color={colors.accent} soft={colors.accentSoft} /> : null} {describe(c)}
                  </td>
                  <td className="cell-sub">{c.changedByEmail}</td>
                  <td className="cell-sub">{when(c.createdAt)}</td>
                  <td>
                    <Button small variant="ghost" onClick={() => undo(c)}>
                      Undo
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="card-pad">
            <Pagination {...page} />
          </div>
        </>
      ) : (
        <EmptyState title="No changes yet">Changes made on System Management from now on are listed here.</EmptyState>
      )}
      {dialog}
    </Card>
  );
}

function BackupsCard() {
  const api = useApi();
  const { sync } = useApp();
  const { ask, dialog } = useConfirm();
  const [list, setList] = useState<Backup[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(() => {
    api<Backup[]>('/developer/backups')
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [api]);
  useEffect(load, [load]);

  const create = async () => {
    setBusy('create');
    setError(null);
    try {
      const b = await api<Backup>('/developer/backups', { method: 'POST', json: {} });
      setNotice(`Backup saved: ${b.collections.reduce((n, c) => n + c.count, 0)} records, ${size(b.sizeBytes)}.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const restore = (b: Backup) =>
    ask(
      <>
        Replace everything in the database with the backup from <strong>{when(b.createdAt)}</strong>? Reports, accounts, cases and messages made after it will be
        gone. A backup of the database as it is now is taken first, so this can be undone. Admin accounts are kept as they are.
      </>,
      async () => {
        setBusy(b.id);
        setError(null);
        try {
          await api(`/developer/backups/${b.id}/restore`, { method: 'POST' });
          setNotice(`Restored the backup from ${when(b.createdAt)}. The state before the restore was saved as a new backup.`);
          load();
          void sync.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(null);
        }
      },
      { title: 'Restore this backup?', confirmLabel: 'Yes, restore', tone: 'danger' },
    );

  const remove = (b: Backup) =>
    ask(<>Delete the backup from {when(b.createdAt)}? It cannot be restored afterwards.</>, async () => {
      try {
        await api(`/developer/backups/${b.id}`, { method: 'DELETE' });
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }, { title: 'Delete backup?', confirmLabel: 'Delete', tone: 'danger' });

  return (
    <Card>
      <CardHead
        title="Database backups"
        sub="A full copy of the database, kept privately inside it. Take one before big changes; restore it if something breaks."
        actions={
          <Button disabled={busy !== null} onClick={() => void create()}>
            {busy === 'create' ? 'Backing up…' : 'Back up now'}
          </Button>
        }
      />
      <div className="card-pad" style={{ paddingTop: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error ? (
          <Banner tone="danger" title="Something went wrong">
            {error}
          </Banner>
        ) : null}
        {notice ? (
          <Banner tone="success" title="Done">
            {notice}
          </Banner>
        ) : null}
      </div>
      {list.length ? (
        <table>
          <thead>
            <tr>
              <th>Backup</th>
              <th>Contents</th>
              <th>Size</th>
              <th>Taken</th>
              <th style={{ width: 190 }} />
            </tr>
          </thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id}>
                <td>
                  <div className="cell-title">{b.label}</div>
                  <div className="cell-sub">
                    {b.kind === 'before_restore' ? 'Automatic, before a restore' : `by ${b.createdByEmail ?? 'admin'}`}
                    {b.restoredAt ? ` · restored ${when(b.restoredAt)}` : ''}
                  </div>
                </td>
                <td className="cell-sub" title={b.collections.map((c) => `${c.name}: ${c.count}`).join('\n')}>
                  {b.collections.reduce((n, c) => n + c.count, 0).toLocaleString()} records in {b.collections.length} collections
                </td>
                <td className="cell-sub">{size(b.sizeBytes)}</td>
                <td className="cell-sub">{when(b.createdAt)}</td>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    <Button small variant="secondary" disabled={busy !== null} onClick={() => restore(b)}>
                      {busy === b.id ? 'Restoring…' : 'Restore'}
                    </Button>
                    <Button small variant="ghost" disabled={busy !== null} onClick={() => remove(b)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title="No backups yet">Click "Back up now" to take the first one.</EmptyState>
      )}
      {dialog}
    </Card>
  );
}
