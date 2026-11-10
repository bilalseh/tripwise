import type { Trip } from '@tripwise/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { isApiError } from '../../lib/apiClient';
import { todayIso } from '../../lib/format';
import { keys, tripApi } from '../../lib/queries';

interface Props {
  open: boolean;
  onClose: () => void;
  trip: Trip;
  uid: string;
}

/** Use this trip as a template: same days and lists, new dates, nothing checked off. */
export function DuplicateDialog({ open, onClose, trip, uid }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(t('duplicate.defaultTitle', { title: trip.title }));
  const [startDate, setStartDate] = useState('');
  const duplicate = useMutation({
    mutationFn: () =>
      tripApi.duplicate(trip.id, { title: title.trim() || null, startDate: startDate || null }),
    onSuccess: async (copy) => {
      await queryClient.invalidateQueries({ queryKey: keys.trips(uid) });
      await queryClient.invalidateQueries({ queryKey: keys.usage(uid) });
      onClose();
      await navigate(`/trips/${copy.id}`);
    },
  });
  const limit = isApiError(duplicate.error) && duplicate.error.code === 'trip_limit_reached';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('duplicate.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button
            disabled={duplicate.isPending}
            onClick={() => {
              duplicate.mutate();
            }}
          >
            {t('duplicate.confirm')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{t('duplicate.body')}</p>
      <label className="mt-4 block">
        <span className="font-medium">{t('duplicate.name')}</span>
        <input
          value={title}
          maxLength={80}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="mt-3 block">
        <span className="font-medium">{t('duplicate.start')}</span>
        <input
          type="date"
          value={startDate}
          min={todayIso()}
          onChange={(e) => {
            setStartDate(e.target.value);
          }}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      {duplicate.isError && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {limit ? t('wizard.review.limit') : t('states.errorBody')}
        </p>
      )}
    </Dialog>
  );
}
