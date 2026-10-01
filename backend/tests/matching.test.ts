import { attributeScore } from '../src/services/matching.service';

const MUZON = { latitude: 14.8136, longitude: 121.0453 };
const FAR_AWAY = { latitude: 14.5995, longitude: 120.9842 }; // Manila, ~25km from Muzon

describe('attributeScore', () => {
  it('never matches a different species', () => {
    const result = attributeScore(
      { animalType: 'dog', location: MUZON },
      { animalType: 'cat' },
    );
    expect(result).toBeNull();
  });

  it('scores a strong match higher than a weak one', () => {
    const strong = attributeScore(
      { animalType: 'dog', color: 'brown white', breed: 'Aspin', size: 'medium', location: MUZON },
      {
        animalType: 'dog',
        color: 'brown with white chest',
        breed: 'Aspin mix',
        size: 'medium',
        location: MUZON,
      },
    );
    const weak = attributeScore(
      { animalType: 'dog', color: 'brown white', breed: 'Aspin', size: 'medium', location: MUZON },
      { animalType: 'dog', location: FAR_AWAY },
    );
    expect(strong).not.toBeNull();
    expect(weak).not.toBeNull();
    expect(strong!.score).toBeGreaterThan(weak!.score);
  });

  it('rewards proximity', () => {
    const near = attributeScore(
      { animalType: 'cat', location: MUZON },
      { animalType: 'cat', location: MUZON },
    );
    const far = attributeScore(
      { animalType: 'cat', location: MUZON },
      { animalType: 'cat', location: FAR_AWAY },
    );
    expect(near!.score).toBeGreaterThan(far!.score);
  });

  it('tolerates a candidate with no attributes at all beyond species', () => {
    const result = attributeScore(
      { animalType: 'other', location: MUZON },
      { animalType: 'other' },
    );
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0);
  });

  it('never exceeds the 0.99 cap', () => {
    const result = attributeScore(
      { animalType: 'dog', color: 'brown white black', breed: 'Aspin', size: 'medium', location: MUZON },
      {
        animalType: 'dog',
        color: 'brown white black',
        breed: 'Aspin',
        size: 'medium',
        location: MUZON,
      },
    );
    expect(result!.score).toBeLessThanOrEqual(0.99);
  });
});
