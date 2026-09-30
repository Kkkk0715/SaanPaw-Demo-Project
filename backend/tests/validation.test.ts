import {
  caseStatusSchema,
  changePasswordSchema,
  queryNumber,
  registerShelterSchema,
  registerUserSchema,
  reportSchema,
  shelterAnimalPatchSchema,
  shelterProfileSchema,
} from '../src/utils/validation';
import { combineAddress, combineName } from '../src/utils/geoHelpers';

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
  const user = {
    firstName: 'Ana',
    lastName: 'Reyes',
    email: 'ana@gmail.com',
    phone: '+639171234567',
    password: 'password1',
    barangay: 'Muzon',
    location,
  };

  it('applies the default alert radius', () => {
    expect(registerUserSchema.parse(user).alertRadiusMeters).toBe(3000);
  });

  it('rejects a short password and a non-Gmail email', () => {
    expect(() => registerUserSchema.parse({ ...user, password: 'short' })).toThrow();
    expect(() => registerUserSchema.parse({ ...user, email: 'ana@yahoo.com' })).toThrow();
    expect(() => registerUserSchema.parse({ ...user, email: 'nope' })).toThrow();
  });

  it('only accepts a PH mobile number in +639XXXXXXXXX form', () => {
    expect(registerUserSchema.parse(user).phone).toBe('+639171234567');
    expect(() => registerUserSchema.parse({ ...user, phone: '09171234567' })).toThrow();
    expect(() => registerUserSchema.parse({ ...user, phone: '+63917123456' })).toThrow();
    expect(() => registerUserSchema.parse({ ...user, phone: '+639171234567a' })).toThrow();
  });

  it('allows a blank middle name but requires first and last', () => {
    expect(registerUserSchema.parse(user).middleName).toBeUndefined();
    expect(() => registerUserSchema.parse({ ...user, firstName: '' })).toThrow();
    expect(() => registerUserSchema.parse({ ...user, lastName: '' })).toThrow();
  });
});

describe('registerShelterSchema', () => {
  const shelter = {
    name: 'Test Shelter',
    barangay: 'Muzon',
    contactNumber: '+639171234567',
    email: 'shelter@gmail.com',
    location,
  };

  it('requires a Gmail email and a PH mobile contact number', () => {
    expect(registerShelterSchema.parse(shelter).email).toBe('shelter@gmail.com');
    expect(() => registerShelterSchema.parse({ ...shelter, email: 'shelter@yahoo.com' })).toThrow();
    expect(() => registerShelterSchema.parse({ ...shelter, contactNumber: '0917 123 4567' })).toThrow();
  });

  it('accepts the broken-down address parts', () => {
    const parsed = registerShelterSchema.parse({
      ...shelter,
      houseUnitNo: 'Blk 5 Lot 12',
      street: 'Sampaguita St.',
      subdivision: 'Greenfields',
    });
    expect(parsed.houseUnitNo).toBe('Blk 5 Lot 12');
    expect(parsed.street).toBe('Sampaguita St.');
    expect(parsed.subdivision).toBe('Greenfields');
  });
});

describe('combineName / combineAddress', () => {
  it('joins name parts and skips a blank middle name', () => {
    expect(combineName({ firstName: 'Ana', middleName: 'Reyes', lastName: 'Cruz' })).toBe('Ana Reyes Cruz');
    expect(combineName({ firstName: 'Ana', lastName: 'Cruz' })).toBe('Ana Cruz');
    expect(combineName({ firstName: 'Ana', middleName: null, lastName: 'Cruz' })).toBe('Ana Cruz');
  });

  it('joins address parts and skips whichever are blank', () => {
    expect(combineAddress({ houseUnitNo: 'Blk 5', street: 'Sampaguita St.', subdivision: 'Greenfields' })).toBe(
      'Blk 5, Sampaguita St., Greenfields',
    );
    expect(combineAddress({ street: 'Sampaguita St.' })).toBe('Sampaguita St.');
    expect(combineAddress({})).toBe('');
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

  it('rejects a non-Gmail email on the shelter profile', () => {
    expect(() => shelterProfileSchema.parse({ email: 'shelter@yahoo.com' })).toThrow();
  });
});

describe('changePasswordSchema', () => {
  it('requires both a current and a new password of at least 8 characters', () => {
    expect(() => changePasswordSchema.parse({ currentPassword: '', newPassword: 'password1' })).toThrow();
    expect(() => changePasswordSchema.parse({ currentPassword: 'old', newPassword: 'short' })).toThrow();
    expect(changePasswordSchema.parse({ currentPassword: 'old', newPassword: 'password1' }).newPassword).toBe(
      'password1',
    );
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
