import type { Trip } from '@tripwise/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { isApiError } from '../../lib/apiClient';
import { keys, tripApi } from '../../lib/queries';
import { selectDirty, useItineraryStore } from './itineraryStore';

const DEBOUNCE_MS = 800;

/** Saves edits shortly after they stop, one request at a time, with the version as a guard. */
export function useAutosave(uid: string): { retry: () => void } {
  const queryClient = useQueryClient();
  const present = useItineraryStore((s) => s.history.present);
  const dirty = useItineraryStore(selectDirty);
  const status = useItineraryStore((s) => s.status);
  const inFlight = useRef(false);

  const save = useCallback(async () => {
    const state = useItineraryStore.getState();
    if (inFlight.current || !state.tripId || !selectDirty(state)) return;
    const sent = state.history.present;
    inFlight.current = true;
    state.setStatus('saving');
    try {
      const trip = await tripApi.save(state.tripId, {
        baseVersion: state.version,
        title: sent.title,
        days: sent.days,
        overrides: sent.overrides,
      });
      useItineraryStore.getState().markSaved(trip, sent);
      queryClient.setQueryData<Trip>(keys.trip(uid, trip.id), trip);
      void queryClient.invalidateQueries({ queryKey: keys.trips(uid) });
    } catch (error) {
      useItineraryStore.getState().setStatus(isApiError(error, 409) ? 'conflict' : 'error');
    } finally {
      inFlight.current = false;
    }
  }, [queryClient, uid]);

  useEffect(() => {
    if (!dirty || status === 'conflict' || status === 'error' || status === 'saving') return;
    const timer = window.setTimeout(() => void save(), DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [present, dirty, status, save]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [dirty]);

  return { retry: () => void save() };
}
