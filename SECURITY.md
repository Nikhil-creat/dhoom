# Security model

## Controls
| Area | Control |
|---|---|
| Auth | bcrypt (cost 10), JWT 30d, login/register limited to 30 req / 15 min / IP |
| Transport/headers | Helmet; CORS allowlist with wildcard support (`CLIENT_ORIGIN`) |
| Abuse | global 600 req/15 min, AI 15/min, reports 5/hour |
| Uploads | 30 MB cap, MIME filter + magic-byte sniffing, random filenames, cover/lyrics validated |
| Proxy | `/api/proxy` only fetches allowlisted hosts (soundhelix.com, jamendo.com) |
| Agent | fixed tool allowlist, arg validation, ids verified against catalog, max 5 steps, tool output truncated, prompts mark tool/lyrics text as untrusted, no cross-user data, playlists only for the signed-in user |
| RAG | answers constrained to retrieved context; lyrics never quoted beyond a short phrase; lyric snippets not returned in sources |
| WebSocket | 64 KB payload cap, host-only sync, only same-origin (`/…`) track URLs accepted, heartbeat |
| Privacy | data export + account deletion, copyright report workflow |

## Known gaps (do these before a commercial launch)
1. Move JSON file → Postgres (Supabase) + object storage; add backups.
2. Email verification, password reset, optional 2FA/OAuth; consider httpOnly cookies instead of localStorage tokens.
3. Content moderation + automated copyright fingerprinting (e.g. audio ID service).
4. Dependency scanning (Dependabot), `npm audit` in CI, replace multer 1.x with 2.x.
5. Centralised logging/alerts (Sentry), WAF/CDN in front of the API.
6. Legal: have a lawyer review Privacy/Terms/DMCA pages; register a DMCA agent if you serve US users.
