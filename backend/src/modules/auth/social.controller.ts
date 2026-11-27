import type { Request, Response } from 'express';
import { User } from '../../models/User';
import { logger } from '../../utils/logger';
import { ApiError } from '../../utils/ApiError';
import { authService } from './auth.service';
import {
  PROVIDER_LABEL,
  PROVIDERS,
  appReturnUrl,
  providerEnabled,
  readLoginTicket,
  readSocialState,
  signLoginTicket,
  signSocialRegistration,
  socialLoginUrl,
  socialProfile,
  type Provider,
} from '../../services/social.service';

const providerOf = (req: Request): Provider => {
  const p = req.params.provider;
  if (!PROVIDERS.includes(p as Provider)) throw ApiError.notFound('Unknown sign-in provider');
  return p as Provider;
};

/** Which buttons the app shows: only providers set up on the server. */
export function socialStatus(_req: Request, res: Response) {
  res.json({ facebook: providerEnabled('facebook'), google: providerEnabled('google'), enabled: providerEnabled('facebook') });
}

/** Sign in or sign up (not signed in yet): returns the provider page to open. */
export async function startSocial(req: Request, res: Response) {
  const provider = providerOf(req);
  const purpose = req.body?.intent === 'register' ? 'register' : 'login';
  res.json({ url: socialLoginUrl({ purpose, provider }) });
}

/** Connect the provider to the signed-in user's account. */
export async function linkSocial(req: Request, res: Response) {
  res.json({ url: socialLoginUrl({ purpose: 'link', userId: req.auth!.id, provider: providerOf(req) }) });
}

export async function unlinkSocial(req: Request, res: Response) {
  const provider = providerOf(req);
  await User.updateOne({ _id: req.auth!.id }, { $unset: { [provider]: 1 } });
  res.json({ ok: true });
}

/** The app swaps the two-minute ticket from the sign-in link for a session. */
export async function exchangeTicket(req: Request, res: Response) {
  const ticket = typeof req.body?.ticket === 'string' ? req.body.ticket : '';
  if (!ticket) throw ApiError.badRequest('Missing sign-in ticket.');
  res.json(await authService.sessionForUser(readLoginTicket(ticket)));
}

/** Sends the browser back into the app, with a button in case it doesn't open by itself. */
function backToApp(res: Response, provider: Provider, params: Record<string, string>) {
  const url = `${appReturnUrl(provider)}?${new URLSearchParams({ provider, ...params })}`;
  const safe = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const ok = params.status !== 'error' && params.status !== 'cancelled';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${safe}"><title>SaanPaw</title></head>
<body style="font-family:sans-serif;padding:24px;text-align:center">
<p>${ok ? `Done with ${PROVIDER_LABEL[provider]}.` : `${PROVIDER_LABEL[provider]} sign-in did not finish.`}</p>
<p><a href="${safe}" style="display:inline-block;padding:12px 20px;background:#15843a;color:#fff;border-radius:8px;text-decoration:none">Back to SaanPaw</a></p>
</body></html>`);
}

/** The provider sends the person back here after they approve (or cancel). */
export async function socialCallback(req: Request, res: Response) {
  const provider = providerOf(req);
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const stateRaw = typeof req.query.state === 'string' ? req.query.state : '';
  if (!code) return backToApp(res, provider, { status: 'cancelled' });
  try {
    const state = readSocialState(stateRaw, provider);
    const profile = await socialProfile(provider, code);
    const linkedTo = await User.findOne({ [`${provider}.id`]: profile.id, isGuest: { $ne: true } }, '_id').lean();

    if (state.purpose === 'link') {
      if (linkedTo && String(linkedTo._id) !== state.userId) {
        throw ApiError.conflict(`This ${PROVIDER_LABEL[provider]} account is already connected to another SaanPaw account.`);
      }
      await User.updateOne(
        { _id: state.userId },
        { [provider]: { id: profile.id, name: profile.name, ...(provider === 'google' ? { email: profile.email } : {}), connectedAt: new Date() } },
      );
      return backToApp(res, provider, { status: 'connected', name: profile.name });
    }

    if (state.purpose === 'login') {
      let userId = linkedTo ? String(linkedTo._id) : null;
      // A Google address Google has verified, on an account not yet connected: same person.
      if (!userId && profile.emailVerified && profile.email) {
        const byEmail = await User.findOne({ email: profile.email, isGuest: { $ne: true } }, '_id').lean();
        if (byEmail) {
          userId = String(byEmail._id);
          await User.updateOne(
            { _id: userId },
            { [provider]: { id: profile.id, name: profile.name, email: profile.email, connectedAt: new Date() } },
          );
        }
      }
      if (userId) {
        await authService.sessionForUser(userId); // banned / maintenance: say so now, in the browser
        return backToApp(res, provider, { status: 'signed_in', ticket: signLoginTicket(userId) });
      }
      // No SaanPaw account yet: go to registration with the details filled in.
    }

    return backToApp(res, provider, {
      status: state.purpose === 'login' ? 'not_registered' : 'connected',
      name: profile.name,
      ...(profile.firstName ? { firstName: profile.firstName } : {}),
      ...(profile.lastName ? { lastName: profile.lastName } : {}),
      ...(profile.email ? { email: profile.email } : {}),
      ...(profile.emailVerified ? { emailVerified: '1' } : {}),
      token: signSocialRegistration(profile),
    });
  } catch (err) {
    logger.warn(`${provider}: sign-in failed`, err);
    return backToApp(res, provider, {
      status: 'error',
      message: err instanceof Error ? err.message : `${PROVIDER_LABEL[provider]} sign-in failed.`,
    });
  }
}
