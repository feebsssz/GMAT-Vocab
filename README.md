# GMAT 800 Vocab Review

A mobile-friendly web app for reviewing the GMAT 800 core vocabulary list. Features flashcards with English and Chinese definitions, progress tracking, and a searchable word list.

## Features

- **Flashcard Mode** — tap to flip, swipe right (know) / left (don't know)
- **Word List** — browse, search, and filter all 800 words
- **Bilingual Definitions** — English + Chinese (toggle in-app)
- **Progress Tracking** — saved locally in your browser
- **Mobile-First** — designed for phone use, dark theme

## Quick Start

```bash
# Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies
uv sync

# Run the app
uv run python app.py
```

Then open `http://localhost:5050` in your browser, or access from your phone at `http://<your-local-ip>:5050` (same WiFi).

## Re-extract Vocab Data

If you want to regenerate `vocab_data.json` from the source PDF:

```bash
uv run python extract_vocab.py
```

This extracts words from `Gmat 800 vocab list-New.pdf` and fetches English definitions from the Free Dictionary API.

## Tech Stack

- Python + Flask
- Vanilla HTML/CSS/JS (no framework)
- Free Dictionary API for English definitions
- Google Translate for Chinese definitions
