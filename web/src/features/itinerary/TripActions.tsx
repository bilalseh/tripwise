import { buildIcs, type Trip } from '@tripwise/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { downloadText, slugify } from '../../lib/ids';
import { keys, tripApi } from '../../lib/queries';
import { DuplicateDialog } from './DuplicateDialog';
import { selectDirty, useItineraryStore } from './itineraryStore';
import { ShareDialog } from './ShareDialog';

type Open = 'share' | 'duplicate' | 'delete' | 'regenerate' | null;

export function TripActions({
  trip,
  uid,
  onRegenerate,
}: {
  trip: Trip;
  uid: string;
  onRegenerate: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<Open>(null);
  const present = useItineraryStore((s) => s.history.present);
  const dirty = useItineraryStore(selectDirty);
  const close = () => {
    setOpen(null);
  };

  const remove = useMutation({
    mutationFn: () => tripApi.remove(trip.id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: keys.trip(uid, trip.id) });
      await queryClient.invalidateQueries({ queryKey: keys.trips(uid) });
      await queryClient.invalidateQueries({ queryKey: keys.usage(uid) });
      await navigate('/trips');
    },
  });

  function exportIcs() {
    const ics = buildIcs(
      { id: trip.id, title: present.title, startDate: trip.request.startDate, days: present.days },
      new Date(),
    );
    if (ics) downloadText(`${slugify(present.title)}.ics`, ics, 'text/calendar');
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setOpen('share');
        }}
      >
        {t('trip.actions.share')}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void navigate(`/trips/${trip.id}/print`)}
      >
        {t('trip.actions.pdf')}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={exportIcs}
        disabled={!trip.request.startDate}
        title={trip.request.startDate ? undefined : t('trip.actions.icsNeedsDates')}
      >
        {t('trip.actions.ics')}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setOpen('duplicate');
        }}
      >
        {t('trip.actions.duplicate')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setOpen('regenerate');
        }}
      >
        {t('trip.actions.regenerate')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-red-700"
        onClick={() => {
          setOpen('delete');
        }}
      >
        {t('actions.delete')}
      </Button>

      <ShareDialog open={open === 'share'} onClose={close} trip={trip} uid={uid} />
      <DuplicateDialog open={open === 'duplicate'} onClose={close} trip={trip} uid={uid} />
      <Dialog
        open={open === 'regenerate'}
        onClose={close}
        title={t('trip.regenerate.title')}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              {t('actions.cancel')}
            </Button>
            <Button
              disabled={dirty}
              onClick={() => {
                close();
                onRegenerate();
              }}
            >
              {t('trip.regenerate.confirm')}
            </Button>
          </>
        }
      >
        <p>{t('trip.regenerate.body')}</p>
        {dirty && <p className="mt-2 text-sm text-amber-800">{t('trip.regenerate.unsaved')}</p>}
      </Dialog>
      <Dialog
        open={open === 'delete'}
        onClose={close}
        title={t('trip.delete.title')}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              {t('actions.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate();
              }}
            >
              {t('actions.delete')}
            </Button>
          </>
        }
      >
        <p>{t('trip.delete.body', { title: present.title })}</p>
        {remove.isError && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {t('states.errorBody')}
          </p>
        )}
      </Dialog>
    </div>
  );
}
