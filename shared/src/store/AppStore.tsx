import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { SJDM_BARANGAYS, distanceMeters } from '../sjdm';
import {
  apiActions,
  isLocalImageUri,
  loadSnapshot,
  toStoredImageUrl,
  uploadImage,
  type ApiSession,
  type Snapshot,
} from '../api';
import {
  CURRENT_SHELTER_ID,
  CURRENT_USER_ID,
  seedCases,
  seedConversations,
  seedFlags,
  seedMatches,
  seedMessages,
  seedNotifications,
  seedReports,
  seedShelterAnimals,
  seedShelters,
  seedUsers,
} from '../mock/data';
import type {
  AnimalCase,
  AnimalCaseStatus,
  AnimalReport,
  AnimalType,
  AppUser,
  Conversation,
  DashboardStats,
  DeploymentInfo,
  LatLng,
  MatchSuggestion,
  Message,
  ModerationFlag,
  NotificationItem,
  ReportKind,
  ReportStatus,
  Role,
  Shelter,
  ShelterAnimal,
  SystemConfig,
} from '../types';

/** Offline demo mode has no server config to load, so toggles stay local-only here. */
const DEMO_SYSTEM_CONFIG: SystemConfig = {
  aiModeration: true,
  smartAlerts: true,
  geoFence: true,
  maintenanceMode: false,
};

/**
 * All app data.
 *
 * Without a `session` the store runs on the in-memory seed data, so the apps work
 * with no backend. With a `session` it loads everything for that role from the
 * API and every action becomes a request. Screens use the same hook either way.
 *
 * Live mode updates the screen first, sends the request, then reloads from the
 * server. A failed request surfaces in `sync.error` and the reload rolls the
 * screen back to what the server actually holds.
 *
 */

const POLL_MS = 30_000;

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

const PLACEHOLDER_LOCATION = SJDM_BARANGAYS[0].center;

const PLACEHOLDER_USER: AppUser = {
  id: '',
  firstName: '',
  lastName: '',
  fullName: '',
  email: '',
  phone: '',
  barangay: SJDM_BARANGAYS[0].name,
  location: PLACEHOLDER_LOCATION,
  alertRadiusMeters: 3000,
  joinedAt: new Date(0).toISOString(),
  flaggedReportCount: 0,
  isBanned: false,
};

const PLACEHOLDER_SHELTER: Shelter = {
  id: '',
  name: '',
  barangay: SJDM_BARANGAYS[0].name,
  address: '',
  contactNumber: '',
  email: '',
  location: PLACEHOLDER_LOCATION,
  operatingRadiusMeters: 5000,
  approvalStatus: 'pending',
  registeredAt: new Date(0).toISOString(),
  permitNumber: '',
  capacity: 0,
  currentOccupancy: 0,
  logoColor: '#888888',
};

export interface SyncState {
  /** `loading` until the first load finishes; always `ready` on seed data. */
  status: 'loading' | 'ready' | 'error';
  /** Latest load or action failure, for the app to show. */
  error: string | null;
  clearError: () => void;
  refresh: () => Promise<void>;
}

/** Login handed out when a developer approves a shelter, shown once. */
export interface IssuedLogin {
  shelterId: string;
  email: string;
  password: string;
  /** Whether the credentials were also emailed to the shelter automatically. */
  emailSent: boolean;
}

/**
 * "Daily" means the last 24 hours, matching the backend.
 * Counting by calendar day zeroed the dashboard just after midnight.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const withinLast24h = (iso: string) => Date.now() - +new Date(iso) <= DAY_MS;

const uid = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 9)}`;

export interface NewReportInput {
  kind: ReportKind;
  name?: string;
  animalType: AnimalType;
  breed?: string;
  color?: string;
  sex?: AnimalReport['sex'];
  size?: AnimalReport['size'];
  distinctMarks?: string;
  description?: string;
  imageUrls: string[];
  barangay: string;
  location: LatLng;
}

interface AppState {
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
  /** Developer-only: null until the System Management page loads (or in offline demo mode, local-only defaults). */
  systemConfig: SystemConfig | null;
  /** Developer-only: null outside a live session - offline demo mode has no server to report on. */
  deployment: DeploymentInfo | null;

  currentUser: AppUser;
  currentShelter: Shelter;

  sync: SyncState;
  issuedLogin: IssuedLogin | null;
  clearIssuedLogin: () => void;

  // ---- selectors
  stats: DashboardStats;
  reportById: (id: string) => AnimalReport | undefined;
  shelterById: (id: string) => Shelter | undefined;
  myReports: AnimalReport[];
  /** Inside the user's alert radius, nearest first. */
  nearbyReports: (kind?: ReportKind) => (AnimalReport & { distance: number })[];
  /** Inside the shelter's operating radius, nearest first. */
  shelterAreaReports: () => (AnimalReport & { distance: number })[];
  matchesForReport: (lostReportId: string) => MatchSuggestion[];
  notificationsFor: (role: Role) => NotificationItem[];
  messagesIn: (conversationId: string) => Message[];
  caseForReport: (reportId: string) => AnimalCase | undefined;
  /**
   * Text-attribute heuristic used only in offline demo mode, where there is no backend to run a
   * real photo comparison. `scanPhotoMatch` is the real thing and falls back to this when signed
   * out of a live session.
   */
  runImageMatch: (input: {
    animalType: AnimalType;
    color?: string;
    size?: AnimalReport['size'];
    breed?: string;
    location: LatLng;
  }) => { id: string; source: 'found_report' | 'shelter_animal'; score: number; reasons: string[] }[];
  /** Ad-hoc "scan a photo" search, not tied to any existing report; results are not persisted. */
  scanPhotoMatch: (input: {
    animalType: AnimalType;
    color?: string;
    breed?: string;
    size?: AnimalReport['size'];
    location: LatLng;
    photoUrl?: string;
  }) => Promise<{ candidateId: string; candidateSource: 'found_report' | 'shelter_animal'; score: number; reasons: string[] }[]>;

  // ---- actions
  /** Rejects when the server refuses the report, e.g. a pin outside the service area. */
  createReport: (input: NewReportInput) => Promise<AnimalReport>;
  setReportStatus: (reportId: string, status: ReportStatus) => void;
  deleteReport: (reportId: string) => void;
  setShelterApproval: (shelterId: string, status: 'approved' | 'rejected') => void;
  openCase: (reportId: string, note: string) => void;
  setCaseStatus: (caseId: string, status: AnimalCaseStatus, note: string) => void;
  setShelterAnimalStatus: (animalId: string, status: AnimalCaseStatus) => void;
  addShelterAnimal: (input: Omit<ShelterAnimal, 'id' | 'shelterId'>) => void;
  toggleAnimalPublic: (animalId: string) => void;
  updateShelterProfile: (patch: Partial<Shelter>) => void;
  updateUserProfile: (patch: Partial<AppUser>) => void;
  sendMessage: (conversationId: string, senderRole: Role, body: string) => void;
  startConversation: (shelterId: string, subject: string, body: string, reportId?: string) => string;
  /** Clears the unread count for the signed-in side of a thread. */
  markConversationRead: (conversationId: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: (role: Role) => void;
  resolveFlag: (flagId: string, resolution: ModerationFlag['resolution']) => void;
  banUser: (userId: string) => void;
  /** Developer-only: a true delete, unlike banning (which hides their reports but keeps the account). */
  deleteUserAccount: (userId: string) => void;
  /** Developer-only: a true delete, unlike revoking approval (which keeps the account, just blocks sign-in). */
  deleteShelterAccount: (shelterId: string) => void;
  /** Rejects with the server's message (e.g. "Current password is incorrect") on failure. */
  changeShelterPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Developer-only: enforced server-side, not just stored for display. Local-only (unenforced) in offline demo mode. */
  updateSystemConfig: (patch: Partial<SystemConfig>) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppStoreProvider({ children, session }: { children: ReactNode; session?: ApiSession }) {
  const live = Boolean(session);
  const [users, setUsers] = useState<AppUser[]>(live ? [] : seedUsers);
  const [shelters, setShelters] = useState<Shelter[]>(live ? [] : seedShelters);
  const [reports, setReports] = useState<AnimalReport[]>(live ? [] : seedReports);
  const [matches, setMatches] = useState<MatchSuggestion[]>(live ? [] : seedMatches);
  const [shelterAnimals, setShelterAnimals] = useState<ShelterAnimal[]>(live ? [] : seedShelterAnimals);
  const [cases, setCases] = useState<AnimalCase[]>(live ? [] : seedCases);
  const [flags, setFlags] = useState<ModerationFlag[]>(live ? [] : seedFlags);
  const [notifications, setNotifications] = useState<NotificationItem[]>(live ? [] : seedNotifications);
  const [conversations, setConversations] = useState<Conversation[]>(live ? [] : seedConversations);
  const [messages, setMessages] = useState<Message[]>(live ? [] : seedMessages);
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(live ? null : DEMO_SYSTEM_CONFIG);
  const [deployment, setDeployment] = useState<DeploymentInfo | null>(null);

  const [selfId, setSelfId] = useState('');
  const [serverStats, setServerStats] = useState<Snapshot['stats']>({});
  const [status, setStatus] = useState<SyncState['status']>(live ? 'loading' : 'ready');
  const [error, setError] = useState<string | null>(null);
  const [issuedLogin, setIssuedLogin] = useState<IssuedLogin | null>(null);

  // Callbacks read the session through a ref so they stay stable across renders.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const statusRef = useRef(status);
  statusRef.current = status;
  const pending = useRef(0);

  const currentUser =
    users.find((u) => u.id === (live ? (session!.role === 'user' ? selfId : '') : CURRENT_USER_ID)) ??
    PLACEHOLDER_USER;
  const currentShelter =
    shelters.find(
      (s) => s.id === (live ? (session!.role === 'shelter_admin' ? selfId : '') : CURRENT_SHELTER_ID),
    ) ?? PLACEHOLDER_SHELTER;

  const applySnapshot = useCallback((snap: Snapshot) => {
    setSelfId(snap.selfId);
    setUsers(snap.users);
    setShelters(snap.shelters);
    setReports(snap.reports);
    setShelterAnimals(snap.shelterAnimals);
    setCases(snap.cases);
    setFlags(snap.flags);
    setNotifications(snap.notifications);
    setConversations(snap.conversations);
    setMessages(snap.messages);
    setServerStats(snap.stats);
    setSystemConfig(snap.systemConfig);
    setDeployment(snap.deployment);
    // The server does not rank matches yet, so keep the ones ranked on this device.
    setMatches((prev) => {
      const seen = new Set(snap.matches.map((m) => `${m.lostReportId}:${m.candidateId}`));
      const local = prev.filter(
        (m) =>
          m.id.startsWith('mm') &&
          !seen.has(`${m.lostReportId}:${m.candidateId}`) &&
          snap.reports.some((r) => r.id === m.lostReportId),
      );
      return [...snap.matches, ...local];
    });
  }, []);

  /** Reload from the server. Skipped while a request is in flight so it cannot undo an optimistic edit. */
  const refresh = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || pending.current > 0) return;
    try {
      const snap = await loadSnapshot(s);
      if (sessionRef.current?.token !== s.token || pending.current > 0) return;
      applySnapshot(snap);
      // Recovering from a failed first load: the load error no longer applies.
      if (statusRef.current !== 'ready') setError(null);
      setStatus('ready');
    } catch (e) {
      if (statusRef.current !== 'ready') {
        setStatus('error');
        setError(errorMessage(e));
      }
    }
  }, [applySnapshot]);

  useEffect(() => {
    setError(null);
    setIssuedLogin(null);
    if (!session) {
      setUsers(seedUsers);
      setShelters(seedShelters);
      setReports(seedReports);
      setMatches(seedMatches);
      setShelterAnimals(seedShelterAnimals);
      setCases(seedCases);
      setFlags(seedFlags);
      setNotifications(seedNotifications);
      setConversations(seedConversations);
      setMessages(seedMessages);
      setServerStats({});
      setSystemConfig(DEMO_SYSTEM_CONFIG);
      setDeployment(null);
      setStatus('ready');
      return;
    }
    setUsers([]);
    setShelters([]);
    setReports([]);
    setMatches([]);
    setShelterAnimals([]);
    setCases([]);
    setFlags([]);
    setNotifications([]);
    setConversations([]);
    setMessages([]);
    setServerStats({});
    setSystemConfig(null);
    setDeployment(null);
    setSelfId('');
    setStatus('loading');
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
    // A new token, role or server means a different account, so start over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token, session?.role, session?.baseUrl, refresh]);

  /** Run a request the screen already reflects: on failure show the error and roll back to server state. */
  const send = useCallback(
    (task: Promise<unknown>) => {
      pending.current += 1;
      task
        .finally(() => {
          pending.current -= 1;
        })
        .then(
          () => refresh(),
          (e) => {
            setError(errorMessage(e));
            return refresh();
          },
        );
    },
    [refresh],
  );

  const pushNotification = useCallback((n: Omit<NotificationItem, 'id' | 'createdAt' | 'isRead'>) => {
    // Live notifications are created by the server.
    if (sessionRef.current) return;
    setNotifications((prev) => [
      { ...n, id: uid('n'), createdAt: new Date().toISOString(), isRead: false },
      ...prev,
    ]);
  }, []);

  // -------------------------------------------------------------- selectors

  const stats = useMemo<DashboardStats>(() => {
    const open = reports.filter((r) => r.status === 'active' || r.status === 'matched');
    return {
      lostToday: reports.filter((r) => r.kind === 'lost' && withinLast24h(r.reportedAt)).length,
      foundToday: reports.filter((r) => r.kind === 'found' && withinLast24h(r.reportedAt)).length,
      activeReports: open.length,
      reunitedThisMonth:
        cases.filter((c) => c.status === 'reunited').length +
        shelterAnimals.filter((a) => a.caseStatus === 'reunited').length,
      underRescue: shelterAnimals.filter((a) => a.caseStatus === 'under_rescue').length,
      sheltersOnline: shelters.filter((s) => s.approvalStatus === 'approved').length,
      // City-wide counters from the server cover rows this device never loads.
      ...serverStats,
    };
  }, [reports, cases, shelterAnimals, shelters, serverStats]);

  const reportById = useCallback((id: string) => reports.find((r) => r.id === id), [reports]);
  const shelterById = useCallback((id: string) => shelters.find((s) => s.id === id), [shelters]);

  const myReports = useMemo(
    () =>
      reports
        .filter((r) => r.reporterId === currentUser.id)
        .sort((a, b) => +new Date(b.reportedAt) - +new Date(a.reportedAt)),
    [reports, currentUser.id],
  );

  const nearbyReports = useCallback(
    (kind?: ReportKind) =>
      reports
        .filter((r) => (kind ? r.kind === kind : true))
        .filter((r) => r.status !== 'closed')
        .map((r) => ({ ...r, distance: distanceMeters(currentUser.location, r.location) }))
        .filter((r) => r.distance <= currentUser.alertRadiusMeters)
        .sort((a, b) => a.distance - b.distance),
    [reports, currentUser],
  );

  const shelterAreaReports = useCallback(
    () =>
      reports
        .filter((r) => r.status !== 'closed')
        .map((r) => ({ ...r, distance: distanceMeters(currentShelter.location, r.location) }))
        .filter((r) => r.distance <= currentShelter.operatingRadiusMeters)
        .sort((a, b) => a.distance - b.distance),
    [reports, currentShelter],
  );

  const matchesForReport = useCallback(
    (lostReportId: string) =>
      matches.filter((m) => m.lostReportId === lostReportId).sort((a, b) => b.score - a.score),
    [matches],
  );

  const notificationsFor = useCallback(
    (role: Role) =>
      notifications
        .filter((n) => n.audience === role)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [notifications],
  );

  const messagesIn = useCallback(
    (conversationId: string) =>
      messages
        .filter((m) => m.conversationId === conversationId)
        .sort((a, b) => +new Date(a.sentAt) - +new Date(b.sentAt)),
    [messages],
  );

  const caseForReport = useCallback(
    (reportId: string) => cases.find((c) => c.reportId === reportId),
    [cases],
  );

  const runImageMatch = useCallback<AppState['runImageMatch']>(
    (input) => {
      const norm = (s?: string) => (s ?? '').toLowerCase();
      const colorWords = norm(input.color).split(/[^a-z]+/).filter((w) => w.length > 2);

      const score = (c: {
        animalType: AnimalType;
        color?: string;
        size?: AnimalReport['size'];
        breed?: string;
        location?: LatLng;
      }) => {
        const reasons: string[] = [];
        let s = 0;

        if (c.animalType === input.animalType) {
          s += 0.35;
          reasons.push(`Species match (${input.animalType})`);
        } else {
          return null; // a cat is never a match for a dog
        }

        const candColor = norm(c.color);
        const overlap = colorWords.filter((w) => candColor.includes(w));
        if (overlap.length) {
          s += Math.min(0.3, 0.15 * overlap.length);
          reasons.push(`Coat colour overlap on "${overlap.join(', ')}"`);
        }

        if (input.breed && c.breed && norm(c.breed).includes(norm(input.breed).split(' ')[0])) {
          s += 0.15;
          reasons.push(`Breed reads as ${c.breed}`);
        }

        if (input.size && c.size === input.size) {
          s += 0.1;
          reasons.push(`Same size class (${input.size})`);
        }

        if (c.location) {
          const d = distanceMeters(input.location, c.location);
          if (d < 2000) {
            s += 0.15;
            reasons.push(`Recorded ${(d / 1000).toFixed(1)} km away`);
          } else if (d < 6000) {
            s += 0.05;
            reasons.push(`Recorded ${(d / 1000).toFixed(1)} km away`);
          } else {
            reasons.push(`Recorded ${(d / 1000).toFixed(1)} km away - outside the usual stray range`);
          }
        }

        return { score: Math.min(0.99, s), reasons };
      };

      const fromReports = reports
        .filter((r) => r.kind === 'found' && r.status === 'active')
        .map((r) => {
          const res = score(r);
          return res && { id: r.id, source: 'found_report' as const, ...res };
        });

      const fromAnimals = shelterAnimals
        .filter((a) => a.caseStatus === 'under_rescue' || a.caseStatus === 'inconclusive')
        .map((a) => {
          const shelter = shelters.find((s) => s.id === a.shelterId);
          const res = score({ ...a, location: shelter?.location });
          return res && { id: a.id, source: 'shelter_animal' as const, ...res };
        });

      return [...fromReports, ...fromAnimals]
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
    },
    [reports, shelterAnimals, shelters],
  );

  const scanPhotoMatch = useCallback<AppState['scanPhotoMatch']>(
    async (input) => {
      const session = sessionRef.current;
      if (!session) {
        return runImageMatch(input).map((m) => ({
          candidateId: m.id,
          candidateSource: m.source,
          score: m.score,
          reasons: m.reasons,
        }));
      }
      return apiActions.scanPhoto(session, input);
    },
    [runImageMatch],
  );

  // ---------------------------------------------------------------- actions

  const createReport = useCallback<AppState['createReport']>(
    async (input) => {
      const session = sessionRef.current;
      let report: AnimalReport;
      if (session) {
        const { kind, ...payload } = input;
        // The server assigns the id, so wait for it. The caller shows the error if it refuses.
        pending.current += 1;
        try {
          report = await apiActions.createReport(session, kind, payload);
        } finally {
          pending.current -= 1;
        }
      } else {
        report = {
          ...input,
          id: uid('r'),
          status: 'active',
          reportedAt: new Date().toISOString(),
          reporterId: currentUser.id,
          reporterName: currentUser.fullName,
          reporterPhone: currentUser.phone,
        };
      }
      setReports((prev) => [report, ...prev]);

      // Alert every approved shelter whose radius covers this report.
      shelters
        .filter((s) => s.approvalStatus === 'approved')
        .forEach((s) => {
          const d = distanceMeters(s.location, report.location);
          if (d <= s.operatingRadiusMeters) {
            pushNotification({
              audience: 'shelter_admin',
              type: input.kind === 'lost' ? 'lost_nearby' : 'found_nearby',
              title: `New ${input.kind} report in your radius`,
              body: `${input.name ?? `A ${input.color ?? ''} ${input.animalType}`.trim()} in ${input.barangay}, ${(d / 1000).toFixed(1)} km away.`,
              distanceMeters: d,
              relatedReportId: report.id,
            });
          }
        });

      if (input.kind === 'lost') {
        pushNotification({
          audience: 'user',
          type: 'lost_nearby',
          title: 'Your report is live',
          body: `${input.name ?? 'Your pet'} is now visible to shelters and nearby users in ${input.barangay}.`,
          relatedReportId: report.id,
        });

        // Live mode: the server ranks real candidates (attribute pre-filter + a Gemini photo
        // comparison) while creating the report, and the refresh() below pulls those in. Offline
        // demo mode has no server to do that, so it keeps using this text-only heuristic.
        if (!session) {
          const ranked = runImageMatch({
            animalType: input.animalType,
            color: input.color,
            size: input.size,
            breed: input.breed,
            location: input.location,
          });
          if (ranked.length) {
            setMatches((prev) => [
              ...ranked.slice(0, 3).map((m) => ({
                id: uid('mm'),
                lostReportId: report.id,
                candidateId: m.id,
                candidateSource: m.source,
                score: m.score,
                reasons: m.reasons,
                createdAt: new Date().toISOString(),
              })),
              ...prev,
            ]);
          }
        }
      }

      if (session) void refresh();
      return report;
    },
    [currentUser, shelters, pushNotification, runImageMatch, refresh],
  );

  const setReportStatus = useCallback<AppState['setReportStatus']>(
    (reportId, status) => {
      const session = sessionRef.current;
      const kind = reports.find((r) => r.id === reportId)?.kind;
      setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status } : r)));
      if (session && kind) send(apiActions.setReportStatus(session, kind, reportId, status));
    },
    [reports, send],
  );

  const deleteReport = useCallback<AppState['deleteReport']>(
    (reportId) => {
      const session = sessionRef.current;
      const kind = reports.find((r) => r.id === reportId)?.kind;
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      setMatches((prev) => prev.filter((m) => m.lostReportId !== reportId && m.candidateId !== reportId));
      if (session && kind) send(apiActions.deleteReport(session, kind, reportId));
    },
    [reports, send],
  );

  const setShelterApproval = useCallback<AppState['setShelterApproval']>(
    (shelterId, status) => {
      const session = sessionRef.current;
      setShelters((prev) => prev.map((s) => (s.id === shelterId ? { ...s, approvalStatus: status } : s)));
      if (!session) return;
      send(
        apiActions
          .reviewShelter(session, shelterId, status === 'approved' ? 'approve' : 'reject')
          .then((res) => {
            if (res.temporaryPassword && res.adminEmail) {
              setIssuedLogin({
                shelterId,
                email: res.adminEmail,
                password: res.temporaryPassword,
                emailSent: Boolean(res.emailSent),
              });
            }
          }),
      );
    },
    [send],
  );

  const openCase = useCallback<AppState['openCase']>(
    (reportId, note) => {
      const session = sessionRef.current;
      if (session) {
        // The server assigns the case id, and later status edits need it, so wait for it.
        send(
          apiActions.openCase(session, reportId, note).then((created) => {
            setCases((prev) => [created, ...prev]);
            setReports((prev) =>
              prev.map((r) => (r.id === reportId ? { ...r, caseId: created.id, status: 'matched' } : r)),
            );
          }),
        );
        return;
      }
      const id = uid('c');
      const at = new Date().toISOString();
      setCases((prev) => [
        {
          id,
          reportId,
          shelterId: currentShelter.id,
          status: 'under_rescue',
          openedAt: at,
          updatedAt: at,
          timeline: [{ at, status: 'under_rescue', note, by: currentShelter.name }],
        },
        ...prev,
      ]);
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, caseId: id, status: 'matched' } : r)),
      );
      pushNotification({
        audience: 'user',
        type: 'case_update',
        title: 'A shelter responded to your report',
        body: `${currentShelter.name} opened a rescue case. Status: Under rescue.`,
        relatedReportId: reportId,
      });
    },
    [currentShelter, pushNotification, send],
  );

  const setCaseStatus = useCallback<AppState['setCaseStatus']>(
    (caseId, status, note) => {
      const session = sessionRef.current;
      if (session) send(apiActions.setCaseStatus(session, caseId, status, note));
      const at = new Date().toISOString();
      let reportId: string | undefined;
      setCases((prev) =>
        prev.map((c) => {
          if (c.id !== caseId) return c;
          reportId = c.reportId;
          return {
            ...c,
            status,
            updatedAt: at,
            timeline: [...c.timeline, { at, status, note, by: currentShelter.name }],
          };
        }),
      );
      if (status === 'reunited' && reportId) {
        setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status: 'recovered' } : r)));
      }
      pushNotification({
        audience: 'user',
        type: 'case_update',
        title: 'Case status updated',
        body: `${currentShelter.name} set the case to "${status.replace('_', ' ')}". ${note}`,
        relatedReportId: reportId,
      });
    },
    [currentShelter, pushNotification, send],
  );

  const setShelterAnimalStatus = useCallback<AppState['setShelterAnimalStatus']>(
    (animalId, status) => {
      const session = sessionRef.current;
      setShelterAnimals((prev) =>
        prev.map((a) => (a.id === animalId ? { ...a, caseStatus: status } : a)),
      );
      if (session) send(apiActions.updateShelterAnimal(session, animalId, { caseStatus: status }));
    },
    [send],
  );

  const addShelterAnimal = useCallback<AppState['addShelterAnimal']>(
    (input) => {
      const session = sessionRef.current;
      if (session) {
        send(apiActions.addShelterAnimal(session, input).then((created) => setShelterAnimals((prev) => [created, ...prev])));
        return;
      }
      setShelterAnimals((prev) => [{ ...input, id: uid('sa'), shelterId: currentShelter.id }, ...prev]);
    },
    [currentShelter.id, send],
  );

  const toggleAnimalPublic = useCallback<AppState['toggleAnimalPublic']>(
    (animalId) => {
      const session = sessionRef.current;
      const next = !shelterAnimals.find((a) => a.id === animalId)?.postedPublicly;
      setShelterAnimals((prev) =>
        prev.map((a) => (a.id === animalId ? { ...a, postedPublicly: next } : a)),
      );
      if (session) send(apiActions.updateShelterAnimal(session, animalId, { postedPublicly: next }));
    },
    [shelterAnimals, send],
  );

  const updateShelterProfile = useCallback<AppState['updateShelterProfile']>(
    (patch) => {
      const session = sessionRef.current;
      // Shows immediately from the device's own local file; the real hosted URL replaces it
      // once the next refresh comes back, same as a shelter animal's photo.
      setShelters((prev) => prev.map((s) => (s.id === currentShelter.id ? { ...s, ...patch } : s)));
      if (!session) return;
      const ready =
        patch.photoUrl && isLocalImageUri(patch.photoUrl)
          ? uploadImage(session, patch.photoUrl).then((photoUrl) => ({ ...patch, photoUrl }))
          : Promise.resolve(
              patch.photoUrl ? { ...patch, photoUrl: toStoredImageUrl(patch.photoUrl, session.baseUrl) } : patch,
            );
      send(ready.then((finalPatch) => apiActions.updateShelterProfile(session, finalPatch)));
    },
    [currentShelter.id, send],
  );

  const updateUserProfile = useCallback<AppState['updateUserProfile']>(
    (patch) => {
      const session = sessionRef.current;
      setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? { ...u, ...patch } : u)));
      if (!session) return;
      const ready =
        patch.photoUrl && isLocalImageUri(patch.photoUrl)
          ? uploadImage(session, patch.photoUrl).then((photoUrl) => ({ ...patch, photoUrl }))
          : Promise.resolve(
              patch.photoUrl ? { ...patch, photoUrl: toStoredImageUrl(patch.photoUrl, session.baseUrl) } : patch,
            );
      send(ready.then((finalPatch) => apiActions.updateUserProfile(session, finalPatch)));
    },
    [currentUser.id, send],
  );

  const sendMessage = useCallback<AppState['sendMessage']>(
    (conversationId, senderRole, body) => {
      const session = sessionRef.current;
      const sentAt = new Date().toISOString();
      setMessages((prev) => [
        ...prev,
        {
          id: uid('msg'),
          conversationId,
          senderRole,
          senderName: senderRole === 'shelter_admin' ? currentShelter.name : currentUser.fullName,
          body,
          sentAt,
        },
      ]);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessageAt: sentAt,
                unreadForShelter: senderRole === 'user' ? c.unreadForShelter + 1 : 0,
                unreadForUser: senderRole === 'shelter_admin' ? c.unreadForUser + 1 : 0,
              }
            : c,
        ),
      );
      if (session) send(apiActions.sendMessage(session, conversationId, body));
    },
    [currentShelter.name, currentUser.fullName, send],
  );

  const startConversation = useCallback<AppState['startConversation']>(
    (shelterId, subject, body, reportId) => {
      const session = sessionRef.current;
      // The server keeps this id, so the thread can open before the request finishes.
      const id = session
        ? Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
        : uid('conv');
      const at = new Date().toISOString();
      setConversations((prev) => [
        {
          id,
          shelterId,
          userId: currentUser.id,
          userName: currentUser.fullName,
          reportId,
          subject,
          lastMessageAt: at,
          unreadForShelter: 1,
          unreadForUser: 0,
        },
        ...prev,
      ]);
      setMessages((prev) => [
        ...prev,
        { id: uid('msg'), conversationId: id, senderRole: 'user', senderName: currentUser.fullName, body, sentAt: at },
      ]);
      if (session) send(apiActions.startConversation(session, { id, shelterId, subject, body, reportId }));
      return id;
    },
    [currentUser, send],
  );

  const markConversationRead = useCallback<AppState['markConversationRead']>(
    (conversationId) => {
      const session = sessionRef.current;
      const asShelter = session ? session.role === 'shelter_admin' : false;
      const target = conversations.find((c) => c.id === conversationId);
      if (!target || (asShelter ? !target.unreadForShelter : !target.unreadForUser)) return;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, ...(asShelter ? { unreadForShelter: 0 } : { unreadForUser: 0 }) } : c,
        ),
      );
      if (session) send(apiActions.markConversationRead(session, conversationId));
    },
    [conversations, send],
  );

  const markNotificationRead = useCallback<AppState['markNotificationRead']>(
    (id) => {
      const session = sessionRef.current;
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      if (session) send(apiActions.markNotificationRead(session, id));
    },
    [send],
  );

  const markAllNotificationsRead = useCallback<AppState['markAllNotificationsRead']>(
    (role) => {
      const session = sessionRef.current;
      const unread = notifications.filter((n) => n.audience === role && !n.isRead);
      setNotifications((prev) => prev.map((n) => (n.audience === role ? { ...n, isRead: true } : n)));
      if (session && unread.length) {
        send(Promise.all(unread.map((n) => apiActions.markNotificationRead(session, n.id))));
      }
    },
    [notifications, send],
  );

  const resolveFlag = useCallback<AppState['resolveFlag']>(
    (flagId, resolution) => {
      const session = sessionRef.current;
      const target = flags.find((f) => f.id === flagId);
      if (session && target && resolution !== 'pending') {
        send(
          resolution === 'dismissed'
            ? apiActions.resolveFlag(session, flagId, 'dismiss')
            : apiActions
                .resolveFlag(session, flagId, 'remove_report')
                .then(() => (resolution === 'account_banned' ? apiActions.banUser(session, target.reporterId) : undefined)),
        );
      }
      setFlags((prev) => {
        const flag = prev.find((f) => f.id === flagId);
        if (flag && resolution === 'removed') {
          if (flag.reportType === 'shelter_animal') {
            setShelterAnimals((as) => as.filter((a) => a.id !== flag.reportId));
          } else {
            setReports((rs) => rs.filter((r) => r.id !== flag.reportId));
          }
        }
        if (flag && resolution === 'account_banned') {
          setUsers((us) => us.map((u) => (u.id === flag.reporterId ? { ...u, isBanned: true } : u)));
          setReports((rs) => rs.filter((r) => r.reporterId !== flag.reporterId));
        }
        return prev.map((f) => (f.id === flagId ? { ...f, resolution } : f));
      });
    },
    [flags, send],
  );

  const banUser = useCallback<AppState['banUser']>(
    (userId) => {
      const session = sessionRef.current;
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isBanned: true } : u)));
      setReports((prev) => prev.filter((r) => r.reporterId !== userId));
      if (session) send(apiActions.banUser(session, userId));
    },
    [send],
  );

  const deleteUserAccount = useCallback<AppState['deleteUserAccount']>(
    (userId) => {
      const session = sessionRef.current;
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setReports((prev) => prev.filter((r) => r.reporterId !== userId));
      if (session) send(apiActions.deleteUserAccount(session, userId));
    },
    [send],
  );

  const deleteShelterAccount = useCallback<AppState['deleteShelterAccount']>(
    (shelterId) => {
      const session = sessionRef.current;
      setShelters((prev) => prev.filter((s) => s.id !== shelterId));
      setShelterAnimals((prev) => prev.filter((a) => a.shelterId !== shelterId));
      if (session) send(apiActions.deleteShelterAccount(session, shelterId));
    },
    [send],
  );

  const updateSystemConfig = useCallback<AppState['updateSystemConfig']>(
    (patch) => {
      const session = sessionRef.current;
      setSystemConfig((prev) => (prev ? { ...prev, ...patch } : prev));
      if (session) send(apiActions.updateSystemConfig(session, patch));
    },
    [send],
  );

  const changeShelterPassword = useCallback<AppState['changeShelterPassword']>(async (currentPassword, newPassword) => {
    const session = sessionRef.current;
    if (!session) return;
    await apiActions.changeShelterPassword(session, currentPassword, newPassword);
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearIssuedLogin = useCallback(() => setIssuedLogin(null), []);
  const sync = useMemo<SyncState>(
    () => ({ status, error, clearError, refresh }),
    [status, error, clearError, refresh],
  );

  const value = useMemo<AppState>(
    () => ({
      users,
      shelters,
      reports,
      matches,
      shelterAnimals,
      cases,
      flags,
      notifications,
      conversations,
      messages,
      systemConfig,
      deployment,
      currentUser,
      currentShelter,
      sync,
      issuedLogin,
      clearIssuedLogin,
      stats,
      reportById,
      shelterById,
      myReports,
      nearbyReports,
      shelterAreaReports,
      matchesForReport,
      notificationsFor,
      messagesIn,
      caseForReport,
      runImageMatch,
      scanPhotoMatch,
      createReport,
      setReportStatus,
      deleteReport,
      setShelterApproval,
      openCase,
      setCaseStatus,
      setShelterAnimalStatus,
      addShelterAnimal,
      toggleAnimalPublic,
      updateShelterProfile,
      updateUserProfile,
      sendMessage,
      startConversation,
      markConversationRead,
      markNotificationRead,
      markAllNotificationsRead,
      resolveFlag,
      banUser,
      deleteUserAccount,
      deleteShelterAccount,
      changeShelterPassword,
      updateSystemConfig,
    }),
    [
      users, shelters, reports, matches, shelterAnimals, cases, flags, notifications,
      conversations, messages, systemConfig, deployment, currentUser, currentShelter, sync, issuedLogin, clearIssuedLogin,
      stats, reportById, shelterById,
      myReports, nearbyReports, shelterAreaReports, matchesForReport, notificationsFor,
      messagesIn, caseForReport, runImageMatch, scanPhotoMatch, createReport, setReportStatus, deleteReport,
      setShelterApproval, openCase, setCaseStatus, setShelterAnimalStatus, addShelterAnimal,
      toggleAnimalPublic, updateShelterProfile, updateUserProfile, sendMessage,
      startConversation, markConversationRead, markNotificationRead, markAllNotificationsRead, resolveFlag, banUser,
      deleteUserAccount, deleteShelterAccount, changeShelterPassword, updateSystemConfig,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppStoreProvider');
  return ctx;
}
