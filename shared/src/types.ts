export type Role = 'developer' | 'shelter_admin' | 'user';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export type AnimalType = 'dog' | 'cat' | 'other';
export type AnimalSex = 'male' | 'female' | 'unknown';
export type AnimalSize = 'small' | 'medium' | 'large';

/** Which of the two report flows produced a record. */
export type ReportKind = 'lost' | 'found';

/** Lifecycle of a report as owned by the reporting user. */
export type ReportStatus = 'active' | 'matched' | 'recovered' | 'closed';

/** Scope: "Animal Status Management (under rescue / reunited / adopted / inconclusive)". */
export type AnimalCaseStatus = 'under_rescue' | 'reunited' | 'adopted' | 'inconclusive';

/** Scope: Developer "Shelter Approval Management". */
export type ShelterApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface AnimalDescriptor {
  animalType: AnimalType;
  breed?: string;
  color?: string;
  sex?: AnimalSex;
  size?: AnimalSize;
  distinctMarks?: string;
}

export interface AnimalReport extends AnimalDescriptor {
  id: string;
  kind: ReportKind;
  /** Pet name - only meaningful for a lost report. */
  name?: string;
  description?: string;
  imageUrls: string[];
  status: ReportStatus;
  reportedAt: string;
  reporterId: string;
  reporterName: string;
  reporterPhone?: string;
  barangay: string;
  location: LatLng;
  /** Set once a shelter takes the report on as a case. */
  caseId?: string;
  /** Populated by the developer module's AI moderation pass. */
  moderationFlagId?: string;
}

export interface MatchSuggestion {
  id: string;
  /** The lost report the user is trying to resolve. */
  lostReportId: string;
  /** The found report or shelter animal being proposed as the same animal. */
  candidateId: string;
  candidateSource: 'found_report' | 'shelter_animal';
  /** Image-recognition confidence, 0-1. */
  score: number;
  /** Human-readable reasons behind the score, shown under the match card. */
  reasons: string[];
  createdAt: string;
}

export interface Shelter {
  id: string;
  name: string;
  barangay: string;
  /** House/Unit No., e.g. "Blk 5 Lot 12". */
  houseUnitNo?: string;
  street?: string;
  subdivision?: string;
  /** "House/Unit No., Street, Subdivision" - derived server-side for display. */
  address: string;
  contactNumber: string;
  email: string;
  photoUrl?: string;
  location: LatLng;
  /** Scope: shelter admin "select their operations radius". */
  operatingRadiusMeters: number;
  approvalStatus: ShelterApprovalStatus;
  registeredAt: string;
  /** Local-government permit number the developer verifies before approving. */
  permitNumber: string;
  capacity: number;
  currentOccupancy: number;
  logoColor: string;
}

export interface ShelterAnimal extends AnimalDescriptor {
  id: string;
  shelterId: string;
  name: string;
  imageUrls: string[];
  /** Where the animal came from - intake or a recovery in the field. */
  intakeType: 'surrendered' | 'recovered' | 'rescued';
  intakeDate: string;
  caseStatus: AnimalCaseStatus;
  /** True once the shelter posts it publicly under "Recovered Animals Posting". */
  postedPublicly: boolean;
  notes?: string;
}

export interface AnimalCase {
  id: string;
  reportId: string;
  shelterId: string;
  status: AnimalCaseStatus;
  openedAt: string;
  updatedAt: string;
  timeline: { at: string; status: AnimalCaseStatus; note: string; by: string }[];
}

export interface NotificationItem {
  id: string;
  audience: Role;
  type: 'lost_nearby' | 'found_nearby' | 'match_found' | 'case_update' | 'message' | 'system';
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  /** Distance from the recipient, in metres - the smart alert radius check. */
  distanceMeters?: number;
  relatedReportId?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderRole: Role;
  senderName: string;
  body: string;
  sentAt: string;
}

export interface Conversation {
  id: string;
  shelterId: string;
  userId: string;
  userName: string;
  /** The report that started the conversation. */
  reportId?: string;
  subject: string;
  lastMessageAt: string;
  unreadForShelter: number;
  unreadForUser: number;
}

/** Scope: Developer "Report Monitoring ... AI system that automatically flags". */
export interface ModerationFlag {
  id: string;
  /** What reportId points into: a citizen's report, or a shelter's own animal posting. */
  reportType: 'lost' | 'found' | 'shelter_animal';
  reportId: string;
  reporterId: string;
  reporterName: string;
  reason: 'suspected_false' | 'inappropriate_image' | 'duplicate' | 'spam';
  /** AI confidence that the report is false or inappropriate, 0-1. */
  confidence: number;
  detail: string;
  flaggedAt: string;
  resolution: 'pending' | 'dismissed' | 'removed' | 'account_banned';
}

/** Developer-controlled feature toggles, enforced server-side - not just a display of intent. */
export interface SystemConfig {
  aiModeration: boolean;
  smartAlerts: boolean;
  geoFence: boolean;
  maintenanceMode: boolean;
  updatedAt?: string;
}

/** Developer Module "Deployment" card - facts about the running instance, computed fresh per request. */
export interface DeploymentInfo {
  environment: string;
  databaseConnected: boolean;
  uptimeSeconds: number;
  nodeVersion: string;
}

export interface AppUser {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  /** "First Middle Last", derived server-side - kept for display so nothing that already reads it needs to change. */
  fullName: string;
  email: string;
  phone: string;
  photoUrl?: string;
  barangay: string;
  location: LatLng;
  /** Scope: user registration "select their radius to receive notifications". */
  alertRadiusMeters: number;
  joinedAt: string;
  /** Running count used by the developer module's ban decision. */
  flaggedReportCount: number;
  isBanned: boolean;
}

export interface DashboardStats {
  lostToday: number;
  foundToday: number;
  activeReports: number;
  reunitedThisMonth: number;
  underRescue: number;
  sheltersOnline: number;
}
