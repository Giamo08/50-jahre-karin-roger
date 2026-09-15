# 50 Jahre Karin & Roger

Phase 1 der Event-Website: Benutzername, Punkteanzeige, eigener Rang und Top-3-Rangliste.

## Lokal starten

1. Node.js 22+ installieren.
2. `npm install`
3. `.env.example` nach `.env.local` kopieren und Supabase-Werte eintragen.
4. SQL aus `supabase/schema.sql` im Supabase SQL Editor ausführen.
5. `npm run dev`

## GitHub Pages

Repository-Name: `50-jahre-karin-roger`

In GitHub unter **Settings → Pages** als Source **GitHub Actions** wählen.
Unter **Settings → Secrets and variables → Actions** folgende Secrets anlegen:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Danach wird bei jedem Push auf `main` automatisch deployed.
