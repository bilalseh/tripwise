// The only module that talks to Firebase Auth. Everything else uses SessionUser, so tests can
// swap this module for src/test/fakeSession.ts.
import {
  deleteUser,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signOut as firebaseSignOut,
  signInAnonymously,
  signInWithPopup,
  type User,
} from 'firebase/auth';

import { auth } from './firebase';

export interface SessionUser {
  uid: string;
  isAnonymous: boolean;
  displayName: string | null;
  email: string | null;
}

function toSessionUser(user: User | null): SessionUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    displayName: user.displayName,
    email: user.email,
  };
}

export function subscribeToUser(listener: (user: SessionUser | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => {
    listener(toSessionUser(user));
  });
}

export function getCurrentUser(): SessionUser | null {
  return toSessionUser(auth.currentUser);
}

/** Resolves once Firebase has restored any saved session. */
export async function waitForAuth(): Promise<SessionUser | null> {
  await auth.authStateReady();
  return getCurrentUser();
}

export async function getIdToken(): Promise<string | null> {
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

export async function signInWithGoogle(): Promise<SessionUser> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const { user } = await signInWithPopup(auth, provider);
  return { uid: user.uid, isAnonymous: false, displayName: user.displayName, email: user.email };
}

/** Demo visitors sign in anonymously; the API seeds their account with two sample trips. */
export async function startDemo(): Promise<SessionUser> {
  const { user } = await signInAnonymously(auth);
  return { uid: user.uid, isAnonymous: true, displayName: null, email: null };
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

/** Deletes the sign-in account. Firebase may ask Google users to confirm by signing in again. */
export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await deleteUser(user);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code !== 'auth/requires-recent-login' || user.isAnonymous) throw error;
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
    await deleteUser(user);
  }
}
