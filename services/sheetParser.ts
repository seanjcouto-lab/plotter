// Client-side photo-of-sheet parser.
// Handles HEIC → JPEG conversion in the browser, then POSTs base64 to
// /api/parse-sheet. The Anthropic key never leaves the server.

import { getCurrentSession, isSupabaseConfigured } from './supabaseClient';

export function isSheetParseSupported(): boolean {
  // Photo parse needs the server route, which needs Supabase auth for the
  // bearer token. If Supabase isn't configured, we can't auth → no parse.
  return isSupabaseConfigured();
}

export interface ParsedRow {
  qty: number;
  part_number: string;
  description: string;
  vendor?: string;
  wo_number?: string;
}

type SupportedMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

async function normalizeImage(
  file: File,
): Promise<{ mediaType: SupportedMediaType; data: string }> {
  let blob: Blob = file;
  let mediaType: SupportedMediaType = 'image/jpeg';

  const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);

  if (isHeic) {
    const heic2any = (await import('heic2any')).default;
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
    blob = Array.isArray(converted) ? converted[0] : (converted as Blob);
    mediaType = 'image/jpeg';
  } else if (file.type === 'image/png') {
    mediaType = 'image/png';
  } else if (file.type === 'image/webp') {
    mediaType = 'image/webp';
  } else if (file.type === 'image/gif') {
    mediaType = 'image/gif';
  }

  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  const data = btoa(binary);

  return { mediaType, data };
}

export async function parseSheet(file: File): Promise<ParsedRow[]> {
  const session = await getCurrentSession();
  if (!session) throw new Error('Not signed in — photo parse needs a Supabase session');

  const { mediaType, data } = await normalizeImage(file);

  const res = await fetch('/api/parse-sheet', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ mediaType, data }),
  });

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      if (j?.error) detail = j.error;
    } catch {
      // ignore parse failure
    }
    throw new Error(`Photo parse failed: ${detail}`);
  }

  const payload = (await res.json()) as { rows?: unknown };
  if (!payload.rows || !Array.isArray(payload.rows)) {
    throw new Error('Server response missing "rows" array');
  }
  return payload.rows as ParsedRow[];
}
