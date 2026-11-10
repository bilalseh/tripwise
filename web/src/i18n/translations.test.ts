import { describe, expect, it } from 'vitest';

import { resources } from './index';

const PLURAL = /_(zero|one|two|few|many|other)$/;

function keyPaths(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) return [prefix];
  return Object.entries(node).flatMap(([key, value]) =>
    keyPaths(value, prefix ? `${prefix}.${key}` : key),
  );
}

const normalise = (paths: string[]) => [...new Set(paths.map((p) => p.replace(PLURAL, '')))].sort();

describe('translations', () => {
  it('Arabic covers every English key', () => {
    const en = normalise(keyPaths(resources.en.translation));
    const ar = normalise(keyPaths(resources.ar.translation));
    expect(ar).toEqual(en);
  });

  it('never uses the em dash', () => {
    const text = JSON.stringify(resources);
    expect(text.includes(String.fromCharCode(0x2014))).toBe(false);
  });

  it('keeps every placeholder in Arabic', () => {
    const placeholders = (value: string) => [...new Set(value.match(/{{\w+}}/g) ?? [])].sort();
    const flat = (node: unknown, prefix = ''): [string, string][] =>
      typeof node === 'string'
        ? [[prefix.replace(PLURAL, ''), node]]
        : Object.entries(node as object).flatMap(([k, v]) =>
            flat(v, prefix ? `${prefix}.${k}` : k),
          );
    const ar = new Map(flat(resources.ar.translation));
    // English plural forms of one key are merged ("Your destination" / "Your 3 destinations").
    const en = new Map<string, string>();
    for (const [key, value] of flat(resources.en.translation))
      en.set(key, `${en.get(key) ?? ''} ${value}`);
    for (const [key, value] of en) {
      expect(placeholders(ar.get(key) ?? ''), key).toEqual(placeholders(value));
    }
  });
});
