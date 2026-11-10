import type { Trip } from '@tripwise/shared';
import { useOutletContext } from 'react-router';

/** What the trip layout hands to its tabs: the server copy of the trip and the user. */
export interface TripContext {
  trip: Trip;
  uid: string;
}

export const useTripContext = () => useOutletContext<TripContext>();
