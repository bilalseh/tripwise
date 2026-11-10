// Runs against the Firestore emulator: `pnpm test:rules` at the repo root.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-tripwise',
    firestore: { rules: readFileSync(resolve(import.meta.dirname, '../firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/alice'), { displayName: 'Alice', tier: 'free' });
    await setDoc(doc(db, 'users/alice/trips/lisbon'), { title: 'Lisbon', version: 1 });
    await setDoc(doc(db, 'users/alice/trips/lisbon/extras/packing'), { items: [] });
    await setDoc(doc(db, 'users/bob'), { displayName: 'Bob' });
    await setDoc(doc(db, 'shares/token123'), { uid: 'alice', tripId: 'lisbon' });
    await setDoc(doc(db, 'billing/alice'), { subscriptionId: 'sub_1' });
    await setDoc(doc(db, 'aiUsage/2026-11-10'), { aiRequests: 3 });
    await setDoc(doc(db, 'cache/geocode__abc'), { value: '[]' });
  });
});

const asAlice = () => env.authenticatedContext('alice').firestore();
const asBob = () => env.authenticatedContext('bob').firestore();
const signedOut = () => env.unauthenticatedContext().firestore();

describe('users/{uid}', () => {
  it('lets a user read their own profile, trips and lists', async () => {
    const db = asAlice();
    await assertSucceeds(getDoc(doc(db, 'users/alice')));
    await assertSucceeds(getDoc(doc(db, 'users/alice/trips/lisbon')));
    await assertSucceeds(getDocs(collection(db, 'users/alice/trips')));
    await assertSucceeds(getDoc(doc(db, 'users/alice/trips/lisbon/extras/packing')));
  });

  it("blocks reading another user's trips", async () => {
    const db = asBob();
    await assertFails(getDoc(doc(db, 'users/alice/trips/lisbon')));
    await assertFails(getDocs(collection(db, 'users/alice/trips')));
  });

  it('blocks signed-out reads and listing every user', async () => {
    await assertFails(getDoc(doc(signedOut(), 'users/alice/trips/lisbon')));
    await assertFails(getDocs(collection(asAlice(), 'users')));
  });

  it("blocks every client write, even to the user's own data", async () => {
    const db = asAlice();
    await assertFails(setDoc(doc(db, 'users/alice/trips/porto'), { title: 'Porto' }));
    await assertFails(updateDoc(doc(db, 'users/alice'), { tier: 'pro' }));
    await assertFails(updateDoc(doc(db, 'users/alice/trips/lisbon'), { version: 99 }));
    await assertFails(deleteDoc(doc(db, 'users/alice/trips/lisbon')));
  });
});

describe('server-only collections', () => {
  it('keeps share tokens unlistable and unreadable, so links cannot be enumerated', async () => {
    await assertFails(getDoc(doc(asAlice(), 'shares/token123')));
    await assertFails(getDocs(collection(signedOut(), 'shares')));
    await assertFails(setDoc(doc(asBob(), 'shares/mine'), { uid: 'alice', tripId: 'lisbon' }));
  });

  it("keeps billing, usage and cache private, even the user's own billing", async () => {
    await assertFails(getDoc(doc(asAlice(), 'billing/alice')));
    await assertFails(getDoc(doc(asAlice(), 'aiUsage/2026-11-10')));
    await assertFails(getDoc(doc(asAlice(), 'cache/geocode__abc')));
  });
});
