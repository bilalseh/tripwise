import type { PackingCategory, PackingItem, PackingList } from '@tripwise/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button';
import { ErrorState, LoadingState } from '../../components/States';
import { newId } from '../../lib/ids';
import { keys, packingQuery, tripApi } from '../../lib/queries';
import { useTripContext } from '../itinerary/tripContext';
import { TemplatesPanel } from './TemplatesPanel';
import { mergeItems } from './mergeItems';
import { usePackingLabel } from './usePackingLabel';

const ORDER: PackingCategory[] = [
  'documents',
  'clothing',
  'toiletries',
  'health',
  'electronics',
  'kids',
  'gear',
  'other',
];

export function PackingPage() {
  const { t } = useTranslation();
  const { trip, uid } = useTripContext();
  const queryClient = useQueryClient();
  const query = useQuery(packingQuery(uid, trip.id));
  const label = usePackingLabel();
  const [newLabel, setNewLabel] = useState('');
  const [newCategory, setNewCategory] = useState<PackingCategory>('other');
  const save = useMutation({
    mutationFn: (list: PackingList) => tripApi.savePacking(trip.id, list),
    onMutate: (list) => {
      queryClient.setQueryData(keys.packing(uid, trip.id), list);
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: keys.packing(uid, trip.id) }),
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return (
      <div className="mt-6">
        <ErrorState onRetry={() => void query.refetch()} />
      </div>
    );
  const items = query.data.items;
  const change = (next: PackingItem[]) => {
    save.mutate({ items: next });
  };
  const packed = items.filter((i) => i.checked).length;

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="font-medium">
            {t('packing.progress', { packed, total: items.length })}
          </p>
          {save.isError && (
            <p role="alert" className="text-sm text-red-700">
              {t('edit.saveFailed')}
            </p>
          )}
        </div>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = newLabel.trim();
            if (!text) return;
            change([
              ...items,
              {
                id: newId('p'),
                label: text.slice(0, 120),
                category: newCategory,
                quantity: 1,
                checked: false,
              },
            ]);
            setNewLabel('');
          }}
        >
          <label htmlFor="new-item" className="sr-only">
            {t('packing.newItem')}
          </label>
          <input
            id="new-item"
            value={newLabel}
            onChange={(e) => {
              setNewLabel(e.target.value);
            }}
            placeholder={t('packing.newItem')}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"
          />
          <label htmlFor="new-category" className="sr-only">
            {t('packing.category')}
          </label>
          <select
            id="new-category"
            value={newCategory}
            onChange={(e) => {
              setNewCategory(e.target.value as PackingCategory);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2"
          >
            {ORDER.map((c) => (
              <option key={c} value={c}>
                {t(`packing.categories.${c}`)}
              </option>
            ))}
          </select>
          <Button type="submit">{t('actions.add')}</Button>
        </form>
        {ORDER.map((category) => {
          const group = items.filter((i) => i.category === category);
          if (!group.length) return null;
          return (
            <section key={category} className="mt-5">
              <h2 className="text-sm font-semibold tracking-wide text-slate-600 uppercase">
                {t(`packing.categories.${category}`)}
              </h2>
              <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {group.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                    <input
                      id={`pack-${item.id}`}
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => {
                        change(
                          items.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)),
                        );
                      }}
                      className="size-5 accent-brand-700"
                    />
                    <label
                      htmlFor={`pack-${item.id}`}
                      className={`flex-1 ${item.checked ? 'text-slate-500 line-through' : ''}`}
                    >
                      {label(item.label)}
                      {item.quantity > 1 && (
                        <span className="ms-1 text-slate-500">× {item.quantity}</span>
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        change(items.filter((i) => i.id !== item.id));
                      }}
                      aria-label={t('packing.remove', { item: label(item.label) })}
                      className="rounded px-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <TemplatesPanel
        uid={uid}
        tripId={trip.id}
        onApply={(templateItems) => {
          change(mergeItems(items, templateItems));
        }}
      />
    </div>
  );
}
