import type { PackingItem } from '@tripwise/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button';
import { keys, templatesQuery, tripApi } from '../../lib/queries';

interface Props {
  uid: string;
  tripId: string;
  onApply: (items: PackingItem[]) => void;
}

/** Save this list as a reusable template, or add a saved template's items to it. */
export function TemplatesPanel({ uid, tripId, onApply }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const templates = useQuery(templatesQuery(uid));
  const [name, setName] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.templates(uid) });
  const save = useMutation({
    mutationFn: () => tripApi.saveTemplate(tripId, name.trim()),
    onSuccess: () => {
      setName('');
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: tripApi.deleteTemplate,
    onSuccess: () => void refresh(),
  });

  return (
    <aside
      aria-labelledby="templates-title"
      className="h-fit rounded-xl border border-slate-200 bg-white p-4"
    >
      <h2 id="templates-title" className="font-semibold">
        {t('packing.templates.title')}
      </h2>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save.mutate();
        }}
      >
        <label htmlFor="template-name" className="sr-only">
          {t('packing.templates.name')}
        </label>
        <input
          id="template-name"
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder={t('packing.templates.name')}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        <Button type="submit" size="sm" disabled={save.isPending}>
          {t('actions.save')}
        </Button>
      </form>
      {save.isSuccess && (
        <p role="status" className="mt-2 text-sm text-emerald-700">
          {t('packing.templates.saved')}
        </p>
      )}
      <ul className="mt-4 space-y-2">
        {(templates.data ?? []).map((template) => (
          <li key={template.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              {template.name} <span className="text-slate-500">({template.items.length})</span>
            </span>
            <span className="flex shrink-0 gap-1">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onApply(template.items);
                }}
              >
                {t('packing.templates.use')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('packing.templates.delete', { name: template.name })}
                onClick={() => {
                  remove.mutate(template.id);
                }}
              >
                ×
              </Button>
            </span>
          </li>
        ))}
        {templates.data?.length === 0 && (
          <li className="text-sm text-slate-600">{t('packing.templates.none')}</li>
        )}
      </ul>
    </aside>
  );
}
