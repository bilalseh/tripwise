import type { GeoPoint, TravelLeg } from '../generated/types';
import { haversineKm } from './geo';

// Mirrors api/src/tripwise_api/domain/geo.py so the browser can show a number instantly while
// the API refines long legs with OSRM.
export const DETOUR_FACTOR = 1.3;
export const WALK_KMH = 4.5;
export const DRIVE_KMH = 25;
export const DRIVE_OVERHEAD_MINUTES = 5;
export const WALK_LIMIT_KM = 2;

export function estimateLeg(from: GeoPoint, to: GeoPoint): TravelLeg {
  const km = haversineKm(from, to) * DETOUR_FACTOR;
  const walk = km <= WALK_LIMIT_KM;
  const minutes = walk ? (km / WALK_KMH) * 60 : (km / DRIVE_KMH) * 60 + DRIVE_OVERHEAD_MINUTES;
  return {
    minutes: Math.max(1, Math.round(minutes)),
    km: Math.round(km * 100) / 100,
    mode: walk ? 'walk' : 'drive',
    source: 'estimate',
  };
}

/** Legs between consecutive points (one fewer than the points). */
export function estimateLegs(points: readonly GeoPoint[]): TravelLeg[] {
  return points.slice(1).map((point, index) => estimateLeg(points[index] as GeoPoint, point));
}
