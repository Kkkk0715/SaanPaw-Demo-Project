/**
 * Search tags kept on every report and shelter animal ("aiTags"). The AI photo autofill suggests
 * feature tags (e.g. "white chest", "red collar"); the report's own fields always add the basics
 * (type, breed, colour words, size, sex, barangay), so every record is searchable by tag even when
 * the AI was unavailable or the reporter typed the details themselves.
 */
const STOP = new Set(['and', 'with', 'the', 'a', 'an', 'of', 'on', 'in', 'its', 'has', 'is', 'very']);

function words(value?: string | null): string[] {
  return (value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9ñ-]+/i)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export function buildTags(input: {
  aiTags?: string[];
  animalType?: string;
  breed?: string | null;
  color?: string | null;
  size?: string | null;
  sex?: string | null;
  barangay?: string | null;
}): string[] {
  const tags = new Set<string>();
  for (const t of input.aiTags ?? []) {
    const clean = String(t).toLowerCase().trim().slice(0, 30);
    if (clean) tags.add(clean);
  }
  if (input.animalType) tags.add(input.animalType);
  if (input.breed) tags.add(input.breed.toLowerCase().trim().slice(0, 30));
  for (const w of words(input.color)) tags.add(w);
  if (input.size) tags.add(input.size);
  if (input.sex && input.sex !== 'unknown') tags.add(input.sex);
  if (input.barangay) tags.add(input.barangay.toLowerCase());
  return [...tags].slice(0, 20);
}
