import type { Trip } from '@tripwise/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { keys, tripApi } from '../../lib/queries';

interface Props {
  open: boolean;
  onClose: () => void;
  trip: Trip;
  uid: string;
}

/** A read-only link to the map and itinerary, revocable at any time. */
export function ShareDialog({ open, onClose, trip, uid }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const token = trip.shareToken ?? null;
  const url = token ? `${window.location.origin}/share/${token}` : null;

  const update = (shareToken: string | null) => {
    queryClient.setQueryData<Trip>(keys.trip(uid, trip.id), (old) =>
      old ? { ...old, shareToken } : old,
    );
  };
  const share = useMutation({
    mutationFn: () => tripApi.share(trip.id),
    onSuccess: (link) => {
      update(link.token);
    },
  });
  const revoke = useMutation({
    mutationFn: () => tripApi.unshare(trip.id),
    onSuccess: () => {
      update(null);
    },
  });

  return (
    <Dialog open={open} onClose={onClose} title={t('share.title')}>
      <p className="text-sm text-slate-600">{t('share.body')}</p>
      {url ? (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-sm font-medium">{t('share.link')}</span>
            <input
              readOnly
              value={url}
              dir="ltr"
              onFocus={(e) => {
                e.target.select();
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(url).then(() => {
                  setCopied(true);
                });
              }}
            >
              {copied ? t('share.copied') : t('share.copy')}
            </Button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
            >
              {t('share.open')}
            </a>
            <Button
              variant="ghost"
              className="text-red-700"
              disabled={revoke.isPending}
              onClick={() => {
                setCopied(false);
                revoke.mutate();
              }}
            >
              {t('share.revoke')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          className="mt-4"
          disabled={share.isPending}
          onClick={() => {
            share.mutate();
          }}
        >
          {t('share.create')}
        </Button>
      )}
      {(share.isError || revoke.isError) && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {t('states.errorBody')}
        </p>
      )}
      <p className="mt-4 text-xs text-slate-500">{t('share.private')}</p>
    </Dialog>
  );
}
