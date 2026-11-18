import type { Trip } from '@tripwise/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isApiError } from '../../lib/apiClient';
import { keys, tripApi } from '../../lib/queries';
import { retryDelays } from './generationRetry';

const BATCH = 4;

export type GenerationError = 'limit' | 'busy' | 'failed';

export interface Generation {
  running: boolean;
  /** Pausing for the AI's per-minute limit before one more try. */
  waiting: boolean;
  done: number;
  total: number;
  error: GenerationError | null;
  resetsAt: string | null;
  start: (fromDay?: number) => void;
}

const wait = (ms: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

/**
 * Generates the trip's missing days in batches of four, so each call fits the 60 s limit. When
 * the AI cannot answer a batch, the same days are retried in smaller batches (4, 2, then 1),
 * because models are far more reliable on shorter plans. A single day that still fails gets one
 * more try after a minute, when free per-minute limits have passed. Planned days are kept.
 */
export function useGeneration(
  uid: string,
  trip: Trip | undefined,
  onDone: (trip: Trip) => void,
): Generation {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<GenerationError | null>(null);
  const [resetsAt, setResetsAt] = useState<string | null>(null);
  const started = useRef<string | null>(null);
  const total = trip?.request.destinations.reduce((sum, d) => sum + d.days, 0) ?? 0;

  const start = useCallback(
    (fromDay?: number) => {
      if (!trip) return;
      setRunning(true);
      setError(null);
      void (async () => {
        let current = trip;
        let first = fromDay ?? current.days.length;
        let batch = BATCH;
        let patient = true;
        try {
          while (first < total) {
            setDone(first);
            try {
              current = await tripApi.generate(current.id, first, batch);
            } catch (caught) {
              if (!isApiError(caught, 503)) throw caught;
              if (batch > 1) {
                batch = Math.ceil(batch / 2);
                await wait(retryDelays.smallerBatch);
                continue;
              }
              if (!patient) throw caught;
              patient = false;
              setWaiting(true);
              await wait(retryDelays.rateLimit);
              setWaiting(false);
              continue;
            }
            patient = true;
            queryClient.setQueryData(keys.trip(uid, current.id), current);
            first += batch;
          }
          setDone(total);
          onDone(current);
        } catch (caught) {
          if (isApiError(caught, 429) && caught.code === 'ai_limit_reached') {
            setError('limit');
            setResetsAt(
              typeof caught.detail['resetsAt'] === 'string' ? caught.detail['resetsAt'] : null,
            );
          } else {
            setError(isApiError(caught, 503) ? 'busy' : 'failed');
          }
        } finally {
          setRunning(false);
          setWaiting(false);
          void queryClient.invalidateQueries({ queryKey: keys.usage(uid) });
          void queryClient.invalidateQueries({ queryKey: keys.trips(uid) });
        }
      })();
    },
    [trip, total, uid, queryClient, onDone],
  );

  // A fresh draft starts generating as soon as it opens, once per trip.
  useEffect(() => {
    if (trip && trip.days.length < total && started.current !== trip.id) {
      started.current = trip.id;
      start();
    }
  }, [trip, total, start]);

  return { running, waiting, done, total, error, resetsAt, start };
}
