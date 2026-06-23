#!/usr/bin/env node
// Generate PWA icons from a single SVG source.
// Produces: icon-192.png, icon-512.png, icon-512-maskable.png,
//           apple-touch-icon.png (180), favicon.png (32), favicon.ico (32).
//
// Run: node scripts/generate-icons.mjs

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

await mkdir(publicDir, { recursive: true });

// --- Source SVG -----------------------------------------------------------
// Navy bg, gold serif P, iOS-rounded corners baked in for non-maskable icons.
// Marine navy (#0A1726), marine gold (#D8A24A) — matches the in-app palette.

const NAVY = '#0A1726';
const GOLD = '#D8A24A';
const GOLD_DIM = '#B5853A';

// Non-maskable version: corner radius baked in (~19%, iOS standard).
const svgRounded = `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${NAVY}"/>
      <stop offset="1" stop-color="#091322"/>
    </linearGradient>
    <linearGradient id="p" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${GOLD_DIM}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <text x="256" y="265"
        dominant-baseline="central"
        text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="360"
        font-weight="700"
        fill="url(#p)">P</text>
  <circle cx="256" cy="445" r="6" fill="${GOLD}" opacity="0.6"/>
</svg>`;

// Maskable version: full bleed, no corner radius (Android masks it).
const svgMaskable = `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${NAVY}"/>
      <stop offset="1" stop-color="#091322"/>
    </linearGradient>
    <linearGradient id="p" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${GOLD_DIM}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <text x="256" y="265"
        dominant-baseline="central"
        text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="280"
        font-weight="700"
        fill="url(#p)">P</text>
</svg>`;

async function makePng(svg, size, name) {
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  await writeFile(join(publicDir, name), buf);
  console.log(`  wrote ${name} (${size}x${size}, ${buf.length} bytes)`);
}

console.log('Generating PWA icons →', publicDir);
await makePng(svgRounded, 192, 'icon-192.png');
await makePng(svgRounded, 512, 'icon-512.png');
await makePng(svgMaskable, 512, 'icon-512-maskable.png');
await makePng(svgRounded, 180, 'apple-touch-icon.png');
await makePng(svgRounded, 32, 'favicon.png');

// Save SVG source too, in case someone wants to tweak later.
await writeFile(join(publicDir, 'icon.svg'), svgRounded);

console.log('\nDone. Update vite.config.ts PWA manifest if icon names changed.');
