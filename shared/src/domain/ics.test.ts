import { describe, expect, it } from 'vitest';

import { makeDay, makeStop } from './fixtures';
import { buildIcs, escapeText, foldLine } from './ics';

const now = new Date('2026-11-10T09:00:00Z');

describe('ics export', () => {
  it('writes one event per stop at its estimated time', () => {
    const trip = {
      id: 't1',
      title: 'Lisbon, Portugal',
      startDate: '2026-12-30',
      days: [
        makeDay([makeStop('a')]),
        makeDay([makeStop('b', { slot: 'evening', reason: 'Fado; dinner, late' })]),
      ],
    };
    const ics = buildIcs(trip, now, () => []) ?? '';

    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('X-WR-CALNAME:Lisbon\\, Portugal');
    expect(ics).toContain('DTSTART:20261230T090000');
    expect(ics).toContain('DTSTART:20261231T180000');
    expect(ics).toContain('UID:t1-b@tripwise');
    expect(ics).toContain('DESCRIPTION:Fado\\; dinner\\, late\\nEstimated 60 min');
    expect(ics).toContain('DTSTAMP:20261110T090000Z');
  });

  it('needs a start date', () => {
    expect(buildIcs({ id: 't', title: 'x', startDate: null, days: [] }, now)).toBeNull();
  });

  it('escapes text and folds long lines by UTF-8 bytes', () => {
    expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
    const folded = foldLine(`SUMMARY:${'é'.repeat(60)}`);
    const parts = folded.split('\r\n ');
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(parts.join('')).toBe(`SUMMARY:${'é'.repeat(60)}`);
  });
});
