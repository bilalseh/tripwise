import type { GroundingReport } from '@tripwise/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Says plainly what the AI suggested that could not be matched to a real place. */
export function GroundingNotice({ report }: { report: GroundingReport | null }) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(false);
  if (!report || hidden) return null;
  if (!report.dropped.length && !report.trimmed.length && !report.unchecked.length) return null;
  return (
    <div
      role="note"
      className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"
    >
      <div>
        <p className="font-semibold">
          {t('grounding.title', { kept: report.kept, suggested: report.suggested })}
        </p>
        {report.dropped.length > 0 && (
          <p className="mt-1">{t('grounding.dropped', { names: report.dropped.join(', ') })}</p>
        )}
        {report.unchecked.length > 0 && (
          <p className="mt-1">{t('grounding.unchecked', { names: report.unchecked.join(', ') })}</p>
        )}
        {report.trimmed.length > 0 && (
          <p className="mt-1">{t('grounding.trimmed', { names: report.trimmed.join(', ') })}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          setHidden(true);
        }}
        className="shrink-0 font-semibold underline"
      >
        {t('actions.dismiss')}
      </button>
    </div>
  );
}
