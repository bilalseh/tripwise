import type { DocumentItem, DocumentsResponse } from '@tripwise/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button';
import { ErrorState, LoadingState } from '../../components/States';
import { formatDate } from '../../lib/format';
import { newId } from '../../lib/ids';
import { documentsQuery, keys, tripApi } from '../../lib/queries';
import { useTripContext } from '../itinerary/tripContext';

export function DocumentsPage() {
  const { t, i18n } = useTranslation();
  const { trip, uid } = useTripContext();
  const queryClient = useQueryClient();
  const query = useQuery(documentsQuery(uid, trip.id));
  const [custom, setCustom] = useState('');
  const save = useMutation({
    mutationFn: (items: DocumentItem[]) => tripApi.saveDocuments(trip.id, { items }),
    onMutate: (items) => {
      queryClient.setQueryData<DocumentsResponse>(keys.documents(uid, trip.id), (old) =>
        old ? { ...old, checklist: { items } } : old,
      );
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: keys.documents(uid, trip.id) }),
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return (
      <div className="mt-6">
        <ErrorState onRetry={() => void query.refetch()} />
      </div>
    );
  const { checklist, officialLinks, passportValidUntil } = query.data;
  const items = checklist.items;
  const label = (item: DocumentItem) =>
    i18n.exists(`documents.items.${item.label}`)
      ? t(`documents.items.${item.label}` as 'documents.items.passport')
      : item.label;
  const patch = (id: string, change: Partial<DocumentItem>) => {
    save.mutate(items.map((i) => (i.id === id ? { ...i, ...change } : i)));
  };

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div>
        {passportValidUntil && (
          <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {t('documents.passportRule', {
              date: formatDate(passportValidUntil, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }),
            })}
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <input
                  id={`doc-${item.id}`}
                  type="checkbox"
                  checked={item.done}
                  onChange={() => {
                    patch(item.id, { done: !item.done });
                  }}
                  className="mt-1 size-5 accent-brand-700"
                />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`doc-${item.id}`}
                    className={`font-semibold ${item.done ? 'text-slate-500 line-through' : ''}`}
                  >
                    {label(item)}
                  </label>
                  {i18n.exists(`documents.hints.${item.label}`) && (
                    <p className="text-sm text-slate-600">
                      {t(`documents.hints.${item.label}` as 'documents.hints.passport')}
                    </p>
                  )}
                  <div className="mt-2 grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
                    <label className="text-sm">
                      <span className="block text-slate-600">{t('documents.due')}</span>
                      <input
                        type="date"
                        value={item.dueDate ?? ''}
                        onChange={(e) => {
                          patch(item.id, { dueDate: e.target.value || null });
                        }}
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="block text-slate-600">{t('documents.note')}</span>
                      <input
                        defaultValue={item.note}
                        maxLength={500}
                        onBlur={(e) => {
                          if (e.target.value !== item.note)
                            patch(item.id, { note: e.target.value });
                        }}
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
                      />
                    </label>
                  </div>
                </div>
                {item.kind === 'custom' && (
                  <button
                    type="button"
                    onClick={() => {
                      save.mutate(items.filter((i) => i.id !== item.id));
                    }}
                    aria-label={t('documents.remove', { item: label(item) })}
                    className="rounded px-2 text-slate-500 hover:text-red-700"
                  >
                    ×
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = custom.trim();
            if (!text) return;
            save.mutate([
              ...items,
              {
                id: newId('d'),
                kind: 'custom',
                label: text.slice(0, 120),
                done: false,
                dueDate: null,
                note: '',
              },
            ]);
            setCustom('');
          }}
        >
          <label htmlFor="custom-doc" className="sr-only">
            {t('documents.add')}
          </label>
          <input
            id="custom-doc"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
            }}
            placeholder={t('documents.add')}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"
          />
          <Button type="submit">{t('actions.add')}</Button>
        </form>
        {save.isError && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {t('edit.saveFailed')}
          </p>
        )}
      </div>
      <aside
        aria-labelledby="official-title"
        className="h-fit rounded-xl border border-slate-200 bg-white p-4"
      >
        <h2 id="official-title" className="font-semibold">
          {t('documents.officialTitle')}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{t('documents.officialBody')}</p>
        <ul className="mt-3 space-y-2 text-sm">
          {officialLinks.map((link) => (
            <li key={link.url}>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className="font-semibold text-brand-700 underline-offset-2 hover:underline"
              >
                {t(`documents.links.${link.label}` as 'documents.links.gov_uk')}
              </a>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
