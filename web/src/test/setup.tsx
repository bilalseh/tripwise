import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import i18n from '../i18n';
import { useItineraryStore } from '../features/itinerary/itineraryStore';
import { useWizardStore } from '../features/wizard/wizardStore';
import { fakeSession } from './fakeSession';

// No test talks to Firebase or draws a WebGL map.
vi.mock('../lib/firebase', () => ({ firebaseApp: {}, auth: {}, useEmulators: false }));
vi.mock('../lib/session', async () => (await import('./fakeSession')).fakeSessionModule);
vi.mock('../features/map/TripMap', () => ({
  TripMap: ({ days }: { days: unknown[] }) => (
    <div data-testid="map">{days.length} days on the map</div>
  ),
}));

window.scrollTo = () => undefined;
Element.prototype.scrollIntoView = () => undefined;

afterEach(async () => {
  cleanup();
  fakeSession.reset();
  useWizardStore.getState().reset();
  useItineraryStore.setState({ tripId: null, saved: null, status: 'saved' });
  sessionStorage.clear();
  localStorage.clear();
  await i18n.changeLanguage('en');
});
