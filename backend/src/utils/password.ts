import crypto from 'crypto';

/**
 * A one-time password that meets the same rules people must follow when choosing one
 * (8+ characters, a number, a special character), so it is accepted everywhere a password is.
 */
export function generateTemporaryPassword(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const specials = '!@#$%&*?';
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  const chars = [pick(digits), pick(specials), ...Array.from({ length: 8 }, () => pick(letters + digits))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
