import { env } from '../src/config/env';
import { csrfGuard, forceHttps, objectIdParam, stripOperators } from '../src/middleware/security';
import {
  flagStatusQuerySchema,
  forgotPasswordSchema,
  pushTokenSchema,
  reportStatusSchema,
  resolveFlagSchema,
  reviewShelterSchema,
} from '../src/utils/validation';
import { accountActionEmail, shelterCredentialsEmail } from '../src/services/email.service';
import { resolveApiBase } from '../../shared/src/api';

/** A tiny stand-in for Express's req/res, enough to see what a middleware decided. */
function run(mw: (req: any, res: any, next: () => void) => void, req: Record<string, unknown>) {
  const out = { status: 200, body: undefined as unknown, redirect: undefined as string | undefined, nextCalled: false };
  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json(body: unknown) {
      out.body = body;
      return this;
    },
    redirect(code: number, url: string) {
      out.status = code;
      out.redirect = url;
    },
  };
  mw({ headers: {}, method: 'GET', originalUrl: '/', ...req }, res, () => {
    out.nextCalled = true;
  });
  return out;
}

describe('NoSQL injection: operators are removed from client input', () => {
  it('drops $-keys and dotted keys at any depth, keeps normal values', () => {
    const body = stripOperators({
      email: { $ne: '' },
      password: 'Passw0rd!',
      nested: { ok: 1, 'a.b': 2, deeper: [{ $where: 'sleep(1000)', keep: 'x' }] },
    });
    expect(body).toEqual({ email: {}, password: 'Passw0rd!', nested: { ok: 1, deeper: [{ keep: 'x' }] } });
  });

  it('cannot be used to pollute prototypes', () => {
    const body = stripOperators(JSON.parse('{"__proto__": {"admin": true}, "constructor": {"x": 1}, "name": "a"}'));
    expect(Object.keys(body)).toEqual(['name']);
    expect(({} as { admin?: boolean }).admin).toBeUndefined();
  });

  it('a form then refuses the emptied field instead of matching every account', () => {
    const body = stripOperators({ role: 'user', email: { $gt: '' } });
    expect(forgotPasswordSchema.safeParse(body).success).toBe(false);
  });

  it('an :id that is not a database id never reaches a query', () => {
    expect(() => objectIdParam({} as never, {} as never, () => {}, '{"$ne":null}')).toThrow('Invalid id');
    let passed = false;
    objectIdParam({} as never, {} as never, () => (passed = true), '6650f1a2b3c4d5e6f7a8b9c0');
    expect(passed).toBe(true);
  });
});

describe('HTTPS is required in production', () => {
  const was = env.isProduction;
  afterAll(() => {
    env.isProduction = was;
  });

  it('redirects a plain-http GET and refuses a plain-http write', () => {
    env.isProduction = true;
    const get = run(forceHttps, { headers: { 'x-forwarded-proto': 'http', host: 'saanpaw-api.vercel.app' }, originalUrl: '/api/v1/health' });
    expect(get.status).toBe(308);
    expect(get.redirect).toBe('https://saanpaw-api.vercel.app/api/v1/health');
    const post = run(forceHttps, { method: 'POST', headers: { 'x-forwarded-proto': 'http', host: 'x' } });
    expect(post.status).toBe(403);
    expect(post.nextCalled).toBe(false);
  });

  it('lets https through', () => {
    env.isProduction = true;
    expect(run(forceHttps, { method: 'POST', headers: { 'x-forwarded-proto': 'https' } }).nextCalled).toBe(true);
  });

  it('the apps upgrade a public http:// API address to https://, but keep local development addresses', () => {
    expect(resolveApiBase('http://saanpaw-api.vercel.app/api/v1')).toBe('https://saanpaw-api.vercel.app/api/v1');
    expect(resolveApiBase('http://localhost:4001/api/v1')).toBe('http://localhost:4001/api/v1');
    expect(resolveApiBase('http://192.168.1.20:4001/api/v1')).toBe('http://192.168.1.20:4001/api/v1');
    expect(resolveApiBase('https://saanpaw-api.vercel.app/api/v1')).toBe('https://saanpaw-api.vercel.app/api/v1');
  });
});

describe('CSRF guard', () => {
  const was = [...env.corsOrigins];
  beforeAll(() => {
    env.corsOrigins.splice(0, env.corsOrigins.length, 'https://saanpaw-console.vercel.app');
  });
  afterAll(() => {
    env.corsOrigins.splice(0, env.corsOrigins.length, ...was);
  });

  it('refuses a write sent from another website', () => {
    const r = run(csrfGuard, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json', 'content-length': '10' } });
    expect(r.status).toBe(403);
    expect(r.nextCalled).toBe(false);
  });

  it('refuses a cross-site HTML form body (urlencoded / text/plain)', () => {
    for (const type of ['application/x-www-form-urlencoded', 'text/plain']) {
      const r = run(csrfGuard, { method: 'POST', headers: { 'content-type': type, 'content-length': '20' } });
      expect(r.status).toBe(415);
    }
  });

  it('allows the console, the mobile apps (no Origin), file uploads and reads', () => {
    const json = { 'content-type': 'application/json', 'content-length': '10' };
    expect(run(csrfGuard, { method: 'PATCH', headers: { ...json, origin: 'https://saanpaw-console.vercel.app' } }).nextCalled).toBe(true);
    expect(run(csrfGuard, { method: 'POST', headers: json }).nextCalled).toBe(true);
    expect(run(csrfGuard, { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': '99' } }).nextCalled).toBe(true);
    expect(run(csrfGuard, { method: 'DELETE', headers: {} }).nextCalled).toBe(true);
    expect(run(csrfGuard, { method: 'GET', headers: { origin: 'https://evil.example' } }).nextCalled).toBe(true);
  });
});

describe('Server-side checks for inputs that used to be checked only by hand', () => {
  it('push tokens must be real Expo tokens', () => {
    expect(pushTokenSchema.safeParse({ token: 'ExponentPushToken[abc123_DEF-xyz]' }).success).toBe(true);
    expect(pushTokenSchema.safeParse({ token: '<script>alert(1)</script>' }).success).toBe(false);
    expect(pushTokenSchema.safeParse({ token: { $ne: '' } }).success).toBe(false);
  });

  it('report status, flag status and flag actions only accept their known values', () => {
    expect(reportStatusSchema.safeParse({ status: 'closed' }).success).toBe(true);
    expect(reportStatusSchema.safeParse({ status: 'deleted' }).success).toBe(false);
    expect(flagStatusQuerySchema.safeParse({ status: { $ne: 'open' } }).success).toBe(false);
    expect(flagStatusQuerySchema.parse({}).status).toBeUndefined();
    expect(resolveFlagSchema.safeParse({ action: 'remove_report' }).success).toBe(true);
    expect(resolveFlagSchema.safeParse({ action: 'drop_database' }).success).toBe(false);
  });

  it('a shelter review cannot smuggle in other fields such as another developer id', () => {
    const parsed = reviewShelterSchema.parse({ decision: 'approve', developerId: 'someone-else', shelterId: 'x' });
    expect(parsed).toEqual({ decision: 'approve' });
  });
});

describe('XSS: names and reasons are escaped in emails', () => {
  it('escapes a shelter name and an admin reason', () => {
    const approved = shelterCredentialsEmail({
      shelterName: '<img src=x onerror=alert(1)>',
      email: 'a@b.com',
      password: 'Abc123!@#',
    } as never);
    expect(approved.html).not.toContain('<img src=x');
    expect(approved.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    const action = accountActionEmail({ action: 'user_banned', name: 'Ana', email: 'a@b.com', reason: '<script>x</script>' } as never);
    expect(action.html).not.toContain('<script>');
  });
});
