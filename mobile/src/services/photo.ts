import * as ImageManipulator from 'expo-image-manipulator';

const MAX_WIDTH = 1600;

/**
 * Phone cameras produce 3-8 MB photos, but Vercel rejects request bodies over 4.5 MB - so a
 * photo that looked fine in testing fails to upload on a real phone. Shrinking to a sensible
 * size first keeps uploads fast on mobile data too. Falls back to the original if it cannot.
 */
export async function shrinkPhoto(uri: string, width?: number): Promise<string> {
  try {
    const actions = width && width > MAX_WIDTH ? [{ resize: { width: MAX_WIDTH } }] : [];
    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return result.uri;
  } catch {
    return uri;
  }
}
