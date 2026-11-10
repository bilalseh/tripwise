import { describe, expect, it } from 'vitest';

import { haversineKm, type LatLng } from './geo';

const paris: LatLng = { lat: 48.8566, lng: 2.3522 };
const london: LatLng = { lat: 51.5074, lng: -0.1278 };

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(paris, paris)).toBe(0);
  });

  it('matches the known Paris to London distance within a kilometre', () => {
    expect(haversineKm(paris, london)).toBeCloseTo(343.5, 0);
  });

  it('is symmetric', () => {
    expect(haversineKm(london, paris)).toBeCloseTo(haversineKm(paris, london), 9);
  });

  it('takes the short way across the antimeridian', () => {
    const west: LatLng = { lat: 0, lng: 179.5 };
    const east: LatLng = { lat: 0, lng: -179.5 };
    expect(haversineKm(west, east)).toBeCloseTo(111.2, 0);
  });

  it('stays finite for antipodal points', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(20015.1, 0);
  });
});
