// UUID generation. crypto.randomUUID() is supported in all modern browsers
// and works under HTTPS or on localhost. Wrapped here so we have one swap-point
// if we ever need a server-side fallback or v7 ordered UUIDs later.

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback — only hit on ancient browsers; the format is RFC4122-ish, not crypto-strong.
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else if (i === 19) out += hex[(Math.random() * 4) | 8];
    else out += hex[(Math.random() * 16) | 0];
  }
  return out;
}

export function nowIso(): string {
  return new Date().toISOString();
}
