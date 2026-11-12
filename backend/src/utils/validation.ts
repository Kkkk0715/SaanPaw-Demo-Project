import { z } from 'zod';
import { MIN_USER_AGE, ageFromBirthDate } from './age';
import { ANIMAL_CASE_STATUSES, ANIMAL_TYPES, SHELTER_ANIMAL_STATUSES } from '../config/constants';

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
/**
 * "0917 123 4567", "639171234567", "+63 917-123-4567" and "9171234567" all become
 * "+639171234567". Accounts saved before the +639 rule used other formats; without this, saving
 * any change to such a profile was rejected over the untouched phone number, and every edit
 * (photo included) rolled back.
 */
export function normalizePhMobile(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const digits = value.replace(/[\s().-]/g, '');
  if (/^\+639\d{9}$/.test(digits)) return digits;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;
  return value.trim();
}

const phMobile = z.preprocess(
  normalizePhMobile,
  z.string().regex(/^\+639\d{9}$/, 'Enter a valid mobile number (+639 followed by 9 digits)'),
);
const optionalPhMobile = z.union([z.literal(''), phMobile]).optional();

/** Any email provider is accepted (Gmail, Yahoo, Outlook, a school or work domain...). */
const emailAddress = z.string().trim().toLowerCase().max(200).email('Enter a valid email address');
const optionalEmailAddress = z.union([z.literal(''), emailAddress]).optional();

/**
 * Password policy for every password a person chooses (registration, reset, change):
 * at least 8 characters, a capital letter, a number, and a special character.
 * PASSWORD_RULES is exported so the apps can show the same checklist the server enforces.
 */
export const PASSWORD_RULES = [
  { test: (pw: string) => pw.length >= 8, message: 'Use at least 8 characters' },
  { test: (pw: string) => /[A-Z]/.test(pw), message: 'Include at least 1 capital letter (A-Z)' },
  { test: (pw: string) => /\d/.test(pw), message: 'Include at least 1 number (0-9)' },
  { test: (pw: string) => /[^A-Za-z0-9\s]/.test(pw), message: 'Include at least 1 special character (e.g. ! @ # $ %)' },
] as const;

export const strongPassword = z
  .string()
  .max(128, 'Use at most 128 characters')
  .superRefine((pw, ctx) => {
    for (const rule of PASSWORD_RULES) {
      if (!rule.test(pw)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: rule.message });
    }
  });

/** Letters only (any alphabet, so "Ñ" and accented names work), plus space, hyphen, apostrophe and period. */
const LETTERS_ONLY = /^[\p{L}][\p{L} .'-]*$/u;
const personName = (label: string) =>
  text(60).min(1, `Enter ${label}`).regex(LETTERS_ONLY, `${label[0].toUpperCase()}${label.slice(1)} can only contain letters`);
const optionalPersonName = z.union([z.literal(''), text(60).regex(LETTERS_ONLY, 'Names can only contain letters')]).optional();

/** "YYYY-MM-DD", a real date, and the person is 18 or older today (Philippine date). */
const adultBirthDate = z
  .string({ required_error: 'Enter your birthday', invalid_type_error: 'Enter your birthday' })
  .trim()
  // One message per problem: a blank birthday is only "Enter your birthday", not also "valid birthday".
  .superRefine((value, ctx) => {
    if (!value) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter your birthday' });
      return;
    }
    const age = ageFromBirthDate(value);
    if (age === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid birthday' });
    else if (age < MIN_USER_AGE)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `You must be at least ${MIN_USER_AGE} years old to register` });
    else if (age > 120) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid birthday' });
  });

const objectIdList = (max: number) => z.array(z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id')).max(max);

export const registerUserSchema = z.object({
  firstName: personName('your first name'),
  middleName: optionalPersonName,
  lastName: personName('your last name'),
  email: emailAddress,
  phone: phMobile,
  password: strongPassword,
  /** "YYYY-MM-DD"; registration is for adults only (18+). */
  birthDate: adultBirthDate,
  barangay: text(100).min(1, 'Select your barangay'),
  alertRadiusMeters: z.coerce.number().positive().max(50_000).default(3000),
  location: latLngSchema,
  /** From POST /auth/email-code/verify: proves the email address is real and theirs. */
  emailVerificationToken: z.string().trim().max(200).optional(),
});

export const registerShelterSchema = z.object({
  name: text(150).min(1, 'Enter the shelter name'),
  barangay: text(100).min(1, 'Select the barangay'),
  contactNumber: phMobile,
  email: emailAddress,
  houseUnitNo: optionalText(100),
  street: optionalText(150),
  subdivision: optionalText(150),
  location: latLngSchema,
  operatingRadiusMeters: z.coerce.number().positive().max(50_000).default(5000),
  permitNumber: optionalText(100),
  capacity: z.coerce.number().int().min(0).max(100_000).optional(),
  /** Proof of credentials uploaded first via POST /shelter/register/proof (documents, photos). */
  proofDocumentIds: objectIdList(10).min(1, 'Attach at least one proof document (permit, registration, ID or photos)'),
  /** From POST /auth/email-code/verify: proves the email address is real and theirs. */
  emailVerificationToken: z.string().trim().max(200).optional(),
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
  /** Street-level address of the pin, auto-filled from the map and editable by the reporter. */
  address: optionalText(300),
  /** Nearby landmark, e.g. "beside the 7-Eleven on Quirino Hwy". */
  landmark: optionalText(200),
});

export const matchScanSchema = z.object({
  animalType: z.enum(ANIMAL_TYPES),
  breed: optionalText(100),
  color: optionalText(100),
  size: size.optional(),
  location: latLngSchema,
  photoUrl: optionalText(1000),
  /** The owner's lost report this scan is for: its results are saved as that report's possible matches. */
  lostReportId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});

export const userProfileSchema = z.object({
  firstName: personName('your first name').optional(),
  middleName: optionalPersonName,
  lastName: personName('your last name').optional(),
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
  email: optionalEmailAddress,
  capacity: z.coerce.number().int().min(0).max(100_000).optional(),
  currentOccupancy: z.coerce.number().int().min(0).max(100_000).optional(),
});

/** The signed-in user deleting their own account: their password, typed again, confirms it. */
export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: strongPassword,
});

const resettableRole = z.enum(['user', 'shelter_admin']);

export const forgotPasswordSchema = z.object({
  role: resettableRole,
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

const sixDigitCode = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const verifyResetCodeSchema = z.object({
  role: resettableRole,
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  code: sixDigitCode,
});

/** Step 3 of the reset: the token from a verified code (or, from older app builds, the code itself). */
export const resetPasswordSchema = z
  .object({
    role: resettableRole,
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    resetToken: z.string().trim().regex(/^[a-f0-9]{64}$/).optional(),
    code: sixDigitCode.optional(),
    newPassword: strongPassword,
  })
  .refine((v) => Boolean(v.resetToken || v.code), { message: 'Verify the code from your email first', path: ['code'] });

export const emailCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  purpose: z.enum(['register_user', 'register_shelter']),
});

export const verifyEmailCodeSchema = emailCodeSchema.extend({ code: sixDigitCode });

const caseStatus = z.enum(ANIMAL_CASE_STATUSES);
/** A shelter animal has no "recovered" status - it is already in the shelter's care. */
const animalStatus = z.enum(SHELTER_ANIMAL_STATUSES);

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
  caseStatus: animalStatus.optional(),
  postedPublicly: z.boolean().optional(),
  notes: optionalText(1000),
});

export const shelterAnimalPatchSchema = z.object({
  caseStatus: animalStatus.optional(),
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
