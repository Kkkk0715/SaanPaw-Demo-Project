import {
  caseStatusSchema,
  queryNumber,
  registerUserSchema,
  reportSchema,
  shelterAnimalPatchSchema,
  shelterProfileSchema,
} from '../src/utils/validation';

const location = { latitude: 14.81, longitude: 121.04 };
const report = { animalType: 'dog', barangay: 'Muzon', location };

describe('reportSchema', () => {
  it('accepts a minimal report and defaults the photo list', () => {
    expect(reportSchema.parse(report).imageUrls).toEqual([]);
  });

  it('drops fields a client must not set', () => {
    const parsed = reportSchema.parse({ ...report, status: 'recovered', isHiddenByModeration: true, caseId: 'x' });
    expect(parsed).not.toHaveProperty('status');
    expect(parsed).not.toHaveProperty('isHiddenByModeration');
    expect(parsed).not.toHaveProperty('caseId');
  });

  it('rejects an unknown animal type and a missing location', () => {
    expect(() => reportSchema.parse({ ...report, animalType: 'dragon' })).toThrow();
    expect(() => reportSchema.parse({ ...report, location: undefined })).toThrow();
  });

  it('accepts coordinates sent as strings', () => {
    const parsed = reportSchema.parse({ ...report, location: { latitude: '14.8', longitude: '121.0' } });
    expect(parsed.location).toEqual({ latitude: 14.8, longitude: 121 });
  });

  it('allows at most five photos', () => {
    expect(() => reportSchema.parse({ ...report, imageUrls: Array(6).fill('/uploads/a.jpg') })).toThrow();
  });
});

describe('registerUserSchema', () => {
  const user = { fullName: 'Ana', email: 'ana@example.ph', password: 'password1', barangay: 'Muzon', location };

  it('applies the default alert radius', () => {
    expect(registerUserSchema.parse(user).alertRadiusMeters).toBe(3000);
  });

  it('rejects a short password and a bad email', () => {
    expect(() => registerUserSchema.parse({ ...user, password: 'short' })).toThrow();
    expect(() => registerUserSchema.parse({ ...user, email: 'nope' })).toThrow();
  });
});

describe('status and profile schemas', () => {
  it('only accepts the four case statuses', () => {
    expect(caseStatusSchema.parse({ status: 'reunited' }).status).toBe('reunited');
    expect(() => caseStatusSchema.parse({ status: 'weird' })).toThrow();
  });

  it('rejects an invalid animal status instead of storing it', () => {
    expect(() => shelterAnimalPatchSchema.parse({ caseStatus: 'nonsense' })).toThrow();
  });

  it('lets a shelter save its profile with a blank email', () => {
    expect(shelterProfileSchema.parse({ email: '' }).email).toBe('');
  });
});

describe('queryNumber', () => {
  it('reads numbers and ignores anything else', () => {
    expect(queryNumber('121.05')).toBe(121.05);
    expect(queryNumber('abc')).toBeUndefined();
    expect(queryNumber('')).toBeUndefined();
    expect(queryNumber(undefined)).toBeUndefined();
  });
});
