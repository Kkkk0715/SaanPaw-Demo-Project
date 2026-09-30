/**
 * Breed/species lists for the report and shelter-animal forms. "Other" is always last, and picking
 * it reveals a free-text field - these lists are a starting point, not the full universe of pets
 * people in San Jose Del Monte actually keep.
 */

export const OTHER_OPTION = 'Other (please specify)';

export const DOG_BREEDS: string[] = [
  'Aspin (Asong Pinoy)',
  'Shih Tzu',
  'Chihuahua',
  'Pomeranian',
  'Poodle',
  'Labrador Retriever',
  'Golden Retriever',
  'German Shepherd',
  'Siberian Husky',
  'Beagle',
  'Dachshund',
  'Rottweiler',
  'Doberman Pinscher',
  'Bulldog',
  'French Bulldog',
  'Pug',
  'Shiba Inu',
  'Japanese Spitz',
  'Border Collie',
  'Australian Shepherd',
  'Cocker Spaniel',
  'Maltese',
  'Yorkshire Terrier',
  'Great Dane',
  'Boxer',
  'Belgian Malinois',
  'Bull Terrier',
  'American Pit Bull Terrier',
  'Mixed breed',
  OTHER_OPTION,
];

export const CAT_BREEDS: string[] = [
  'Puspin (Pusang Pinoy)',
  'Persian',
  'Siamese',
  'Maine Coon',
  'British Shorthair',
  'Scottish Fold',
  'Ragdoll',
  'Bengal',
  'Sphynx',
  'American Shorthair',
  'Himalayan',
  'Munchkin',
  'Exotic Shorthair',
  'Turkish Angora',
  'Mixed breed',
  OTHER_OPTION,
];

/** Common non-dog, non-cat household animals. */
export const HOUSEHOLD_ANIMALS: string[] = [
  'Rabbit',
  'Hamster',
  'Guinea pig',
  'Bird (parakeet/lovebird)',
  'Chicken',
  'Duck',
  'Turtle/Tortoise',
  'Goat',
  'Pig',
  'Fish',
  OTHER_OPTION,
];
