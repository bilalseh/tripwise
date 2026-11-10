import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { Button } from '../../components/Button';
import { accountApi } from '../../lib/queries';
import { deleteAccount } from '../../lib/session';
import { useWizardStore } from '../wizard/wizardStore';

const CONFIRM_WORD = 'DELETE';

/** Erase every trip, list and setting, then the sign-in account itself. */
export function DeleteAccountSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState('');
  const remove = useMutation({
    mutationFn: async () => {
      await accountApi.deleteData();
      await deleteAccount();
    },
    onSuccess: async () => {
      queryClient.clear();
      useWizardStore.getState().reset();
      await navigate('/');
    },
  });

  return (
    <section
      aria-labelledby="delete-title"
      className="rounded-xl border border-red-200 bg-red-50 p-5"
    >
      <h2 id="delete-title" className="text-lg font-semibold text-red-900">
        {t('settings.deleteTitle')}
      </h2>
      <p className="mt-2 text-red-900">{t('settings.deleteBody')}</p>
      <label htmlFor="confirm-delete" className="mt-4 block text-sm font-medium text-red-900">
        {t('settings.deleteConfirmLabel', { word: CONFIRM_WORD })}
      </label>
      <div className="mt-1 flex flex-wrap gap-3">
        <input
          id="confirm-delete"
          value={confirm}
          dir="ltr"
          autoComplete="off"
          onChange={(e) => {
            setConfirm(e.target.value);
          }}
          className="rounded-lg border border-red-300 bg-white px-3 py-2"
        />
        <Button
          variant="danger"
          disabled={confirm !== CONFIRM_WORD || remove.isPending}
          onClick={() => {
            remove.mutate();
          }}
        >
          {remove.isPending ? t('settings.deleting') : t('settings.deleteButton')}
        </Button>
      </div>
      {remove.isError && (
        <p role="alert" className="mt-3 text-sm text-red-900">
          {t('settings.deleteFailed')}
        </p>
      )}
    </section>
  );
}
