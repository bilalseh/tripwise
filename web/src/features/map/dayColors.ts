/** One colour per day, distinguishable from each other and readable with white numbers. */
export const DAY_COLORS = [
  '#1d4ed8', // blue
  '#c2410c', // orange
  '#047857', // green
  '#7e22ce', // purple
  '#be123c', // rose
  '#0e7490', // cyan
  '#a16207', // amber
  '#4338ca', // indigo
] as const;

export function dayColor(dayIndex: number): string {
  return DAY_COLORS[dayIndex % DAY_COLORS.length] ?? DAY_COLORS[0];
}

/** Free vector tiles from OpenFreeMap (OpenStreetMap data); the style carries attribution. */
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
