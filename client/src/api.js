export const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';
export const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
let token = localStorage.getItem('token');
export const hasToken = () => !!token;
export const setToken = (t) => { token = t; t ? localStorage.setItem('token', t) : localStorage.removeItem('token'); };
export const abs = (u) => (u && u.startsWith('/') ? BASE + u : u);
export async function api(path, { method = 'GET', body } = {}) {
  const isForm = body instanceof FormData;
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}
