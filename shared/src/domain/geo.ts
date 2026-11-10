/** A point on the map, in decimal degrees (WGS 84, as returned by geocoders). */
export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

const EARTH_RADIUS_KM = 6371.0088;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle ("as the crow flies") distance in kilometres, by the haversine formula.
 * Used for clustering stops and for the labeled straight-line travel estimates.
 */
export function haversineKm(from: LatLng, to: LatLng): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}
