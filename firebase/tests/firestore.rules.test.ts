// Runs against the Firestore emulator: `pnpm test:rules` at the repo root.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
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
    await setDoc(doc(context.firestore(), 'users/alice/trips/lisbon'), { title: 'Lisbon' });
  });
});

const asAlice = () => env.authenticatedContext('alice').firestore();
const signedOut = () => env.unauthenticatedContext().firestore();

describe('default rules', () => {
  it('deny every read until a collection is opened explicitly', async () => {
    await assertFails(getDoc(doc(asAlice(), 'users/alice/trips/lisbon')));
    await assertFails(getDocs(collection(asAlice(), 'users')));
    await assertFails(getDoc(doc(signedOut(), 'users/alice/trips/lisbon')));
  });

  it('deny every client write', async () => {
    await assertFails(setDoc(doc(asAlice(), 'users/alice/trips/porto'), { title: 'Porto' }));
    await assertFails(setDoc(doc(signedOut(), 'shares/abc'), { tripId: 'lisbon' }));
  });
});
