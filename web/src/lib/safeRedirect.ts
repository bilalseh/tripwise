/** Only same-site paths may be redirect targets, which rules out open redirects. */
export function safeNext(next: string | null, fallback = '/trips'): string {
  if (!next?.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
