import type { RouteObject } from 'react-router';

import { RequireAuth } from '../features/auth/RequireAuth';
import { SignInPage } from '../features/auth/SignInPage';
import { PricingPage } from '../features/billing/PricingPage';
import { LandingPage } from '../pages/LandingPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RootLayout } from './RootLayout';
import { RouteError } from './RouteError';

/** Heavy pages (map, drag and drop) are split into their own chunks. */
const lazyPage = <K extends string>(
  load: () => Promise<Record<K, React.ComponentType>>,
  name: K,
) => ({
  lazy: async () => ({ Component: (await load())[name] }),
});

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'sign-in', element: <SignInPage /> },
      { path: 'pricing', element: <PricingPage /> },
      {
        path: 'share/:token',
        ...lazyPage(() => import('../features/share/SharedTripPage'), 'SharedTripPage'),
      },
      {
        element: <RequireAuth />,
        children: [
          { path: 'trips', ...lazyPage(() => import('../features/trips/TripsPage'), 'TripsPage') },
          {
            path: 'trips/new',
            ...lazyPage(() => import('../features/wizard/WizardPage'), 'WizardPage'),
          },
          {
            path: 'trips/:tripId/print',
            ...lazyPage(() => import('../features/export/PrintPage'), 'PrintPage'),
          },
          {
            path: 'trips/:tripId',
            ...lazyPage(() => import('../features/itinerary/TripLayout'), 'TripLayout'),
            children: [
              {
                index: true,
                ...lazyPage(() => import('../features/itinerary/ItineraryPage'), 'ItineraryPage'),
              },
              {
                path: 'budget',
                ...lazyPage(() => import('../features/budget/BudgetPage'), 'BudgetPage'),
              },
              {
                path: 'packing',
                ...lazyPage(() => import('../features/packing/PackingPage'), 'PackingPage'),
              },
              {
                path: 'documents',
                ...lazyPage(() => import('../features/documents/DocumentsPage'), 'DocumentsPage'),
              },
              {
                path: 'weather',
                ...lazyPage(() => import('../features/weather/WeatherPage'), 'WeatherPage'),
              },
            ],
          },
          {
            path: 'settings',
            ...lazyPage(() => import('../features/settings/SettingsPage'), 'SettingsPage'),
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
