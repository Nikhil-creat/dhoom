# Supabase setup (persistence for users, playlists, history + song/cover storage)

1. supabase.com → New project (note the DB password; any region near you).
2. **SQL Editor → New query** → paste `supabase.sql` → Run.
3. **Storage → New bucket** → name `dhoom` → turn **Public bucket** ON → Create.
4. **Project Settings → API** (or API Keys): copy
   - Project URL → `SUPABASE_URL` (e.g. https://abcd1234.supabase.co)
   - `service_role` key (legacy) **or** the new `secret` key → `SUPABASE_SERVICE_KEY`
   ⚠ This key is a server secret. Put it ONLY in Render env vars — never in Vercel/Netlify/client code or GitHub.
5. Render → your service → Environment → add `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET=dhoom` → Save (auto redeploy).
6. Check `https://<render-url>/api/health` → `"storage":"supabase"`. Render logs should say `Loaded state from Supabase` or `fresh start`.

How it works: the API keeps its fast in-memory database and snapshots it to the `dhoom_state` table after every change (~1s debounce); uploads go to the `dhoom` bucket and stream back through `/api/proxy`.
If Supabase can't be reached on boot the API **refuses to start** instead of overwriting your data.
Limits: single API instance, whole-state snapshots (fine for thousands of tracks/users, not millions). See ROADMAP.md for the move to real tables.
