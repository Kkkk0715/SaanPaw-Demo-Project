import { AppState, Linking } from 'react-native';
import { apiRequest } from './api';

/**
 * "Continue with Facebook / Google": sign in, sign up, or connect the account in Profile.
 * The provider's page opens in the browser; when it's done the server sends the browser back into
 * the app as saanpaw://facebook?... or saanpaw://google?..., which this waits for.
 */
export type Provider = 'facebook' | 'google';
export const PROVIDER_LABEL: Record<Provider, string> = { facebook: 'Facebook', google: 'Google' };

export interface SocialResult {
  provider: Provider;
  /**
   * connected      - account connected (Profile), or details ready for sign-up (`token`)
   * signed_in      - an existing SaanPaw account: swap `ticket` for a session
   * not_registered - signed in with the provider, but no SaanPaw account yet: sign up (`token`)
   */
  status: 'connected' | 'signed_in' | 'not_registered' | 'cancelled' | 'error';
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  /** Google confirmed this email address, so the emailed code can be skipped. */
  emailVerified?: boolean;
  /** Sign-up: proof of the provider profile, sent with the new account. */
  token?: string;
  ticket?: string;
  message?: string;
}
/** Kept for screens written for the Facebook-only version. */
export type FacebookResult = SocialResult;

/** Which providers the server has set up (buttons for the others stay hidden). */
export async function socialAvailability(): Promise<Record<Provider, boolean>> {
  try {
    const r = await apiRequest<{ facebook?: boolean; google?: boolean; enabled?: boolean }>('/auth/social/status');
    return { facebook: Boolean(r.facebook ?? r.enabled), google: Boolean(r.google) };
  } catch {
    try {
      const r = await apiRequest<{ enabled: boolean }>('/auth/facebook/status');
      return { facebook: Boolean(r.enabled), google: false };
    } catch {
      return { facebook: false, google: false };
    }
  }
}
export const facebookAvailable = async () => (await socialAvailability()).facebook;

function parseReturn(url: string): SocialResult | null {
  const m = /^saanpaw:\/\/(facebook|google)\b/.exec(url);
  if (!m) return null;
  const query = url.split('?')[1] ?? '';
  const p: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    p[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  const known = ['connected', 'signed_in', 'not_registered', 'error'] as const;
  const status = (known as readonly string[]).includes(p.status) ? (p.status as SocialResult['status']) : 'cancelled';
  return {
    provider: m[1] as Provider,
    status,
    name: p.name,
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    emailVerified: p.emailVerified === '1',
    token: p.token,
    ticket: p.ticket,
    message: p.message,
  };
}

/** Opens the provider page and resolves when the browser comes back to the app (or is closed). */
function waitForReturn(url: string, provider: Provider): Promise<SocialResult> {
  return new Promise<SocialResult>((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (r: SocialResult) => {
      if (done) return;
      done = true;
      linkSub.remove();
      appSub.remove();
      if (timer) clearTimeout(timer);
      resolve(r);
    };
    const linkSub = Linking.addEventListener('url', ({ url: back }) => {
      const r = parseReturn(back);
      if (r) finish(r);
    });
    // Came back to the app without finishing (closed the browser): cancelled, after a short wait
    // in case the return link is still on its way.
    let left = false;
    const appSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        left = true;
        return;
      }
      if (left) timer = setTimeout(() => finish({ provider, status: 'cancelled' }), 2500);
    });
    Linking.openURL(url).catch(() => finish({ provider, status: 'error', message: `Could not open ${PROVIDER_LABEL[provider]}.` }));
  });
}

/** Sign in, or start a sign-up, with the provider (not signed in). */
export async function continueWith(provider: Provider, intent: 'login' | 'register'): Promise<SocialResult> {
  const { url } = await apiRequest<{ url: string }>(`/auth/${provider}/start`, {
    method: 'POST',
    body: JSON.stringify({ intent }),
  });
  return waitForReturn(url, provider);
}

/** Connects the provider to the signed-in user's account (Profile). */
export async function connectProvider(provider: Provider, signedInToken: string): Promise<SocialResult> {
  const { url } = await apiRequest<{ url: string }>(`/user/social/${provider}/link`, { method: 'POST' }, signedInToken);
  return waitForReturn(url, provider);
}
export async function disconnectProvider(provider: Provider, signedInToken: string): Promise<void> {
  await apiRequest(`/user/social/${provider}`, { method: 'DELETE' }, signedInToken);
}

// The Facebook-only names the screens first used.
export const connectFacebook = (signedInToken?: string) =>
  signedInToken ? connectProvider('facebook', signedInToken) : continueWith('facebook', 'register');
export const disconnectFacebook = (signedInToken: string) => disconnectProvider('facebook', signedInToken);
