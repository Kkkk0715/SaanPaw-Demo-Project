import type { Request, Response } from 'express';
import { linkSocial, socialCallback, socialStatus, startSocial, unlinkSocial } from './social.controller';

/**
 * The first Facebook-only routes, kept for app builds that still call them. New builds use the
 * provider routes in social.controller (/auth/:provider/... and /user/social/:provider).
 */
const asFacebook = (req: Request) => {
  req.params.provider = 'facebook';
  return req;
};
export const facebookStatus = (req: Request, res: Response) => socialStatus(req, res);
export const startFacebookRegistration = (req: Request, res: Response) => {
  req.body = { ...(req.body ?? {}), intent: 'register' };
  return startSocial(asFacebook(req), res);
};
export const linkFacebook = (req: Request, res: Response) => linkSocial(asFacebook(req), res);
export const unlinkFacebook = (req: Request, res: Response) => unlinkSocial(asFacebook(req), res);
export const facebookCallback = (req: Request, res: Response) => socialCallback(asFacebook(req), res);
