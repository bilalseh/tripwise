import { estimateLegs, type Stop, type TravelLeg } from '@tripwise/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { placesApi } from '../../lib/queries';

/**
 * Travel legs for a day's stops: straight-line estimates immediately (so dragging feels
 * instant), replaced by the API's answer, which uses OSRM for longer legs when it can.
 */
export function useDayLegs(stops: readonly Stop[], enabled = true): TravelLeg[] {
  const points = useMemo(() => stops.map((s) => s.place.location), [stops]);
  const estimates = useMemo(() => estimateLegs(points), [points]);
  const needsRouting = estimates.some((leg) => leg.mode === 'drive');
  const routed = useQuery({
    queryKey: ['legs', points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';')],
    queryFn: () => placesApi.travel(points),
    enabled: enabled && needsRouting && points.length > 1,
    staleTime: Infinity,
    retry: false,
  });
  return routed.data?.length === estimates.length ? routed.data : estimates;
}
