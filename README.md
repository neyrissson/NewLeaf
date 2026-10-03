# NewLeaf

A macOS desktop app that automates the tedious parts of a job search: pulling live openings
straight from company career pages, scoring how well each one fits a candidate's background, and
drafting the application materials for the ones worth pursuing.

This is the **demo build** — it ships with no companies pre-loaded. Add a few from *Discovery →
Add Company* to see the pipeline run end to end: scan → filter → score → apply.

## What it does

- **Scans career pages directly**, no manual copy-pasting. Companies on Greenhouse, Lever, Ashby,
  Workday, BambooHR, or Gem are queried through their own public APIs for clean, complete job data
  in well under a second. Anything else falls back to a headless-browser scraper, which also
  self-heals: if a marketing-style careers page yields almost nothing but links out to a real ATS
  board, the backend automatically follows that link and re-scans it.
- **Filters out noise before it reaches you.** A title/description pre-filter (editable allow/deny
  word lists) strips obvious non-roles and off-target functions before anything gets scored, so you
  only spend AI calls on postings worth judging.
- **Scores fit against your background**, via either a local Ollama model (free, private, runs
  entirely on-device) or Claude Haiku (faster, higher quality) — your choice, one toggle.
- **Helps you act on the good ones**: an Application Strategist tab generates a tailored strategy
  brief, a cover letter, and a "why this company" note per job, using whichever engine you picked
  for scoring.
- **Applies a geo policy automatically** (remote, or a set of accepted locations) so postings
  outside where you're willing to work never make it into your feed.

## Stack

React + TypeScript + Vite for the UI, Electron for the desktop shell and all scraping/API logic
(Node, no browser CORS restrictions to work around). No backend server — everything runs locally;
state lives in the browser's local storage inside the app.

## Running it

```bash
npm install
VITE_DEMO_MODE=true npx vite build --outDir dist
npm start
```

`npm run dev` also works for iterating on the UI with hot reload (loads in your default browser,
not the Electron shell).
