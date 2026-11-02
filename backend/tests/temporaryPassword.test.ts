import { generateTemporaryPassword } from '../src/utils/password';
import { PASSWORD_RULES } from '../src/utils/validation';

describe('generateTemporaryPassword', () => {
  it('always meets the password rules people have to follow', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateTemporaryPassword();
      for (const rule of PASSWORD_RULES) expect(rule.test(pw)).toBe(true);
    }
  });
});
