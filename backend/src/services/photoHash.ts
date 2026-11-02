/**
 * Perceptual "difference hash" (dHash): the photo is shrunk to a 9x8 greyscale grid and each bit
 * records whether a pixel is brighter than its right-hand neighbour. Re-compressing, resizing or
 * lightly editing a photo barely changes those 64 comparisons, so two copies of the same picture
 * land within a few bits of each other while different photos differ in roughly half of them.
 *
 * Pure and dependency-free: decoding the image into that grid is photoFingerprint.service.ts's job.
 */

export const DHASH_WIDTH = 9;
export const DHASH_HEIGHT = 8;

/** Bits (of 64) two hashes may differ by and still count as the same photo. */
export const DUPLICATE_MAX_DISTANCE = 6;

/** `pixels` is a row-major 9x8 greyscale grid (72 values, 0-255). Returns 16 hex characters. */
export function dHashFromGrid(pixels: ArrayLike<number>): string {
  if (pixels.length !== DHASH_WIDTH * DHASH_HEIGHT) {
    throw new Error(`dHash needs a ${DHASH_WIDTH}x${DHASH_HEIGHT} grid, got ${pixels.length} values`);
  }
  let hex = '';
  for (let row = 0; row < DHASH_HEIGHT; row++) {
    let byte = 0;
    for (let col = 0; col < DHASH_WIDTH - 1; col++) {
      const left = pixels[row * DHASH_WIDTH + col];
      const right = pixels[row * DHASH_WIDTH + col + 1];
      byte = (byte << 1) | (left > right ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/** Number of differing bits between two 16-hex-character hashes. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let i = 0; i < a.length; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) {
      distance += x & 1;
      x >>= 1;
    }
  }
  return distance;
}

export const isSamePhoto = (a: string, b: string) => hammingDistance(a, b) <= DUPLICATE_MAX_DISTANCE;
