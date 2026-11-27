import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { facebookConfig } from './facebook.service';

/**
 * "Continue with Facebook" and "Continue with Google": sign in, sign up, or connect the account
 * to an existing SaanPaw user. The phone opens the provider's page in the browser; the provider
 * sends the browser back to the API's callback, which sends it on into the app
 * (saanpaw://facebook or saanpaw://google). Sessions are never put in that link - it carries a
 * one-use ticket valid for two minutes, which the app swaps for a session over HTTPS.
 *
 * Setup (Vercel, API project):
 *  - Facebook: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET;
 *    redirect URI <PUBLIC_API_URL>/api/v1/auth/facebook/callback
 *  - Google:   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (OAuth client of type "Web application");
 *    redirect URI <PUBLIC_API_URL>/api/v1/auth/google/callback
 */
export type Provider = 'facebook' | 'google';
export const PROVIDERS: Provider[] = ['facebook', 'google'];
export const PROVIDER_LABEL: Record<Provider, string> = { facebook: 'Facebook', google: 'Google' };

const googleConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID ?? '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
};

export function providerEnabled(p: Provider): boolean {
  return p === 'facebook'
    ? Boolean(facebookConfig.appId && facebookConfig.appSecret)
    : Boolean(googleConfig.clientId && googleConfig.clientSecret);
}

export const callbackUrl = (p: Provider) => `${facebookConfig.publicApiUrl}/api/v1/auth/${p}/callback`;
/** Where the browser goes back into the app. */
export const appReturnUrl = (p: Provider) =>
  p === 'facebook' ? facebookConfig.appReturnUrl : (process.env.APP_RETURN_URL_GOOGLE ?? 'saanpaw://google');

export type SocialState =
  | { purpose: 'link'; userId: string; provider: Provider }
  | { purpose: 'register'; provider: Provider }
  | { purpose: 'login'; provider: Provider };

export interface SocialProfile {
  provider: Provider;
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  /** Only Google says the address is verified; a Facebook address is still checked by code. */
  emailVerified: boolean;
}

const sign = (payload: object, expiresIn: string) =>
  jwt.sign(payload, env.jwtSecret, { expiresIn, algorithm: 'HS256' } as SignOptions);
function verify<T>(token: string, kind: string, message: string): T {
  try {
    const d = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] }) as T & { kind?: string };
    if (d.kind !== kind) throw new Error('wrong token');
    return d;
  } catch {
    throw ApiError.badRequest(message);
  }
}

/** The provider's sign-in page to open. `state` is signed, so the callback can trust it. */
export function socialLoginUrl(state: SocialState): string {
  const p = state.provider;
  if (!providerEnabled(p)) throw new ApiError(503, `${PROVIDER_LABEL[p]} sign-in is not set up for SaanPaw yet.`);
  const signed = sign({ ...state, kind: 'social_state' }, '10m');
  if (p === 'facebook') {
    return `https://www.facebook.com/v19.0/dialog/oauth?${new URLSearchParams({
      client_id: facebookConfig.appId,
      redirect_uri: callbackUrl(p),
      state: signed,
      scope: 'public_profile,email',
      response_type: 'code',
    })}`;
  }
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: googleConfig.clientId,
    redirect_uri: callbackUrl(p),
    state: signed,
    scope: 'openid email profile',
    response_type: 'code',
    prompt: 'select_account',
  })}`;
}

export function readSocialState(state: string, provider: Provider): SocialState {
  const s = verify<SocialState>(state, 'social_state', 'The sign-in took too long or was not started from SaanPaw. Try again.');
  if (s.provider !== provider) throw ApiError.badRequest('The sign-in came back from the wrong provider. Try again.');
  return s;
}

/** Swaps the code the provider sent back for the person's profile. */
export async function socialProfile(provider: Provider, code: string): Promise<SocialProfile> {
  const refused = () => ApiError.badRequest(`${PROVIDER_LABEL[provider]} did not accept the sign-in. Try again.`);
  if (provider === 'facebook') {
    const GRAPH = 'https://graph.facebook.com/v19.0';
    const tokenRes = await fetch(
      `${GRAPH}/oauth/access_token?${new URLSearchParams({
        client_id: facebookConfig.appId,
        client_secret: facebookConfig.appSecret,
        redirect_uri: callbackUrl(provider),
        code,
      })}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const { access_token } = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
    if (!tokenRes.ok || !access_token) throw refused();
    const meRes = await fetch(
      `${GRAPH}/me?fields=id,name,first_name,last_name,email&access_token=${encodeURIComponent(access_token)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const me = (await meRes.json().catch(() => ({}))) as Record<string, string | undefined>;
    if (!me.id) throw ApiError.badRequest('Could not read your Facebook profile.');
    return {
      provider,
      id: me.id,
      name: me.name ?? 'Facebook user',
      firstName: me.first_name,
      lastName: me.last_name,
      email: me.email?.toLowerCase(),
      emailVerified: false,
    };
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: googleConfig.clientId,
      client_secret: googleConfig.clientSecret,
      redirect_uri: callbackUrl(provider),
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const { access_token } = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
  if (!tokenRes.ok || !access_token) throw refused();
  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const info = (await infoRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!info.sub) throw ApiError.badRequest('Could not read your Google profile.');
  return {
    provider,
    id: String(info.sub),
    name: String(info.name ?? info.email ?? 'Google user'),
    firstName: typeof info.given_name === 'string' ? info.given_name : undefined,
    lastName: typeof info.family_name === 'string' ? info.family_name : undefined,
    email: typeof info.email === 'string' ? info.email.toLowerCase() : undefined,
    emailVerified: info.email_verified === true,
  };
}

/** Sign-up with a provider: the profile travels with the new account's form (30 minutes). */
export function signSocialRegistration(profile: SocialProfile) {
  return sign({ ...profile, kind: 'social_register' }, '30m');
}
export function readSocialRegistration(token: string): SocialProfile {
  const d = verify<SocialProfile>(token, 'social_register', 'The Google or Facebook sign-up expired. Start again, or register without it.');
  return {
    provider: d.provider,
    id: d.id,
    name: d.name,
    firstName: d.firstName,
    lastName: d.lastName,
    email: d.email,
    emailVerified: Boolean(d.emailVerified),
  };
}

/** Sign-in: a two-minute ticket the app swaps for a session (never a session in a link). */
export function signLoginTicket(userId: string) {
  return sign({ userId, kind: 'social_ticket', jti: crypto.randomBytes(12).toString('hex') }, '2m');
}
const usedTickets = new Map<string, number>();
export function readLoginTicket(ticket: string): string {
  const d = verify<{ userId: string; jti: string; exp: number }>(ticket, 'social_ticket', 'That sign-in has expired. Try again.');
  // One use per ticket (per server instance; it expires in two minutes anyway).
  const now = Date.now();
  for (const [k, exp] of usedTickets) if (exp < now) usedTickets.delete(k);
  if (usedTickets.has(d.jti)) throw ApiError.badRequest('That sign-in was already used. Try again.');
  usedTickets.set(d.jti, d.exp * 1000);
  return d.userId;
}
