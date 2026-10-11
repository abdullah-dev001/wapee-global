# Wapee

Appointment-booking SaaS. One Expo codebase → Android app, iOS app and an installable web app (PWA). Backend: Supabase.

Project rules: [CLAUDE.md](CLAUDE.md). Docs: [docs/](docs/). Feature state: [context/](context/).

## Requirements

- Node 20+ (tested on Node 24) and npm
- iOS: macOS with Xcode + an iOS simulator
- Android: Android Studio with an emulator (or a device with USB debugging)
- Supabase CLI (`brew install supabase/tap/supabase`) for migrations and Edge Functions

## Install

```sh
npm install
cp .env.example .env   # then fill in the values (see below)
```

## Environment

The app **runs without any keys**. Missing values only log one dev warning (`[env] Missing: …`) and backend calls are disabled.

| Variable                        | What it is                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `EXPO_PUBLIC_SUPABASE_URL`      | Supabase project URL (Project Settings → API)                                  |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon / publishable key                                                |
| `EXPO_PUBLIC_VAPID_PUBLIC_KEY`  | Web Push public key (PWA notifications)                                        |
| `EXPO_PUBLIC_SITE_URL`          | The one origin (landing, app, business pages). Default: `https://wapee.online` |

`EXPO_PUBLIC_*` values are bundled into the app and are **public**. Never put secrets in `.env`.
Server secrets (Twilio, Resend, VAPID private key, service role) live only in Edge Function secrets; their names are listed in [supabase/functions/.env.example](supabase/functions/.env.example).

Validation lives in [src/config/env.ts](src/config/env.ts). After changing `.env`, restart the dev server.

## Run

The app uses native libraries that are not in Expo Go, so native runs use a **development build**.

```sh
# iOS simulator (first run builds the native app; later runs are fast)
npm run ios

# Android emulator or connected device
npm run android

# Web (dev server, opens the browser)
npm run web

# Dev server only (for an already installed development build)
npm start
```

If port 8081 is busy: `npx expo start --port 8090` (or `npx expo run:ios --port 8090`).

## Scripts

| Script              | Does                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm start`         | Expo dev server                                                                                              |
| `npm run web`       | Dev server + web                                                                                             |
| `npm run ios`       | Build + run the iOS development build (`expo run:ios`)                                                       |
| `npm run android`   | Build + run the Android development build (`expo run:android`)                                               |
| `npm run lint`      | ESLint, zero warnings allowed                                                                                |
| `npm run typecheck` | `tsc --noEmit` (TypeScript strict)                                                                           |
| `npm run format`    | Prettier write (`format:check` to only check)                                                                |
| `npm run build:web` | Static web export to `dist/` (PWA)                                                                           |
| `npm run manifest`  | Regenerate `public/manifest.json` from `src/config/brand.ts` (runs automatically before start/web/build:web) |

## Supabase

`supabase/` was created with `supabase init` and is **not linked** to a project yet.

```sh
supabase link --project-ref <ref>
supabase db push                                  # apply migrations in supabase/migrations
supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
```

## Structure

See CLAUDE.md §3. Short version: `app/` = routes only, `src/features/<feature>/` = feature logic, `src/lib/` = shared infrastructure (theme, query, supabase, i18n, time, money), `src/components/` = shared UI.
