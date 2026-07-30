# CITE Assets — running the app

React Native + Expo (TypeScript) + Supabase. The design source of truth is
`README.md`; the schema is `DATABASE.md`; the build order is `IMPLEMENTATION_PLAN.md`.

## Working rules

1. Migrations are additive and checked in — never edit an applied migration.
2. All writes go through an RPC or `src/api/` — no ad-hoc multi-table writes from the client.
3. Never write to `audit_log`; never update or delete `movements` or `bast_versions`.
4. Every list ships loading, empty and error states before it counts as done.
5. Colours, spacing and copy come from `README.md` — no invented values.
   Hex literals belong in `src/theme/tokens.ts`; ESLint warns anywhere else.

## Prerequisites

- Node 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for the local database)
- Expo Go on a phone, or an iOS/Android simulator

## 1. Install

```bash
npm install
```

## 2. Start the database

```bash
supabase start          # boots Postgres, Auth, Storage on :54321
supabase db reset       # applies every migration, then supabase/seed.sql
```

Docker Desktop must be running first. If some optional containers fail their
health check on Windows, the stack still works with just the services this
project needs:

```bash
supabase start -x studio,imgproxy,realtime,logflare,vector,supavisor,mailpit,inbucket
```

Storage and the Edge runtime are **not** in that exclusion list on purpose:
Phase 3 needs Storage for asset photos, and Phase 5 needs both for the BAST
PDF. `supabase start` will not add a container to an already-running stack —
`supabase stop` first if you started it without them.

`supabase start` prints an anon key. Copy `.env.example` to `.env` and fill it in:

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<the anon key>
```

Without `.env` the app still runs in dev — it falls back to a demo session so the
chrome and theme can be reviewed — but nothing is persisted.

### Seeded sign-ins (local only)

| Email                      | Role        | Sees                       |
| -------------------------- | ----------- | -------------------------- |
| `dewi.lestari@cite.co.id`  | Super Admin | both locations, 7 assets   |
| `siti.rahayu@cite.co.id`   | Site IT     | Head Office only, 4 assets |
| `andi.prasetyo@cite.co.id` | Viewer      | Head Office, read-only     |

Password for all three: `cite-dev-2026`

## 3. Run the app

```bash
npm start           # then press i / a, or scan the QR with Expo Go
npm run ios
npm run android
npm run web
```

> **Dev-server note:** on the **web** target, Metro serves the project's
> `assets/` folder at `/assets`, so opening `http://localhost:8081/assets`
> directly returns 500. Tapping the **Assets** tab inside the app works
> normally, as does the route on iOS and Android.

## 4. Checks

```bash
npm run typecheck
npm run lint
npm test            # requires a running local Supabase + .env
```

- `test:rls` signs in as each seeded role and asserts the database — not the UI —
  limits what they can read and write.
- `test:master` covers the master data validation copy, the 23503 delete guard,
  soft delete, and the Phase 2 acceptance criterion end to end.
- `test:register` covers search across all seven fields, the status and scope
  filters, the six Asset Detail tabs, the merged timeline, edit validation and
  the photo-path guard.
- `test:assign` covers the wizard's validation copy, assign → return, the
  movement row, and proves a movement cannot be edited or deleted with a raw
  PostgREST call from a signed-in client.
- `test:bast` calls the `generate-bast-pdf` Edge Function for real, checks the
  stored file is a well-formed single-page PDF, then uploads a signed scan and
  asserts the badge flips to Signed on both the BAST list and the asset's
  Documents tab.

The suites clean up after themselves and can run repeatedly against the same
database. Two things they deliberately do not clean up, because nothing can:
movement rows and `bast_versions` rows are append-only. The tests move an asset
out and straight back so counts still match the seed, and no assertion depends
on a total.

`test:bast` needs the Storage and Edge Function containers, so start the stack
with at least those two (see the `-x` list above, which keeps both).

## 5. Getting it onto a phone

Three routes, cheapest first.

### Expo Go — no build at all

`npm start`, then scan the QR with Expo Go (iOS and Android). Everything in this
app is an Expo SDK module, so it runs unmodified. **This is the fastest way to
test on an iPhone from Windows**, and the only free one.

### Android APK — EAS Build (cloud)

There is no Android SDK on this machine (`ANDROID_HOME` is unset), and a local
build would pull the NDK — about 5.4 GB against 7.9 GB free. The build runs on
Expo's servers instead. Free tier, queued.

```bash
npm run lan-ip                     # checks eas.json still points at this machine
export EXPO_TOKEN=<access token>   # from expo.dev/settings/access-tokens
npm run build:apk                  # ~10-20 min, ends with a download link
```

`EXPO_TOKEN` authenticates without an interactive login, which is also what CI
will use later. `npx eas-cli login` works instead if you prefer the prompt.

The first run creates the EAS project and generates an Android keystore. **Let
Expo hold that keystore** — every future update to the same app has to be signed
with it, and losing it means a new package name.

`eas-cli` is deliberately **not** a project dependency: as a devDependency it
gets installed on the builder along with its own TypeScript and native-runtime
tree, for no benefit. Install it globally (`npm i -g eas-cli`).

`scripts/eas-build-pre-install.mjs` deletes `package-lock.json` on the builder
so EAS resolves with `npm install` rather than `npm ci`. That file explains why
in full; the short version is that one npm lockfile cannot describe the optional,
platform-conditional dependency trees of both Windows and Linux, so `npm ci`
fails on the builder no matter how the lockfile is generated. The trade-off is
that builds are not byte-reproducible — **move to pnpm or Yarn and delete the
hook before this ships for real.**

### iOS — needs an Apple Developer account

An `.ipa` that installs on a real iPhone requires a paid Apple Developer
Program membership (USD 99/year); Apple allows no way around it. With one:

```bash
npm run build:ios      # profile preview-device, asks for the Apple ID
```

Without one, the `preview` profile builds a **simulator** `.app`, which only
runs on a macOS simulator — no use on Windows. Use Expo Go instead.

### The Supabase URL is compiled in

`EXPO_PUBLIC_*` values are inlined at build time, so a build cannot read `.env`
at runtime and `127.0.0.1` means _the phone itself_. The `preview` profile in
`eas.json` therefore carries this machine's LAN address:

```
EXPO_PUBLIC_SUPABASE_URL=http://10.10.55.80:54321
```

Change it whenever this machine joins a different network — `npm run lan-ip`
prints the right value and fails if `eas.json` has drifted. The phone must be on
the same Wi-Fi, and Windows Firewall must allow inbound TCP 54321.

`usesCleartextTraffic` and `NSAllowsLocalNetworking` are switched on in
`app.json` because the local stack is plain HTTP. **Both must come off before a
production build** — a hosted Supabase project is HTTPS and needs neither.

### Before this ships for real

The current build is a **test** build. Four things stand between it and
production, in order:

1. **Hosted Supabase.** The app points at a laptop on the Wi-Fi. Create a
   project, `supabase link` + `supabase db push` (the migrations are additive
   and ordered, so they apply as-is), `supabase functions deploy
   generate-bast-pdf`, then move the URL and anon key into EAS environment
   variables instead of `eas.json`.
2. **Turn the cleartext escapes off.** `usesCleartextTraffic` and
   `NSAllowsLocalNetworking` exist only because the local stack is plain HTTP.
   A hosted project is HTTPS and needs neither, and shipping them weakens every
   other request the app makes.
3. **Real accounts.** `supabase/seed.sql` and `src/auth/demoSession.ts` are
   local-only. Production accounts get created through the Auth admin API by a
   Super Admin; nobody should be able to sign in as Dewi.
4. **Phases 6-8** — documents, maintenance, notifications, Excel import,
   reports, then the polish pass.

### Icons

`assets/icon.png` and `assets/adaptive-icon.png` are generated: the source mark
is 636×599, and a non-square icon comes out oval once Android and iOS mask it.
Re-run `npm run build:icons` after changing `assets/cite-logo.png`.

## Layout

```
app/                    expo-router routes
  _layout.tsx           providers + auth redirect
  sign-in.tsx
  (tabs)/_layout.tsx    header, scope dropdown, bottom nav + FAB, quick actions
  (tabs)/index.tsx      Home
src/
  theme/                tokens, typography, layout, motion, ThemeProvider, useTheme
  components/ui/        the 12 primitives
  components/chrome/    header, avatar, scope dropdown, nav, quick actions, toast host
  auth/                 SessionProvider, permission matrix, usePermissions()
  api/                  the only place that talks to Supabase
  store/                scope, session, UI (zustand)
  lib/                  supabase client, query client + key shapes
supabase/
  migrations/           additive, checked in
  functions/            edge functions
  seed.sql              local demo data only
scripts/                build helpers (the baked BAST logo)
tests/                  acceptance scripts, one per phase
```

## Phase status

- **Phase 0 — done.** Project, theme, 12 primitives, app chrome, empty Home,
  dark mode. Migrations 0001 (schema §1–9), 0002 (RLS §10), 0003 (master seed §13).
- **Phase 1 — done and verified.** Migration 0004 (auth link,
  `bootstrap_session()`, `set_account_scope()`), 0005 (`my_location_ids()` fix),
  0006 (table grants). Sign-in screen, session bootstrap, `usePermissions()`,
  FAB and More rows gated by role. `npm run test:rls` passes 23/23 against a
  real local stack.
- **Phase 2 — done and verified.** Migration 0007 (master data RPCs), 0008
  (`create_asset()`, `asset_form_options()`), 0009 (counter-generator and
  `master_rename` fixes). Master data screen for all eight entities, Add Asset
  form. `npm run test:master` passes 24/24.
- **Phase 3 — done and verified.** Migration 0010 (`search_assets()`,
  `asset_detail()`, `update_asset()`), 0011 (`asset-photos` bucket + policies,
  `set_asset_photo()`). Assets register with search, status chips and scope;
  Asset Detail with all six tabs; Edit form; photo upload.
  `npm run test:register` passes 44/44.
- **Phase 4 — done and verified.** Migration 0012 (`assign_asset()`,
  `return_asset()`, `record_movement()`, plus the two wizard reads and the
  movement rail). 3-step Assign/Return wizard with the README's validation copy
  and success state, Transfer form, append-only movement history.
  `npm run test:assign` passes 47/47.
- **Phase 5 — done and verified.** Migration 0013 (`bast_list()`,
  `bast_stats()`, `bast_detail()`, `indonesian_long_date()`, the `bast` bucket
  and its policies, `attach_generated_bast()`, `attach_signed_bast()`), the
  `generate-bast-pdf` Edge Function, the BAST list and detail with the paper
  preview, signed-scan upload with real transfer progress, and the version
  history rail. `npm run test:bast` passes 60/60.
- **Phase 6 — next.** Per-asset document library, maintenance records,
  notification inbox, and the two scheduled jobs.

## Migrations

| File                                         | What it does                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `20260729090000_init_schema.sql`             | DATABASE.md §1–9: enums, tables, indexes, generators, append-only triggers, audit log                               |
| `20260729090100_rls.sql`                     | DATABASE.md §10: RLS enabled + policies                                                                             |
| `20260729090200_seed_master_data.sql`        | DATABASE.md §13: reference data (ships to every environment)                                                        |
| `20260729100000_auth_session.sql`            | Phase 1: `auth.users` → `accounts` link, `bootstrap_session()`, `set_account_scope()`                               |
| `20260729110000_fix_my_location_ids.sql`     | Fixes the scalar-subquery bug in DATABASE.md §10's helper                                                           |
| `20260729120000_grants.sql`                  | Table privileges for `authenticated`; RLS filters rows, GRANT opens the table                                       |
| `20260729130000_master_data_rpcs.sql`        | Phase 2: list/create/rename/soft-delete/delete across the eight entities                                            |
| `20260729140000_create_asset.sql`            | `create_asset()` and `asset_form_options()` — active master data only                                               |
| `20260729150000_fix_counters_and_rename.sql` | Makes the number generators SECURITY DEFINER; fixes `FOUND` after dynamic UPDATE                                    |
| `20260729160000_asset_register.sql`          | Phase 3: `search_assets()`, `count_assets_in_scope()`, `asset_detail()`, `update_asset()`                           |
| `20260729170000_asset_photos_storage.sql`    | `asset-photos` bucket, scope-aware storage policies, `set_asset_photo()`                                            |
| `20260729180000_assign_return_movement.sql`  | Phase 4: `assign_asset()`, `return_asset()`, `record_movement()`, the wizard reads, the movement rail               |
| `20260729200000_bast.sql`                    | Phase 5: BAST reads, `indonesian_long_date()`, the `bast` bucket, `attach_generated_bast()`, `attach_signed_bast()` |

## Edge Functions

| Function            | What it does                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate-bast-pdf` | Renders the BAST letterhead to `bast/<id>/v1.pdf` and records the version. Runs under the **caller's** JWT, never the service role, so RLS and the storage policies still apply. Dependency-free: the PDF writer is `pdf.ts`, and `logo.ts` is the CITE mark baked into a PDF image stream by `node scripts/build-bast-logo.mjs` (re-run that after changing `assets/cite-logo.png`). |
