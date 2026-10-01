import { z } from 'zod';
import { ANIMAL_CASE_STATUSES, ANIMAL_TYPES } from '../config/constants';

/**
 * Request bodies are parsed with these schemas, which both reject bad input with a 400 and drop
 * any field not listed - a client cannot set `status`, `caseId` or `isHiddenByModeration` itself.
 */

const text = (max = 500) => z.string().trim().max(max);
const optionalText = (max = 500) => text(max).optional();

export const latLngSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const sex = z.enum(['male', 'female', 'unknown']);
const size = z.enum(['small', 'medium', 'large']);
const imageUrls = z.array(text(1000)).max(5).default([]);

/** Philippine mobile number, e.g. "+639171234567" - the +639 prefix plus 9 more digits. */
const phMobile = z.string().trim().regex(/^\+639\d{9}$/, 'Enter a valid mobile number (+639 followed by 9 digits)');
const optionalPhMobile = z.union([z.literal(''), phMobile]).optional();

/** Only Gmail addresses are accepted, per the app's registration policy. */
const gmailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[^\s@]+@gmail\.com$/, 'Enter a Gmail address (must end in @gmail.com)')
  .max(200);
const optionalGmailAddress = z.union([z.literal(''), gmailAddress]).optional();

const personName = (label: string) => text(60).min(1, `Enter ${label}`);

export const registerUserSchema = z.object({
  firstName: personName('your first name'),
  middleName: optionalText(60),
  lastName: personName('your last name'),
  email: gmailAddress,
  phone: phMobile,
  password: z.string().min(8, 'Use at least 8 characters').max(128),
  barangay: text(100).min(1, 'Select your barangay'),
  alertRadiusMeters: z.coerce.number().positive().max(50_000).default(3000),
  location: latLngSchema,
});

export const registerShelterSchema = z.object({
  name: text(150).min(1, 'Enter the shelter name'),
  barangay: text(100).min(1, 'Select the barangay'),
  contactNumber: phMobile,
  email: gmailAddress,
  houseUnitNo: optionalText(100),
  street: optionalText(150),
  subdivision: optionalText(150),
  location: latLngSchema,
  operatingRadiusMeters: z.coerce.number().positive().max(50_000).default(5000),
  permitNumber: optionalText(100),
  capacity: z.coerce.number().int().min(0).max(100_000).optional(),
});

export const reportSchema = z.object({
  name: optionalText(100),
  animalType: z.enum(ANIMAL_TYPES),
  breed: optionalText(100),
  color: optionalText(100),
  sex: sex.optional(),
  size: size.optional(),
  distinctMarks: optionalText(500),
  description: optionalText(1000),
  imageUrls,
  barangay: text(100).min(1, 'Select the barangay'),
  location: latLngSchema,
});

export const matchScanSchema = z.object({
  animalType: z.enum(ANIMAL_TYPES),
  breed: optionalText(100),
  color: optionalText(100),
  size: size.optional(),
  location: latLngSchema,
  photoUrl: optionalText(1000),
});

export const userProfileSchema = z.object({
  firstName: text(60).min(1).optional(),
  middleName: optionalText(60),
  lastName: text(60).min(1).optional(),
  phone: optionalPhMobile,
  photoUrl: optionalText(1000),
  barangay: text(100).min(1).optional(),
  alertRadiusMeters: z.coerce.number().positive().max(50_000).optional(),
  location: latLngSchema.optional(),
});

export const shelterProfileSchema = z.object({
  name: text(150).min(1).optional(),
  contactNumber: optionalPhMobile,
  houseUnitNo: optionalText(100),
  street: optionalText(150),
  subdivision: optionalText(150),
  photoUrl: optionalText(1000),
  barangay: text(100).min(1).optional(),
  location: latLngSchema.optional(),
  operatingRadiusMeters: z.coerce.number().positive().max(50_000).optional(),
  email: optionalGmailAddress,
  capacity: z.coerce.number().int().min(0).max(100_000).optional(),
  currentOccupancy: z.coerce.number().int().min(0).max(100_000).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(8, 'Use at least 8 characters').max(128),
});

const resettableRole = z.enum(['user', 'shelter_admin']);

export const forgotPasswordSchema = z.object({
  role: resettableRole,
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

export const resetPasswordSchema = z.object({
  role: resettableRole,
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  code: z.string().trim().length(6, 'Enter the 6-digit code'),
  newPassword: z.string().min(8, 'Use at least 8 characters').max(128),
});

const caseStatus = z.enum(ANIMAL_CASE_STATUSES);

export const shelterAnimalSchema = z.object({
  name: optionalText(100),
  animalType: z.enum(ANIMAL_TYPES),
  breed: optionalText(100),
  color: optionalText(100),
  sex: sex.optional(),
  size: size.optional(),
  distinctMarks: optionalText(500),
  description: optionalText(1000),
  imageUrls,
  intakeType: z.enum(['surrendered', 'recovered', 'rescued']).optional(),
  intakeDate: z.coerce.date().optional(),
  caseStatus: caseStatus.optional(),
  postedPublicly: z.boolean().optional(),
  notes: optionalText(1000),
});

export const shelterAnimalPatchSchema = z.object({
  caseStatus: caseStatus.optional(),
  postedPublicly: z.boolean().optional(),
});

export const openCaseSchema = z.object({ reportId: objectId, note: optionalText(1000) });

export const caseStatusSchema = z.object({ status: caseStatus, notes: optionalText(1000) });

export const startConversationSchema = z.object({
  /** Chosen by the app so it can open the thread before the server answers. */
  id: objectId.optional(),
  shelterId: objectId,
  subject: text(200).min(1),
  body: text(2000).min(1),
  reportId: objectId.optional(),
});

export const sendMessageSchema = z.object({ body: text(2000).min(1) });

/** A finite number from a query-string value, or undefined when absent or not numeric. */
export const queryNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};
