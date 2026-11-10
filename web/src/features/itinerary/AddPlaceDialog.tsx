import { addStop, type Destination, type PlaceResult, type Slot } from '@tripwise/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Spinner } from '../../components/States';
import { newId } from '../../lib/ids';
import { placesApi } from '../../lib/queries';
import { useItineraryStore } from './itineraryStore';

interface Props {
  open: boolean;
  onClose: () => void;
  destination: Destination | undefined;
  dayIndex: number;
}

/** Add a real place found by search (on submit, per the geocoders' usage policies). */
export function AddPlaceDialog({ open, onClose, destination, dayIndex }: Props) {
  const { t } = useTranslation();
  const apply = useItineraryStore((s) => s.apply);
  const [query, setQuery] = useState('');
  const [slot, setSlot] = useState<Slot>('afternoon');
  const search = useMutation({
    mutationFn: (q: string) => placesApi.search(q, destination?.location),
  });

  function add(result: PlaceResult) {
    apply((e) => ({
      ...e,
      days: addStop(e.days, dayIndex, {
        id: newId(),
        place: result.place,
        category: 'sight',
        slot,
        reason: '',
        durationMinutes: 60,
        costEstimate: 0,
        locked: false,
        note: '',
      }),
    }));
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('addPlace.title', { number: dayIndex + 1 })}
      wide
    >
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim().length >= 2) search.mutate(query.trim());
        }}
      >
        <label htmlFor="place-search" className="sr-only">
          {t('addPlace.label')}
        </label>
        <input
          id="place-search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          placeholder={t('addPlace.placeholder', { city: destination?.name ?? '' })}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"
        />
        <label className="sr-only" htmlFor="place-slot">
          {t('addPlace.slot')}
        </label>
        <select
          id="place-slot"
          value={slot}
          onChange={(e) => {
            setSlot(e.target.value as Slot);
          }}
          className="rounded-lg border border-slate-300 bg-white px-2"
        >
          {(['morning', 'afternoon', 'evening'] as const).map((value) => (
            <option key={value} value={value}>
              {t(`slot.${value}`)}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={search.isPending}>
          {search.isPending && <Spinner className="size-4" />}
          {t('addPlace.search')}
        </Button>
      </form>
      <div aria-live="polite" className="mt-4">
        {search.isError && (
          <p role="alert" className="text-sm text-red-700">
            {t('addPlace.failed')}
          </p>
        )}
        {search.data?.results.length === 0 && (
          <p className="text-sm text-slate-600">{t('addPlace.none')}</p>
        )}
        {search.data && search.data.results.length > 0 && (
          <>
            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
              {search.data.results.map((result) => (
                <li
                  key={`${result.place.osmId ?? result.place.name}-${String(result.place.location.lat)}`}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{result.place.name}</span>
                    <span className="block truncate text-sm text-slate-600">
                      {result.place.address}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      add(result);
                    }}
                    aria-label={t('addPlace.add', { name: result.place.name })}
                  >
                    {t('actions.add')}
                  </Button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">{search.data.attribution}</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
