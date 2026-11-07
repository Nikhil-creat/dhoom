import { useEffect, useMemo, useRef, useState } from 'react';
import { api, setToken, WS_URL, abs } from './api';
import { T } from './i18n';
import { usePlayer } from './player.jsx';
import { AuthCard, Cover, Lyrics, QueuePanel, Studio, TrackRow, UploadCard, Visualizer, fmt, hue } from './ui.jsx';

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

/* ---------- Listen Together (WebSocket) ---------- */
function useParty(p, user) {
  const ws = useRef(null); const me = useRef('');
  const [s, setS] = useState({ on: false, room: '', host: false, members: [], chat: [], err: '' });
  const send = (o) => ws.current?.readyState === 1 && ws.current.send(JSON.stringify(o));
  const leave = () => { ws.current?.close(); ws.current = null; setS({ on: false, room: '', host: false, members: [], chat: [], err: '' }); };
  const join = (room) => {
    leave();
    const w = new WebSocket(WS_URL); ws.current = w;
    w.onopen = () => w.send(JSON.stringify({ type: 'join', room, name: user?.name || 'Guest' }));
    w.onerror = () => setS((x) => ({ ...x, err: 'Cannot reach server' }));
    w.onclose = () => setS((x) => ({ ...x, on: false }));
    w.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'joined') { me.current = m.id; setS((x) => ({ ...x, on: true, room: m.room, err: '' })); }
      if (m.type === 'roster') setS((x) => ({ ...x, members: m.members, host: m.hostId === me.current }));
      if (m.type === 'chat') setS((x) => ({ ...x, chat: [...x.chat.slice(-40), m] }));
      if (m.type === 'sync') p.remote(m);
      if (m.type === 'need-sync') pushSync();
    };
  };
  const pushSync = () => { const st = p.getSync(); if (st.track) send({ type: 'sync', ...st }); };
  useEffect(() => { if (s.on && s.host) pushSync(); }, [p.track?.id, p.playing, s.on, s.host]);
  useEffect(() => { if (!(s.on && s.host)) return; const i = setInterval(pushSync, 4000); return () => clearInterval(i); }, [s.on, s.host]);
  return { ...s, join, leave, chat: (text) => send({ type: 'chat', text }), chatLog: s.chat };
}

function PartyView({ party, t }) {
  const [room, setRoom] = useState(''); const [msg, setMsg] = useState('');
  return (
    <div className="card">
      <h3>🛰 {t('party')}</h3>
      {!party.on ? (<>
        <small>Create a room and share the code. Everyone hears the same song in sync — the host controls playback.</small>
        <div className="chips"><input placeholder="Room code (blank = new room)" value={room} onChange={(e) => setRoom(e.target.value)} /><button className="primary" onClick={() => party.join(room)}>{room ? 'Join' : 'Create'}</button></div>
        {party.err && <small className="err">{party.err}</small>}
      </>) : (<>
        <div className="chips"><b>Room: <span className="code">{party.room}</span></b><button onClick={() => navigator.clipboard?.writeText(party.room)}>Copy</button><button onClick={party.leave}>Leave</button></div>
        <small>{party.host ? '👑 You are the host — whatever you play, everyone hears.' : '🎧 Following the host'} · {party.members.length} listening: {party.members.map((m) => m.name).join(', ')}</small>
        <div className="chat">{party.chatLog.map((c, i) => <div key={i}><b>{c.name}:</b> {c.text}</div>)}</div>
        <div className="chips"><input placeholder="Say something…" value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && msg) { party.chat(msg); setMsg(''); } }} /></div>
      </>)}
    </div>
  );
}

/* ---------- AI DJ ---------- */
function AIDJ({ list, user, onSaved, t }) {
  const p = usePlayer(); const [q, setQ] = useState(''); const [res, setRes] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const ask = async (text) => { setBusy(true); setErr(''); try { setRes(await api('/api/ai/dj', { method: 'POST', body: { prompt: text } })); } catch (e) { setErr(e.message); } setBusy(false); };
  const save = async () => { await api('/api/playlists', { method: 'POST', body: { name: res.name, tracks: res.tracks } }); onSaved(); };
  const ideas = ['Wedding baraat DJ energy 🔥', 'Late night Telugu melodies', 'మాస్ బీట్స్ పార్టీ', 'Village folk festival vibes', 'Calm focus study mix', 'Bhakti morning'];
  return (
    <div>
      <div className="card"><h3>🤖 {t('ai')}</h3><small>Describe a mood in English, Telugu or Tenglish.</small>
        <div className="chips"><input className="grow" placeholder="e.g. jathara vibes for a road trip" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && q && ask(q)} /><button className="primary" disabled={busy} onClick={() => q && ask(q)}>{busy ? '…' : 'Generate'}</button></div>
        <div className="chips">{ideas.map((i) => <button key={i} onClick={() => { setQ(i); ask(i); }}>{i}</button>)}</div>
        {err && <small className="err">{err}</small>}
      </div>
      {res && (<><h2>{res.name} <small>{res.ai ? '· AI curated' : '· smart match'}</small></h2>
        <div className="chips"><button className="primary" onClick={() => p.play(res.tracks, 0)}>▶ Play all</button>{user && <button onClick={save}>Save as playlist</button>}</div>
        {list(res.tracks)}</>)}
    </div>
  );
}

/* ---------- Insights / Admin ---------- */
const Bars = ({ title, data }) => { const max = Math.max(1, ...data.map((d) => d.plays)); return (
  <div className="card"><h3>{title}</h3>{data.length ? data.map((d) => <div key={d.name} className="bar"><span>{d.name}</span><i style={{ width: (d.plays / max) * 100 + '%' }} /><small>{d.plays}</small></div>) : <small>Play some songs first.</small>}</div>); };
function Insights() {
  const [s, setS] = useState(null); useEffect(() => { api('/api/stats').then(setS).catch(() => {}); }, []);
  if (!s) return <small>Loading…</small>;
  return <div><h2>📈 Your listening · {s.totalPlays} plays</h2><Bars title="Top genres" data={s.topGenres} /><Bars title="Top artists" data={s.topArtists} /><Bars title="Top tracks" data={s.topTracks} /></div>;
}
function Admin({ refresh, tracks }) {
  const [s, setS] = useState(null); const [err, setErr] = useState('');
  const load = () => api('/api/admin/stats').then(setS).catch((e) => setErr(e.message)); useEffect(() => { load(); }, []);
  if (err) return <small className="err">{err}</small>; if (!s) return <small>Loading…</small>;
  const del = async (id) => { if (confirm('Delete track?')) { await api('/api/tracks/' + id, { method: 'DELETE' }); refresh(); load(); } };
  return (
    <div><h2>🛡 Admin</h2>
      <div className="stats">{[['Users', s.users], ['Tracks', s.tracks], ['Playlists', s.playlists], ['Plays', s.totalPlays], ['Live rooms', s.rooms]].map(([k, v]) => <div key={k} className="card stat"><b>{v}</b><small>{k}</small></div>)}</div>
      <Bars title="Top tracks" data={s.topTracks.map((x) => ({ name: x.title, plays: x.plays }))} />
      <h3>Manage tracks</h3>{tracks.map((x) => <div key={x.id} className="row"><div className="meta"><b>{x.title}</b><small>{x.artist} · {x.genre}</small></div><button onClick={() => del(x.id)}>Delete</button></div>)}
    </div>
  );
}

/* ---------- Now Playing (panel on desktop, full-screen on mobile) ---------- */
function NowPlaying({ t, onClose }) {
  const p = usePlayer(); const [tab, setTab] = useState('viz');
  return (
    <section className="np">
      <div className="chips"><button onClick={onClose}>✕</button>{[['viz', 'Now'], ['lyrics', t('lyrics')], ['queue', t('queue')]].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'viz' && <div className="fullart"><Cover t={p.track} size={220} /><h3>{p.track.title}</h3><small>{p.track.artist}</small><Visualizer /></div>}
      {tab === 'lyrics' && <Lyrics />}
      {tab === 'queue' && <QueuePanel t={t} />}
    </section>
  );
}

/* ---------- Command palette (Ctrl/⌘ + K) ---------- */
function Palette({ onClose, go, setQ, t }) {
  const [v, setV] = useState('');
  const cmds = [['home', t('home')], ['search', t('search')], ['library', t('library')], ['ai', t('ai')], ['party', t('party')], ['studio', t('studio')], ['stats', t('stats')], ['upload', t('upload')], ['settings', t('settings')]];
  const hit = cmds.filter(([k, l]) => `${k} ${l}`.toLowerCase().includes(v.toLowerCase()));
  const run = (k) => { go(k); onClose(); };
  return (
    <div className="modal" onClick={onClose}><div className="card pal" onClick={(e) => e.stopPropagation()}>
      <input autoFocus placeholder="Go to… or type a song to search" value={v} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter') { if (hit.length && v) run(hit[0][0]); else { setQ(v); run('search'); } } }} />
      {hit.map(([k, l]) => <a key={k} onClick={() => run(k)}>{l}</a>)}
      {v && <a onClick={() => { setQ(v); run('search'); }}>🔎 Search “{v}”</a>}
    </div></div>
  );
}

export default function App() {
  const p = usePlayer();
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en'); const t = (k) => T[lang][k] || k;
  const [theme, setTheme] = useState(() => load('theme', { mode: 'neon', accent: '#ff3d81' }));
  const [view, setView] = useState('home');
  const [user, setUser] = useState(() => load('user', null));
  const [genres, setGenres] = useState([]); const [genre, setGenre] = useState('');
  const [tracks, setTracks] = useState([]); const [disc, setDisc] = useState({ tracks: [] }); const [rec, setRec] = useState({ forYou: [], trending: [], mixes: [] });
  const [q, setQ] = useState(''); const [liked, setLiked] = useState([]); const [pls, setPls] = useState([]); const [open, setOpen] = useState(null); const [recent, setRecent] = useState([]);
  const [showAuth, setShowAuth] = useState(false); const [np, setNp] = useState(false); const [pal, setPal] = useState(false); const [listening, setListening] = useState(false);
  const party = useParty(p, user);

  const loadLib = () => user && Promise.all([api('/api/likes'), api('/api/playlists'), api('/api/history')]).then(([l, pl, h]) => { setLiked(l); setPls(pl); setRecent(h); }).catch(() => { setToken(null); setUser(null); });
  const loadTracks = () => api(`/api/tracks?genre=${encodeURIComponent(genre)}&q=${encodeURIComponent(q)}`).then(setTracks).catch(() => {});
  const loadRec = () => api('/api/recommend').then(setRec).catch(() => {});
  useEffect(() => { api('/api/genres').then(setGenres).catch(() => {}); }, []);
  useEffect(() => { loadTracks(); }, [genre, q]);
  useEffect(() => { api(`/api/discover?q=${encodeURIComponent(q)}&tags=${encodeURIComponent(genre && !genre.startsWith('Telugu') ? genre.toLowerCase() : '')}`).then(setDisc).catch(() => {}); }, [genre, q]);
  useEffect(() => { loadLib(); loadRec(); localStorage.setItem('user', JSON.stringify(user)); }, [user]);
  useEffect(() => { localStorage.setItem('lang', lang); }, [lang]);
  useEffect(() => {
    localStorage.setItem('theme', JSON.stringify(theme));
    document.documentElement.dataset.theme = theme.mode; document.documentElement.style.setProperty('--ac', theme.accent);
  }, [theme]);
  useEffect(() => { document.documentElement.style.setProperty('--glow', p.track ? `hsl(${hue(p.track.title)} 70% 22%)` : '#1b1030'); }, [p.track?.id]);

  useEffect(() => {
    const k = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPal(true); return; }
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); p.toggle(); }
      if (e.code === 'ArrowRight') e.shiftKey ? p.next() : p.seek(p.time + 10);
      if (e.code === 'ArrowLeft') e.shiftKey ? p.prev() : p.seek(Math.max(0, p.time - 10));
      if (e.code === 'ArrowUp') p.setVol(Math.min(1, p.vol + 0.05));
      if (e.code === 'ArrowDown') p.setVol(Math.max(0, p.vol - 0.05));
      if (e.key === 'l') setNp((x) => !x);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  const voice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return alert('Voice search is not supported in this browser (try Chrome).');
    const r = new SR(); r.lang = lang === 'te' ? 'te-IN' : 'en-IN'; r.onstart = () => setListening(true); r.onend = () => setListening(false);
    r.onresult = (e) => { setQ(e.results[0][0].transcript); setView('search'); }; r.start();
  };

  const isLiked = (x) => liked.some((l) => l.id === x.id);
  const like = async (x) => { await api('/api/likes', { method: 'POST', body: { track: x } }); loadLib(); };
  const addTo = async (id, x) => { await api(`/api/playlists/${id}/tracks`, { method: 'POST', body: { track: x } }); loadLib(); };
  const newPl = async () => { const name = prompt('Playlist name'); if (name) { await api('/api/playlists', { method: 'POST', body: { name } }); loadLib(); } };
  const delPl = async (id) => { await api('/api/playlists/' + id, { method: 'DELETE' }); setOpen(null); loadLib(); };
  const rmFrom = async (x) => { await api(`/api/playlists/${open}/tracks/${x.id}`, { method: 'DELETE' }); loadLib(); };
  const share = async (pl) => { await api('/api/playlists/' + pl.id, { method: 'PATCH', body: { public: true } }); const url = `${location.origin}/#pl=${pl.id}`; navigator.clipboard?.writeText(url); alert('Public link copied:\n' + url); loadLib(); };
  const logout = () => { setToken(null); setUser(null); setLiked([]); setPls([]); setRecent([]); };
  const go = (k) => { if (['library', 'upload', 'stats', 'ai'].includes(k) && !user && k !== 'ai') setShowAuth(true); setView(k); };
  const shared = { user, playlists: pls, onLike: like, onAdd: addTo };
  const list = (arr) => arr.map((x, i) => <TrackRow key={x.id} t={x} list={arr} i={i} liked={isLiked(x)} {...shared} />);
  const openPl = pls.find((x) => x.id === open);

  // public playlist deep link  (#pl=ID)
  const [pubPl, setPubPl] = useState(null);
  useEffect(() => { const m = location.hash.match(/pl=(\w+)/); if (m) api('/api/public/playlists/' + m[1]).then((d) => { setPubPl(d); setView('public'); }).catch(() => {}); }, []);

  const nav = [['home', '🏠', t('home')], ['search', '🔎', t('search')], ['library', '📚', t('library')], ['ai', '🤖', t('ai')], ['party', '🛰', t('party')], ['studio', '🎛', t('studio')], ['stats', '📈', t('stats')], ['upload', '⬆', t('upload')], ...(user?.role === 'admin' ? [['admin', '🛡', t('admin')]] : []), ['settings', '⚙', t('settings')]];

  return (
    <div className={'app' + (p.track ? ' hasp' : '') + (np ? ' np-open' : '')}>
      <aside>
        <h1>🥁 Dhoom</h1>
        {nav.map(([k, ic, l]) => <a key={k} className={view === k ? 'act' : ''} onClick={() => go(k)}><span>{ic}</span> {l}</a>)}
        <a onClick={() => setPal(true)}><span>⌘</span> Ctrl+K</a>
        <div className="grow" />
        {user ? <a onClick={logout}>👤 {user.name} · {t('logout')}</a> : <a onClick={() => setShowAuth(true)}>👤 {t('login')}</a>}
      </aside>

      <main>
        {showAuth && !user && <AuthCard onDone={(u) => { setUser(u); setShowAuth(false); }} />}
        {party.on && view !== 'party' && <div className="banner" onClick={() => setView('party')}>🛰 Room {party.room} · {party.members.length} listening {party.host ? '(you are host)' : '(following host)'}</div>}

        {view === 'home' && (<>
          <div className="chips"><button className={!genre ? 'on' : ''} onClick={() => setGenre('')}>All</button>{genres.map((g) => <button key={g} className={genre === g ? 'on' : ''} onClick={() => setGenre(g)}>{g}</button>)}</div>
          {genre ? (<><h2>{genre}</h2>{tracks.length ? list(tracks) : <small>No tracks in this genre yet — upload some!</small>}</>) : (<>
            {user && recent.length > 0 && (<><h2>{t('recent')}</h2><div className="hs">{recent.slice(0, 10).map((x, i) => <div key={x.id} className="tile" onClick={() => p.play(recent, i)}><Cover t={x} size={120} /><b>{x.title}</b><small>{x.artist}</small></div>)}</div></>)}
            <h2>{t('forYou')}</h2><div className="hs">{rec.forYou.map((x, i) => <div key={x.id} className="tile" onClick={() => p.play(rec.forYou, i)}><Cover t={x} size={120} /><b>{x.title}</b><small>{x.artist}</small></div>)}</div>
            <h2>{t('mixes')}</h2>{rec.mixes.map((m) => <div key={m.name} className="card mix"><b>{m.name}</b><button className="primary" onClick={() => p.play(m.tracks, 0)}>▶ Play</button></div>)}
            <h2>{t('trending')}</h2>{list(rec.trending)}
            <h2>{t('discover')} <small>(Creative Commons)</small></h2>{disc.tracks.length ? list(disc.tracks) : <small>{disc.note || 'Nothing found.'}</small>}
          </>)}
        </>)}

        {view === 'search' && (<>
          <div className="chips"><input className="search grow" autoFocus placeholder={t('searchPh')} value={q} onChange={(e) => setQ(e.target.value)} /><button className={listening ? 'on' : ''} onClick={voice}>🎤</button></div>
          <h2>Library</h2>{tracks.length ? list(tracks) : <small>No matches.</small>}
          <h2>{t('discover')}</h2>{disc.tracks.length ? list(disc.tracks) : <small>{disc.note || 'Nothing found.'}</small>}
        </>)}

        {view === 'library' && user && (<>
          <h2>{t('liked')}</h2>{liked.length ? list(liked) : <small>Tap ♡ on any song.</small>}
          <h2>{t('playlists')} <button onClick={newPl}>＋ New</button></h2>
          <div className="chips">{pls.map((x) => <button key={x.id} className={open === x.id ? 'on' : ''} onClick={() => setOpen(x.id)}>{x.name} ({x.tracks.length})</button>)}</div>
          {openPl && (<><h3>{openPl.name} <button onClick={() => p.play(openPl.tracks, 0)}>▶</button> <button onClick={() => share(openPl)}>🔗 Share</button> <button onClick={() => delPl(openPl.id)}>Delete</button></h3>
            {openPl.tracks.map((x, i) => <TrackRow key={x.id} t={x} list={openPl.tracks} i={i} liked={isLiked(x)} {...shared} onRemove={rmFrom} />)}</>)}
          <h2>{t('recent')}</h2>{list(recent)}
        </>)}

        {view === 'public' && pubPl && (<><h2>🔗 {pubPl.name} <small>by {pubPl.owner}</small></h2><button className="primary" onClick={() => p.play(pubPl.tracks, 0)}>▶ Play all</button>{list(pubPl.tracks)}</>)}
        {view === 'ai' && <AIDJ list={list} user={user} onSaved={loadLib} t={t} />}
        {view === 'party' && <PartyView party={party} t={t} />}
        {view === 'studio' && <Studio />}
        {view === 'stats' && user && <Insights />}
        {view === 'upload' && user && <UploadCard genres={genres} onDone={() => { loadTracks(); loadRec(); }} />}
        {view === 'admin' && user?.role === 'admin' && <Admin tracks={tracks} refresh={loadTracks} />}
        {view === 'settings' && (
          <div className="card"><h3>⚙ {t('settings')}</h3>
            <div className="chips"><span>Language</span><button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button><button className={lang === 'te' ? 'on' : ''} onClick={() => setLang('te')}>తెలుగు</button></div>
            <div className="chips"><span>Theme</span>{['neon', 'amoled', 'light'].map((m) => <button key={m} className={theme.mode === m ? 'on' : ''} onClick={() => setTheme({ ...theme, mode: m })}>{m}</button>)}</div>
            <div className="chips"><span>Accent</span>{['#ff3d81', '#7c4dff', '#00d4ff', '#22e58b', '#ffb020'].map((c) => <button key={c} style={{ background: c, width: 30, height: 30, padding: 0 }} onClick={() => setTheme({ ...theme, accent: c })} />)}</div>
            <small>Shortcuts: Space play/pause · ←/→ seek 10s · Shift+←/→ prev/next · ↑/↓ volume · L lyrics · Ctrl/⌘+K command palette</small>
          </div>
        )}
      </main>

      {p.track && np && <NowPlaying t={t} onClose={() => setNp(false)} />}

      {p.track && (
        <footer>
          <div className="now" onClick={() => setNp(!np)}><Cover t={p.track} /><div className="meta"><b>{p.track.title}</b><small>{p.track.artist}</small></div></div>
          <div className="ctl">
            <div>
              <button className={p.shuffle ? 'on' : ''} onClick={() => p.setShuffle(!p.shuffle)}>🔀</button>
              <button onClick={p.prev}>⏮</button>
              <button className="big" onClick={p.toggle}>{p.playing ? '⏸' : '▶'}</button>
              <button onClick={p.next}>⏭</button>
              <button className={p.repeat !== 'off' ? 'on' : ''} onClick={() => p.setRepeat({ off: 'all', all: 'one', one: 'off' }[p.repeat])}>{p.repeat === 'one' ? '🔂' : '🔁'}</button>
            </div>
            <div className="seek"><small>{fmt(p.time)}</small><input type="range" min="0" max={p.dur || 0} step="0.5" value={p.time} onChange={(e) => p.seek(+e.target.value)} /><small>{fmt(p.dur)}</small></div>
          </div>
          <div className="vol"><button onClick={() => setNp(!np)}>🎤</button>🔊<input type="range" min="0" max="1" step="0.01" value={p.vol} onChange={(e) => p.setVol(+e.target.value)} /></div>
        </footer>
      )}
      {pal && <Palette onClose={() => setPal(false)} go={go} setQ={setQ} t={t} />}
    </div>
  );
}
