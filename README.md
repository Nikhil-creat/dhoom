# 🥁 Dhoom v3 — AI-powered Music Streaming Platform

React + Vite PWA · Node/Express API · WebSockets · Web Audio · optional Groq LLM

## Feature map
**Playback & audio engine** — queue (reorder/remove/play-next), shuffle, repeat, gapless auto-advance, fade in/out, playback speed (pitch-preserved), 3-band EQ + presets (DJ Bass Boost, Folk Vocal, Club), loudness leveler (compressor), **8D spatial audio**, 3 live visualizers (bars/wave/circle), sleep timer, lock-screen controls, resume queue after refresh.
**Discovery & AI** — **AI DJ** (describe a vibe in English/Telugu/Tenglish → playlist; Groq LLM or built-in mood engine), personalized "Made for you" + Daily Mixes from your history, trending, Discover (Jamendo CC catalog), search + 🎤 **Telugu voice search**.
**Social** — **Listen Together** (real-time synced rooms + chat over WebSocket), public playlist share links.
**Lyrics** — time-synced karaoke lyrics (LRCLIB or your own .lrc upload), click a line to seek.
**Library** — accounts, liked songs, playlists, history, listening **Insights** dashboard.
**Creator tools** — upload audio + cover art + .lrc, genres incl. Telugu Folk DJ / Mass Beats / Bhakti.
**Admin** — first registered user is admin: platform stats, live rooms, track moderation.
**UX** — Telugu/English UI, 3 themes + accent colors, command palette (Ctrl/⌘+K), keyboard shortcuts, responsive/mobile, installable offline-shell PWA.
**v3 additions** — sticky header (search, voice, language, API status), footer + legal pages (About/Privacy/Terms/DMCA/Security & Limits), hero + skeleton loaders, API-down diagnostics banner, **Agentic AI assistant** (tool-calling), **RAG knowledge Q&A** (BM25 + citations), **CNN genre tagging service** (PyTorch, Docker), copyright report queue, data export/delete.
**Engineering** — helmet security headers, rate limiting, input validation, CORS allowlist, SSRF-safe stream proxy, graceful shutdown, Docker + docker-compose, GitHub Actions CI.

## Run locally
```bash
cd server && cp .env.example .env && npm install && npm run dev     # :8080
cd client && cp .env.example .env && npm install && npm run dev     # :5173
# or: docker compose up --build   (web :3000, api :8080)
```
After first start, **register yourself first → you become admin**.

## Music licensing (important)
Seed tracks are placeholder demo audio. Commercial Telugu film/DJ songs are copyrighted: only upload music you own or have written permission for (independent folk artists, your own remixes, CC-licensed tracks). See `ROADMAP.md` for the licensed-catalog path.


See `ARCHITECTURE.md`, `SECURITY.md`, `ROADMAP.md`, `ml/README.md`.

**Persistence:** set `SUPABASE_*` env vars (see `SUPABASE.md`) so data and uploads survive redeploys.
