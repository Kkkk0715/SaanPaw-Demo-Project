import { useCallback, useEffect, useState } from 'react';
import { colors } from '@saanpaw/shared';
import { Badge, Banner, Button, Card, CardHead, EmptyState, Modal, Pagination, Tabs, usePagination } from '@/components/ui';
import { useApi } from '@/lib/useApi';

type Status = 'open' | 'in_progress' | 'resolved' | 'closed';
interface Ticket {
  id: string;
  ref: string;
  requesterType: 'user' | 'shelter';
  requesterName: string;
  requesterEmail?: string;
  subject: string;
  category: string;
  status: Status;
  priority: 'low' | 'normal' | 'high';
  messages: { id: string; authorType: 'user' | 'shelter' | 'admin'; authorName: string; body: string; at: string }[];
  unread: number;
  createdAt: string;
  lastActivityAt: string;
}

export const ticketStatusMeta: Record<Status, { label: string; color: string; soft: string }> = {
  open: { label: 'Open', color: colors.danger, soft: colors.dangerSoft },
  in_progress: { label: 'In progress', color: colors.accent, soft: colors.accentSoft },
  resolved: { label: 'Resolved', color: colors.primary, soft: colors.primarySoft },
  closed: { label: 'Closed', color: colors.muted, soft: colors.surfaceAlt },
};
const CATEGORY: Record<string, string> = {
  account: 'Account',
  report: 'Report',
  shelter: 'Shelter',
  app_problem: 'App problem',
  suggestion: 'Suggestion',
  other: 'Other',
};
const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

/** Help & support tickets sent by users and shelters from the app, answered here. */
export function SupportPage() {
  const api = useApi();
  const [tab, setTab] = useState<'active' | Status | 'all'>('active');
  const [who, setWho] = useState<'' | 'user' | 'shelter'>('');
  const [q, setQ] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [counts, setCounts] = useState<Partial<Record<Status, number>>>({});
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        ...(tab !== 'active' && tab !== 'all' ? { status: tab } : {}),
        ...(who ? { requesterType: who } : {}),
        ...(q.trim() ? { q: q.trim() } : {}),
      });
      const res = await api<{ tickets: Ticket[]; counts: Partial<Record<Status, number>> }>(`/developer/tickets?${params}`);
      setTickets(tab === 'active' ? res.tickets.filter((t) => t.status === 'open' || t.status === 'in_progress') : res.tickets);
      setCounts(res.counts);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api, tab, who, q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const page = usePagination(tickets, 15, `${tab}${who}${q}`);
  const active = (counts.open ?? 0) + (counts.in_progress ?? 0);

  return (
    <>
      {error ? (
        <Banner tone="danger" title="Could not load tickets">
          {error}
        </Banner>
      ) : null}
      <Card>
        <CardHead
          title="Support tickets"
          sub={`${active} waiting for an answer · users and shelters open these from Help & support in the app`}
          actions={
            <input className="table-search" placeholder="Search subject, name, email or T-…" value={q} onChange={(e) => setQ(e.target.value)} />
          }
        />
        <div className="card-pad toolbar" style={{ paddingTop: 0 }}>
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { label: `Needs answer (${active})`, value: 'active' },
              { label: `Resolved (${counts.resolved ?? 0})`, value: 'resolved' },
              { label: `Closed (${counts.closed ?? 0})`, value: 'closed' },
              { label: 'All', value: 'all' },
            ]}
          />
          <select className="table-search" style={{ width: 150 }} value={who} onChange={(e) => setWho(e.target.value as typeof who)}>
            <option value="">Users and shelters</option>
            <option value="user">Users only</option>
            <option value="shelter">Shelters only</option>
          </select>
        </div>
        {tickets.length ? (
          <>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 92 }}>Ticket</th>
                  <th>Subject</th>
                  <th>From</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((t) => (
                  <tr key={t.id} onClick={() => setOpenId(t.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <b style={{ whiteSpace: 'nowrap' }}>{t.ref}</b>
                      {t.unread ? <span className="count" style={{ marginLeft: 6 }}>{t.unread}</span> : null}
                    </td>
                    <td>
                      <div className="cell-title">{t.subject}</div>
                      <div className="cell-sub">{CATEGORY[t.category] ?? t.category}</div>
                    </td>
                    <td>
                      <div className="cell-title">{t.requesterName}</div>
                      <div className="cell-sub">{t.requesterType === 'shelter' ? 'Shelter' : 'User'}</div>
                    </td>
                    <td>
                      <Badge label={ticketStatusMeta[t.status].label} color={ticketStatusMeta[t.status].color} soft={ticketStatusMeta[t.status].soft} />
                    </td>
                    <td style={{ textTransform: 'capitalize', color: t.priority === 'high' ? colors.danger : undefined }}>{t.priority}</td>
                    <td className="cell-sub">{when(t.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card-pad">
              <Pagination {...page} />
            </div>
          </>
        ) : (
          <EmptyState title="No tickets here">When a user or shelter asks for help from the app, their ticket appears in this list.</EmptyState>
        )}
      </Card>
      {openId ? <TicketModal id={openId} onClose={() => setOpenId(null)} onChanged={load} /> : null}
    </>
  );
}

function TicketModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const api = useApi();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Ticket>(`/developer/tickets/${id}`)
      .then((t) => {
        setTicket(t);
        onChanged();
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, id]);

  const send = async (status?: Status) => {
    if (!reply.trim()) {
      setError('Write a reply first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setTicket(await api<Ticket>(`/developer/tickets/${id}/messages`, { method: 'POST', json: { message: reply, status } }));
      setReply('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const patch = async (body: { status?: Status; priority?: Ticket['priority'] }) => {
    try {
      setTicket(await api<Ticket>(`/developer/tickets/${id}`, { method: 'PATCH', json: body }));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal
      title={ticket ? `${ticket.ref} · ${ticket.subject}` : 'Ticket'}
      sub={ticket ? `${ticket.requesterName} (${ticket.requesterType}) · ${ticket.requesterEmail ?? 'no email'} · opened ${when(ticket.createdAt)}` : undefined}
      onClose={onClose}
      actions={
        ticket && ticket.status !== 'closed' ? (
          <>
            <Button variant="ghost" onClick={() => void patch({ status: 'closed' })}>
              Close ticket
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void send('resolved')}>
              Reply and mark resolved
            </Button>
            <Button disabled={busy} onClick={() => void send()}>
              {busy ? 'Sending…' : 'Send reply'}
            </Button>
          </>
        ) : ticket ? (
          <Button variant="secondary" onClick={() => void patch({ status: 'open' })}>
            Reopen
          </Button>
        ) : null
      }
    >
      {error ? (
        <Banner tone="danger" title="Something went wrong">
          {error}
        </Banner>
      ) : null}
      {ticket ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="row row-wrap" style={{ gap: 10 }}>
            <Badge label={ticketStatusMeta[ticket.status].label} color={ticketStatusMeta[ticket.status].color} soft={ticketStatusMeta[ticket.status].soft} />
            <Badge label={CATEGORY[ticket.category] ?? ticket.category} color={colors.info} soft={colors.infoSoft} />
            <label className="mini-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              Status
              <select value={ticket.status} onChange={(e) => void patch({ status: e.target.value as Status })}>
                {(Object.keys(ticketStatusMeta) as Status[]).map((s) => (
                  <option key={s} value={s}>
                    {ticketStatusMeta[s].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mini-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              Priority
              <select value={ticket.priority} onChange={(e) => void patch({ priority: e.target.value as Ticket['priority'] })}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
          <div className="thread">
            {ticket.messages.map((m) => (
              <div key={m.id} className={`thread-msg ${m.authorType === 'admin' ? 'mine' : ''}`.trim()}>
                <div className="thread-meta">
                  {m.authorName} · {when(m.at)}
                </div>
                <div className="thread-body">{m.body}</div>
              </div>
            ))}
          </div>
          {ticket.status !== 'closed' ? (
            <div className="field">
              <label htmlFor="ticket-reply">Your reply (they get a notification on their phone)</label>
              <textarea id="ticket-reply" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write your answer…" />
            </div>
          ) : (
            <p className="muted">This ticket is closed. Reopen it to reply.</p>
          )}
        </div>
      ) : (
        <p className="muted">Loading…</p>
      )}
    </Modal>
  );
}
