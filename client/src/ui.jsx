import { useEffect, useRef, useState } from 'react';
import { abs, api, setToken } from './api';
import { usePlayer } from './player.jsx';

export const hue = (s = '') => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
export const fmt = (s) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

export function Cover({ t, size = 48 }) {
  const h = hue(t?.title);
  return t?.cover
    ? <img className="cover" src={abs(t.cover)} width={size} height={size} alt="" loading="lazy" />
    : <div className="cover" style={{ width: size, height: size, fontSize: size / 2.4, background: `linear-gradient(135deg,hsl(${h} 80% 55%),hsl(${(h + 60) % 360} 80% 35%))` }}>♪</div>;
}

export function Visualizer() {
  const { analyser, playing, fx } = usePlayer();
  const ref = useRef();
  useEffect(() => {
    let raf; const c = ref.current, x = c.getContext('2d'); const mode = fx.viz;
    const draw = () => {
      raf = requestAnimationFrame(draw); x.clearRect(0, 0, c.width, c.height);
      const an = analyser(); if (!an) return;
      const W = c.width, H = c.height; const ac = getComputedStyle(document.documentElement).getPropertyValue('--ac').trim() || '#ff3d81';
      if (mode === 'wave') {
        const d = new Uint8Array(an.fftSize); an.getByteTimeDomainData(d);
        x.beginPath(); x.strokeStyle = ac; x.lineWidth = 2;
        d.forEach((v, i) => { const px = (i / d.length) * W, py = (v / 255) * H; i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke(); return;
      }
      const d = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(d);
      if (mode === 'circle') {
        const cx = W / 2, cy = H / 2, r = H * 0.2; x.lineWidth = 2;
        d.forEach((v, i) => { const ang = (i / d.length) * Math.PI * 2, l = (v / 255) * H * 0.3; x.strokeStyle = `hsl(${(i * 360) / d.length} 90% 60%)`; x.beginPath(); x.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r); x.lineTo(cx + Math.cos(ang) * (r + l), cy + Math.sin(ang) * (r + l)); x.stroke(); });
        return;
      }
      const w = W / d.length;
      d.forEach((v, i) => { x.fillStyle = `hsl(${280 - i * 2.2} 90% 60%)`; const h = (v / 255) * H; x.fillRect(i * w, H - h, w - 1, h); });
    };
    draw(); return () => cancelAnimationFrame(raf);
  }, [fx.viz, playing]);
  return <canvas ref={ref} width="360" height="150" className="viz" />;
}

const parseLrc = (s) => (s || '').split('\n').flatMap((l) => { const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/); return m ? [{ t: +m[1] * 60 + +m[2], text: m[3].trim() }] : []; });

export function Lyrics() {
  const p = usePlayer(); const [l, setL] = useState({ lines: [], plain: '' }); const [state, setState] = useState('load');
  const act = useRef();
  useEffect(() => {
    if (!p.track) return; const t = p.track; setState('load'); setL({ lines: [], plain: '' });
    api(`/api/lyrics?id=${encodeURIComponent(t.id)}&title=${encodeURIComponent(t.title)}&artist=${encodeURIComponent(t.artist)}`)
      .then((d) => { setL({ lines: parseLrc(d.synced), plain: d.plain || '' }); setState('ok'); }).catch(() => setState('none'));
  }, [p.track?.id]);
  let active = -1; l.lines.forEach((x, i) => { if (x.t <= p.time + 0.3) active = i; });
  useEffect(() => { act.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [active]);
  if (state === 'load') return <small>Loading lyrics…</small>;
  if (state === 'none' || (!l.lines.length && !l.plain)) return <small>No lyrics found. Uploaded tracks can include a .lrc file for synced lyrics.</small>;
  return (
    <div className="lyrics">
      {l.lines.length ? l.lines.map((x, i) => <p key={i} ref={i === active ? act : null} className={i === active ? 'now' : ''} onClick={() => p.seek(x.t)}>{x.text || '♪'}</p>)
        : <pre>{l.plain}</pre>}
    </div>
  );
}

export function QueuePanel({ t }) {
  const p = usePlayer();
  return (
    <div>
      <div className="chips"><b>{t('queue')}</b><button onClick={p.clearQueue}>Clear</button></div>
      {p.queue.map((q, i) => (
        <div key={q.id + i} className={'row' + (i === p.idx ? ' cur' : '')}>
          <div className="rowmain" onClick={() => p.play(p.queue, i)}><Cover t={q} size={36} /><div className="meta"><b>{q.title}</b><small>{q.artist}</small></div></div>
          <div className="acts"><button onClick={() => p.move(i, -1)}>↑</button><button onClick={() => p.move(i, 1)}>↓</button>{i !== p.idx && <button onClick={() => p.removeAt(i)}>✕</button>}</div>
        </div>
      ))}
    </div>
  );
}

export function TrackRow({ t, list, i, user, playlists, liked, onLike, onAdd, onRemove }) {
  const p = usePlayer(); const cur = p.track?.id === t.id;
  return (
    <div className={'row' + (cur ? ' cur' : '')}>
      <div className="rowmain" onClick={() => p.play(list, i)}>
        <Cover t={t} size={44} />
        <div className="meta"><b>{cur && p.playing ? '▶ ' : ''}{t.title}</b><small>{t.artist} · {t.genre}</small></div>
      </div>
      <div className="acts">
        <button title="Play next" onClick={() => p.playNext(t)}>⏭+</button>
        <button title="Add to queue" onClick={() => p.enqueue(t)}>＋Q</button>
        {user && <button title="Like" className={liked ? 'on' : ''} onClick={() => onLike(t)}>{liked ? '♥' : '♡'}</button>}
        {user && playlists?.length > 0 && (
          <select value="" onChange={(e) => e.target.value && onAdd(e.target.value, t)}>
            <option value="">＋PL</option>{playlists.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
          </select>
        )}
        {onRemove && <button onClick={() => onRemove(t)}>✕</button>}
      </div>
    </div>
  );
}

export function AuthCard({ onDone }) {
  const [mode, setMode] = useState('login'); const [f, setF] = useState({}); const [err, setErr] = useState('');
  const submit = async () => { try { const d = await api('/api/auth/' + (mode === 'login' ? 'login' : 'register'), { method: 'POST', body: f }); setToken(d.token); onDone(d.user); } catch (e) { setErr(e.message); } };
  return (
    <div className="card auth">
      <h3>{mode === 'login' ? 'Log in' : 'Create account'}</h3>
      {mode === 'register' && <input placeholder="Name" onChange={(e) => setF({ ...f, name: e.target.value })} />}
      <input placeholder="Email" onChange={(e) => setF({ ...f, email: e.target.value })} />
      <input type="password" placeholder="Password (8+)" onChange={(e) => setF({ ...f, password: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      {err && <small className="err">{err}</small>}
      <button className="primary" onClick={submit}>{mode === 'login' ? 'Log in' : 'Sign up'}</button>
      <a onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'New here? Sign up' : 'Have an account? Log in'}</a>
    </div>
  );
}

export function Studio() {
  const { eq, setEq, fx, setFx, sleepAt, setSleepAt } = usePlayer();
  const sl = (k, label) => (<label>{label}<input type="range" min="-12" max="12" value={eq[k]} onChange={(e) => setEq({ ...eq, [k]: +e.target.value })} /><small>{eq[k]} dB</small></label>);
  const tg = (k, label) => <button className={fx[k] ? 'on' : ''} onClick={() => setFx({ ...fx, [k]: !fx[k] })}>{label}</button>;
  return (
    <div className="card">
      <h3>🎛 Audio Studio</h3>
      <div className="eq">{sl('low', 'Bass')}{sl('mid', 'Mid')}{sl('high', 'Treble')}</div>
      <div className="chips">
        <button onClick={() => setEq({ low: 10, mid: -2, high: 2 })}>DJ Bass Boost</button>
        <button onClick={() => setEq({ low: 4, mid: 3, high: 4 })}>Folk Vocal</button>
        <button onClick={() => setEq({ low: 6, mid: 0, high: 5 })}>Club</button>
        <button onClick={() => setEq({ low: 0, mid: 0, high: 0 })}>Flat</button>
      </div>
      <div className="chips">{tg('eight', '🎧 8D Audio')}{tg('leveler', '📊 Loudness Leveler')}</div>
      <label className="row2">Speed {fx.speed}×<input type="range" min="0.5" max="1.5" step="0.05" value={fx.speed} onChange={(e) => setFx({ ...fx, speed: +e.target.value })} /></label>
      <label className="row2">Fade in/out {fx.fade}s<input type="range" min="0" max="8" step="1" value={fx.fade} onChange={(e) => setFx({ ...fx, fade: +e.target.value })} /></label>
      <div className="chips"><span>Visualizer:</span>{['bars', 'wave', 'circle'].map((v) => <button key={v} className={fx.viz === v ? 'on' : ''} onClick={() => setFx({ ...fx, viz: v })}>{v}</button>)}</div>
      <div className="chips"><span>Sleep timer:</span>{[15, 30, 60].map((m) => <button key={m} onClick={() => setSleepAt(Date.now() + m * 60000)}>{m}m</button>)}{sleepAt && <button className="on" onClick={() => setSleepAt(null)}>Cancel</button>}</div>
    </div>
  );
}

export function UploadCard({ genres, onDone }) {
  const [f, setF] = useState({ genre: 'Telugu Folk DJ', language: 'Telugu' }); const [files, setFiles] = useState({}); const [msg, setMsg] = useState('');
  const go = async () => {
    const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v));
    Object.entries(files).forEach(([k, v]) => v && fd.append(k, v));
    try { const tr = await api('/api/tracks', { method: 'POST', body: fd }); setMsg('Uploaded ✓' + (tr.autoGenre ? ` · CNN genre guess: ${tr.autoGenre}` : '')); onDone(); } catch (e) { setMsg(e.message); }
  };
  const fi = (k, label, accept) => <label className="fl">{label}<input type="file" accept={accept} onChange={(e) => setFiles({ ...files, [k]: e.target.files[0] })} /></label>;
  return (
    <div className="card auth">
      <h3>Upload a track</h3>
      <small>Only upload music you own or have permission to distribute.</small>
      <input placeholder="Title" onChange={(e) => setF({ ...f, title: e.target.value })} />
      <input placeholder="Artist" onChange={(e) => setF({ ...f, artist: e.target.value })} />
      <input placeholder="Album (optional)" onChange={(e) => setF({ ...f, album: e.target.value })} />
      <select value={f.genre} onChange={(e) => setF({ ...f, genre: e.target.value })}>{genres.map((g) => <option key={g}>{g}</option>)}</select>
      {fi('audio', 'Audio file *', 'audio/*')}{fi('cover', 'Cover art', 'image/*')}{fi('lrc', 'Synced lyrics (.lrc)', '.lrc,.txt')}
      <button className="primary" disabled={!files.audio} onClick={go}>Upload</button>{msg && <small>{msg}</small>}
    </div>
  );
}
