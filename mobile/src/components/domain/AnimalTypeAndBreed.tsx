import { useEffect, useRef, useState } from 'react';
import { CAT_BREEDS, DOG_BREEDS, HOUSEHOLD_ANIMALS, OTHER_OPTION } from '@/constants/animalBreeds';
import { Field, Select } from '@/components/ui';
import type { AnimalType } from '@saanpaw/shared';

const listFor = (animalType: AnimalType) =>
  animalType === 'dog' ? DOG_BREEDS : animalType === 'cat' ? CAT_BREEDS : HOUSEHOLD_ANIMALS;

/**
 * The breed/animal picker used by both the lost/found report form and the shelter's "add animal"
 * form. Dog and Cat show a breed dropdown; Other shows a dropdown of common household animals
 * instead (a breed does not apply the same way there), and either dropdown falls back to free text
 * when the real answer is not in the list.
 */
export function AnimalTypeAndBreed({
  animalType,
  breed,
  onBreedChange,
}: {
  animalType: AnimalType;
  breed: string;
  onBreedChange: (b: string) => void;
}) {
  const list = listFor(animalType);
  const initial = breed && list.includes(breed) ? breed : breed ? OTHER_OPTION : null;
  const [selected, setSelected] = useState<string | null>(initial);
  const [customText, setCustomText] = useState(breed && !list.includes(breed) ? breed : '');

  // Switching Dog/Cat/Other invalidates whatever was picked from the previous list.
  const prevType = useRef(animalType);
  useEffect(() => {
    if (prevType.current === animalType) return;
    prevType.current = animalType;
    setSelected(null);
    setCustomText('');
    onBreedChange('');
    // onBreedChange is stable enough here; re-running this on identity changes would fight typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animalType]);

  return (
    <>
      <Select
        label={animalType === 'other' ? 'Animal' : 'Breed (if known)'}
        value={selected}
        options={list}
        placeholder={animalType === 'other' ? 'Select the kind of animal' : 'Select a breed'}
        icon="paw-outline"
        onChange={(v) => {
          setSelected(v);
          onBreedChange(v === OTHER_OPTION ? customText : v);
        }}
      />
      {selected === OTHER_OPTION ? (
        <Field
          label={animalType === 'other' ? 'Specify the animal' : 'Specify the breed'}
          value={customText}
          onChangeText={(v) => {
            setCustomText(v);
            onBreedChange(v);
          }}
          placeholder={animalType === 'other' ? 'e.g. Iguana' : 'e.g. Aspin-Shih Tzu mix'}
        />
      ) : null}
    </>
  );
}
