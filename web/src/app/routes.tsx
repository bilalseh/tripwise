import type { RouteObject } from 'react-router';

import { LandingPage } from '../pages/LandingPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RootLayout } from './RootLayout';
import { RouteError } from './RouteError';

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
