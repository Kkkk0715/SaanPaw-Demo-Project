import { AppState, Linking } from 'react-native';
import { apiRequest } from './api';

export interface FacebookResult {
  status: 'connected' | 'cancelled' | 'error';
  name?: string;
  /** Registration only: proof of the Facebook profile, sent along with the new account. */
  token?: string;
  message?: string;
}

/** Whether "Connect Facebook" can be offered: the Facebook app has to be set up on the server. */
export async function facebookAvailable(): Promise<boolean> {
  try {
    const r = await apiRequest<{ enabled: boolean }>('/auth/facebook/status');
    return Boolean(r.enabled);
  } catch {
    return false;
  }
}

function parseReturn(url: string): FacebookResult | null {
  if (!url.startsWith('saanpaw://facebook')) return null;
  const query = url.split('?')[1] ?? '';
  const params: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  const status = params.status === 'connected' ? 'connected' : params.status === 'error' ? 'error' : 'cancelled';
  return { status, name: params.name, token: params.token, message: params.message };
}

/**
 * Opens Facebook's sign-in in the browser and waits for it to send the person back to the app.
 * `signedInToken` connects the signed-in user's account; without it, it is for a new account.
 */
export async function connectFacebook(signedInToken?: string): Promise<FacebookResult> {
  const { url } = signedInToken
    ? await apiRequest<{ url: string }>('/user/facebook/link', { method: 'POST' }, signedInToken)
    : await apiRequest<{ url: string }>('/auth/facebook/start', { method: 'POST' });

  return new Promise<FacebookResult>((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (r: FacebookResult) => {
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
    // Came back to the app without finishing (closed the browser): treat as cancelled, after a
    // short wait in case the return link is still on its way.
    let left = false;
    const appSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        left = true;
        return;
      }
      if (left) timer = setTimeout(() => finish({ status: 'cancelled' }), 2500);
    });
    Linking.openURL(url).catch(() => finish({ status: 'error', message: 'Could not open Facebook.' }));
  });
}

export async function disconnectFacebook(token: string): Promise<void> {
  await apiRequest('/user/facebook', { method: 'DELETE' }, token);
}
