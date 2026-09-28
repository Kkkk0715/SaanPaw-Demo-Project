import { useState } from 'react';
import { View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '@/constants/theme';
import {
  AnimalPhoto,
  Banner,
  Button,
  Card,
  Caption,
  Choice,
  EmptyState,
  Field,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Sheet,
} from '@/components/ui';
import { ShelterAnimalCard } from '@/components/domain';
import { shrinkPhoto } from '@/services/photo';
import { useApp } from '@saanpaw/shared';
import type { AnimalCaseStatus, AnimalType, ShelterAnimal } from '@saanpaw/shared';

/** Shelter Admin Module - The animals in this shelter's care. */
export function ShelterAnimalsScreen() {
  const { shelterAnimals, currentShelter, addShelterAnimal, toggleAnimalPublic } = useApp();

  const [filter, setFilter] = useState<AnimalCaseStatus | 'all'>('all');
  const [adding, setAdding] = useState(false);

  const [name, setName] = useState('');
  const [animalType, setAnimalType] = useState<AnimalType>('dog');
  const [breed, setBreed] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState<ShelterAnimal['size']>('medium');
  const [intakeType, setIntakeType] = useState<ShelterAnimal['intakeType']>('rescued');
  const [notes, setNotes] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState('');

  const mine = shelterAnimals.filter((a) => a.shelterId === currentShelter.id);
  const shown = mine.filter((a) => (filter === 'all' ? true : a.caseStatus === filter));

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });
    if (!res.canceled && res.assets[0]) setImage(await shrinkPhoto(res.assets[0].uri, res.assets[0].width));
  };

  const save = () => {
    if (!name.trim() || !color.trim()) {
      setError('A name and coat colour are required so the animal can be matched.');
      return;
    }
    addShelterAnimal({
      name: name.trim(),
      animalType,
      breed: breed.trim() || undefined,
      color: color.trim(),
      size,
      imageUrls: image ? [image] : [],
      intakeType,
      intakeDate: new Date().toISOString(),
      caseStatus: 'under_rescue',
      postedPublicly: false,
      notes: notes.trim() || undefined,
    });
    setAdding(false);
    setName('');
    setBreed('');
    setColor('');
    setNotes('');
    setImage(null);
    setError('');
  };

  return (
    <Screen>
      <Banner
        tone="info"
        icon="albums"
        title={`${mine.length} animals on record`}
        message={`Animals in ${currentShelter.name}'s care. Anything marked public also appears to users under Shelter View and is included in image-recognition matching.`}
      />

      <Button label="Add an animal to the database" icon="add-circle-outline" onPress={() => setAdding(true)} />

      <Segmented
        options={[
          { label: 'All', value: 'all' },
          { label: 'Under rescue', value: 'under_rescue', color: theme.colors.info },
          { label: 'Reunited', value: 'reunited' },
          { label: 'Adopted', value: 'adopted', color: theme.colors.accent },
        ]}
        value={filter}
        onChange={(v) => setFilter(v as AnimalCaseStatus | 'all')}
      />

      <SectionHeader title={`${shown.length} ${shown.length === 1 ? 'animal' : 'animals'}`} />

      {shown.length ? (
        shown.map((a) => (
          <ShelterAnimalCard
            key={a.id}
            animal={a}
            right={
              <Button
                label={a.postedPublicly ? 'Unpublish' : 'Publish'}
                variant={a.postedPublicly ? 'ghost' : 'secondary'}
                icon={a.postedPublicly ? 'eye-off-outline' : 'eye-outline'}
                full={false}
                onPress={() => toggleAnimalPublic(a.id)}
              />
            }
          />
        ))
      ) : (
        <Card>
          <EmptyState
            icon="paw-outline"
            title="Nothing in this list"
            message="Add the animals currently in your care so they can be matched against lost pet reports across the city."
            action="Add an animal"
            onAction={() => setAdding(true)}
          />
        </Card>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add animal to shelter database">
        <View style={{ gap: theme.spacing(1.5) }}>
          <Row gap={1.5} align="flex-start">
            <AnimalPhoto uri={image ?? undefined} size={80} />
            <View style={{ flex: 1 }}>
              <Button label="Add photo" variant="secondary" icon="camera-outline" onPress={pick} />
              <Caption>Photos are what the recognition matcher compares against.</Caption>
            </View>
          </Row>

          <Field label="Name or reference" value={name} onChangeText={setName} placeholder="e.g. Blackie, or 'Unnamed brown dog'" />
          <Choice
            label="Animal type"
            options={[
              { label: 'Dog', value: 'dog', icon: 'paw' },
              { label: 'Cat', value: 'cat' },
              { label: 'Other', value: 'other' },
            ]}
            value={animalType}
            onChange={setAnimalType}
          />
          <Field label="Breed" value={breed} onChangeText={setBreed} placeholder="e.g. Aspin" />
          <Field label="Coat colour" value={color} onChangeText={setColor} placeholder="e.g. black with white paws" />
          <Choice
            label="Size"
            options={[
              { label: 'Small', value: 'small' },
              { label: 'Medium', value: 'medium' },
              { label: 'Large', value: 'large' },
            ]}
            value={size ?? 'medium'}
            onChange={(v) => setSize(v as ShelterAnimal['size'])}
          />
          <Choice
            label="Intake type"
            options={[
              { label: 'Rescued', value: 'rescued' },
              { label: 'Recovered', value: 'recovered' },
              { label: 'Surrendered', value: 'surrendered' },
            ]}
            value={intakeType}
            onChange={(v) => setIntakeType(v as ShelterAnimal['intakeType'])}
          />
          <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Condition, vet checks, holding period..." multiline />
          {error ? <Caption style={{ color: theme.colors.danger }}>{error}</Caption> : null}
          <Button label="Save to database" icon="save-outline" onPress={save} />
        </View>
      </Sheet>
    </Screen>
  );
}
