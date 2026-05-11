# GMAT Study

A mobile-first flashcard app for GMAT prep. Study vocabulary and Critical Reasoning logic terms with spaced repetition, cross-device sync via Supabase, and a clean minimal UI.

## Features

- **Flashcard mode** — tap to flip, swipe right/left, keyboard shortcuts
- **Quiz mode** — multiple choice with instant feedback
- **Spaced repetition** — weighted queue prioritizes words you struggle with (5 levels)
- **Multiple decks** — Vocab (800 words) · CR Logic (44 terms) · Quant & Grammar ready to add
- **Cross-device sync** — Supabase backend, same progress on Mac and iPhone
- **Offline fallback** — localStorage keeps progress even without internet
- **Stats** — 7-day activity chart, per-deck progress bars, error log
- **Bilingual** — English + Chinese definitions (toggle in settings)

## Quick Start

```bash
npm install
npm run dev -- --host
```

Open `http://localhost:5173` in your browser, or `http://<your-local-ip>:5173` on your phone (same WiFi).

On first launch you'll be prompted for a sync code — enter anything memorable (e.g. `phoebe-gmat`). Use the same code on all devices to sync progress.

## Supabase Setup (optional, for cross-device sync)

1. Create a free project at [supabase.com](https://supabase.com)
2. Run this SQL in the Supabase SQL editor:

```sql
create table vocab_progress (
  user_code text not null,
  deck text not null default 'vocab',
  word text not null,
  status text not null default 'unseen',
  level integer not null default 0,
  misses integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_code, deck, word)
);

create table vocab_daily (
  user_code text not null,
  date date not null,
  reviews integer not null default 0,
  new_words integer not null default 0,
  primary key (user_code, date)
);

alter table vocab_progress disable row level security;
alter table vocab_daily disable row level security;
```

3. Copy your credentials into a `.env` file:

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

4. Restart the dev server — sync will activate automatically.

## Adding Decks

Each deck is a JSON file in `public/` with this structure:

```json
[
  {
    "word": "Term or question front",
    "pos": "Category label",
    "definition": "Answer / explanation",
    "definition_zh": "Chinese translation or null",
    "all_definitions": []
  }
]
```

To enable the Quant or Grammar decks, add your content to `public/quant_data.json` / `public/grammar_data.json` and uncomment the relevant lines in `src/App.jsx`:

```js
// { id: "quant",   name: "Quant",   emoji: "🔢", color: "#0ea5e9", file: "/quant_data.json" },
// { id: "grammar", name: "Grammar", emoji: "✍️", color: "#7c3aed", file: "/grammar_data.json" },
```

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` / `Enter` | Flip card |
| `→` / `k` | Know it |
| `←` / `j` | Don't know |
| `u` | Undo last answer |

## Tech Stack

- React 19 + Vite
- Supabase (PostgreSQL) for cloud sync
- localStorage for offline fallback
- No CSS framework — inline styles
