import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

/**
 * Facebook: connect an account (Facebook Login) and share reports to it.
 *
 * Facebook no longer lets apps post to a person's timeline on their behalf, so "post to Facebook"
 * opens Facebook's own share window with the report's link (photo, title and description come
 * from the link's preview); the person taps Post. Connecting the account shows their Facebook
 * name on their profile and is needed for nothing else.
 *
 * Needs FACEBOOK_APP_ID and FACEBOOK_APP_SECRET on the API, and this redirect URI added to the
 * Facebook app's "Valid OAuth Redirect URIs": <PUBLIC_API_URL>/api/v1/auth/facebook/callback
 */
const GRAPH = 'https://graph.facebook.com/v19.0';
export const facebookConfig = {
  appId: process.env.FACEBOOK_APP_ID ?? '',
  appSecret: process.env.FACEBOOK_APP_SECRET ?? '',
  publicApiUrl: (process.env.PUBLIC_API_URL ?? 'https://api.saanpaw.online').replace(/\/+$/, ''),
  consoleUrl: (process.env.CONSOLE_URL ?? 'https://www.saanpaw.online').replace(/\/+$/, ''),
  /** Where the browser goes back to after Facebook: the app's own link scheme. */
  appReturnUrl: process.env.APP_RETURN_URL ?? 'saanpaw://facebook',
};
export const facebookEnabled = () => Boolean(facebookConfig.appId && facebookConfig.appSecret);
const redirectUri = () => `${facebookConfig.publicApiUrl}/api/v1/auth/facebook/callback`;

type FacebookState = { purpose: 'link'; userId: string } | { purpose: 'register' };

/** The Facebook sign-in page to open; `state` is signed so the callback can trust it. */
export function facebookLoginUrl(state: FacebookState): string {
  if (!facebookEnabled()) throw new ApiError(503, 'Facebook is not set up for SaanPaw yet.');
  const signed = jwt.sign({ ...state, kind: 'fb_state' }, env.jwtSecret, { expiresIn: '10m', algorithm: 'HS256' });
  const params = new URLSearchParams({
    client_id: facebookConfig.appId,
    redirect_uri: redirectUri(),
    state: signed,
    scope: 'public_profile',
    response_type: 'code',
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
}

export function readState(state: string): FacebookState {
  try {
    const decoded = jwt.verify(state, env.jwtSecret, { algorithms: ['HS256'] }) as FacebookState & { kind?: string };
    if (decoded.kind !== 'fb_state') throw new Error('wrong token');
    return decoded;
  } catch {
    throw ApiError.badRequest('The Facebook sign-in took too long or was not started from SaanPaw. Try again.');
  }
}

/** Swaps the code Facebook sent back for the person's Facebook id and name. */
export async function facebookProfile(code: string): Promise<{ id: string; name: string }> {
  const tokenUrl = `${GRAPH}/oauth/access_token?${new URLSearchParams({
    client_id: facebookConfig.appId,
    client_secret: facebookConfig.appSecret,
    redirect_uri: redirectUri(),
    code,
  })}`;
  const tokenRes = await fetch(tokenUrl, { signal: AbortSignal.timeout(10_000) });
  if (!tokenRes.ok) throw ApiError.badRequest('Facebook did not accept the sign-in. Try again.');
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) throw ApiError.badRequest('Facebook did not accept the sign-in. Try again.');
  const meRes = await fetch(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(access_token)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const me = (await meRes.json()) as { id?: string; name?: string };
  if (!me.id) throw ApiError.badRequest('Could not read your Facebook profile.');
  return { id: me.id, name: me.name ?? 'Facebook user' };
}

/** Registration: the Facebook account is attached once the SaanPaw account exists. */
export function signRegistrationToken(profile: { id: string; name: string }) {
  return jwt.sign({ ...profile, kind: 'fb_register' }, env.jwtSecret, { expiresIn: '30m', algorithm: 'HS256' });
}
export function readRegistrationToken(token: string): { id: string; name: string } {
  try {
    const d = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] }) as { id: string; name: string; kind?: string };
    if (d.kind !== 'fb_register') throw new Error('wrong token');
    return { id: d.id, name: d.name };
  } catch {
    throw ApiError.badRequest('The Facebook connection expired. Connect Facebook again or register without it.');
  }
}
