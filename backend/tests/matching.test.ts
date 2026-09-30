import { attributeScore } from '../src/services/matching.service';

const MUZON = { latitude: 14.8136, longitude: 121.0453 };
const FAR_AWAY = { latitude: 14.5995, longitude: 120.9842 }; // Manila, ~25km from Muzon

describe('attributeScore', () => {
  it('never matches a different species', () => {
    const result = attributeScore(
      { animalType: 'dog', location: MUZON },
      { id: 'c1', source: 'found_report', animalType: 'cat', imageUrls: [] },
    );
    expect(result).toBeNull();
  });

  it('scores a strong match higher than a weak one', () => {
    const strong = attributeScore(
      { animalType: 'dog', color: 'brown white', breed: 'Aspin', size: 'medium', location: MUZON },
      {
        id: 'c1',
        source: 'found_report',
        animalType: 'dog',
        color: 'brown with white chest',
        breed: 'Aspin mix',
        size: 'medium',
        imageUrls: [],
        location: MUZON,
      },
    );
    const weak = attributeScore(
      { animalType: 'dog', color: 'brown white', breed: 'Aspin', size: 'medium', location: MUZON },
      { id: 'c2', source: 'found_report', animalType: 'dog', imageUrls: [], location: FAR_AWAY },
    );
    expect(strong).not.toBeNull();
    expect(weak).not.toBeNull();
    expect(strong!.score).toBeGreaterThan(weak!.score);
  });

  it('rewards proximity', () => {
    const near = attributeScore(
      { animalType: 'cat', location: MUZON },
      { id: 'c1', source: 'shelter_animal', animalType: 'cat', imageUrls: [], location: MUZON },
    );
    const far = attributeScore(
      { animalType: 'cat', location: MUZON },
      { id: 'c2', source: 'shelter_animal', animalType: 'cat', imageUrls: [], location: FAR_AWAY },
    );
    expect(near!.score).toBeGreaterThan(far!.score);
  });

  it('tolerates a candidate with no attributes at all beyond species', () => {
    const result = attributeScore(
      { animalType: 'other', location: MUZON },
      { id: 'c1', source: 'shelter_animal', animalType: 'other', imageUrls: [] },
    );
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0);
  });

  it('never exceeds the 0.99 cap', () => {
    const result = attributeScore(
      { animalType: 'dog', color: 'brown white black', breed: 'Aspin', size: 'medium', location: MUZON },
      {
        id: 'c1',
        source: 'found_report',
        animalType: 'dog',
        color: 'brown white black',
        breed: 'Aspin',
        size: 'medium',
        imageUrls: [],
        location: MUZON,
      },
    );
    expect(result!.score).toBeLessThanOrEqual(0.99);
  });
});
