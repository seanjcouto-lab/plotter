// Shared core for the photo-of-sheet parser.
// Used by both /api/parse-sheet (Vercel function in prod) and the Vite dev
// middleware (localhost). Anthropic key stays server-side.

import Anthropic from '@anthropic-ai/sdk';

export interface ParsedRow {
  qty: number;
  part_number: string;
  description: string;
  vendor?: string;
  wo_number?: string;
}

export type SupportedMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export interface ParseRequest {
  mediaType: SupportedMediaType;
  data: string; // base64 (no data: prefix)
}

const SYSTEM_PROMPT = `You are an OCR assistant for a marine parts manager. You read photographed parts-order sheets (printed or handwritten) and turn each visible row into structured data.

For each data row, capture:
- qty: integer quantity. Read numeric digits with extra care — in handwriting, 1/7, 4/9, 3/8, 2/Z, 5/6, and 0/O/D are the most common confusion pairs. Use column position and adjacent rows as context cues to disambiguate. If a digit is truly illegible, default to 1.
- part_number: the part number as written. Preserve case, hyphens, slashes, and leading zeros. Numeric digits in part numbers matter — read each digit precisely; the same 1/7, 4/9, 3/8 caveats apply.
- description: the part description as written.
- vendor: the vendor name if shown in a vendor column; otherwise null.
- wo_number: the work order / job number if shown; otherwise null. Values like "SHOP", "stock", or "STK" are not real WO numbers — record those as null.

Skip header rows and rows that are entirely blank. For ambiguous handwriting, make your best reading — the operator reviews every row before saving, so a reasonable best-guess is more useful than a refusal.

Return one object per data row in the rows array.`;

const ROW_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          qty: { type: 'integer' },
          part_number: { type: 'string' },
          description: { type: 'string' },
          vendor: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          wo_number: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
        required: ['qty', 'part_number', 'description', 'vendor', 'wo_number'],
        additionalProperties: false,
      },
    },
  },
  required: ['rows'],
  additionalProperties: false,
} as const;

export async function parseSheetServer(
  body: ParseRequest,
  apiKey: string,
): Promise<ParsedRow[]> {
  if (!apiKey) throw new Error('Anthropic API key not configured');
  if (!body.mediaType || !body.data) throw new Error('Missing mediaType or data');

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: 'json_schema', schema: ROW_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: body.mediaType, data: body.data } },
          { type: 'text', text: 'Parse this parts sheet into the rows array.' },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  let parsed: { rows?: unknown };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch (err) {
    throw new Error(`Could not parse Claude response as JSON: ${(err as Error).message}`);
  }

  if (!parsed.rows || !Array.isArray(parsed.rows)) {
    throw new Error('Claude response missing "rows" array');
  }

  return parsed.rows
    .map((r): ParsedRow | null => {
      if (typeof r !== 'object' || r === null) return null;
      const row = r as Record<string, unknown>;
      const partNumber = typeof row.part_number === 'string' ? row.part_number.trim() : '';
      const description = typeof row.description === 'string' ? row.description.trim() : '';
      if (!partNumber && !description) return null;
      return {
        qty: typeof row.qty === 'number' && row.qty > 0 ? Math.floor(row.qty) : 1,
        part_number: partNumber,
        description,
        vendor: typeof row.vendor === 'string' && row.vendor.trim() ? row.vendor.trim() : undefined,
        wo_number: typeof row.wo_number === 'string' && row.wo_number.trim() ? row.wo_number.trim() : undefined,
      };
    })
    .filter((r): r is ParsedRow => r !== null);
}
