import { useTranslation } from 'react-i18next';

/** Items from the packing rules carry a key as their label; custom items carry plain text. */
export function usePackingLabel(): (label: string) => string {
  const { t, i18n } = useTranslation();
  return (label) => {
    const key = `packing.items.${label}`;
    return i18n.exists(key) ? t(key as 'packing.items.passport') : label;
  };
}
