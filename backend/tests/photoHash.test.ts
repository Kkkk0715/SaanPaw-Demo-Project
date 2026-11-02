import { DUPLICATE_MAX_DISTANCE, dHashFromGrid, hammingDistance, isSamePhoto } from '../src/services/photoHash';

const grid = (fn: (row: number, col: number) => number) =>
  Array.from({ length: 72 }, (_, i) => fn(Math.floor(i / 9), i % 9));

describe('dHashFromGrid', () => {
  it('sets a bit wherever a pixel is brighter than the one to its right', () => {
    expect(dHashFromGrid(grid((_r, c) => 255 - c * 20))).toBe('ffffffffffffffff');
    expect(dHashFromGrid(grid((_r, c) => c * 20))).toBe('0000000000000000');
  });

  it('needs exactly a 9x8 grid', () => {
    expect(() => dHashFromGrid([1, 2, 3])).toThrow(/9x8/);
  });
});

describe('hammingDistance / isSamePhoto', () => {
  it('counts differing bits', () => {
    expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0);
    expect(hammingDistance('0000000000000000', '000000000000000f')).toBe(4);
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });

  it('treats a few changed bits as the same photo and many as a different one', () => {
    expect(isSamePhoto('136cccccccc46308', '136cccccccc46309')).toBe(true);
    expect(DUPLICATE_MAX_DISTANCE).toBeLessThan(10);
    expect(isSamePhoto('0000000000000000', '00000000000000ff')).toBe(false);
  });
});
