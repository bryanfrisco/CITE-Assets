# Implementation Plan — CITE Assets

Build in the order below. Each module ships working end-to-end (DB → API → UI) before the next one
starts. Do **not** ask an AI assistant to "build the whole app" — the result is always fragile.

## Phase 0 — Foundation (½ day)

- Expo + TypeScript project, absolute imports, ESLint/Prettier.
- Supabase project; run the DDL from `DATABASE.md` §1–9 as one migration, then §13 seed.
- Theme file with the tokens from `README.md` (light + dark), Inter bundled, `useTheme()` hook.
- Primitives: `Screen`, `Card`, `ListCard`, `Badge`, `Chip`, `Button`, `Input`, `Switch`,
  `Skeleton`, `Toast`, `BottomSheet`, `EmptyState`.
- App chrome: header (logo, bell, scope chip, avatar), floating bottom nav + FAB, FAB quick-action
  sheet, toast host.

**Done when** an empty Home screen renders inside the real chrome and dark mode flips correctly.

## Phase 1 — Auth & roles (1 day)

Supabase Auth (email + password), `accounts` linked by `auth_user_id`, session bootstrap that loads
role + `account_scope_preferences`, a `usePermissions()` hook, and route/action gating:

|                        | Super Admin      | Corporate IT  | Site IT          | Viewer       |
| ---------------------- | ---------------- | ------------- | ---------------- | ------------ |
| View assets            | all              | all           | own location     | own location |
| Create / edit asset    | ✓                | ✓             | ✓ (own location) | —            |
| Delete asset           | ✓                | —             | —                | —            |
| Assign / return        | ✓                | ✓             | ✓                | —            |
| Movement               | ✓                | ✓             | ✓                | —            |
| Generate / upload BAST | ✓                | ✓             | ✓                | —            |
| Master data            | ✓ (incl. delete) | ✓ (no delete) | —                | —            |
| Accounts               | ✓                | —             | —                | —            |
| Audit log              | ✓                | ✓             | —                | —            |

**Done when** a Viewer sees no mutating buttons and a Site IT user's asset list is location-limited
_by RLS_ (verify by querying with their token, not just by hiding UI).

## Phase 2 — Master data (1 day)

CRUD for all eight entities, duplicate-name validation, referenced-record delete protection
(Postgres `23503` → friendly message), soft-delete via `is_active`.

**Done when** an admin can add a category and immediately use it in the Add Asset form without a
release.

## Phase 3 — Assets (2–3 days)

Asset register: list + trigram search + status chips + scope filter, Add/Edit form with
`next_asset_code()`, photo upload, specifications repeater, and the full Asset Detail with all six
tabs (Timeline reads from assignments + movements + maintenance + bast, merged and sorted).

**Done when** search finds an asset by serial number and by the holder's name, and the Timeline shows
purchase → registration → assignment events from real rows.

## Phase 4 — Assignment & movement (2 days)

`assign_asset()` / `return_asset()` / `record_movement()` RPCs behind the 3-step wizard, with the exact
validation and success states in the README. Movement list is read-only.

**Done when** assigning an asset changes its status and holder, writes an assignment row, a movement
row (if the location changed), and audit entries — and the movement row cannot be edited or deleted
even with a raw SQL call from the client.

## Phase 5 — BAST (2–3 days)

- `next_bast_number()` numbering; BAST record created by `assign_asset()` when Auto-BAST is on.
- Edge Function `generate-bast-pdf`: renders the exact letterhead layout from the prototype's paper
  preview (CITE logo, navy rule, underlined _BERITA ACARA SERAH TERIMA_, Indonesian body sentence,
  bordered detail table, two signature blocks), stores `bast/<id>/v1.pdf`, inserts `bast_versions`.
- Signed-scan upload with real progress, status → `signed`, version history, and a mirrored
  `documents` row of kind `signed_bast`.

**Done when** a generated PDF opens correctly on an iPhone, and uploading a scan flips the badge to
Signed on both the BAST list and the asset's Documents tab.

## Phase 6 — Documents, maintenance, notifications (2 days)

Per-asset document library (7 kinds, multi-file, signed-URL download), maintenance records with
vendor and cost, notification inbox with unread state + deep links, and the two scheduled jobs
(warranty expiring, maintenance reminder).

**Done when** an asset whose `warranty_end` is 20 days away produces a notification overnight and the
bell shows the red dot.

## Phase 7 — Import Excel & Reports (2 days)

Template download, upload → server-side validation (unknown master value, duplicate serial, invalid
date, missing column) → row-level preview with error highlighting → import of valid rows only →
`import_batches` row + notification. Reports: filter sheet → Excel/PDF export via Edge Function,
returned as a signed URL.

**Done when** a file with 45 rows and 3 bad rows imports 42 and returns a downloadable error report.

## Phase 8 — Polish (1–2 days)

Skeletons on every list, pull-to-refresh, optimistic updates + rollback toasts, empty/error states,
offline banner, animation timings from the README, accessibility (44px targets, dynamic type,
contrast), app icon + splash from `cite-logo.png`, then EAS builds for TestFlight / internal Android
testing.

---

## Prompts to paste into Claude Code

Give the assistant this whole folder first:

> Read `README.md` and `DATABASE.md` in `design_handoff_cite_assets/`, and open
> `CITE Assets.dc.html` in a browser to see the intended UI. We are building this as a React Native
> (Expo, TypeScript) app with Supabase. Do not copy the HTML — recreate the designs with React Native
> components. Confirm your understanding and list the files you plan to create for **Phase 0 only**.

Then, one phase per session:

> **Phase 1.** Implement auth and roles exactly as specified in `IMPLEMENTATION_PLAN.md` Phase 1 and
> the RLS section of `DATABASE.md`. Write the migration first, then the client code. Include a test
> that queries `assets` with a Site IT token and asserts only that location's rows come back.

> **Phase 3.** Build the asset register: list screen, search, status chips, scope filter, Add/Edit
> form, and Asset Detail with all six tabs. Match the spacing, radii, badge colors, and copy in
> `README.md` §Screens 2–3 exactly. Use the `search_assets` RPC, not client-side filtering.

> **Phase 5.** Implement BAST end-to-end. The PDF must match the paper preview in the prototype
> (letterhead, underlined title, Indonesian body sentence, bordered table, two signature blocks).
> Numbering comes from `next_bast_number()` — never generate numbers on the client.

Rules to give the assistant up front:

1. Migrations are additive and checked in; never edit an applied migration.
2. All writes go through RPCs or the API layer — no ad-hoc multi-table writes from the client.
3. Never write to `audit_log`, `movements`, or `bast_versions` update/delete paths.
4. Every list needs loading, empty, and error states before it is considered done.
5. Colors, spacing, and copy come from `README.md` — do not invent new values.

## Estimate

Roughly **15–20 working days** for one developer working with an AI assistant, excluding UAT and
Play Store / App Store review. Phases 0–5 (≈11 days) already produce a usable internal release:
assets, assignment, BAST, and audit trail.

## Open questions for the client

1. Is `Site` a single site, or will Konawe / Morowali / Weda become separate location records?
   (The schema supports many; the UI scope selector currently shows two.)
2. Who signs the BAST on the CITE side — always the same officer, or the acting Corporate IT staff?
3. Should the BAST support digital signatures, or is the scanned wet-signature flow final?
4. Asset disposal: is there an approval chain before status → `Retired` / `Lost`?
5. Retention: how long must documents and audit entries be kept?
