import {
  caseStatusSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  queryNumber,
  registerShelterSchema,
  registerUserSchema,
  reportSchema,
  resetPasswordSchema,
  verifyResetCodeSchema,
  verifyEmailCodeSchema,
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

  it('keeps the address and landmark of the pin', () => {
    const parsed = reportSchema.parse({ ...report, address: ' 12 Quirino Hwy, Muzon ', landmark: 'Near the chapel' });
    expect(parsed.address).toBe('12 Quirino Hwy, Muzon');
    expect(parsed.landmark).toBe('Near the chapel');
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
    password: 'Passw0rd!',
    birthDate: '1999-05-14',
    barangay: 'Muzon',
    location,
  };

  it('requires a birthday of someone 18 or older', () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date(Date.now() + 8 * 3600_000);
    const ymd = (yearsAgo: number, dayShift = 0) => {
      const d = new Date(Date.UTC(now.getUTCFullYear() - yearsAgo, now.getUTCMonth(), now.getUTCDate() + dayShift));
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    };
    expect(registerUserSchema.safeParse({ ...user, birthDate: ymd(18) }).success).toBe(true); // 18th birthday today
    const almost = registerUserSchema.safeParse({ ...user, birthDate: ymd(18, 1) }); // turns 18 tomorrow
    expect(almost.success).toBe(false);
    expect(JSON.stringify(almost.error?.issues)).toContain('at least 18');
    expect(registerUserSchema.safeParse({ ...user, birthDate: '2005-02-30' }).success).toBe(false);
    expect(registerUserSchema.safeParse({ ...user, birthDate: ymd(-1) }).success).toBe(false);
    const { birthDate: _omit, ...noBirthday } = user;
    expect(registerUserSchema.safeParse(noBirthday).success).toBe(false);
    const blank = registerUserSchema.safeParse({ ...user, birthDate: '' });
    expect(blank.success ? [] : blank.error.issues.map((i) => i.message)).toEqual(['Enter your birthday']);
  });

  it('applies the default alert radius', () => {
    expect(registerUserSchema.parse(user).alertRadiusMeters).toBe(3000);
  });

  it('accepts any email provider but rejects a malformed address', () => {
    expect(registerUserSchema.parse({ ...user, email: 'Ana@Yahoo.com' }).email).toBe('ana@yahoo.com');
    expect(registerUserSchema.parse({ ...user, email: 'ana@stisjdm.edu.ph' }).email).toBe('ana@stisjdm.edu.ph');
    expect(() => registerUserSchema.parse({ ...user, email: 'nope' })).toThrow();
  });

  it.each([
    ['short', 'Sh0rt!'],
    ['no number', 'Password!'],
    ['no capital letter', 'passw0rd!'],
    ['no special character', 'Password1'],
  ])('rejects a password with %s', (_label, password) => {
    expect(() => registerUserSchema.parse({ ...user, password })).toThrow();
  });

  it('names every password rule that is not met', () => {
    const result = registerUserSchema.safeParse({ ...user, password: 'abc' });
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        'Use at least 8 characters',
        'Include at least 1 capital letter (A-Z)',
        'Include at least 1 number (0-9)',
        expect.stringMatching(/special/),
      ]),
    );
  });

  it('only accepts letters in names', () => {
    expect(registerUserSchema.parse({ ...user, firstName: 'María Ñiña', lastName: "O'Neil-Santos" }).firstName).toBe(
      'María Ñiña',
    );
    expect(() => registerUserSchema.parse({ ...user, firstName: 'Ana2' })).toThrow();
    expect(() => registerUserSchema.parse({ ...user, lastName: 'Reyes!' })).toThrow();
    expect(() => registerUserSchema.parse({ ...user, middleName: '123' })).toThrow();
  });

  it('stores a PH mobile number as +639XXXXXXXXX, however it was typed', () => {
    expect(registerUserSchema.parse(user).phone).toBe('+639171234567');
    for (const typed of ['09171234567', '0917 123 4567', '639171234567', '+63 917-123-4567', '9171234567']) {
      expect(registerUserSchema.parse({ ...user, phone: typed }).phone).toBe('+639171234567');
    }
    expect(() => registerUserSchema.parse({ ...user, phone: '+63917123456' })).toThrow();
    expect(() => registerUserSchema.parse({ ...user, phone: '0817 123 4567' })).toThrow();
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
    proofDocumentIds: ['64b7f0c2a1b2c3d4e5f60718'],
  };

  it('accepts any email provider and requires a PH mobile contact number', () => {
    expect(registerShelterSchema.parse(shelter).email).toBe('shelter@gmail.com');
    expect(registerShelterSchema.parse({ ...shelter, email: 'shelter@yahoo.com' }).email).toBe('shelter@yahoo.com');
    expect(registerShelterSchema.parse({ ...shelter, contactNumber: '0917 123 4567' }).contactNumber).toBe('+639171234567');
    expect(() => registerShelterSchema.parse({ ...shelter, contactNumber: '12345' })).toThrow();
  });

  it('requires at least one proof document', () => {
    expect(() => registerShelterSchema.parse({ ...shelter, proofDocumentIds: [] })).toThrow(/proof document/);
    expect(() => registerShelterSchema.parse({ ...shelter, proofDocumentIds: undefined })).toThrow();
    expect(() => registerShelterSchema.parse({ ...shelter, proofDocumentIds: ['not-an-id'] })).toThrow();
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

  it('accepts any valid email on the shelter profile', () => {
    expect(shelterProfileSchema.parse({ email: 'shelter@yahoo.com' }).email).toBe('shelter@yahoo.com');
    expect(() => shelterProfileSchema.parse({ email: 'not an email' })).toThrow();
  });
});

describe('changePasswordSchema', () => {
  it('requires a current password and a new one that meets the password rules', () => {
    expect(() => changePasswordSchema.parse({ currentPassword: '', newPassword: 'Passw0rd!' })).toThrow();
    expect(() => changePasswordSchema.parse({ currentPassword: 'old', newPassword: 'short' })).toThrow();
    expect(() => changePasswordSchema.parse({ currentPassword: 'old', newPassword: 'longenough' })).toThrow();
    expect(() => changePasswordSchema.parse({ currentPassword: 'old', newPassword: 'passw0rd!' })).toThrow();
    expect(changePasswordSchema.parse({ currentPassword: 'old', newPassword: 'Passw0rd!' }).newPassword).toBe(
      'Passw0rd!',
    );
  });
});

describe('forgotPasswordSchema', () => {
  it('requires a valid email and a resettable role', () => {
    expect(() => forgotPasswordSchema.parse({ role: 'user', email: 'not-an-email' })).toThrow();
    expect(() => forgotPasswordSchema.parse({ role: 'developer', email: 'a@b.com' })).toThrow();
    expect(forgotPasswordSchema.parse({ role: 'user', email: 'A@B.COM' }).email).toBe('a@b.com');
    expect(forgotPasswordSchema.parse({ role: 'shelter_admin', email: 'shelter@gmail.com' }).role).toBe(
      'shelter_admin',
    );
  });
});

describe('resetPasswordSchema', () => {
  it('requires a 6-digit code and a new password that meets the password rules', () => {
    expect(() =>
      resetPasswordSchema.parse({ role: 'user', email: 'a@b.com', code: '12345', newPassword: 'Passw0rd!' }),
    ).toThrow();
    expect(() =>
      resetPasswordSchema.parse({ role: 'user', email: 'a@b.com', code: '123456', newPassword: 'short' }),
    ).toThrow();
    expect(
      resetPasswordSchema.parse({ role: 'user', email: 'a@b.com', code: '123456', newPassword: 'Passw0rd!' }).code,
    ).toBe('123456');
  });
});

describe('password reset steps', () => {
  it('checks the code on its own, digits only', () => {
    expect(verifyResetCodeSchema.parse({ role: 'user', email: 'A@B.com ', code: '123456' }).email).toBe('a@b.com');
    expect(() => verifyResetCodeSchema.parse({ role: 'user', email: 'a@b.com', code: '12a456' })).toThrow();
  });

  it('sets the password with the token from a verified code, and refuses neither token nor code', () => {
    const token = 'a'.repeat(64);
    expect(
      resetPasswordSchema.parse({ role: 'shelter_admin', email: 'a@b.com', resetToken: token, newPassword: 'Passw0rd!' })
        .resetToken,
    ).toBe(token);
    expect(() => resetPasswordSchema.parse({ role: 'user', email: 'a@b.com', newPassword: 'Passw0rd!' })).toThrow();
  });
});

describe('verifyEmailCodeSchema', () => {
  it('needs a sign-up purpose and a 6-digit code', () => {
    expect(verifyEmailCodeSchema.parse({ email: 'x@y.ph', purpose: 'register_user', code: '000111' }).purpose).toBe(
      'register_user',
    );
    expect(() => verifyEmailCodeSchema.parse({ email: 'x@y.ph', purpose: 'developer', code: '000111' })).toThrow();
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
