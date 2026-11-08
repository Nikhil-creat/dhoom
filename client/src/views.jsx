import { useEffect, useRef, useState } from 'react';
import { api, BASE } from './api';

/* ---------- Header / Footer / Hero / banners ---------- */
export function Header({ q, setQ, onSubmit, voice, listening, lang, setLang, user, onLogin, onLogout, apiOk }) {
  return (
    <header className="top">
      <input className="hsearch" placeholder={lang === 'te' ? 'పాటలు, కళాకారులు…' : 'Search songs, artists…'} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSubmit()} />
      <button className={listening ? 'on' : ''} onClick={voice} title="Voice search">🎤</button>
      <button onClick={() => setLang(lang === 'en' ? 'te' : 'en')}>{lang === 'en' ? 'తె' : 'EN'}</button>
      <span className={'dot ' + (apiOk === null ? 'wait' : apiOk ? 'ok' : 'bad')} title={apiOk ? 'API connected' : apiOk === false ? 'API unreachable' : 'Connecting…'} />
      {user ? <button onClick={onLogout} title="Log out">👤 {user.name}</button> : <button className="primary" onClick={onLogin}>Log in</button>}
    </header>
  );
}

export function ApiBanner({ apiOk, retry }) {
  if (apiOk !== false) return null;
  return (
    <div className="card warn">
      <b>⚠ Can't reach the Dhoom API</b>
      <small>Trying: {BASE}</small>
      <small>1) Free Render servers sleep — wait ~30s and retry. 2) Make sure Vercel has VITE_API_URL set to your Render URL (redeploy after changing). 3) On Render, CLIENT_ORIGIN must include this site's URL (or use *).</small>
      <button className="primary" onClick={retry}>Retry</button>
    </div>
  );
}

export const Skeleton = () => <div className="hs">{[...Array(6)].map((_, i) => <div key={i} className="tile"><div className="sk" style={{ width: 120, height: 120 }} /><div className="sk" style={{ width: 90, height: 12 }} /></div>)}</div>;

export function Hero({ onPlay, onAI, onAgent, count }) {
  return (
    <section className="hero">
      <small>🥁 DHOOM · TELUGU-FIRST MUSIC</small>
      <h1>Folk. DJ. Melody.<br />Powered by AI.</h1>
      <p>{count ? `${count} tracks in your library` : 'Your library is ready'} · synced lyrics · 8D audio · listen together</p>
      <div className="chips"><button className="primary" onClick={onPlay}>▶ Play Folk DJ</button><button onClick={onAI}>🤖 AI DJ</button><button onClick={onAgent}>🧠 Ask the Agent</button></div>
    </section>
  );
}

export function Footer({ go }) {
  const L = [['about', 'About'], ['privacy', 'Privacy'], ['terms', 'Terms'], ['dmca', 'Copyright / DMCA'], ['security', 'Security & Limits']];
  return (
    <footer className="site">
      <div className="chips">{L.map(([k, l]) => <a key={k} onClick={() => go(k)}>{l}</a>)}</div>
      <small>© {new Date().getFullYear()} Dhoom · v3 · Only play and upload music you have the rights to.</small>
    </footer>
  );
}

/* ---------- Assistant: Agentic AI + RAG ---------- */
function Agent({ p, onChanged }) {
  const [msgs, setMsgs] = useState([{ role: 'assistant', content: "Hi! I'm the Dhoom agent. I can search the catalog, queue songs and build playlists — in English, Telugu or Tenglish." }]);
  const [v, setV] = useState(''); const [busy, setBusy] = useState(false); const end = useRef();
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);
  const send = async (text) => {
    if (!text.trim() || busy) return; const next = [...msgs, { role: 'user', content: text }]; setMsgs(next); setV(''); setBusy(true);
    try {
      const d = await api('/api/agent/chat', { method: 'POST', body: { message: text, history: msgs.slice(-8).map(({ role, content }) => ({ role, content })) } });
      setMsgs([...next, { role: 'assistant', content: d.reply, steps: d.steps, mode: d.mode }]);
      const play = d.actions?.find((a) => a.type === 'play'); if (play?.tracks?.length) p.play(play.tracks, 0);
      if (d.steps?.includes('create_playlist')) onChanged();
    } catch (e) { setMsgs([...next, { role: 'assistant', content: '⚠ ' + e.message }]); }
    setBusy(false);
  };
  const ideas = ['Play energetic folk DJ songs for a wedding', 'Make me a playlist for a late-night drive', 'వినిపించు మాస్ బీట్స్', 'What did I listen to most?'];
  return (
    <div className="card chatbox">
      <div className="msgs">
        {msgs.map((m, i) => <div key={i} className={'bub ' + m.role}>{m.content}{m.steps?.length > 0 && <div className="tools">{[...new Set(m.steps)].map((s) => <span key={s}>🔧 {s}</span>)}</div>}{m.mode === 'rules' && <small> · basic mode</small>}</div>)}
        {busy && <div className="bub assistant">…thinking</div>}<div ref={end} />
      </div>
      <div className="chips">{ideas.map((i) => <button key={i} onClick={() => send(i)}>{i}</button>)}</div>
      <div className="chips"><input className="grow" placeholder="Ask the agent…" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send(v)} /><button className="primary" disabled={busy} onClick={() => send(v)}>Send</button></div>
    </div>
  );
}

function Knowledge() {
  const [q, setQ] = useState(''); const [r, setR] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const ask = async (text) => { if (!text.trim()) return; setBusy(true); setErr(''); try { setR(await api('/api/rag/ask', { method: 'POST', body: { question: text } })); } catch (e) { setErr(e.message); } setBusy(false); };
  return (
    <div className="card">
      <small>Retrieval-Augmented answers from guides, track info and lyrics, with sources.</small>
      <div className="chips"><input className="grow" placeholder="e.g. What is bonalu? How do I upload lyrics?" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask(q)} /><button className="primary" disabled={busy} onClick={() => ask(q)}>{busy ? '…' : 'Ask'}</button></div>
      {['What is bonalu?', 'What is a dappu?', 'How do I upload lyrics?', 'Can I upload film songs?'].map((i) => <button key={i} className="mini" onClick={() => { setQ(i); ask(i); }}>{i}</button>)}
      {err && <small className="err">{err}</small>}
      {r && (<><p className="ans">{r.answer}</p><small>{r.mode === 'llm' ? 'AI answer' : 'Extractive answer (add GROQ_API_KEY for AI answers)'}</small>
        {r.sources.map((s) => <div key={s.n} className="src"><b>[{s.n}] {s.title}</b> <small>({s.type})</small>{s.snippet && <small> — {s.snippet}</small>}</div>)}</>)}
    </div>
  );
}

export function AssistantView({ p, onChanged }) {
  const [tab, setTab] = useState('agent');
  return (
    <div><h2>🧠 Assistant</h2>
      <div className="chips"><button className={tab === 'agent' ? 'on' : ''} onClick={() => setTab('agent')}>Agent</button><button className={tab === 'rag' ? 'on' : ''} onClick={() => setTab('rag')}>Knowledge (RAG)</button></div>
      {tab === 'agent' ? <Agent p={p} onChanged={onChanged} /> : <Knowledge />}
    </div>
  );
}

/* ---------- Admin: copyright reports ---------- */
export function AdminReports() {
  const [r, setR] = useState([]); const load = () => api('/api/admin/reports').then(setR).catch(() => {}); useEffect(() => { load(); }, []);
  const done = async (id) => { await api(`/api/admin/reports/${id}/resolve`, { method: 'POST' }); load(); };
  const del = async (tid, id) => { if (tid && confirm('Delete reported track?')) { await api('/api/tracks/' + tid, { method: 'DELETE' }).catch(() => {}); } done(id); };
  return (<><h3>Copyright / abuse reports ({r.length})</h3>{r.length ? r.map((x) => <div key={x.id} className="card"><b>{x.name || 'Anonymous'}</b> <small>{x.email} · track {x.trackId || '—'}</small><p>{x.details}</p><div className="chips"><button onClick={() => done(x.id)}>Resolve</button>{x.trackId && <button onClick={() => del(x.trackId, x.id)}>Delete track + resolve</button>}</div></div>) : <small>No open reports.</small>}</>);
}

/* ---------- Static pages ---------- */
const Li = ({ items }) => <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>;
function ReportForm() {
  const [f, setF] = useState({}); const [msg, setMsg] = useState('');
  const send = async () => { try { await api('/api/report', { method: 'POST', body: f }); setMsg('Report received. We will review it.'); } catch (e) { setMsg(e.message); } };
  return (<div className="card auth"><h3>Submit a takedown / abuse report</h3>
    <input placeholder="Your name" onChange={(e) => setF({ ...f, name: e.target.value })} /><input placeholder="Your email" onChange={(e) => setF({ ...f, email: e.target.value })} />
    <input placeholder="Track ID or title (optional)" onChange={(e) => setF({ ...f, trackId: e.target.value })} />
    <textarea rows="4" placeholder="Describe the work and why you hold the rights (10+ chars)" onChange={(e) => setF({ ...f, details: e.target.value })} />
    <button className="primary" onClick={send}>Submit</button>{msg && <small>{msg}</small>}</div>);
}
export function Pages({ page }) {
  const P = {
    about: (<><h2>About Dhoom</h2><p>Dhoom is a Telugu-first streaming platform: folk, DJ, melody and world music with an AI DJ, a tool-using music agent, retrieval-based Q&A, synced lyrics, real-time Listen Together rooms and a pro audio engine.</p>
      <Li items={['Web Audio engine: EQ, 8D, loudness leveler, visualizers', 'Agentic AI (tool calling) + RAG (BM25 retrieval) + optional CNN genre tagging', 'PWA, Telugu/English UI, Docker-ready', 'Built with React, Express, WebSockets']} /></>),
    privacy: (<><h2>Privacy</h2><p><small>Template — have a lawyer review before commercial launch.</small></p>
      <h3>What we store</h3><Li items={['Account: name, email, password hash (bcrypt) — never your password', 'Your likes, playlists, listening history and uploads', 'Basic server logs (rate limiting / abuse prevention)']} />
      <h3>Third parties</h3><Li items={['Hosting: Render (API), Vercel (web)', 'AI: your prompts to the Agent/AI DJ may be sent to Groq if enabled', 'Lyrics lookups send title+artist to LRCLIB; Discover uses Jamendo']} />
      <h3>Your rights</h3><p>Settings → Download my data / Delete my account. No ads, no tracking cookies; your login token and preferences live in your browser's localStorage.</p></>),
    terms: (<><h2>Terms of use</h2><Li items={['Upload only music you own or have written permission to distribute', 'No illegal, hateful or infringing content; accounts violating this may be removed', 'AI answers can be wrong; the service is provided "as is" without warranty', 'We may remove content after a valid takedown request']} /></>),
    dmca: (<><h2>Copyright / DMCA</h2><p>Commercial Telugu film and DJ songs are copyrighted. If you believe content infringes your rights, submit a report below with details; admins review open reports and remove infringing tracks.</p><ReportForm /></>),
    security: (<><h2>Security & Limits</h2>
      <h3>Controls in place</h3><Li items={['Passwords hashed with bcrypt; JWT sessions (30 days)', 'Helmet security headers, CORS allowlist (wildcards supported), rate limits (global, login, AI, reports)', 'Upload checks: size cap 30MB, MIME + magic-byte validation, random filenames', 'Stream proxy limited to an allowlist of hosts (SSRF-safe)', 'Agent safety: fixed tool allowlist, argument validation, max 5 steps, untrusted-data prompts, no access to other users’ data', 'WebSocket rooms: payload cap, only same-origin track paths accepted', 'Data export & account deletion; copyright report workflow']} />
      <h3>Known limitations</h3><Li items={['Data is in a JSON file; Render free resets the disk on redeploy → move to Supabase/Postgres for production', 'No email verification / password reset / 2FA yet; JWT stored in localStorage (XSS would expose it)', 'Demo tracks are placeholder audio; lyrics only where LRCLIB or an uploaded .lrc exists', 'AI (Agent/RAG) may be wrong or refuse; without GROQ_API_KEY it uses basic rule-based mode', 'CNN genre tagging needs a model you train on labelled audio; suggestions are hints', 'Free hosting sleeps when idle (~30s cold start); one server instance only']} /></>),
  };
  return <div className="legal">{P[page]}</div>;
}
