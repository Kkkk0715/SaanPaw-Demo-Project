import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
import { buildTags } from '../src/services/tags.service';
import { readRegistrationToken, readState, signRegistrationToken } from '../src/services/facebook.service';
import { createTicketSchema, ticketPatchSchema, ticketReplySchema } from '../src/modules/support/ticket.routes';
import { guestKeySchema, guestReportSchema } from '../src/utils/validation';
import { hashGuestKey, newGuestKey } from '../src/services/guestReporter.service';
import { readLoginTicket, readSocialRegistration, signLoginTicket, signSocialRegistration } from '../src/services/social.service';

describe('buildTags', () => {
  it('combines AI tags with the report fields, lower-cased and de-duplicated', () => {
    const tags = buildTags({
      aiTags: ['White Chest', 'red collar', 'white chest'],
      animalType: 'dog',
      breed: 'Aspin',
      color: 'Brown and white',
      size: 'medium',
      sex: 'female',
      barangay: 'Muzon',
    });
    expect(tags).toEqual(['white chest', 'red collar', 'dog', 'aspin', 'brown', 'white', 'medium', 'female', 'muzon']);
  });

  it('leaves out an unknown sex and short filler words', () => {
    const tags = buildTags({ animalType: 'cat', color: 'black with a white tip', sex: 'unknown' });
    expect(tags).toEqual(['cat', 'black', 'white', 'tip']);
  });

  it('never returns more than 20 tags', () => {
    const many = Array.from({ length: 40 }, (_, i) => `tag ${i}`);
    expect(buildTags({ aiTags: many, animalType: 'dog' }).length).toBe(20);
  });
});

describe('Facebook connection tokens', () => {
  it('accepts its own registration token', () => {
    const token = signRegistrationToken({ id: '123', name: 'Juan Dela Cruz' });
    expect(readRegistrationToken(token)).toEqual({ id: '123', name: 'Juan Dela Cruz' });
  });

  it('refuses a sign-in token used as a registration token, and the other way round', () => {
    const session = jwt.sign({ id: 'u1', role: 'user' }, env.jwtSecret, { algorithm: 'HS256' });
    expect(() => readRegistrationToken(session)).toThrow();
    const registration = signRegistrationToken({ id: '123', name: 'X' });
    expect(() => readState(registration)).toThrow();
  });

  it('refuses a state signed with another key', () => {
    const forged = jwt.sign({ purpose: 'link', userId: 'u1', kind: 'fb_state' }, 'not-the-secret', { algorithm: 'HS256' });
    expect(() => readState(forged)).toThrow();
  });

  it('reads back a genuine state', () => {
    const state = jwt.sign({ purpose: 'link', userId: 'u1', kind: 'fb_state' }, env.jwtSecret, { algorithm: 'HS256' });
    const back = readState(state) as { purpose: string; userId?: string };
    expect(back.purpose).toBe('link');
    expect(back.userId).toBe('u1');
  });
});

describe('support ticket input', () => {
  it('needs a subject and a description', () => {
    expect(createTicketSchema.safeParse({ subject: 'Hi', message: 'Help me please' }).success).toBe(false);
    expect(createTicketSchema.safeParse({ subject: 'Photo upload fails', message: 'Help' }).success).toBe(false);
    const ok = createTicketSchema.parse({ subject: 'Photo upload fails', message: 'It spins forever.' });
    expect(ok.category).toBe('other');
  });

  it('rejects unknown categories and statuses', () => {
    expect(createTicketSchema.safeParse({ subject: 'Photo upload', message: 'Spins forever', category: 'hack' }).success).toBe(false);
    expect(ticketReplySchema.safeParse({ message: 'ok', status: 'deleted' }).success).toBe(false);
  });

  it('a change must change something', () => {
    expect(ticketPatchSchema.safeParse({}).success).toBe(false);
    expect(ticketPatchSchema.safeParse({ status: 'resolved' }).success).toBe(true);
  });
});

describe('guest reports', () => {
  const base = {
    animalType: 'dog',
    color: 'brown',
    imageUrls: ['/uploads/aaaaaaaaaaaaaaaaaaaaaaaa'],
    barangay: 'Muzon',
    location: { latitude: 14.8, longitude: 121.05 },
  };

  it('needs the guest name and a Philippine mobile number', () => {
    expect(guestReportSchema.safeParse(base).success).toBe(false);
    expect(guestReportSchema.safeParse({ ...base, reporterName: 'Juan', reporterPhone: '12345' }).success).toBe(false);
    expect(guestReportSchema.safeParse({ ...base, reporterName: 'J', reporterPhone: '09171234567' }).success).toBe(false);
    expect(guestReportSchema.safeParse({ ...base, reporterName: '<script>', reporterPhone: '09171234567' }).success).toBe(false);
    const ok = guestReportSchema.parse({ ...base, reporterName: 'Juan Dela Cruz', reporterPhone: '0917 123 4567' });
    expect(ok.reporterPhone).toBe('+639171234567');
  });

  it('only accepts a well-formed private key', () => {
    expect(guestKeySchema.safeParse({ key: 'abc' }).success).toBe(false);
    expect(guestKeySchema.safeParse({ key: 'a'.repeat(48) }).success).toBe(true);
  });

  it('stores only a hash of the key, and the hash matches only that key', () => {
    const { key, hash } = newGuestKey();
    expect(key).toMatch(/^[a-f0-9]{48}$/);
    expect(hash).not.toBe(key);
    expect(hashGuestKey(key)).toBe(hash);
    expect(hashGuestKey(newGuestKey().key)).not.toBe(hash);
  });
});

describe('Continue with Google / Facebook', () => {
  const profile = { provider: 'google' as const, id: '123', name: 'Juan Dela Cruz', email: 'juan@gmail.com', emailVerified: true };

  it('carries the provider profile into registration, and nothing else is accepted there', () => {
    const t = signSocialRegistration(profile);
    expect(readSocialRegistration(t).email).toBe('juan@gmail.com');
    expect(readSocialRegistration(t).emailVerified).toBe(true);
    expect(() => readSocialRegistration(signLoginTicket('u1'))).toThrow();
  });

  it('a sign-in ticket works once', () => {
    const ticket = signLoginTicket('u1');
    expect(readLoginTicket(ticket)).toBe('u1');
    expect(() => readLoginTicket(ticket)).toThrow();
    expect(() => readLoginTicket(signSocialRegistration(profile))).toThrow();
  });
});
