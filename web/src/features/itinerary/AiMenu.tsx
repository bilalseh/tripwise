import type { AiEditProposal, EditAction, Trip } from '@tripwise/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Spinner } from '../../components/States';
import { isApiError } from '../../lib/apiClient';
import { keys, tripApi } from '../../lib/queries';
import { useUid } from '../auth/useUid';
import { useItineraryStore } from './itineraryStore';
import { ProposalDialog } from './ProposalDialog';

const ACTIONS: EditAction[] = ['relaxed', 'rainy', 'local_food', 'cheaper'];

/** "Ask the AI" for one day. The answer is a proposal: nothing changes until it is accepted. */
export function AiMenu({ trip, dayIndex }: { trip: Trip; dayIndex: number }) {
  const { t } = useTranslation();
  const uid = useUid();
  const queryClient = useQueryClient();
  const [proposal, setProposal] = useState<AiEditProposal | null>(null);
  const ask = useMutation({
    mutationFn: (action: EditAction) => {
      const day = useItineraryStore.getState().history.present.days[dayIndex];
      if (!day) throw new Error('No such day');
      return tripApi.aiEdit(trip.id, { action, dayIndex, day });
    },
    onSuccess: (result) => {
      setProposal(result);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.usage(uid) }),
  });
  const error = ask.error
    ? isApiError(ask.error, 429)
      ? t('ai.errors.limit')
      : isApiError(ask.error, 503)
        ? t('ai.errors.busy')
        : t('ai.errors.failed')
    : null;

  return (
    <div className="relative">
      <label className="sr-only" htmlFor={`ai-${String(dayIndex)}`}>
        {t('ai.label', { number: dayIndex + 1 })}
      </label>
      <div className="flex items-center gap-2">
        <select
          id={`ai-${String(dayIndex)}`}
          value=""
          disabled={ask.isPending}
          onChange={(event) => {
            const { value } = event.target;
            if (value) ask.mutate(value as EditAction);
          }}
          className="rounded-lg border border-brand-600 bg-brand-50 px-2 py-1.5 text-sm font-semibold text-brand-900"
        >
          <option value="">{t('ai.ask')}</option>
          {ACTIONS.map((action) => (
            <option key={action} value={action}>
              {t(`ai.action.${action}`)}
            </option>
          ))}
        </select>
        {ask.isPending && (
          <span role="status" className="inline-flex items-center gap-1 text-sm text-slate-600">
            <Spinner className="size-4" />
            {t('ai.thinking')}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
      {proposal && (
        <ProposalDialog
          proposal={proposal}
          currency={trip.request.currency}
          onClose={() => {
            setProposal(null);
          }}
        />
      )}
    </div>
  );
}
