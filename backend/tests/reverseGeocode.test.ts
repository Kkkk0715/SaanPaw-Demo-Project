import { formatNominatimAddress } from '../src/services/reverseGeocode.service';

describe('formatNominatimAddress', () => {
  it('puts the most specific parts first', () => {
    expect(
      formatNominatimAddress({ house_number: '12', road: 'Quirino Highway', suburb: 'Muzon', city: 'San Jose del Monte' }),
    ).toEqual({
      address: '12 Quirino Highway, Muzon, San Jose del Monte',
      street: 'Quirino Highway',
      houseNumber: '12',
      area: 'Muzon',
      places: ['Muzon'],
    });
  });

  it('lists every place name, most specific first, for barangay matching', () => {
    expect(
      formatNominatimAddress({ residential: 'Francisco Homes', quarter: 'Francisco Homes-Narra', suburb: 'Kaypian' })?.places,
    ).toEqual(['Francisco Homes', 'Francisco Homes-Narra', 'Kaypian']);
  });

  it('skips missing parts and repeated names', () => {
    expect(formatNominatimAddress({ village: 'Tungkong Mangga', city: 'Tungkong Mangga' })?.address).toBe('Tungkong Mangga');
  });

  it('falls back to the display name, or null', () => {
    expect(formatNominatimAddress(undefined, 'Somewhere')?.address).toBe('Somewhere');
    expect(formatNominatimAddress({})).toBeNull();
  });
});
