/**
 * Convert between MongoDB GeoJSON Point format and frontend LatLng format.
 * 
 * MongoDB uses [longitude, latitude] in coordinates.
 * Frontend expects { latitude, longitude } for readability.
 */

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

export function geoPointToLatLng(point: GeoPoint | undefined): LatLng | undefined {
  if (!point || !point.coordinates || point.coordinates.length !== 2) {
    return undefined;
  }
  const [lng, lat] = point.coordinates;
  return { latitude: lat, longitude: lng };
}

export function latLngToGeoPoint(latLng: LatLng): GeoPoint {
  return {
    type: 'Point',
    coordinates: [latLng.longitude, latLng.latitude],
  };
}

/** "First Middle Last", skipping a blank middle name. */
export function combineName(parts: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
}): string {
  return [parts.firstName, parts.middleName, parts.lastName].filter(Boolean).join(' ');
}

/** "House/Unit No., Street, Subdivision", skipping whichever parts are blank. */
export function combineAddress(parts: {
  houseUnitNo?: string | null;
  street?: string | null;
  subdivision?: string | null;
}): string {
  return [parts.houseUnitNo, parts.street, parts.subdivision].filter(Boolean).join(', ');
}

export function serializeUser(doc: any) {
  return {
    id: String(doc._id),
    firstName: doc.firstName,
    middleName: doc.middleName,
    lastName: doc.lastName,
    fullName: combineName(doc),
    email: doc.email,
    phone: doc.phone,
    photoUrl: doc.photoUrl,
    barangay: doc.barangay,
    location: geoPointToLatLng(doc.homeLocation),
    alertRadiusMeters: doc.alertRadiusMeters,
    joinedAt: doc.joinedAt?.toISOString?.(),
    flaggedReportCount: doc.flaggedReportCount,
    isBanned: doc.isBanned,
  };
}

export function serializeShelter(doc: any) {
  return {
    id: String(doc._id),
    name: doc.name,
    barangay: doc.barangay,
    houseUnitNo: doc.houseUnitNo,
    street: doc.street,
    subdivision: doc.subdivision,
    address: combineAddress(doc),
    contactNumber: doc.contactNumber,
    email: doc.email,
    photoUrl: doc.photoUrl,
    location: geoPointToLatLng(doc.location),
    operatingRadiusMeters: doc.operatingRadiusMeters,
    approvalStatus: doc.approvalStatus,
    registeredAt: doc.registeredAt?.toISOString?.(),
    permitNumber: doc.permitNumber,
    capacity: doc.capacity,
    currentOccupancy: doc.currentOccupancy,
    logoColor: doc.logoColor,
  };
}

export function serializeLostReport(doc: any) {
  const [lng, lat] = doc.lastSeenLocation?.coordinates || [0, 0];
  return {
    id: String(doc._id),
    kind: 'lost',
    name: doc.name,
    animalType: doc.animalType,
    breed: doc.breed,
    color: doc.color,
    sex: doc.sex,
    size: doc.size,
    distinctMarks: doc.distinctMarks,
    description: doc.description,
    imageUrls: doc.imageUrls || [],
    status: doc.status,
    reportedAt: doc.reportedAt?.toISOString?.(),
    reporterId: String(doc.reporterId),
    reporterName: doc.reporterName,
    reporterPhone: doc.reporterPhone,
    barangay: doc.barangay,
    location: { latitude: lat, longitude: lng },
    caseId: doc.caseId ? String(doc.caseId) : undefined,
    moderationFlagId: doc.moderationFlagId ? String(doc.moderationFlagId) : undefined,
  };
}

export function serializeFoundReport(doc: any) {
  const [lng, lat] = doc.foundLocation?.coordinates || [0, 0];
  return {
    id: String(doc._id),
    kind: 'found',
    animalType: doc.animalType,
    breed: doc.breed,
    color: doc.color,
    sex: doc.sex,
    size: doc.size,
    distinctMarks: doc.distinctMarks,
    description: doc.description,
    imageUrls: doc.imageUrls || [],
    status: doc.status,
    reportedAt: doc.reportedAt?.toISOString?.(),
    reporterId: String(doc.reporterId),
    reporterName: doc.reporterName,
    reporterPhone: doc.reporterPhone,
    barangay: doc.barangay,
    location: { latitude: lat, longitude: lng },
    caseId: doc.caseId ? String(doc.caseId) : undefined,
    moderationFlagId: doc.moderationFlagId ? String(doc.moderationFlagId) : undefined,
  };
}

export function serializeShelterAnimal(doc: any) {
  return {
    id: String(doc._id),
    shelterId: String(doc.shelterId),
    name: doc.name,
    animalType: doc.animalType,
    breed: doc.breed,
    color: doc.color,
    sex: doc.sex,
    size: doc.size,
    distinctMarks: doc.distinctMarks,
    imageUrls: doc.imageUrls || [],
    intakeType: doc.intakeType,
    intakeDate: doc.intakeDate?.toISOString?.(),
    caseStatus: doc.caseStatus,
    postedPublicly: doc.postedPublicly,
    notes: doc.notes,
  };
}

export function serializeMatchSuggestion(doc: any) {
  return {
    id: String(doc._id),
    lostReportId: String(doc.lostReportId),
    candidateId: String(doc.candidateId ?? doc.foundReportId),
    candidateSource: doc.candidateSource ?? 'found_report',
    score: doc.score ?? doc.similarityScore ?? 0,
    reasons: doc.reasons || [],
    createdAt: doc.createdAt?.toISOString?.(),
  };
}

export function serializeNotification(doc: any) {
  const audienceMap: Record<string, string> = {
    user: 'user',
    shelter: 'shelter_admin',
  };
  
  const typeMap: Record<string, string> = {
    lost_report: 'lost_nearby',
    found_report: 'found_nearby',
    match: 'match_found',
    status_update: 'case_update',
    message: 'message',
    moderation: 'system',
  };

  return {
    id: String(doc._id),
    audience: audienceMap[doc.audienceType] || doc.audienceType,
    type: typeMap[doc.type] || doc.type,
    title: doc.title,
    body: doc.body,
    isRead: doc.isRead || false,
    createdAt: doc.createdAt?.toISOString?.(),
    distanceMeters: doc.distanceMeters,
    relatedReportId: doc.refId ? String(doc.refId) : undefined,
  };
}

export function serializeCase(doc: any, shelterName = 'Shelter') {
  return {
    id: String(doc._id),
    reportId: String(doc.lostReportId ?? doc.foundReportId ?? ''),
    shelterId: String(doc.shelterId),
    status: doc.status,
    openedAt: doc.createdAt?.toISOString?.(),
    updatedAt: doc.updatedAt?.toISOString?.(),
    timeline: (doc.history ?? []).map((h: any) => ({
      at: h.changedAt?.toISOString?.(),
      status: h.status,
      note: h.note ?? '',
      by: shelterName,
    })),
  };
}

const FLAG_REASON_MAP: Record<string, string> = {
  ai_false_positive: 'suspected_false',
  inappropriate: 'inappropriate_image',
  duplicate: 'duplicate',
  manual: 'spam',
};

const FLAG_DETAIL: Record<string, string> = {
  ai_false_positive: 'The AI check found this report looks unlikely to be genuine.',
  inappropriate: 'The AI check found the attached content may be inappropriate.',
  duplicate: 'This looks like a duplicate of an existing report.',
  manual: 'Flagged for manual review.',
};

export function serializeFlag(doc: any, reporterName: string, reporterBanned: boolean) {
  const resolution =
    doc.status === 'dismissed'
      ? 'dismissed'
      : doc.status === 'actioned'
        ? reporterBanned
          ? 'account_banned'
          : 'removed'
        : 'pending';
  return {
    id: String(doc._id),
    reportId: String(doc.reportId),
    reporterId: String(doc.reporterId),
    reporterName,
    reason: FLAG_REASON_MAP[doc.reason] ?? 'spam',
    confidence: doc.aiConfidence ?? 0,
    detail: doc.resolutionNote || doc.detail || FLAG_DETAIL[doc.reason] || '',
    flaggedAt: doc.createdAt?.toISOString?.(),
    resolution,
  };
}

export function serializeConversation(doc: any, userName: string) {
  return {
    id: String(doc._id),
    shelterId: String(doc.shelterId),
    userId: String(doc.userId),
    userName,
    reportId: doc.relatedReportId ? String(doc.relatedReportId) : undefined,
    subject: doc.subject ?? '',
    lastMessageAt: doc.lastMessageAt?.toISOString?.(),
    unreadForShelter: doc.unreadForShelter ?? 0,
    unreadForUser: doc.unreadForUser ?? 0,
  };
}

export function serializeMessage(doc: any, senderName: string) {
  return {
    id: String(doc._id),
    conversationId: String(doc.conversationId),
    senderRole: doc.senderType === 'shelter' ? 'shelter_admin' : 'user',
    senderName,
    body: doc.body,
    sentAt: doc.sentAt?.toISOString?.(),
  };
}
