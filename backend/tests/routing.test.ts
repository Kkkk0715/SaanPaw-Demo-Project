import { parseOsrmRoute } from '../src/services/routing.service';

describe('parseOsrmRoute', () => {
  it('turns GeoJSON [lng, lat] into map [lat, lng] and rounds the totals', () => {
    expect(
      parseOsrmRoute({
        code: 'Ok',
        routes: [{ distance: 3210.6, duration: 540.4, geometry: { coordinates: [[121.04, 14.8], [121.05, 14.81]] } }],
      }),
    ).toEqual({ path: [[14.8, 121.04], [14.81, 121.05]], distanceMeters: 3211, durationSeconds: 540 });
  });

  it('returns null when there is no usable route', () => {
    expect(parseOsrmRoute({ code: 'NoRoute', routes: [] })).toBeNull();
    expect(parseOsrmRoute({ code: 'Ok', routes: [{ distance: 1, duration: 1, geometry: { coordinates: [[1, 2]] } }] })).toBeNull();
    expect(parseOsrmRoute(null)).toBeNull();
  });
});
