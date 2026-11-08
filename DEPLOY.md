# Deploy: GitHub → Render (API) → Vercel / Netlify (web)

> **v3 update (git):** `cd ~/dhoom && git add . && git commit -m "v3" && git push` — Render and Vercel auto-redeploy.
> **If the site loads but lists are empty:** check the red banner, then set Render `CLIENT_ORIGIN` = `https://dhoom-nikhill.vercel.app` (or `https://dhoom-*.vercel.app,https://dhoom-nikhill.vercel.app` to also allow previews). Optional v3 vars: `GROQ_API_KEY` (agent/RAG answers), `ML_SERVICE_URL` (CNN).

**Order: API first** (frontend needs its URL).

## 1. GitHub (from Termux)
```bash
pkg install git -y
unzip dhoom-master-v2.zip && cd dhoom-v2
git init && git add . && git commit -m "Dhoom v2"
git branch -M main
# create an EMPTY repo "dhoom" on github.com, then:
git remote add origin https://github.com/Nikhil-creat/dhoom.git
git push -u origin main                        # password = Personal Access Token (repo scope)
```
The `.github/workflows/ci.yml` will run automatically and show a ✅/❌ build check.

## 2. Render (backend + WebSockets)
1. render.com → **New + → Web Service** → pick repo. Root Directory `server`, Build `npm install`, Start `npm start`, Free plan. (Or New → Blueprint to use `render.yaml`.)
2. Env vars: `NODE_ENV=production`, `JWT_SECRET` (long random), `CLIENT_ORIGIN=*` for now, `JAMENDO_CLIENT_ID` (optional), `GROQ_API_KEY` (optional, enables LLM AI DJ).
3. Open `https://<name>.onrender.com/api/health` → `{"ok":true,...}`. Copy the URL. WebSockets (Listen Together) work on Render automatically.
4. Free tier sleeps when idle (~30s cold start) and has an ephemeral disk — see ROADMAP for Supabase.

## 3a. Vercel (web)
Import repo → Root Directory `client` → Framework Vite → Env `VITE_API_URL=https://<name>.onrender.com` (no trailing slash) → Deploy.

## 3b. Netlify (web mirror)
Add site from Git → Base dir `client` → Build `npm run build` → Publish `dist` (set by `netlify.toml`) → Env `VITE_API_URL` same as above → Deploy.

## 4. Finish
- Render → set `CLIENT_ORIGIN=https://x.vercel.app,https://y.netlify.app` → redeploy.
- **Open your site and register first — the first account is the admin.**
- Test: play → lyrics (L) → AI DJ → open two browsers → Listen Together room.

## Troubleshooting
- Empty/blank data → wrong `VITE_API_URL` (rebuild frontend after changing; Vite bakes it in).
- CORS error → exact frontend URL missing in `CLIENT_ORIGIN`.
- No sound but UI works → browsers block autoplay until first tap; tap ▶.
- Listen Together fails → API URL must be https (wss) and API awake.
- Lyrics empty → LRCLIB doesn't have that song; upload a `.lrc` with the track.
