import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-secret-change-me') console.warn('⚠️  Set JWT_SECRET in production!');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ============ tiny JSON database (swap for Postgres/Supabase later — see ROADMAP.md) ============ */
const DB_FILE = path.join(DATA_DIR, 'db.json');
const db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
Object.assign(db, { users: [], tracks: [], ext: {}, playlists: [], likes: {}, history: {}, ...db });
let timer;
const flush = () => fs.writeFileSync(DB_FILE, JSON.stringify(db));
const save = () => { clearTimeout(timer); timer = setTimeout(flush, 200); };
const uid = () => crypto.randomBytes(6).toString('hex');
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);

const GENRES = ['Telugu Folk DJ', 'Telugu Folk', 'Telugu Melody', 'Telugu Mass Beats', 'Bhakti', 'Devotional Folk', 'Pop', 'Rock', 'Hip-Hop', 'Electronic', 'Lo-fi', 'Classical', 'Jazz', 'Bollywood'];
if (!db.tracks.length) {
  const demo = [
    ['Demo Folk DJ Mix 1', 'Demo Artist', 'Telugu Folk DJ'], ['Demo Folk DJ Mix 2', 'Demo Artist', 'Telugu Folk DJ'],
    ['Demo Palle Folk', 'Demo Artist', 'Telugu Folk'], ['Demo Melody', 'Demo Artist', 'Telugu Melody'],
    ['Demo Mass Beat', 'Demo Artist', 'Telugu Mass Beats'], ['Demo Bhakti', 'Demo Artist', 'Bhakti'],
    ['Demo Pop', 'Demo Artist', 'Pop'], ['Demo Electronic', 'Demo Artist', 'Electronic'],
  ];
  db.tracks = demo.map(([title, artist, genre], i) => ({
    id: 'seed' + (i + 1), title, artist, album: 'Demo Pack', genre, language: genre.startsWith('Telugu') ? 'Telugu' : 'English', cover: '',
    url: `/api/proxy?u=${encodeURIComponent(`https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${i + 1}.mp3`)}`, source: 'demo', plays: 0,
  }));
  save();
}

/* ============ app + security ============ */
const app = express();
app.set('trust proxy', 1);
const origins = (process.env.CLIENT_ORIGIN || '*').split(',').map((s) => s.trim());
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // cross-origin so audio/images load on Vercel/Netlify
app.use(cors({ origin: origins.includes('*') ? true : origins }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, message: { error: 'Too many attempts, try later' } });
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

const readTok = (req) => jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET);
const auth = (req, res, next) => { try { req.user = readTok(req); next(); } catch { res.status(401).json({ error: 'Login required' }); } };
const optAuth = (req, _res, next) => { try { req.user = readTok(req); } catch {} next(); };
const admin = (req, res, next) => (db.users.find((u) => u.id === req.user.id)?.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' }));
const sign = (u) => jwt.sign({ id: u.id, name: u.name }, JWT_SECRET, { expiresIn: '30d' });
const pub = (u) => ({ id: u.id, name: u.name, role: u.role });
const findTrack = (id) => db.tracks.find((t) => t.id === id) || db.ext[id];
const stash = (t) => { if (t?.id && !findTrack(t.id)) db.ext[t.id] = { id: t.id, title: String(t.title).slice(0, 200), artist: String(t.artist || '').slice(0, 200), album: t.album || '', genre: t.genre || '', cover: t.cover || '', url: t.url, source: t.source || 'ext' }; };

app.get('/api/health', (_, res) => res.json({ ok: true, uptime: Math.round(process.uptime()), version: '2.0.0' }));
app.get('/api/genres', (_, res) => res.json(GENRES));

/* ============ auth (first registered user becomes admin) ============ */
app.post('/api/auth/register', authLimit, async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 8) return res.status(400).json({ error: 'Valid name, email and 8+ char password required' });
  if (db.users.some((u) => u.email === email.toLowerCase())) return res.status(409).json({ error: 'Email already registered' });
  const u = { id: uid(), name: String(name).slice(0, 40), email: email.toLowerCase(), hash: await bcrypt.hash(password, 10), role: db.users.length ? 'user' : 'admin', created: Date.now() };
  db.users.push(u); save();
  res.json({ token: sign(u), user: pub(u) });
});
app.post('/api/auth/login', authLimit, async (req, res) => {
  const { email, password } = req.body || {};
  const u = db.users.find((x) => x.email === (email || '').toLowerCase());
  if (!u || !(await bcrypt.compare(password || '', u.hash))) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: sign(u), user: pub(u) });
});
app.get('/api/me', auth, (req, res) => { const u = db.users.find((x) => x.id === req.user.id); u ? res.json(pub(u)) : res.status(401).json({ error: 'Gone' }); });

/* ============ catalog + upload (audio, cover art, .lrc lyrics) ============ */
app.get('/api/tracks', (req, res) => {
  const q = (req.query.q || '').toLowerCase(), g = req.query.genre;
  res.json(db.tracks.filter((t) => (!g || t.genre === g) && (!q || `${t.title} ${t.artist} ${t.album} ${t.genre}`.toLowerCase().includes(q))).slice(0, 200));
});
app.post('/api/tracks/:id/play', (req, res) => { const t = db.tracks.find((x) => x.id === req.params.id); if (t) { t.plays = (t.plays || 0) + 1; save(); } res.json({ ok: true }); });

const upload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (_, f, cb) => cb(null, uid() + path.extname(f.originalname).toLowerCase()) }),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_, f, cb) => cb(null, f.fieldname === 'audio' ? f.mimetype.startsWith('audio/') : f.fieldname === 'cover' ? f.mimetype.startsWith('image/') : /\.(lrc|txt)$/i.test(f.originalname)),
});
app.post('/api/tracks', auth, upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'cover', maxCount: 1 }, { name: 'lrc', maxCount: 1 }]), (req, res) => {
  const f = req.files || {}; const audio = f.audio?.[0];
  if (!audio) return res.status(400).json({ error: 'Attach an audio file (mp3/m4a/wav/ogg, max 30MB)' });
  const b = req.body; let lyrics = '';
  if (f.lrc?.[0]) { lyrics = fs.readFileSync(f.lrc[0].path, 'utf8').slice(0, 60000); fs.rm(f.lrc[0].path, () => {}); }
  const t = { id: uid(), title: b.title || audio.originalname, artist: b.artist || 'Unknown', album: b.album || 'Singles', genre: GENRES.includes(b.genre) ? b.genre : 'Telugu Folk DJ', language: b.language || 'Telugu', cover: f.cover?.[0] ? '/uploads/' + f.cover[0].filename : '', url: '/uploads/' + audio.filename, source: 'upload', by: req.user.id, lyrics, plays: 0, created: Date.now() };
  db.tracks.unshift(t); save(); const { lyrics: _l, ...out } = t; res.json(out);
});
const removeTrack = (t) => { for (const u of [t.url, t.cover]) if (u?.startsWith('/uploads/')) fs.rm(path.join(UPLOAD_DIR, path.basename(u)), () => {}); };
app.delete('/api/tracks/:id', auth, (req, res) => {
  const isAdmin = db.users.find((u) => u.id === req.user.id)?.role === 'admin';
  const i = db.tracks.findIndex((t) => t.id === req.params.id && (t.by === req.user.id || isAdmin));
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  removeTrack(db.tracks.splice(i, 1)[0]); save(); res.json({ ok: true });
});

/* ============ Discover (Jamendo CC catalog) + streaming proxy ============ */
app.get('/api/discover', async (req, res) => {
  const id = process.env.JAMENDO_CLIENT_ID;
  if (!id) return res.json({ tracks: [], note: 'Set JAMENDO_CLIENT_ID on the server to enable Discover' });
  try {
    const p = new URLSearchParams({ client_id: id, format: 'json', limit: '24', include: 'musicinfo', audioformat: 'mp32', order: 'popularity_week' });
    if (req.query.q) p.set('search', req.query.q);
    if (req.query.tags) p.set('tags', req.query.tags);
    const r = await (await fetch('https://api.jamendo.com/v3.0/tracks/?' + p)).json();
    res.json({ tracks: (r.results || []).map((t) => ({ id: 'jm' + t.id, title: t.name, artist: t.artist_name, album: t.album_name, genre: t.musicinfo?.tags?.genres?.[0] || 'Discover', cover: t.image, url: `/api/proxy?u=${encodeURIComponent(t.audio)}`, source: 'jamendo' })) });
  } catch { res.status(502).json({ error: 'Discover service unavailable' }); }
});
const ALLOW = ['soundhelix.com', 'jamendo.com'];
app.get('/api/proxy', async (req, res) => {
  try {
    const u = new URL(req.query.u);
    if (!/^https?:$/.test(u.protocol) || !ALLOW.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))) return res.status(403).end();
    const r = await fetch(u, { headers: req.headers.range ? { Range: req.headers.range } : {} });
    res.status(r.status);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) { const v = r.headers.get(h); if (v) res.setHeader(h, v); }
    Readable.fromWeb(r.body).pipe(res);
  } catch { res.status(502).end(); }
});

/* ============ lyrics: own .lrc first, then LRCLIB (free community lyrics DB) ============ */
const lyricCache = new Map();
app.get('/api/lyrics', async (req, res) => {
  const own = db.tracks.find((t) => t.id === req.query.id)?.lyrics;
  if (own) return res.json({ synced: /\[\d+:\d+/.test(own) ? own : '', plain: own, source: 'upload' });
  const { title, artist } = req.query; if (!title) return res.status(400).json({ error: 'title required' });
  const key = `${artist}|${title}`.toLowerCase();
  if (lyricCache.has(key)) return res.json(lyricCache.get(key));
  try {
    const r = await fetch(`https://lrclib.net/api/get?${new URLSearchParams({ track_name: title, artist_name: artist || '' })}`, { headers: { 'User-Agent': 'Dhoom/2.0' } });
    if (!r.ok) return res.status(404).json({ error: 'No lyrics' });
    const d = await r.json(); const out = { synced: d.syncedLyrics || '', plain: d.plainLyrics || '', source: 'lrclib' };
    if (lyricCache.size > 500) lyricCache.clear(); lyricCache.set(key, out); res.json(out);
  } catch { res.status(404).json({ error: 'No lyrics' }); }
});

/* ============ history, stats, recommendations ============ */
app.post('/api/history', auth, (req, res) => {
  const t = req.body.track; if (!t?.id) return res.status(400).json({ error: 'track required' });
  stash(t); const h = (db.history[req.user.id] ||= []); h.unshift({ id: t.id, ts: Date.now() }); h.length = Math.min(h.length, 1000); save(); res.json({ ok: true });
});
app.get('/api/history', auth, (req, res) => {
  const seen = new Set(), out = [];
  for (const e of db.history[req.user.id] || []) { if (seen.has(e.id)) continue; seen.add(e.id); const t = findTrack(e.id); if (t) out.push(t); if (out.length >= 30) break; }
  res.json(out);
});
app.get('/api/stats', auth, (req, res) => {
  const h = db.history[req.user.id] || [];
  const count = (f) => { const m = {}; h.forEach((e) => { const t = findTrack(e.id); if (t) { const k = f(t); if (k) m[k] = (m[k] || 0) + 1; } }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, plays]) => ({ name, plays })); };
  res.json({ totalPlays: h.length, topGenres: count((t) => t.genre), topArtists: count((t) => t.artist), topTracks: count((t) => t.title) });
});
app.get('/api/recommend', optAuth, (req, res) => {
  const cat = db.tracks;
  const trending = [...cat].sort((a, b) => (b.plays || 0) - (a.plays || 0)).slice(0, 12);
  const h = (req.user && db.history[req.user.id]) || [];
  let forYou = trending, mixes;
  if (h.length) {
    const g = {}, a = {};
    h.slice(0, 200).forEach((e) => { const t = findTrack(e.id); if (t) { g[t.genre] = (g[t.genre] || 0) + 1; a[t.artist] = (a[t.artist] || 0) + 1; } });
    const sc = (t) => (g[t.genre] || 0) * 2 + (a[t.artist] || 0) * 3 + Math.log((t.plays || 0) + 1) * 0.3;
    forYou = [...cat].sort((x, y) => sc(y) - sc(x)).slice(0, 12);
    mixes = Object.entries(g).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k], i) => ({ name: `Daily Mix ${i + 1} · ${k}`, tracks: shuffle(cat.filter((t) => t.genre === k)).slice(0, 20) }));
  } else mixes = ['Telugu Folk DJ', 'Telugu Melody'].map((k, i) => ({ name: `Daily Mix ${i + 1} · ${k}`, tracks: cat.filter((t) => t.genre === k).slice(0, 20) }));
  res.json({ forYou, trending, mixes: mixes.filter((m) => m.tracks.length) });
});

/* ============ AI DJ: Groq LLM if GROQ_API_KEY set, else mood-keyword engine (works in English/Telugu/Tenglish) ============ */
const MOODS = [
  [/party|dj|dance|wedding|baraat|mass|beat|energy|jathara|bonalu|dappu|డీజే|మాస్|పండుగ/i, ['Telugu Folk DJ', 'Telugu Mass Beats', 'Electronic', 'Hip-Hop']],
  [/folk|palle|village|janapada|జానపద|పల్లె/i, ['Telugu Folk', 'Telugu Folk DJ', 'Devotional Folk']],
  [/chill|sleep|relax|study|focus|night|calm|lofi|lo-fi|ప్రశాంత/i, ['Lo-fi', 'Classical', 'Jazz', 'Telugu Melody']],
  [/love|sad|romantic|melody|heart|ప్రేమ|మెలోడీ/i, ['Telugu Melody', 'Bollywood', 'Pop']],
  [/god|bhakti|devotional|temple|pooja|bhajan|భక్తి|దైవ/i, ['Bhakti', 'Devotional Folk', 'Classical']],
  [/rock|guitar|workout|gym/i, ['Rock', 'Hip-Hop', 'Electronic']],
];
async function groqPick(prompt, cat) {
  const key = process.env.GROQ_API_KEY; if (!key) return null;
  try {
    const lines = cat.slice(0, 200).map((t) => `${t.id}|${t.title}|${t.artist}|${t.genre}`).join('\n');
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', temperature: 0.4, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'You are a music DJ. From the catalog lines (id|title|artist|genre) pick up to 15 tracks matching the request (English, Telugu or Tenglish). Reply ONLY JSON: {"name":"short playlist name","ids":["id"]}. Use only ids from the catalog.' },
        { role: 'user', content: `Request: ${prompt}\nCatalog:\n${lines}` }] }),
    });
    const j = JSON.parse((await r.json()).choices[0].message.content);
    return { name: String(j.name || 'AI Mix').slice(0, 60), ids: Array.isArray(j.ids) ? j.ids : [] };
  } catch { return null; }
}
app.post('/api/ai/dj', optAuth, rateLimit({ windowMs: 60000, limit: 12 }), async (req, res) => {
  const prompt = String(req.body.prompt || '').slice(0, 300); if (!prompt) return res.status(400).json({ error: 'Describe a vibe' });
  const cat = db.tracks; const byId = Object.fromEntries(cat.map((t) => [t.id, t]));
  const g = await groqPick(prompt, cat);
  if (g) { const tracks = g.ids.map((i) => byId[i]).filter(Boolean); if (tracks.length) return res.json({ name: g.name, tracks, ai: true }); }
  const genres = new Set(MOODS.filter(([re]) => re.test(prompt)).flatMap(([, gs]) => gs));
  const words = prompt.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const sc = (t) => (genres.has(t.genre) ? 3 : 0) + words.filter((w) => `${t.title} ${t.artist} ${t.genre}`.toLowerCase().includes(w)).length * 2 + Math.random();
  const tracks = [...cat].sort((a, b) => sc(b) - sc(a)).slice(0, 15);
  res.json({ name: 'Mix: ' + prompt.slice(0, 40), tracks, ai: false });
});

/* ============ likes + playlists (public share links) ============ */
app.get('/api/likes', auth, (req, res) => res.json((db.likes[req.user.id] || []).map(findTrack).filter(Boolean)));
app.post('/api/likes', auth, (req, res) => {
  const t = req.body.track; if (!t?.id) return res.status(400).json({ error: 'track required' });
  stash(t); const l = (db.likes[req.user.id] ||= []); const i = l.indexOf(t.id); i >= 0 ? l.splice(i, 1) : l.unshift(t.id);
  save(); res.json({ liked: i < 0 });
});
const mine = (req) => db.playlists.filter((p) => p.userId === req.user.id);
const view = (p) => ({ id: p.id, name: p.name, public: !!p.public, tracks: p.trackIds.map(findTrack).filter(Boolean) });
app.get('/api/playlists', auth, (req, res) => res.json(mine(req).map(view)));
app.post('/api/playlists', auth, (req, res) => {
  const p = { id: uid(), userId: req.user.id, name: String(req.body.name || 'New playlist').slice(0, 60), trackIds: [], public: false };
  for (const t of req.body.tracks || []) { stash(t); if (t?.id && !p.trackIds.includes(t.id)) p.trackIds.push(t.id); }
  db.playlists.push(p); save(); res.json(view(p));
});
app.patch('/api/playlists/:id', auth, (req, res) => {
  const p = mine(req).find((x) => x.id === req.params.id); if (!p) return res.status(404).json({ error: 'Not found' });
  if (req.body.name) p.name = String(req.body.name).slice(0, 60);
  if (typeof req.body.public === 'boolean') p.public = req.body.public;
  save(); res.json(view(p));
});
app.get('/api/public/playlists/:id', (req, res) => {
  const p = db.playlists.find((x) => x.id === req.params.id && x.public); if (!p) return res.status(404).json({ error: 'Not found or private' });
  res.json({ ...view(p), owner: db.users.find((u) => u.id === p.userId)?.name });
});
app.post('/api/playlists/:id/tracks', auth, (req, res) => {
  const p = mine(req).find((x) => x.id === req.params.id); const t = req.body.track;
  if (!p || !t?.id) return res.status(404).json({ error: 'Not found' });
  stash(t); if (!p.trackIds.includes(t.id)) p.trackIds.push(t.id); save(); res.json(view(p));
});
app.delete('/api/playlists/:id/tracks/:tid', auth, (req, res) => {
  const p = mine(req).find((x) => x.id === req.params.id); if (!p) return res.status(404).json({ error: 'Not found' });
  p.trackIds = p.trackIds.filter((x) => x !== req.params.tid); save(); res.json(view(p));
});
app.delete('/api/playlists/:id', auth, (req, res) => { db.playlists = db.playlists.filter((p) => !(p.id === req.params.id && p.userId === req.user.id)); save(); res.json({ ok: true }); });

/* ============ admin ============ */
app.get('/api/admin/stats', auth, admin, (_req, res) => {
  const totalPlays = db.tracks.reduce((s, t) => s + (t.plays || 0), 0);
  res.json({ users: db.users.length, tracks: db.tracks.length, playlists: db.playlists.length, totalPlays, topTracks: [...db.tracks].sort((a, b) => (b.plays || 0) - (a.plays || 0)).slice(0, 8).map((t) => ({ id: t.id, title: t.title, plays: t.plays || 0 })), rooms: rooms.size });
});

/* ============ Listen Together: WebSocket rooms (host-driven sync + chat) ============ */
const server = http.createServer(app);
const rooms = new Map();
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
const cast = (r, o, except) => r.members.forEach((m) => m !== except && send(m, o));
const roster = (r) => cast(r, { type: 'roster', hostId: r.host.id, members: [...r.members].map((m) => ({ id: m.id, name: m.name })) });
const safeTrack = (t) => (t && typeof t.url === 'string' && t.url.startsWith('/') ? { id: String(t.id), title: String(t.title).slice(0, 200), artist: String(t.artist || '').slice(0, 200), album: t.album || '', genre: t.genre || '', cover: typeof t.cover === 'string' && t.cover.startsWith('/') ? t.cover : '', url: t.url, source: t.source || '' } : null);
wss.on('connection', (ws) => {
  ws.id = uid(); ws.alive = true; ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'join') {
      const code = (String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)) || uid().slice(0, 5).toUpperCase();
      let r = rooms.get(code); if (!r) { r = { host: ws, members: new Set() }; rooms.set(code, r); }
      r.members.add(ws); ws.room = code; ws.name = String(m.name || 'Guest').slice(0, 24);
      send(ws, { type: 'joined', room: code, id: ws.id }); roster(r);
      if (r.host !== ws) send(r.host, { type: 'need-sync' });
      return;
    }
    const r = rooms.get(ws.room); if (!r) return;
    if (m.type === 'sync' && r.host === ws) {
      const track = safeTrack(m.track); if (!track) return;
      cast(r, { type: 'sync', track, queue: (m.queue || []).map(safeTrack).filter(Boolean).slice(0, 50), index: Number(m.index) || 0, playing: !!m.playing, time: Number(m.time) || 0 }, ws);
    }
    if (m.type === 'chat') cast(r, { type: 'chat', name: ws.name, text: String(m.text || '').slice(0, 300) });
  });
  ws.on('close', () => {
    const r = rooms.get(ws.room); if (!r) return;
    r.members.delete(ws);
    if (!r.members.size) return rooms.delete(ws.room);
    if (r.host === ws) r.host = [...r.members][0];
    roster(r);
  });
});
setInterval(() => wss.clients.forEach((ws) => { if (!ws.alive) return ws.terminate(); ws.alive = false; ws.ping(); }), 30000);

server.listen(PORT, () => console.log(`Dhoom API v2 on :${PORT}`));
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { flush(); process.exit(0); });
