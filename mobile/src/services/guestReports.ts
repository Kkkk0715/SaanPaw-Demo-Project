import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { ReportKind } from '@saanpaw/shared';
import { apiRequest } from './api';

/**
 * Guest mode reporting: a lost or found report without an account. The phone remembers the
 * guest's name and number (so the next report is quicker) and each report's private key, which is
 * the only way to mark it resolved or delete it later. Nothing here leaves the phone except the
 * report itself.
 */
const CONTACT_KEY = 'saanpaw.guestContact';
const REPORTS_KEY = 'saanpaw.guestReports';

export interface GuestContact {
  name: string;
  phone: string;
}
export interface SavedGuestReport {
  kind: ReportKind;
  id: string;
  key: string;
  title: string;
  at: string;
}

/** "0917 123 4567", "+63 917..." -> valid if it is a Philippine mobile number. */
export const isPhMobile = (value: string) => /^(\+?63|0)?9\d{9}$/.test(value.replace(/[\s()-]/g, ''));

export async function loadGuestContact(): Promise<GuestContact | null> {
  try {
    const raw = await AsyncStorage.getItem(CONTACT_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as GuestContact;
    // Stored as +639XXXXXXXXX (older versions kept what was typed): anything else is dropped.
    const digits = String(c.phone ?? '').replace(/\D/g, '');
    const national = digits.startsWith('63') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits;
    return { name: String(c.name ?? '').slice(0, 60), phone: /^9\d{9}$/.test(national) ? `+63${national}` : '' };
  } catch {
    return null;
  }
}
export async function saveGuestContact(c: GuestContact) {
  try {
    await AsyncStorage.setItem(CONTACT_KEY, JSON.stringify(c));
  } catch {
    /* convenience only */
  }
}

export async function listGuestReports(): Promise<SavedGuestReport[]> {
  try {
    const raw = await AsyncStorage.getItem(REPORTS_KEY);
    return raw ? (JSON.parse(raw) as SavedGuestReport[]) : [];
  } catch {
    return [];
  }
}
async function writeGuestReports(list: SavedGuestReport[]) {
  await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(list.slice(0, 50)));
}
export async function rememberGuestReport(r: SavedGuestReport) {
  const list = (await listGuestReports()).filter((x) => x.id !== r.id);
  await writeGuestReports([r, ...list]);
}
export async function forgetGuestReport(id: string) {
  await writeGuestReports((await listGuestReports()).filter((x) => x.id !== id));
}

const guessMime = (uri: string) =>
  /\.png($|\?)/i.test(uri) ? 'image/png' : /\.webp($|\?)/i.test(uri) ? 'image/webp' : 'image/jpeg';

/** Sends one photo (screened by the server for an animal) and returns its stored address. */
export async function uploadGuestPhoto(uri: string): Promise<string> {
  if (/^https?:\/\//.test(uri) || uri.startsWith('/uploads/')) return uri;
  const form = new FormData();
  form.append('purpose', 'animal');
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('photo', blob, 'photo');
  } else {
    form.append('photo', { uri, name: 'photo', type: guessMime(uri) } as unknown as Blob);
  }
  const { url } = await apiRequest<{ url: string }>('/public/guest/photos', { method: 'POST', body: form });
  return url;
}

export async function setGuestReportStatus(r: SavedGuestReport, status: 'recovered' | 'closed' | 'active') {
  return apiRequest(`/public/guest/reports/${r.kind}/${r.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ key: r.key, status }),
  });
}

export async function deleteGuestReport(r: SavedGuestReport) {
  await apiRequest(`/public/guest/reports/${r.kind}/${r.id}`, { method: 'DELETE', body: JSON.stringify({ key: r.key }) });
  await forgetGuestReport(r.id);
}
