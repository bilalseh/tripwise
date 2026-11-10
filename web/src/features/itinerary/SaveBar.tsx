import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button';
import { selectCanRedo, selectCanUndo, useItineraryStore } from './itineraryStore';

/** Undo/redo for every change, and where the latest edit stands with the server. */
export function SaveBar({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const canUndo = useItineraryStore(selectCanUndo);
  const canRedo = useItineraryStore(selectCanRedo);
  const status = useItineraryStore((s) => s.status);
  const undo = useItineraryStore((s) => s.undo);
  const redo = useItineraryStore((s) => s.redo);

  return (
    <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-2 bg-slate-50/95 px-4 py-2 backdrop-blur">
      <div className="flex gap-1">
        <Button
          variant="secondary"
          size="sm"
          onClick={undo}
          disabled={!canUndo}
          aria-keyshortcuts="Control+Z"
        >
          {t('edit.undo')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={redo}
          disabled={!canRedo}
          aria-keyshortcuts="Control+Shift+Z"
        >
          {t('edit.redo')}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="text-sm text-slate-600">
        {status === 'saved' && t('edit.saved')}
        {(status === 'pending' || status === 'saving') && t('edit.saving')}
        {status === 'error' && (
          <span className="text-red-700">
            {t('edit.saveFailed')}{' '}
            <button type="button" onClick={onRetry} className="font-semibold underline">
              {t('states.retry')}
            </button>
          </span>
        )}
        {status === 'conflict' && (
          <span className="text-amber-800">
            {t('edit.conflict')}{' '}
            <button
              type="button"
              onClick={() => {
                window.location.reload();
              }}
              className="font-semibold underline"
            >
              {t('edit.reload')}
            </button>
          </span>
        )}
      </p>
    </div>
  );
}
