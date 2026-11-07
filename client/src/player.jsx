import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { abs, api, hasToken } from './api';

const Ctx = createContext();
export const usePlayer = () => useContext(Ctx);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

export function PlayerProvider({ children }) {
  const a = useRef(null);
  if (!a.current) { a.current = new Audio(); a.current.crossOrigin = 'anonymous'; a.current.preload = 'auto'; }
  const g = useRef(null);
  const saved = useRef(load('queue', null));
  const [queue, setQueue] = useState(saved.current?.queue || []);
  const [idx, setIdx] = useState(saved.current?.queue?.length ? saved.current.idx : -1);
  const restored = useRef(!!saved.current?.queue?.length);
  const pending = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(() => Number(localStorage.getItem('vol') ?? 0.8));
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off');
  const [eq, setEq] = useState(() => load('eq', { low: 0, mid: 0, high: 0 }));
  const [fx, setFx] = useState(() => load('fx', { leveler: false, eight: false, speed: 1, fade: 0, viz: 'bars' }));
  const [sleepAt, setSleepAt] = useState(null);
  const track = queue[idx];
  const st = useRef({}); st.current = { queue, idx, shuffle, repeat };
  const fxr = useRef(fx); fxr.current = fx;

  const initGraph = () => {
    if (g.current) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaElementSource(a.current);
    const mk = (type, f) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; return n; };
    const low = mk('lowshelf', 200), mid = mk('peaking', 1000), high = mk('highshelf', 4000);
    const comp = ctx.createDynamicsCompressor();
    const pan = ctx.createStereoPanner();
    const gain = ctx.createGain();
    const an = ctx.createAnalyser(); an.fftSize = 256;
    src.connect(low); low.connect(mid); mid.connect(high); high.connect(comp); comp.connect(pan); pan.connect(gain); gain.connect(an); an.connect(ctx.destination);
    g.current = { ctx, low, mid, high, comp, pan, gain, an };
    applyFx();
  };
  const applyFx = () => {
    const x = g.current; if (!x) return;
    x.low.gain.value = eq.low; x.mid.gain.value = eq.mid; x.high.gain.value = eq.high;
    x.comp.threshold.value = fxr.current.leveler ? -28 : 0; x.comp.ratio.value = fxr.current.leveler ? 6 : 1;
  };

  const go = useCallback((dir, auto) => {
    const { queue, idx, shuffle, repeat } = st.current;
    if (!queue.length) return;
    if (auto && repeat === 'one') { a.current.currentTime = 0; a.current.play(); return; }
    let n;
    if (shuffle && queue.length > 1) { do { n = Math.floor(Math.random() * queue.length); } while (n === idx); }
    else {
      n = idx + dir;
      if (n >= queue.length) { if (repeat === 'all' || !auto) n = 0; else { setPlaying(false); return; } }
      if (n < 0) n = queue.length - 1;
    }
    setIdx(n);
  }, []);

  const toggle = () => { const el = a.current; if (!el.src) return; el.paused ? el.play() : el.pause(); };
  const seek = (t) => { a.current.currentTime = t; };
  const play = (list, i = 0) => {
    if (st.current.queue[st.current.idx]?.id === list[i]?.id) return toggle();
    setQueue(list); setIdx(i);
  };
  const enqueue = (t) => { if (!st.current.queue.length) { setQueue([t]); setIdx(0); } else setQueue((q) => [...q, t]); };
  const playNext = (t) => { if (!st.current.queue.length) return enqueue(t); setQueue((q) => { const c = [...q]; c.splice(st.current.idx + 1, 0, t); return c; }); };
  const removeAt = (i) => { if (i === st.current.idx) return; setQueue((q) => q.filter((_, k) => k !== i)); if (i < st.current.idx) setIdx((x) => x - 1); };
  const move = (i, d) => {
    const j = i + d; const q = [...st.current.queue]; if (j < 0 || j >= q.length) return;
    [q[i], q[j]] = [q[j], q[i]]; setQueue(q);
    if (st.current.idx === i) setIdx(j); else if (st.current.idx === j) setIdx(i);
  };
  const clearQueue = () => { const t = st.current.queue[st.current.idx]; if (t) { setQueue([t]); setIdx(0); } };

  /* Listen Together hooks */
  const getSync = () => { const { queue, idx } = st.current; return { track: queue[idx], queue: queue.slice(idx, idx + 30), index: 0, playing: !a.current.paused, time: a.current.currentTime }; };
  const remote = (s) => {
    if (!s.track) return;
    const cur = st.current.queue[st.current.idx], el = a.current;
    if (cur?.id !== s.track.id) { pending.current = { t: s.time, playing: s.playing }; setQueue(s.queue?.length ? s.queue : [s.track]); setIdx(0); return; }
    if (Math.abs(el.currentTime - s.time) > 1.5) el.currentTime = s.time;
    s.playing ? el.play().catch(() => {}) : el.pause();
  };

  useEffect(() => {
    if (!track) return;
    const el = a.current;
    el.src = abs(track.url); el.playbackRate = fxr.current.speed; el.preservesPitch = true;
    document.title = `${track.title} · Dhoom`;
    if (restored.current) { restored.current = false; return; }
    const p = pending.current; pending.current = null;
    if (p) el.addEventListener('loadedmetadata', () => { el.currentTime = p.t; p.playing ? el.play().catch(() => {}) : el.pause(); }, { once: true });
    else el.play().catch(() => {});
    if (track.source === 'demo' || track.source === 'upload') api(`/api/tracks/${track.id}/play`, { method: 'POST' }).catch(() => {});
    if (hasToken()) api('/api/history', { method: 'POST', body: { track } }).catch(() => {});
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: track.album || '', artwork: track.cover ? [{ src: abs(track.cover) }] : [] });
      navigator.mediaSession.setActionHandler('play', () => el.play());
      navigator.mediaSession.setActionHandler('pause', () => el.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => go(1));
      navigator.mediaSession.setActionHandler('previoustrack', () => (el.currentTime > 3 ? (el.currentTime = 0) : go(-1)));
    }
  }, [track?.id]);

  useEffect(() => {
    const el = a.current;
    const on = {
      timeupdate: () => {
        setTime(el.currentTime);
        const f = fxr.current.fade, d = el.duration || 0;
        if (g.current) { let v = 1; if (f > 0 && d) v = Math.min(1, Math.max(0.02, el.currentTime / f), Math.max(0.02, (d - el.currentTime) / f)); g.current.gain.gain.value = v; }
      },
      loadedmetadata: () => setDur(el.duration || 0),
      play: () => { setPlaying(true); initGraph(); g.current?.ctx.resume(); },
      pause: () => setPlaying(false),
      ended: () => go(1, true),
    };
    Object.entries(on).forEach(([k, f]) => el.addEventListener(k, f));
    return () => Object.entries(on).forEach(([k, f]) => el.removeEventListener(k, f));
  }, [go]);

  useEffect(() => { a.current.volume = vol; localStorage.setItem('vol', vol); }, [vol]);
  useEffect(() => { localStorage.setItem('eq', JSON.stringify(eq)); applyFx(); }, [eq]);
  useEffect(() => {
    localStorage.setItem('fx', JSON.stringify(fx)); a.current.playbackRate = fx.speed; applyFx();
    if (!fx.eight) { if (g.current) g.current.pan.pan.value = 0; return; }
    const i = setInterval(() => { if (g.current) g.current.pan.pan.value = Math.sin(Date.now() / 1600) * 0.95; }, 50);
    return () => clearInterval(i);
  }, [fx]);
  useEffect(() => { // persist queue window
    const s = Math.max(0, idx - 5);
    localStorage.setItem('queue', JSON.stringify({ queue: queue.slice(s, s + 100), idx: idx - s }));
  }, [queue, idx]);
  useEffect(() => {
    if (!sleepAt) return;
    const i = setInterval(() => { if (Date.now() >= sleepAt) { a.current.pause(); setSleepAt(null); } }, 1000);
    return () => clearInterval(i);
  }, [sleepAt]);

  const value = {
    track, queue, idx, playing, time, dur, vol, setVol, shuffle, setShuffle, repeat, setRepeat, eq, setEq, fx, setFx, sleepAt, setSleepAt,
    play, toggle, seek, next: () => go(1), prev: () => (a.current.currentTime > 3 ? seek(0) : go(-1)),
    enqueue, playNext, removeAt, move, clearQueue, analyser: () => g.current?.an, getSync, remote,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
