// Stands in for src/lib/session.ts in every test (wired up in setup.ts).
import { vi } from 'vitest';

import type { SessionUser } from '../lib/session';

type Listener = (user: SessionUser | null) => void;

export const DEMO_USER: SessionUser = {
  uid: 'demo-uid',
  isAnonymous: true,
  displayName: null,
  email: null,
};
export const GOOGLE_USER: SessionUser = {
  uid: 'ada-uid',
  isAnonymous: false,
  displayName: 'Ada',
  email: 'ada@example.com',
};

let current: SessionUser | null = null;
const listeners = new Set<Listener>();

function setUser(user: SessionUser | null) {
  current = user;
  for (const listener of listeners) listener(user);
}

export const fakeSession = {
  setUser,
  reset() {
    current = null;
    listeners.clear();
  },
};

export const fakeSessionModule = {
  subscribeToUser(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getCurrentUser: () => current,
  waitForAuth: () => Promise.resolve(current),
  getIdToken: () => Promise.resolve(current ? `token-${current.uid}` : null),
  signInWithGoogle: vi.fn(() => {
    setUser(GOOGLE_USER);
    return Promise.resolve(GOOGLE_USER);
  }),
  startDemo: vi.fn(() => {
    setUser(DEMO_USER);
    return Promise.resolve(DEMO_USER);
  }),
  signOut: vi.fn(() => {
    setUser(null);
    return Promise.resolve();
  }),
  deleteAccount: vi.fn(() => {
    setUser(null);
    return Promise.resolve();
  }),
};
