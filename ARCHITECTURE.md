# Architecture
```
Browser (React PWA, Web Audio) ──HTTPS──► Express API (Render) ──► JSON DB / uploads
        │  └─WSS (Listen Together)          ├─ /api/agent/chat  → Groq LLM tool-loop → catalog/playlist/knowledge tools
        │                                    ├─ /api/rag/ask     → BM25 retrieval (KB + tracks + lyrics) → LLM w/ citations
        └─ Vercel/Netlify (static)           ├─ upload → magic-byte check → (optional) CNN service /classify
                                              └─ lyrics (LRCLIB), discover (Jamendo), stream proxy
CNN service (Docker, FastAPI + PyTorch): log-mel spectrogram windows → 4-block CNN → top-3 genres
```
- **Agentic AI**: `server/ai.js` — model chooses tools (`search_catalog`, `get_my_taste`, `play_tracks`, `create_playlist`, `knowledge_search`); server executes and returns UI actions (the client plays the queue). Falls back to a rule engine without `GROQ_API_KEY`.
- **RAG**: pure-JS BM25 index (Unicode-aware, works for Telugu script), rebuilt when tracks/lyrics change; `server/kb.js` holds guides/knowledge — extend it.
- **CNN**: `ml/` — train with `python train.py dataset`; no weights shipped.
