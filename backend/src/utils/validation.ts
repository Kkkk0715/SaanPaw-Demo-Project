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

export const registerUserSchema = z.object({
  fullName: text(100).min(1, 'Enter your full name'),
  email: z.string().trim().email('Enter a valid email address').max(200),
  phone: optionalText(30),
  password: z.string().min(8, 'Use at least 8 characters').max(128),
  barangay: text(100).min(1, 'Select your barangay'),
  alertRadiusMeters: z.coerce.number().positive().max(50_000).default(3000),
  location: latLngSchema,
});

export const registerShelterSchema = z.object({
  name: text(150).min(1, 'Enter the shelter name'),
  barangay: text(100).min(1, 'Select the barangay'),
  contactNumber: optionalText(30),
  email: z.string().trim().email('Enter a valid email address').max(200).optional(),
  address: optionalText(300),
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

export const userProfileSchema = z.object({
  fullName: text(100).min(1).optional(),
  phone: optionalText(30),
  barangay: text(100).min(1).optional(),
  alertRadiusMeters: z.coerce.number().positive().max(50_000).optional(),
  location: latLngSchema.optional(),
});

export const shelterProfileSchema = z.object({
  name: text(150).min(1).optional(),
  contactNumber: optionalText(30),
  address: optionalText(300),
  barangay: text(100).min(1).optional(),
  location: latLngSchema.optional(),
  operatingRadiusMeters: z.coerce.number().positive().max(50_000).optional(),
  email: z.union([z.literal(''), z.string().trim().email().max(200)]).optional(),
  capacity: z.coerce.number().int().min(0).max(100_000).optional(),
  currentOccupancy: z.coerce.number().int().min(0).max(100_000).optional(),
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
