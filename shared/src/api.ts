import type {
  AnimalCase,
  AnimalCaseStatus,
  AnimalReport,
  AppUser,
  Conversation,
  DashboardStats,
  MatchSuggestion,
  Message,
  ModerationFlag,
  NotificationItem,
  ReportKind,
  ReportStatus,
  Role,
  Shelter,
  ShelterAnimal,
} from './types';

/**
 * Typed client for the SaanPaw REST API. Every response shape here is what the
 * backend serializers in `backend/src/utils/geoHelpers.ts` produce, which is the
 * same shape as `./types`, so nothing needs mapping on the way in.
 */

export interface ApiSession {
  baseUrl: string;
  token: string;
  role: Role;
  /** Called on a 401 so the app can drop an expired session. */
  onUnauthorized?: () => void;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const isLanIpv4 = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !host.startsWith('127.') && host !== '0.0.0.0';

/**
 * A `localhost` API address only works on the machine running the server. When the app itself
 * was opened from a LAN address (a phone, or another PC), aim at that same machine instead.
 * Any other configured address is used as given.
 */
export function resolveApiBase(configured: string, appHost?: string): string {
  const base = configured.replace(/\/+$/, '');
  const local = base.match(/^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/);
  return local && appHost && isLanIpv4(appHost) ? base.replace(local[0], `${local[1]}${appHost}`) : base;
}

/** Shown when the request never got an answer, which is what browsers call "Failed to fetch". */
export const networkErrorMessage = (baseUrl: string) =>
  `Cannot reach the SaanPaw server at ${baseUrl}. Check that the backend is running and that this device can reach it.`;

/** The backend's error middleware answers `{ error: string }`. */
export function errorText(payload: unknown, status: number): string {
  if (typeof payload === 'object' && payload !== null) {
    const body = payload as { error?: unknown; message?: unknown };
    const text = body.error ?? body.message;
    if (typeof text === 'string' && text) return text;
  }
  return typeof payload === 'string' && payload ? payload : `Request failed (${status})`;
}

async function call<T>(
  session: ApiSession,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${session.token}` };
  // A FormData body sets its own multipart Content-Type, boundary included.
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${session.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiRequestError(networkErrorMessage(session.baseUrl), 0);
  }

  const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
  const payload: unknown = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    if (response.status === 401) session.onUnauthorized?.();
    throw new ApiRequestError(errorText(payload, response.status), response.status);
  }
  return payload as T;
}

/** Photos are stored as `/uploads/<file>` paths, so any host that reaches the API can show them. */
const UPLOAD_PREFIX = '/uploads/';

/** `http://host:4001/api/v1` -> `http://host:4001`. A regex, because React Native's URL has no `origin`. */
const originOf = (baseUrl: string) => baseUrl.match(/^https?:\/\/[^/]+/)?.[0] ?? baseUrl;

export const resolveImageUrl = (url: string, baseUrl: string) =>
  url.startsWith(UPLOAD_PREFIX) ? `${originOf(baseUrl)}${url}` : url;

const withImageHosts = <T extends { imageUrls: string[] }>(baseUrl: string, items: T[]): T[] =>
  items.map((item) => ({ ...item, imageUrls: item.imageUrls.map((u) => resolveImageUrl(u, baseUrl)) }));

/** A photo still on the device (file, content, blob or data URI) rather than one the server can already serve. */
export const isLocalImageUri = (uri: string) => !/^https?:\/\//.test(uri) && !uri.startsWith(UPLOAD_PREFIX);

const guessMime = (uri: string) => (/\.png(\?|$)/i.test(uri) ? 'image/png' : /\.webp(\?|$)/i.test(uri) ? 'image/webp' : 'image/jpeg');

/** Sends one photo and returns its `/uploads/...` path. */
export async function uploadImage(s: ApiSession, uri: string): Promise<string> {
  const form = new FormData();
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    // React Native reads the file itself from this descriptor.
    form.append('photo', { uri, name: 'photo', type: guessMime(uri) } as unknown as Blob);
  } else {
    const blob = await (await fetch(uri)).blob();
    form.append('photo', blob, 'photo');
  }
  const { url } = await call<{ url: string }>(s, '/uploads', { method: 'POST', body: form });
  return url;
}

/** Uploads whatever is still local and leaves already-hosted photos alone. */
export const uploadPending = (s: ApiSession, uris: string[]) =>
  Promise.all(uris.map((uri) => (isLocalImageUri(uri) ? uploadImage(s, uri) : uri)));

interface ConversationsEnvelope {
  conversations: Conversation[];
  messages: Message[];
}

const noConversations: ConversationsEnvelope = { conversations: [], messages: [] };

interface ReportsEnvelope {
  lost: AnimalReport[];
  found: AnimalReport[];
}

const flatten = (e: ReportsEnvelope) => [...e.lost, ...e.found];

/** A secondary fetch that should not take the whole screen down when it fails. */
async function optional<T>(task: Promise<T>, fallback: T): Promise<T> {
  try {
    return await task;
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 401) throw err;
    return fallback;
  }
}

export interface Snapshot {
  /** Id of the signed-in user or shelter. */
  selfId: string;
  users: AppUser[];
  shelters: Shelter[];
  reports: AnimalReport[];
  matches: MatchSuggestion[];
  shelterAnimals: ShelterAnimal[];
  cases: AnimalCase[];
  flags: ModerationFlag[];
  notifications: NotificationItem[];
  conversations: Conversation[];
  messages: Message[];
  /** Server-computed counters that win over anything derivable from the loaded rows. */
  stats: Partial<DashboardStats>;
}

const emptySnapshot = (selfId: string): Snapshot => ({
  selfId,
  users: [],
  shelters: [],
  reports: [],
  matches: [],
  shelterAnimals: [],
  cases: [],
  flags: [],
  notifications: [],
  conversations: [],
  messages: [],
  stats: {},
});

export async function loadSnapshot(s: ApiSession): Promise<Snapshot> {
  if (s.role === 'user') {
    const [me, stats, shelters, mine, open, notifications, inbox, cases] = await Promise.all([
      call<AppUser>(s, '/user/me'),
      call<DashboardStats>(s, '/user/dashboard'),
      call<Shelter[]>(s, '/user/shelters'),
      call<ReportsEnvelope>(s, '/user/reports/mine'),
      call<ReportsEnvelope>(s, '/user/reports/search'),
      call<NotificationItem[]>(s, '/user/notifications'),
      optional(call<ConversationsEnvelope>(s, '/user/conversations'), noConversations),
      optional(call<AnimalCase[]>(s, '/user/cases'), []),
    ]);

    const reports = new Map<string, AnimalReport>();
    for (const r of [...flatten(open), ...flatten(mine)]) reports.set(r.id, r);

    const [matches, animals] = await Promise.all([
      Promise.all(mine.lost.map((r) => optional(call<MatchSuggestion[]>(s, `/user/reports/lost/${r.id}/matches`), []))),
      Promise.all(shelters.map((sh) => optional(call<ShelterAnimal[]>(s, `/user/shelters/${sh.id}/animals`), []))),
    ]);

    return {
      ...emptySnapshot(me.id),
      users: [me],
      shelters,
      reports: withImageHosts(s.baseUrl, [...reports.values()]),
      matches: matches.flat(),
      shelterAnimals: withImageHosts(s.baseUrl, animals.flat()),
      notifications,
      cases,
      ...inbox,
      stats,
    };
  }

  if (s.role === 'shelter_admin') {
    const [me, dash, reports, animals, cases, notifications, inbox] = await Promise.all([

      call<Shelter>(s, '/shelter/me'),
      call<{ activeReports: number; reunited: number; underRescue: number }>(s, '/shelter/dashboard'),
      call<ReportsEnvelope>(s, '/shelter/reports'),
      call<ShelterAnimal[]>(s, '/shelter/animals'),
      call<AnimalCase[]>(s, '/shelter/cases'),
      call<NotificationItem[]>(s, '/shelter/notifications'),
      optional(call<ConversationsEnvelope>(s, '/shelter/conversations'), noConversations),
    ]);
    return {
      ...emptySnapshot(me.id),
      shelters: [me],
      reports: withImageHosts(s.baseUrl, flatten(reports)),
      shelterAnimals: withImageHosts(s.baseUrl, animals),
      cases,
      notifications,
      ...inbox,
      stats: {
        activeReports: dash.activeReports,
        reunitedThisMonth: dash.reunited,
        underRescue: dash.underRescue,
      },
    };
  }

  const overview = await call<{
    stats: DashboardStats;
    shelters: Shelter[];
    users: AppUser[];
    reports: AnimalReport[];
    flags: ModerationFlag[];
  }>(s, '/developer/overview');
  return { ...emptySnapshot(''), ...overview, reports: withImageHosts(s.baseUrl, overview.reports) };
}

/** Field names the report endpoints read from the request body. */
export interface ReportPayload {
  name?: string;
  animalType: AnimalReport['animalType'];
  breed?: string;
  color?: string;
  sex?: AnimalReport['sex'];
  size?: AnimalReport['size'];
  distinctMarks?: string;
  description?: string;
  imageUrls: string[];
  barangay: string;
  location: AnimalReport['location'];
}

const notificationsBase = (role: Role) => (role === 'shelter_admin' ? '/shelter' : '/user');

export const apiActions = {
  /** Uploads any photos still on the device first, so the report only ever holds hosted photos. */
  createReport: async (s: ApiSession, kind: ReportKind, body: ReportPayload) => {
    const imageUrls = await uploadPending(s, body.imageUrls);
    const created = await call<AnimalReport>(s, `/user/reports/${kind}`, { method: 'POST', body: { ...body, imageUrls } });
    return withImageHosts(s.baseUrl, [created])[0];
  },

  setReportStatus: (s: ApiSession, kind: ReportKind, id: string, status: ReportStatus) =>
    call<AnimalReport>(s, `/user/reports/${kind}/${id}/status`, { method: 'PATCH', body: { status } }),

  deleteReport: (s: ApiSession, kind: ReportKind, id: string) =>
    call<{ id: string }>(s, `/user/reports/${kind}/${id}`, { method: 'DELETE' }),

  updateUserProfile: (s: ApiSession, patch: Partial<AppUser>) =>
    call<AppUser>(s, '/user/profile', { method: 'PATCH', body: patch }),

  matchesFor: (s: ApiSession, lostReportId: string) =>
    call<MatchSuggestion[]>(s, `/user/reports/lost/${lostReportId}/matches`),

  notifications: (s: ApiSession) => call<NotificationItem[]>(s, `${notificationsBase(s.role)}/notifications`),

  markNotificationRead: (s: ApiSession, id: string) =>
    call<NotificationItem>(s, `${notificationsBase(s.role)}/notifications/${id}/read`, { method: 'PATCH' }),

  startConversation: (s: ApiSession, body: { id: string; shelterId: string; subject: string; body: string; reportId?: string }) =>
    call<ConversationsEnvelope>(s, '/user/conversations', { method: 'POST', body }),

  sendMessage: (s: ApiSession, conversationId: string, body: string) =>
    call<ConversationsEnvelope>(s, `${notificationsBase(s.role)}/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { body },
    }),

  markConversationRead: (s: ApiSession, conversationId: string) =>
    call<ConversationsEnvelope>(s, `${notificationsBase(s.role)}/conversations/${conversationId}/read`, { method: 'POST' }),

  openCase: (s: ApiSession, reportId: string, note: string) =>
    call<AnimalCase>(s, '/shelter/cases', { method: 'POST', body: { reportId, note } }),

  setCaseStatus: (s: ApiSession, caseId: string, status: AnimalCaseStatus, notes: string) =>
    call<AnimalCase>(s, `/shelter/cases/${caseId}/status`, { method: 'PATCH', body: { status, notes } }),

  addShelterAnimal: async (s: ApiSession, body: Omit<ShelterAnimal, 'id' | 'shelterId'>) => {
    const imageUrls = await uploadPending(s, body.imageUrls);
    const created = await call<ShelterAnimal>(s, '/shelter/animals', { method: 'POST', body: { ...body, imageUrls } });
    return withImageHosts(s.baseUrl, [created])[0];
  },

  updateShelterAnimal: (
    s: ApiSession,
    id: string,
    patch: { caseStatus?: AnimalCaseStatus; postedPublicly?: boolean },
  ) => call<ShelterAnimal>(s, `/shelter/animals/${id}`, { method: 'PATCH', body: patch }),

  updateShelterProfile: (s: ApiSession, patch: Partial<Shelter>) =>
    call<Shelter>(s, '/shelter/profile', { method: 'PATCH', body: patch }),

  reviewShelter: (s: ApiSession, id: string, decision: 'approve' | 'reject') =>
    call<{ shelter: Shelter; adminEmail?: string; temporaryPassword?: string; emailSent?: boolean }>(
      s,
      `/developer/shelters/${id}/review`,
      { method: 'PATCH', body: { decision } },
    ),

  resolveFlag: (s: ApiSession, id: string, action: 'dismiss' | 'remove_report') =>
    call<{ flag: ModerationFlag }>(s, `/developer/flags/${id}/resolve`, { method: 'PATCH', body: { action } }),

  banUser: (s: ApiSession, id: string) => call<AppUser>(s, `/developer/users/${id}/ban`, { method: 'PATCH' }),

  changeShelterPassword: (s: ApiSession, currentPassword: string, newPassword: string) =>
    call<{ ok: boolean }>(s, '/shelter/password', { method: 'PATCH', body: { currentPassword, newPassword } }),
};
