# Plotter

Phone-first parts tracker. Sean's personal parts log at TPG, designed to become the permanent Jaxtr inventory-module phone client.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS
- Dexie (IndexedDB, local-first)
- Supabase JS (cloud sync — read-only until migrations approved)
- vite-plugin-pwa (installable on iPhone home screen)

## Folder layout (no `src/` — matches Jaxtr convention)

```
App.tsx            index.tsx          index.html
pages/             components/        services/
data/              utils/             types/
public/
```

## Local dev

```
npm install
cp .env.example .env.local   # then paste VITE_SUPABASE_ANON_KEY
npm run dev
```

Opens on http://localhost:5173.

## Status

- Step 1: scaffold + Dashboard with mock data ← **here**
- Step 2: Add Part screen (barcode scan + manual form)
- Step 3: Part Detail screen (timeline + state-advance)
- Step 4: Vendor View (EOD order list + lead-time avg)
- Step 5: Real Supabase wiring (read-only)
- Step 6 (Tier 3 — explicit Sean go): GitHub repo, prod migrations, Vercel, domain
