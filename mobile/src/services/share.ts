import { Linking, Share } from 'react-native';
import { API_BASE_URL } from './api';

type Kind = 'lost' | 'found';

/**
 * The link put on Facebook for a report. It is a page on the SaanPaw server that shows the photo
 * and details as a preview on Facebook, and sends whoever taps it on to the report in SaanPaw.
 */
export const reportShareLink = (kind: Kind, id: string) => `${API_BASE_URL}/share/r/${kind}/${id}`;

/**
 * Opens Facebook's share box with the report already filled in; the person only taps Post.
 * (Facebook does not let apps post to someone's own timeline by themselves.)
 */
export async function postReportToFacebook(kind: Kind, id: string): Promise<void> {
  const link = reportShareLink(kind, id);
  const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
  await Linking.openURL(url);
}

/** The phone's own share sheet (Messenger, Viber, SMS...). */
export async function shareReport(kind: Kind, id: string, title: string): Promise<void> {
  const link = reportShareLink(kind, id);
  await Share.share({ title, message: `${title}\n${link}`, url: link });
}
