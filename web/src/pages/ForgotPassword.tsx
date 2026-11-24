import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { passwordMeetsRules, PASSWORD_RULES } from '@saanpaw/shared';
import { Banner, Button, PasswordInput } from '@/components/ui';
import { apiRequest } from '@/lib/api';

/**
 * Admin password recovery: email -> 6-digit code (10 minutes) -> new password, the same three
 * steps as the mobile apps. The new-password step only appears once the code is accepted.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'code' | 'password' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [resendAt, setResendAt] = useState<number>(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = expiresAt ? Math.max(0, Math.round((expiresAt - now) / 1000)) : 0;
  const resendIn = Math.max(0, Math.round((resendAt - now) / 1000));
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) throw new Error('Enter the email of your admin account.');
      const res = await apiRequest<{ expiresAt: string; resendAfterSeconds: number }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ role: 'developer', email: email.trim() }),
      });
      setExpiresAt(new Date(res.expiresAt).getTime());
      setResendAt(Date.now() + res.resendAfterSeconds * 1000);
      setCode('');
      setStep('code');
    });

  const verify = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!/^\d{6}$/.test(code.trim())) throw new Error('Enter the 6-digit code from the email.');
      if (left <= 0) throw new Error('That code has expired. Send a new one.');
      const res = await apiRequest<{ resetToken: string }>('/auth/verify-reset-code', {
        method: 'POST',
        body: JSON.stringify({ role: 'developer', email: email.trim(), code: code.trim() }),
      });
      setToken(res.resetToken);
      setStep('password');
    });
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!passwordMeetsRules(password)) throw new Error('The new password does not meet all the rules yet.');
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ role: 'developer', email: email.trim(), resetToken: token, newPassword: password }),
      });
      setStep('done');
    });
  };

  return (
    <div className="login-page">
      <form
        className="login-card"
        onSubmit={
          step === 'email'
            ? (e) => {
                e.preventDefault();
                void sendCode();
              }
            : step === 'code'
              ? verify
              : save
        }
      >
        <button type="button" className="login-back" onClick={() => navigate('/login')}>
          &larr; Back to sign in
        </button>
        <div>
          <h1>Reset admin password</h1>
          <p className="sub">
            {step === 'email'
              ? 'Enter the email you sign in with. We will send a 6-digit code.'
              : step === 'code'
                ? `Enter the code sent to ${email.trim()}.`
                : step === 'password'
                  ? 'Code accepted. Choose a new password.'
                  : 'Your password was changed.'}
          </p>
        </div>
        {error ? (
          <Banner tone="danger" title="Something went wrong">
            {error}
          </Banner>
        ) : null}

        {step === 'email' ? (
          <>
            <div className="field">
              <label htmlFor="fp-email">Email address</label>
              <input id="fp-email" type="email" value={email} autoComplete="username" onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </Button>
          </>
        ) : step === 'code' ? (
          <>
            <div className="field">
              <label htmlFor="fp-code">6-digit code</label>
              <input id="fp-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </div>
            <p className="sub" style={{ margin: 0 }}>
              {left > 0 ? `Code expires in ${mmss(left)}` : 'The code has expired.'} ·{' '}
              {resendIn > 0 ? (
                `Resend in ${mmss(resendIn)}`
              ) : (
                <a href="#" onClick={(e) => (e.preventDefault(), void sendCode())}>
                  Send a new code
                </a>
              )}
            </p>
            <Button type="submit" disabled={busy || left <= 0}>
              {busy ? 'Checking…' : 'Verify code'}
            </Button>
          </>
        ) : step === 'password' ? (
          <>
            <div className="field">
              <label htmlFor="fp-new">New password</label>
              <PasswordInput id="fp-new" value={password} onChange={setPassword} autoComplete="new-password" />
            </div>
            <ul className="rules">
              {PASSWORD_RULES.map((r) => (
                <li key={r.label} className={r.test(password) ? 'ok' : ''}>
                  {r.test(password) ? '✓' : '○'} {r.label}
                </li>
              ))}
            </ul>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Change password'}
            </Button>
          </>
        ) : (
          <Button onClick={() => navigate('/login')}>Sign in</Button>
        )}
      </form>
    </div>
  );
}
