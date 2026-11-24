import { useState } from 'react';
import { useApp } from '@saanpaw/shared';
import { Banner, Button, Modal } from './ui';
import { useApi } from '@/lib/useApi';

/**
 * "Recover account": lifts a ban (user) or restores a revoked/rejected shelter, and can email a
 * password-reset code, for someone locked out of their account.
 */
export function RecoverAccountButton({ kind, id, name, blocked }: { kind: 'user' | 'shelter'; id: string; name: string; blocked: boolean }) {
  const api = useApi();
  const { sync } = useApp();
  const [open, setOpen] = useState(false);
  const [sendReset, setSendReset] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ restored: boolean; resetSent: boolean }>(`/developer/${kind === 'user' ? 'users' : 'shelters'}/${id}/recover`, {
        method: 'POST',
        json: { sendReset, note: note.trim() || undefined },
      });
      setResult(
        [
          res.restored ? (kind === 'user' ? 'The ban was lifted and their reports are visible again.' : 'The shelter was restored and approved.') : 'The account was already active.',
          res.resetSent ? 'A password-reset code was emailed to them.' : 'No reset code was sent.',
        ].join(' '),
      );
      void sync.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant={blocked ? 'primary' : 'secondary'} small onClick={() => setOpen(true)}>
        Recover account
      </Button>
      {open ? (
        <Modal
          title={`Recover ${name}'s account`}
          sub={blocked ? (kind === 'user' ? 'This account is banned.' : 'This shelter cannot sign in right now.') : 'For someone who cannot get into their account.'}
          onClose={() => {
            setOpen(false);
            setResult(null);
          }}
          actions={
            result ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={busy} onClick={() => void run()}>
                  {busy ? 'Recovering…' : 'Recover account'}
                </Button>
              </>
            )
          }
        >
          {result ? (
            <Banner tone="success" title="Account recovered">
              {result}
            </Banner>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0 }}>
                {blocked
                  ? kind === 'user'
                    ? 'Recovering lifts the ban, shows their reports again (except ones removed by moderation) and emails them.'
                    : 'Recovering restores the shelter to approved, so it can sign in and receive alerts again, and emails it.'
                  : 'Their account is active. Recovering emails them that you helped, and can send a code to set a new password.'}
              </p>
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={sendReset} onChange={(e) => setSendReset(e.target.checked)} />
                Email them a code to set a new password
              </label>
              <div className="field">
                <label htmlFor="recover-note">Note to include in the email (optional)</label>
                <textarea id="recover-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              {error ? (
                <Banner tone="danger" title="Could not recover the account">
                  {error}
                </Banner>
              ) : null}
            </div>
          )}
        </Modal>
      ) : null}
    </>
  );
}
