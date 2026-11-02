import { ALLOWED_PREPASS_SPECIES, interpretPrePass } from '../src/services/photoPrePass';

const answer = (overrides: Record<string, unknown> = {}) => ({
  species: 'dog',
  isRealPhoto: true,
  inappropriate: false,
  reasoning: 'A brown aspin standing on a street.',
  ...overrides,
});

describe('interpretPrePass - accepted photos', () => {
  it.each(['dog', 'cat', 'other_pet'])('accepts a real photo of a %s', (species) => {
    const verdict = interpretPrePass(answer({ species }));
    expect(verdict?.allowed).toBe(true);
    expect(verdict?.species).toBe(species);
  });

  it('only accepts the animals SaanPaw handles', () => {
    expect([...ALLOWED_PREPASS_SPECIES].sort()).toEqual(['cat', 'dog', 'other_pet']);
  });
});

describe('interpretPrePass - refused photos', () => {
  it.each(['none', 'wildlife', 'livestock'])('refuses a photo showing %s', (species) => {
    const verdict = interpretPrePass(answer({ species }));
    expect(verdict?.allowed).toBe(false);
    expect(verdict && !verdict.allowed && verdict.message).toMatch(/refused/);
  });

  it('refuses a drawing, screenshot or toy of an accepted animal', () => {
    const verdict = interpretPrePass(answer({ species: 'cat', isRealPhoto: false }));
    expect(verdict?.allowed).toBe(false);
    expect(verdict && !verdict.allowed && verdict.message).toMatch(/real photo/);
  });

  it('refuses inappropriate content even when it shows a dog', () => {
    const verdict = interpretPrePass(answer({ inappropriate: true }));
    expect(verdict?.allowed).toBe(false);
    expect(verdict && !verdict.allowed && verdict.message).toMatch(/inappropriate/);
  });

  it('caps the stored reasoning length', () => {
    const verdict = interpretPrePass(answer({ species: 'none', reasoning: 'x'.repeat(1000) }));
    expect(verdict?.reasoning.length).toBe(300);
  });
});

describe('interpretPrePass - unusable answers', () => {
  it('returns null when Gemini gave no answer', () => {
    expect(interpretPrePass(null)).toBeNull();
  });

  it('returns null for an unknown species value', () => {
    expect(interpretPrePass(answer({ species: 'dragon' }))).toBeNull();
  });

  it('returns null when the booleans are missing or the wrong type', () => {
    expect(interpretPrePass(answer({ isRealPhoto: 'yes' }))).toBeNull();
    expect(interpretPrePass({ species: 'dog' })).toBeNull();
  });
});
