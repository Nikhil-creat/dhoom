# What's left to reach "real Spotify-grade" (honest list)

| Area | Status | Next step |
|---|---|---|
| Database | JSON file (single instance) | Supabase/Neon Postgres: users, tracks, playlists, history tables |
| File storage | Local disk (ephemeral on Render free) | Supabase Storage / Cloudflare R2 + signed URLs, CDN |
| Streaming | Progressive MP3 + Range | HLS/DASH adaptive bitrate via ffmpeg transcoding job |
| Catalog rights | Demo + Jamendo CC + own uploads | Artist onboarding + licence agreements / distributor (DistroKid/TuneCore style) or a licensed API |
| Recommendations | Genre/artist affinity | Audio embeddings + vector DB (Qdrant/pgvector), collaborative filtering |
| Auth | Email+password JWT | OAuth (Google), email verification, refresh tokens, password reset |
| Payments | none | Stripe/Razorpay premium tier (ad-free, downloads) |
| Offline downloads | App shell only | Encrypted IndexedDB track cache for premium |
| Quality | CI build check | Unit/e2e tests (Vitest, Playwright), Sentry, uptime monitor |
| Scale | 1 instance | Redis pub/sub for multi-instance WebSocket rooms, horizontal scaling |
| Mobile | PWA | Capacitor/React Native wrapper → Play Store |
| Compliance | basic | Privacy policy, DMCA takedown flow, content moderation queue |
