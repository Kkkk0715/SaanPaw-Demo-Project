import type { Request, Response } from 'express';
import { User } from '../../models/User';
import { logger } from '../../utils/logger';
import {
  facebookConfig,
  facebookEnabled,
  facebookLoginUrl,
  facebookProfile,
  readState,
  signRegistrationToken,
} from '../../services/facebook.service';

/** Lets the app hide "Connect Facebook" until the Facebook app is set up. */
export function facebookStatus(_req: Request, res: Response) {
  res.json({ enabled: facebookEnabled() });
}

export async function startFacebookRegistration(_req: Request, res: Response) {
  res.json({ url: facebookLoginUrl({ purpose: 'register' }) });
}

export async function linkFacebook(req: Request, res: Response) {
  res.json({ url: facebookLoginUrl({ purpose: 'link', userId: req.auth!.id }) });
}

export async function unlinkFacebook(req: Request, res: Response) {
  await User.updateOne({ _id: req.auth!.id }, { $unset: { facebook: 1 } });
  res.json({ ok: true });
}

/** Sends the browser back into the app, with a fallback link if the app doesn't open by itself. */
function backToApp(res: Response, params: Record<string, string>) {
  const url = `${facebookConfig.appReturnUrl}?${new URLSearchParams(params)}`;
  const safe = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${safe}"><title>SaanPaw</title></head>
<body style="font-family:sans-serif;padding:24px;text-align:center">
<p>${params.status === 'connected' ? 'Facebook connected.' : 'Facebook was not connected.'}</p>
<p><a href="${safe}" style="display:inline-block;padding:12px 20px;background:#15843a;color:#fff;border-radius:8px;text-decoration:none">Back to SaanPaw</a></p>
</body></html>`);
}

/** Facebook sends the person back here after they approve (or cancel) the connection. */
export async function facebookCallback(req: Request, res: Response) {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const stateRaw = typeof req.query.state === 'string' ? req.query.state : '';
  if (!code) return backToApp(res, { status: 'cancelled' });
  try {
    const state = readState(stateRaw);
    const profile = await facebookProfile(code);
    if (state.purpose === 'link') {
      await User.updateOne({ _id: state.userId }, { facebook: { ...profile, connectedAt: new Date() } });
      return backToApp(res, { status: 'connected', name: profile.name });
    }
    return backToApp(res, { status: 'connected', name: profile.name, token: signRegistrationToken(profile) });
  } catch (err) {
    logger.warn('facebook: connection failed', err);
    return backToApp(res, { status: 'error', message: err instanceof Error ? err.message : 'Facebook could not be connected.' });
  }
}
