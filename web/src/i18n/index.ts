import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import arAccount from './locales/ar/account.json';
import arCommon from './locales/ar/common.json';
import arEssentials from './locales/ar/essentials.json';
import arTrip from './locales/ar/trip.json';
import arWizard from './locales/ar/wizard.json';
import enAccount from './locales/en/account.json';
import enCommon from './locales/en/common.json';
import enEssentials from './locales/en/essentials.json';
import enTrip from './locales/en/trip.json';
import enWizard from './locales/en/wizard.json';

export const LANGUAGES = ['en', 'ar'] as const;
export type AppLanguage = (typeof LANGUAGES)[number];

// One file per area keeps each small; they merge into a single namespace.
const en = { ...enCommon, ...enWizard, ...enTrip, ...enEssentials, ...enAccount };
const ar = { ...arCommon, ...arWizard, ...arTrip, ...arEssentials, ...arAccount };

export const defaultNS = 'translation';
export const resources = { en: { translation: en }, ar: { translation: ar } } as const;

const STORAGE_KEY = 'tripwise.language';

export function isAppLanguage(value: unknown): value is AppLanguage {
  return LANGUAGES.includes(value as AppLanguage);
}

/** The last language picked on this device, else the browser's, else English. */
function initialLanguage(): AppLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isAppLanguage(stored)) return stored;
  } catch {
    // Storage can be blocked; the browser language still works.
  }
  return navigator.language.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: 'en',
  supportedLngs: LANGUAGES,
  defaultNS,
  initAsync: false,
  interpolation: { escapeValue: false },
});

function applyDocumentLanguage(language: string): void {
  document.documentElement.lang = language;
  document.documentElement.dir = i18n.dir(language);
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not remembered on this device; nothing else depends on it.
  }
}

applyDocumentLanguage(i18n.language);
i18n.on('languageChanged', applyDocumentLanguage);

export function currentLanguage(): AppLanguage {
  return isAppLanguage(i18n.language) ? i18n.language : 'en';
}

export default i18n;
