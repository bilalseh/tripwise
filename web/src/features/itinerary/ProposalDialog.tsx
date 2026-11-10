import {
  diffDay,
  isEmptyDiff,
  replaceDayAt,
  type AiEditProposal,
  type Stop,
} from '@tripwise/shared';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { formatMinutes, formatMoney } from '../../lib/format';
import { useItineraryStore } from './itineraryStore';

function StopLine({
  stop,
  tone,
  detail,
}: {
  stop: Stop;
  tone: 'add' | 'remove' | 'change' | 'same';
  detail?: string;
}) {
  const { t } = useTranslation();
  const styles = {
    add: 'border-emerald-300 bg-emerald-50',
    remove: 'border-red-300 bg-red-50 line-through decoration-red-700/60',
    change: 'border-amber-300 bg-amber-50',
    same: 'border-slate-200 bg-white text-slate-600',
  } as const;
  return (
    <li className={`rounded-lg border px-3 py-2 text-sm ${styles[tone]}`}>
      <span className="sr-only">{t(`diff.${tone}`)}: </span>
      <span className="font-medium">{stop.place.name}</span>
      {detail && <span className="ms-2 text-slate-700 no-underline">{detail}</span>}
    </li>
  );
}

/** Shows exactly what the AI would change on the day; accepting applies it as one undo step. */
export function ProposalDialog({
  proposal,
  currency,
  onClose,
}: {
  proposal: AiEditProposal;
  currency: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const before = useItineraryStore((s) => s.history.present.days[proposal.dayIndex]);
  const apply = useItineraryStore((s) => s.apply);
  if (!before) return null;
  const diff = diffDay(before, proposal.day);
  const changeDetail = (fields: string[], stop: Stop) =>
    fields
      .map((field) =>
        field === 'durationMinutes'
          ? formatMinutes(stop.durationMinutes)
          : field === 'costEstimate'
            ? formatMoney(stop.costEstimate, currency)
            : t(`diff.field.${field as 'slot'}`),
      )
      .join(', ');

  const accept = () => {
    apply((e) => ({ ...e, days: replaceDayAt(e.days, proposal.dayIndex, proposal.day) }));
    onClose();
  };

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={t('diff.title', {
        action: t(`ai.action.${proposal.action}`),
        number: proposal.dayIndex + 1,
      })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('diff.reject')}
          </Button>
          <Button onClick={accept} disabled={isEmptyDiff(diff)}>
            {t('diff.accept')}
          </Button>
        </>
      }
    >
      <p className="text-slate-700">{proposal.summary}</p>
      <p className="mt-2 text-sm text-slate-600">
        {t('diff.cost', {
          before: formatMoney(diff.costBefore, currency),
          after: formatMoney(diff.costAfter, currency),
        })}
      </p>
      <ul className="mt-4 flex flex-col gap-2" aria-label={t('diff.listLabel')}>
        {diff.added.map((stop) => (
          <StopLine key={stop.id} stop={stop} tone="add" detail={t('diff.addedNote')} />
        ))}
        {diff.changed.map(({ after, fields }) => (
          <StopLine
            key={after.id}
            stop={after}
            tone="change"
            detail={changeDetail(fields, after)}
          />
        ))}
        {diff.unchanged.map((stop) => (
          <StopLine key={stop.id} stop={stop} tone="same" />
        ))}
        {diff.removed.map((stop) => (
          <StopLine key={stop.id} stop={stop} tone="remove" />
        ))}
      </ul>
      {diff.rainAdded.length > 0 && (
        <>
          <h3 className="mt-4 font-semibold">{t('diff.rain')}</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {diff.rainAdded.map((stop) => (
              <StopLine key={stop.id} stop={stop} tone="add" />
            ))}
          </ul>
        </>
      )}
      {proposal.report.dropped.length > 0 && (
        <p className="mt-4 text-xs text-slate-500">
          {t('grounding.dropped', { names: proposal.report.dropped.join(', ') })}
        </p>
      )}
      {isEmptyDiff(diff) && <p className="mt-4 text-sm text-slate-600">{t('diff.nothing')}</p>}
    </Dialog>
  );
}
