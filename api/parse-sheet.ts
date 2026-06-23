// Vercel serverless function — POST /api/parse-sheet
// Body: { mediaType: "image/jpeg" | ..., data: <base64 string> }
// Auth: Bearer <Supabase JWT> in Authorization header
// Returns: { rows: ParsedRow[] }
//
// The Anthropic API key lives in Vercel env (ANTHROPIC_API_KEY, server-only)
// and is NEVER exposed to the browser.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { parseSheetServer, type ParseRequest } from './_sheetParserCore';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Server missing ANTHROPIC_API_KEY' });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ error: 'Server missing Supabase config' });
    return;
  }

  // Auth: require a valid Supabase JWT so random visitors can't burn the Anthropic key.
  const authHeader = (req.headers.authorization ?? req.headers.Authorization) as string | undefined;
  const jwt = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    res.status(401).json({ error: 'Missing Authorization bearer token' });
    return;
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userResult, error: userErr } = await sb.auth.getUser(jwt);
  if (userErr || !userResult.user) {
    res.status(401).json({ error: 'Invalid session' });
    return;
  }

  let body: ParseRequest;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body as ParseRequest);
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  try {
    const rows = await parseSheetServer(body, ANTHROPIC_API_KEY);
    res.status(200).json({ rows });
  } catch (err) {
    const msg = (err as Error).message || 'Parse failed';
    console.error('[parse-sheet]', msg);
    res.status(500).json({ error: msg });
  }
}
