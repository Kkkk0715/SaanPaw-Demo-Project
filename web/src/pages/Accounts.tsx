import { useCallback, useEffect, useMemo, useState } from 'react';
import { colors, useApp } from '@saanpaw/shared';
import { Badge, Banner, Button, Card, CardHead, EmptyState, Modal, Pagination, Tabs, useConfirm, usePagination } from '@/components/ui';
import { RecoverAccountButton } from '@/components/RecoverAccount';
import { useApi } from '@/lib/useApi';

interface Admin {
  id: string;
  email: string;
  name: string;
  disabled: boolean;
  createdAt?: string;
  lastLoginAt?: string;
  createdByEmail?: string;
  isYou: boolean;
}
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '—');

/** User accounts (search, recover) and the console's own admin accounts. */
export function AccountsPage() {
  const [tab, setTab] = useState<'users' | 'admins'>('users');
  return (
    <>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { label: 'Users', value: 'users' },
          { label: 'Admin accounts', value: 'admins' },
        ]}
      />
      {tab === 'users' ? <UsersPanel /> : <AdminsPanel />}
    </>
  );
}

function UsersPanel() {
  const { users } = useApp();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'banned'>('all');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users
      .filter((u) => (filter === 'banned' ? u.isBanned : true))
      .filter((u) => !needle || [u.fullName, u.email, u.phone, u.barangay].some((v) => v?.toLowerCase().includes(needle)));
  }, [users, q, filter]);
  const page = usePagination(list, 15, `${q}${filter}`);

  return (
    <Card>
      <CardHead
        title="Users"
        sub={`${users.length} accounts · ${users.filter((u) => u.isBanned).length} banned · Recover helps someone who is banned or locked out`}
        actions={<input className="table-search" placeholder="Search name, email, phone, barangay" value={q} onChange={(e) => setQ(e.target.value)} />}
      />
      <div className="card-pad" style={{ paddingTop: 0 }}>
        <Tabs
          value={filter}
          onChange={setFilter}
          options={[
            { label: 'All users', value: 'all' },
            { label: 'Banned', value: 'banned' },
          ]}
        />
      </div>
      {list.length ? (
        <>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Barangay</th>
                <th>Joined</th>
                <th>Status</th>
                <th style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {page.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="cell-title">{u.fullName}</div>
                    <div className="cell-sub">{u.phone}</div>
                  </td>
                  <td>{u.email}</td>
                  <td>{u.barangay}</td>
                  <td className="cell-sub">{day(u.joinedAt)}</td>
                  <td>
                    {u.isBanned ? <Badge label="Banned" color={colors.danger} soft={colors.dangerSoft} /> : <Badge label="Active" />}
                  </td>
                  <td>
                    <RecoverAccountButton kind="user" id={u.id} name={u.fullName} blocked={Boolean(u.isBanned)} />
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
        <EmptyState title="No users match">Try a different search.</EmptyState>
      )}
    </Card>
  );
}

function AdminsPanel() {
  const api = useApi();
  const { ask, dialog } = useConfirm();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api<Admin[]>('/developer/admins')
      .then((a) => {
        setAdmins(a);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [api]);
  useEffect(load, [load]);

  const toggle = (a: Admin) =>
    ask(
      a.disabled ? (
        <>Give <strong>{a.email}</strong> access to the console again?</>
      ) : (
        <>Turn off <strong>{a.email}</strong>&apos;s access? They are signed out and cannot sign in until access is turned back on.</>
      ),
      async () => {
        try {
          await api(`/developer/admins/${a.id}`, { method: 'PATCH', json: { disabled: !a.disabled } });
          load();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
      { title: a.disabled ? 'Turn access back on?' : 'Turn off access?', confirmLabel: a.disabled ? 'Turn on' : 'Turn off', tone: a.disabled ? 'primary' : 'danger' },
    );

  return (
    <Card>
      <CardHead
        title="Admin accounts"
        sub="Everyone who can sign in to this console. A new admin gets a one-time password by email, then sets their own with Forgot password."
        actions={<Button onClick={() => setAdding(true)}>Add admin</Button>}
      />
      {error ? (
        <div className="card-pad">
          <Banner tone="danger" title="Something went wrong">
            {error}
          </Banner>
        </div>
      ) : null}
      <table>
        <thead>
          <tr>
            <th>Admin</th>
            <th>Added</th>
            <th>Last sign-in</th>
            <th>Status</th>
            <th style={{ width: 130 }} />
          </tr>
        </thead>
        <tbody>
          {admins.map((a) => (
            <tr key={a.id}>
              <td>
                <div className="cell-title">
                  {a.name || a.email} {a.isYou ? <span className="cell-sub">(you)</span> : null}
                </div>
                <div className="cell-sub">{a.email}</div>
              </td>
              <td className="cell-sub">
                {day(a.createdAt)}
                {a.createdByEmail ? ` by ${a.createdByEmail}` : ''}
              </td>
              <td className="cell-sub">{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString('en-PH') : 'Never'}</td>
              <td>{a.disabled ? <Badge label="Access off" color={colors.danger} soft={colors.dangerSoft} /> : <Badge label="Active" />}</td>
              <td>
                {a.isYou ? null : (
                  <Button small variant={a.disabled ? 'secondary' : 'ghost'} onClick={() => toggle(a)}>
                    {a.disabled ? 'Turn on' : 'Turn off'}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {adding ? <AddAdminModal onClose={() => setAdding(false)} onAdded={load} /> : null}
      {dialog}
    </Card>
  );
}

function AddAdminModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const api = useApi();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ sent: boolean } | null>(null);

  const submit = async () => {
    if (name.trim().length < 2) return setError('Enter their name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError('Enter a valid email address.');
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ email: { sent: boolean } }>('/developer/admins', { method: 'POST', json: { name: name.trim(), email: email.trim() } });
      setDone({ sent: res.email?.sent ?? false });
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Add an admin"
      sub="They can do everything you can in this console."
      onClose={onClose}
      actions={
        done ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void submit()}>
              {busy ? 'Adding…' : 'Add admin'}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <Banner tone={done.sent ? 'success' : 'warning'} title={done.sent ? 'Admin added' : 'Admin added, email not sent yet'}>
          {done.sent
            ? `${email} was emailed a one-time password. They should set their own with "Forgot password" on the sign-in page.`
            : 'The email with their one-time password is queued and will be retried. They can also use "Forgot password" on the sign-in page.'}
        </Banner>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label htmlFor="admin-name">Name</label>
            <input id="admin-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Dela Cruz" />
          </div>
          <div className="field">
            <label htmlFor="admin-email">Email</label>
            <input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          {error ? (
            <Banner tone="danger" title="Check the details">
              {error}
            </Banner>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
