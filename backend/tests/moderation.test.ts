import { REVIEW_THRESHOLD, assessReport } from '../src/services/moderation.service';

const flagged = (text: string, extra: { imageCount?: number; duplicate?: boolean } = {}) =>
  assessReport({ text, imageCount: 1, ...extra });

describe('reports that must NOT be flagged', () => {
  it.each([
    'Bruno Aspin brown with white chest white paw Wearing a red collar, very friendly, answers to his name',
    'Puspin grey tabby small Has a notched left ear, last seen near the Muzon market',
    'Shih Tzu cream Missing since Sunday evening, please call if you see him',
    'Dog named Lady Gaga, golden retriever, wearing a blue harness',
    'Cat named Dick, orange, very shy',
    'Brown dog, tested negative at the vet last week, needs medication',
  ])('%s', (text) => {
    expect(flagged(text).confidence).toBeLessThan(REVIEW_THRESHOLD);
  });
});

describe('reports that must be flagged', () => {
  it('abusive language, as inappropriate', () => {
    const r = flagged('this stupid dog is a putangina gago');
    expect(r.confidence).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
    expect(r.reason).toBe('inappropriate');
  });

  it('explicit words, as inappropriate', () => {
    expect(flagged('free porn here').reason).toBe('inappropriate');
  });

  it('links and promotions, as spam', () => {
    const r = flagged('Lost dog!! visit www.cheap-loans.com or https://bit.example for promo');
    expect(r.confidence).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
    expect(r.reason).toBe('manual');
    expect(r.detail).toMatch(/link/);
  });

  it.each(['test test test', 'asdf asdf', 'lorem ipsum dolor sit', 'just a prank', 'aaaaaaaa dog', 'testing 123'])(
    'placeholder text: %s',
    (text) => {
      const r = flagged(text);
      expect(r.confidence).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
      expect(r.reason).toBe('ai_false_positive');
    },
  );

  it('a near-identical report from the same person, as a duplicate', () => {
    const r = flagged('Bruno Aspin brown with white chest very friendly dog', { duplicate: true });
    expect(r.confidence).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
    expect(r.reason).toBe('duplicate');
  });

  it('a photo-less, description-less report tips over the threshold together', () => {
    const r = assessReport({ text: 'dog', imageCount: 0 });
    expect(r.confidence).toBeGreaterThanOrEqual(0.45);
  });
});

describe('scoring details', () => {
  it('never exceeds 1', () => {
    expect(assessReport({ text: 'fuck asdf www.x.com', imageCount: 0, duplicate: true }).confidence).toBe(1);
  });

  it('explains what it found', () => {
    expect(flagged('asdf').detail).toMatch(/placeholder/);
  });

  it('ignores accents and capitals', () => {
    expect(flagged('PUTANGINA').reason).toBe('inappropriate');
  });

  it('matches whole words only', () => {
    expect(flagged('a classic bobolink cassette photo of the dog wearing a collar').confidence).toBeLessThan(
      REVIEW_THRESHOLD,
    );
  });
});
