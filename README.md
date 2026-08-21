# Handoff: CITE Assets — Mobile IT Asset Management

## Overview

CITE Assets is an internal mobile application for the Corporate IT (CITE) team to manage IT assets
(laptops, desktops, monitors, printers, servers, networking devices, accessories) across
**Head Office (HO)** and **Site** locations.

Core capabilities: asset register with rich search, assignment/return with **BAST**
(Berita Acara Serah Terima) documents, movement tracking between locations, maintenance records,
per-asset document library, master-data administration, immutable audit log, Excel import,
and Excel/PDF export. A **Global Data Scope selector** (multi-select locations) filters every screen
at once.

The physical asset stickers already exist — **do NOT implement QR code or barcode scanning.**

## About the Design Files

`CITE Assets.dc.html` in this bundle is a **design reference created in HTML** — an interactive
prototype showing the intended look, copy, and behavior. It is **not production code to copy**.

The task is to **recreate these designs in the target codebase's environment**, using its
established patterns and libraries. If no codebase exists yet, the recommended stack is:

| Layer               | Recommendation                                                         | Why                                                                                          |
| ------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Mobile app          | **React Native + Expo** (TypeScript)                                   | one codebase for iOS + Android, fastest path                                                 |
| Backend             | **Supabase** (Postgres + Auth + Storage + Edge Functions)              | RLS gives per-role/per-location security in the DB; Storage handles BAST scans and documents |
| PDF generation      | Edge Function rendering HTML → PDF (Puppeteer/Playwright or `pdf-lib`) | BAST must be generated server-side so numbering and content are authoritative                |
| Excel import/export | `xlsx` (SheetJS) in an Edge Function                                   | validation must run server-side before insert                                                |
| Charts              | `react-native-svg` (or `victory-native`)                               | donut + horizontal bars only                                                                 |
| State/data          | TanStack Query + a small Zustand store for the scope selector          | scope is global and read by every query                                                      |

Flutter + Firebase is a valid alternative, but the audit-log and RLS requirements below are much
simpler to satisfy on Postgres.

## Fidelity

**High-fidelity (hifi).** Colors, typography, spacing, radii, shadows, copy, and interaction
behavior in the prototype are final. Recreate the UI pixel-perfectly using the target codebase's
component library. Where a value is not listed in this README, read it from the prototype file.

Two things in the prototype are intentionally placeholders:

- The **asset photo** area on Asset Detail (dashed frame) — replace with the real image, camera and
  gallery upload.
- Screens reachable only via a toast message ("Prototype: action not wired yet"): **Add Asset form,
  Import Excel, Transfer/Movement form, PDF download, pull-to-refresh.** These are specified in
  prose below and must be built.

---

## Design Tokens

### Colors

| Token               | Light     | Dark      | Usage                                       |
| ------------------- | --------- | --------- | ------------------------------------------- |
| `bg`                | `#F6F8FB` | `#080C15` | app canvas                                  |
| `card`              | `#FFFFFF` | `#131A26` | cards, sheets, list containers              |
| `soft`              | `#F0F3F9` | `#1B2432` | icon chips, inputs, segmented tracks        |
| `line`              | `#E6EAF2` | `#232C3C` | 1px borders and dividers                    |
| `text`              | `#0B1220` | `#EAEEF6` | primary text                                |
| `sub`               | `#5A6478` | `#93A0B8` | secondary text, labels                      |
| `navy` (primary)    | `#00072D` | `#0E1A3D` | primary buttons, active nav, FAB            |
| `royal` (secondary) | `#2B57C4` | `#7FA2F0` | links, asset codes, accents, selection ring |
| `gold` (accent)     | `#D4AF37` | `#D4AF37` | warranty card, FAB glyph, Super Admin badge |

Semantic / status colors (badge = `background`, `foreground`, `border`):

| Status                                  | bg                      | fg        | border                  |
| --------------------------------------- | ----------------------- | --------- | ----------------------- |
| Assigned / Active                       | `rgba(43,87,196,.10)`   | `#2B57C4` | `rgba(43,87,196,.26)`   |
| Available / Signed / Good               | `rgba(18,164,93,.11)`   | `#0C6B3F` | `rgba(18,164,93,.26)`   |
| Maintenance / Awaiting signature / Fair | `rgba(178,106,0,.12)`   | `#8A5300` | `rgba(178,106,0,.26)`   |
| Broken / Poor                           | `rgba(224,57,62,.10)`   | `#B3312F` | `rgba(224,57,62,.26)`   |
| Lost                                    | `rgba(107,78,230,.11)`  | `#5138C4` | `rgba(107,78,230,.26)`  |
| Retired / Draft / No login              | `rgba(107,114,128,.12)` | `#4B5563` | `rgba(107,114,128,.26)` |

Error red `#E0393E`; success gradient `linear-gradient(150deg,#0F7A47,#12A45D)`.
Navy header/hero gradient: `linear-gradient(135deg,#00072D,#0A1547 62%,#132766)`.
In dark mode badge foreground becomes `#E6ECF9` (backgrounds/borders unchanged).

### Typography

Font stack: **SF Pro Display / -apple-system** on iOS, **Inter** on Android (ship Inter as the
bundled fallback so both platforms match). `-webkit-font-smoothing: antialiased`.

| Role                                | Size      | Weight                   | Letter-spacing |
| ----------------------------------- | --------- | ------------------------ | -------------- |
| Screen title ("Assets", "Settings") | 22        | 680 (≈700)               | −0.6           |
| App name "CITE Assets"              | 16        | 650                      | −0.35          |
| App subtitle "IT ASSET MANAGEMENT"  | 10.5      | 500, uppercase           | +0.28          |
| Card/section heading                | 13.5      | 650                      | −0.2           |
| Section label (uppercase eyebrow)   | 11        | 700, uppercase           | +0.42          |
| KPI number                          | 22        | 680, tabular-nums        | −0.9           |
| Hero number (warranty "23")         | 34        | 700                      | −1.4           |
| Body / list primary                 | 12.5–13.5 | 560–610                  | −0.15          |
| Secondary / meta                    | 11–11.5   | 400–520                  | 0              |
| Asset code                          | 10.5      | 700, tabular-nums, royal | +0.5           |
| Badge text                          | 10        | 650                      | +0.2           |
| Bottom-nav label                    | 9.5       | 620                      | +0.1           |

All numeric columns use `font-variant-numeric: tabular-nums`.

### Spacing, radii, shadows

- Screen padding: **18px** horizontal; content top 16px; bottom 132px (clears nav + FAB).
- Vertical rhythm: 9–12px between cards, 20px before a new section label.
- Radii: cards **17–20**, list container **18**, inputs/buttons **12–14**, icon chips **11**,
  badges **8**, bottom nav **22**, FAB **21**, bottom sheet **26 26 0 0**.
- Card shadow: `0 1px 2px rgba(11,18,32,.05), 0 8px 24px rgba(11,18,32,.06)`
  (dark: `0 1px 2px rgba(0,0,0,.3)`).
- Bottom nav shadow: `0 12px 30px rgba(11,18,32,.14)`; FAB `0 12px 26px rgba(0,7,45,.36)`.
- Hit targets: minimum **44×44**. Bottom-nav bar height 66, FAB 60×60 with a 3px `bg`-colored ring.

### Motion

| Name    | Value                                                     | Used for                                           |
| ------- | --------------------------------------------------------- | -------------------------------------------------- |
| fade in | 180–200ms ease                                            | screen and tab-content changes                     |
| rise    | 200–250ms ease, `translateY(10px) → 0`                    | toast, scope dropdown, success state, inline forms |
| sheet   | 240ms `cubic-bezier(.22,.9,.3,1)`, `translateY(100%) → 0` | FAB quick-action sheet                             |
| shimmer | 1.2s linear infinite, 320px gradient sweep                | skeleton loading                                   |
| toggle  | 180ms                                                     | switch knob + track                                |

---

## Global Chrome (present on every screen)

**Header** (56px top inset for the status bar, `card` background, 1px bottom `line`):
CITE logo 32×32 · "CITE Assets" + "IT ASSET MANAGEMENT" · bell button (34×34, red 7px dot when
unread) · **scope chip** (pin icon + label) · avatar 34×34 navy with initials.

**Scope chip label:** `HO + Site` when both selected, `Head Office` / `Site` when one, `None` when
zero. Tapping opens a dropdown (absolute, 18px insets, top 98px) listing each location with a 22px
checkbox (royal when checked), name, and meta (`Jakarta · 812 assets`, `Konawe operations · 472
assets`), plus the footer note: _"Dashboard, Assets, BAST, Documents and Reports all follow this
scope."_ Selection is **multi-select** and persisted per user (see `account_scope_preferences`).

**Bottom navigation** — floating bar, 12px side insets, 26px from bottom:
`Home` · `Assets` · **(64px gap for FAB)** · `BAST` · `More`.
Active = `navy` (dark: white); inactive = `#8B94A7` (dark `#93A0B8`). "Assets" stays active on Asset
Detail; "More" stays active on Master data, Settings, Audit log.

**Center FAB** (60×60, navy gradient, gold `+`) opens the **Quick actions** bottom sheet with four
2-column tiles: _Add Asset · Register new equipment_ / _Assign Asset · Handover to employee_ /
_Transfer Asset · HO ↔ Site movement_ / _Generate BAST · Berita Acara Serah Terima_.
Backdrop `rgba(4,8,22,.42)` + 3px blur; tap backdrop to dismiss.

**Toast** — 16px insets, 104px from bottom, `rgba(11,18,32,.94)`, radius 15, green check chip,
auto-dismiss after **2400ms**, single instance (new toast replaces the old).

---

## Screens

### 1. Dashboard (`Home`)

Greeting "Good morning, Dewi" (22/680/−0.6) + scope sentence
`Scope · Head Office and Site · 7 assets`.

- **KPI grid** — 3 columns × 2 rows, 9px gap, radius 16. Each tile: 7px status dot + uppercase label
  (9.5/650/+0.34), value 22/680 tabular, delta 10px sub.
  `Total 1,284 (+18 this month)` · `Active 1,047 (81.5% of fleet)` · `Maint. 62 (9 overdue)` ·
  `Broken 38 (6 for disposal)` · `Lost 9 (2 under review)` · `Retired 128 (archived)`.
- **Warranty card** — navy gradient, radius 18, two decorative gold-stroked circles top-right, gold
  clock icon + "WARRANTY EXPIRING", number `23` at 34/700, "assets in the next 30 days",
  and a `Review list` button (gold-tinted, 34px) → Assets filtered to expiring warranties.
- **Quick actions** — 3×2 grid of icon+label tiles: Add Asset, Assign, Transfer, BAST, Import Excel,
  Export.
- **Assets by category** — donut, r=52, stroke 13, rotated −90°, track `soft`.
  Segments: Laptop 539 `#00072D` · Desktop 231 `#2B57C4` · Monitor 180 `#5B84E8` ·
  Networking 128 `#8FB0F5` · Printer 116 `#D4AF37` · Others 90 `#A9B4C7`.
  Center: total `1,284` + "TOTAL". Legend right: dot, name, value.
- **By location** — full-width bars, 8px tall, navy→royal gradient: Head Office 812 (63%), Site 472 (37%).
- **By department** — label 86px + 7px bar (royal) + right-aligned value: Operations 386 (100%),
  Corporate IT 214 (55%), Finance 142 (37%), HRGA 118 (31%), Procurement 96 (25%).
- **Recent activity** — 5 rows (icon chip 32px, title, meta, relative time) + "Audit log" link.

**Loading:** on first mount and on every return to Home, show a 3×2 grid of 82px shimmer skeletons
for **620–700ms**, then the real content. Assets list uses 92px skeleton rows.
**Pull-to-refresh** (to build): standard `RefreshControl`, re-runs the same queries, shows skeletons only on cold load.

### 2. Assets

Title + count line `4 of 7 in scope · HO + Site`.

- **Search field** — 42px, radius 14, magnifier icon, placeholder
  `Asset code, serial, name, user…`, clear (×) button when non-empty.
  Search matches **asset code, serial number, name, assigned user, department, brand, model**
  (case-insensitive substring).
- **Status chips** — horizontally scrollable: `All, Assigned, Available, Maintenance, Broken, Retired`.
  Active chip = navy fill/white text; inactive = card bg, `sub` text, `line` border. Height 32, radius 11.
- **Asset card** (radius 17, 13/14px padding): 42px category icon chip · asset code (royal) ·
  name 13.5/600 (ellipsis) · holder line 11px sub · chevron. Second row: status badge, condition
  badge, location chip. Tap → Asset Detail.
- **Empty state** — dashed-border card, 56px icon chip, "No assets match",
  "Try a different asset code or widen the global data scope.", `Reset filters` button
  (clears query + status + restores both scope locations).

### 3. Asset Detail

Back link "‹ Assets". Hero card (radius 20): 150px navy gradient with a radial gold glow and a
dashed **asset-photo placeholder** → replace with real photo + upload. Below: asset code (royal),
name 19/670, `Brand · Category · SN <serial>`, status/condition/location badges, then actions:

- Primary button (flex, navy): **`Return Asset`** when status = Assigned, otherwise **`Assign Asset`**.
- `BAST` secondary button → BAST list filtered to this asset.
- ⋯ overflow (Edit, Change status, Transfer, Retire, Delete — permission-gated).

**Tabs** (scrollable chips): `Overview · Specs · Timeline · Documents · Assignments · Maintenance`.

- **Overview** — key/value rows (label 104px `sub`, value right-aligned 12.5/560): Assigned to,
  Department, Current location, Purchase date, Purchase price, Warranty (`start → end`), Vendor,
  Model. Plus a "NOTES" card.
- **Specs** — same row style, from the asset's `specifications` JSON.
- **Timeline** — vertical rail: 11px dot with a 3px halo, 1.5px connector line, per event a title
  13/640, right-aligned date, detail line 11.5 `sub`, and an optional tag chip (e.g. BAST number).
  Event types & dot colors: Purchased `#6B7280`, Registered `royal`, Assigned `#0F7A47`,
  Moved `navy`, Maintenance `#B26A00`, Returned/Reassigned `royal`, Retired `#6B7280`.
- **Documents** — rows with a colored extension chip (PDF `#E0393E`, JPG `royal`, signed BAST
  `#0F7A47`), name, `type · size · date`, download button; then a dashed
  `+ Upload document` button (invoice, PO, warranty card, manual, photos, signed BAST, other).
- **Assignments** — history rows: 30px navy initials avatar, name, department, `Active`/`Returned`
  badge, date range, BAST number.
- **Maintenance** — cards with state badge, date, title, detail, and a footer row `Vendor · …` /
  `Cost · …`.

### 4. Assign / Return Asset (3-step wizard)

Entered from the FAB sheet, Dashboard quick action, or the Asset Detail primary button
(which pre-selects the asset and switches to **return** mode).

Header: "Cancel" link, title `Assign Asset` / `Return Asset`, `Step n of 3 · Employee|Asset|Details`,
and a 3-segment progress bar (4px, navy when reached).

- **Step 1 — Employee**: selectable rows (36px navy initials avatar, name, `Department · Location ·
NIK`). Selected row: 1.5px royal border + `0 0 0 3px rgba(43,87,196,.13)` ring + check icon.
- **Step 2 — Asset**: rows filtered to `Available` (assign mode) or `Assigned` (return mode) **within
  the current scope**; shows code, name, `location · condition`.
- **Step 3 — Details**: summary card (employee + asset), then
  `Assignment date` (**required**, defaults to today), `Expected return (optional)`,
  `Notes` textarea (placeholder "Handover condition, accessories included…"), and an
  **Auto-generate BAST** switch (default ON) labelled "Berita Acara Serah Terima draft".

**Validation** — `Continue` blocked with an inline red message under the buttons:
step 1 "Select an employee to continue", step 2 "Select an asset to continue",
step 3 missing date → field border turns `#E0393E`, helper "Assignment date is required" +
"Fill the required field". Final button label: `Confirm assignment` / `Confirm return`.

**Success state** — 78px green gradient check tile, title `Assignment created` / `Asset returned`,
subtitle depending on the BAST switch, a summary card
(Employee/Returned by, Asset, Date, BAST number or "Not generated"), then
`Generate BAST document` (→ BAST list, toast `BAST/CITE/2026/0183 generated`) and
`Back to dashboard`. Committing also updates the asset: status → `Assigned`/`Available` and the
holder line, writes an assignment row, a movement row when the location changes, and audit entries.

### 5. BAST

**List** — title + `4 documents · HO + Site`, three stat tiles (`Signed 2`, `Awaiting 1`, `Draft 1`),
then record cards: BAST number (royal, tabular), status badge, date right-aligned, asset name,
`Employee · Department · Location`.

**Detail** — header row (number, "Serah Terima Aset", status badge) then a **paper preview** on a
`soft` background: white sheet, radius 8, `0 6px 18px rgba(11,18,32,.08)`, containing
CITE logo + "CORPORATE IT — CITE" / "IT ASSET MANAGEMENT" over a 2px navy rule; centered underlined
title **BERITA ACARA SERAH TERIMA** + `No. <number>`; the Indonesian sentence
_"Pada hari ini, <hari, tanggal>, telah dilakukan serah terima aset IT sebagai berikut:"_;
a bordered table (Asset Code, Nama Aset, Penerima, Departemen, Lokasi, Kondisi); and two signature
blocks — _Yang Menyerahkan_ (Corporate IT staff) and _Yang Menerima_ (employee + department).
Actions: `PDF` (download, navy) and `Preview`.

**Signed BAST card** — dashed upload target ("Upload scanned signed BAST", "PDF or JPG · max 10 MB")
→ progress state (PDF chip, filename, `Uploading · n%`, 6px navy→royal bar; prototype steps 11% every
180ms) → success state (green-tinted row, `Uploaded · 1.8 MB · v2`). Completing an upload sets the
BAST status to **Signed** and toasts "Signed BAST uploaded · status set to Signed".
Below: **Version history** rail (`Signed scan uploaded — Dewi Lestari · Corporate IT`,
`PDF generated (v1) — System · on assignment created`).

### 6. Notifications

Title + `3 unread · scope HO + Site`, `Mark all read` link. Grouped `TODAY` / `YESTERDAY` inside
list cards. Row: 32px icon chip (color per type), title 12.5/600, body 11.5 sub, time, and a 7px
royal unread dot. Unread rows have a faint royal wash (`rgba(43,87,196,.035)`).
Types & deep links: **Warranty expiring** (gold clock → asset), **BAST awaiting signature**
(royal doc → BAST), **Maintenance updated** (amber wrench → asset Maintenance tab),
**Asset returned** (green swap → asset), **Import completed** (green sheet), **New assignment**
(royal user → asset). Tapping a row marks it read and navigates.

### 7. More

List of modules, each with icon chip, label, sub-label, chevron:
`Movement` (Transfer history between HO and Site) · `Maintenance` (Open tickets and service records) ·
`Accessories` (Mice, keyboards, cables — counted, not serialised) ·
`Documents` · `Reports & Export` (Excel and PDF with filters) · `Import Excel`
(Template → validate → import) · `Master data` · `Audit log` (Immutable record of every action) ·
`Settings`.

### 8. Master data

Back to More. Entity chips: `Category, Brand, Model, Vendor, Department, Location, Status,
Condition`, plus `Unit` and `Company` — appended rather than slotted in, so the eight the design
specifies stay in the order it specifies. A `Unit` needs a code and a location; a `Company` needs a
code. A company's meta line counts **people**, not assets, because no asset points at one.
An inline add/edit row (royal `+` icon, text field with placeholder `New <entity> name`, navy
`Add` / `Save` button). Rows show the name and `<Entity> · used by n assets`, with edit (pencil) and
delete (red-tinted trash) buttons. **Validation:** empty → "Enter a name first"; duplicate →
`"<name>" already exists in <Entity>`. Toasts: `<name> added to <Entity>`, `Record updated`,
`<name> deleted`. Deletion must be blocked (or soft-deleted) when the record is referenced — see the
FK notes in `DATABASE.md`. Empty state: "No records yet / Add the first one using the field above."

### 8b. Accessories — **added after this document was written**

> Not in `CITE Assets.dc.html`. There was no design to follow, so this screen is built entirely
> from primitives and tokens already defined above — `Card`, `ListCard`, `Chip`, `PickerSheet`,
> `Badge`, and the KPI tile from Home. **No new colour, radius or spacing value was invented.**
> Recorded here so the contract exists after the fact rather than not at all.

The reason it exists: `assets.serial_number` is NOT NULL UNIQUE, so a mouse or a cable could never
be registered at all. Accessories are **counted, not identified** — a row is a kind of thing at one
location with a quantity.

**List** (`More → Accessories`) — deliberately the same shape as the asset register: title,
`n available · n out · <scope>` meta line, the same category filter pill, the same 220ms-debounced
search field. Rows use the asset card at `padding 13`: 42px category icon chip, name, `Category ·
Location`, and on the right the available count in `assetCode` type over `of <total>` in `badge`
type. Tapping opens the detail.

**Detail** — three KPI tiles (`Total`, `Out`, `Available`), then `Assign to` (navy, disabled at
zero available) and `Edit`. Below, **Who has them**: one row per hand-out, `n × Name` with
`Out since <date>` or `<date> → <date>`, plus the BAST number when there is one. An active row
carries `BAST` and `Return`; a closed one carries a `Returned` badge. Returned rows stay — they are
evidence somebody held three of these in March.

**Assign sheet** — person picker, a quantity field (the only field the asset flow does not have,
because a pile is not a thing), date, notes. Refused above the available count, and the message
names the remainder. On success a sheet offers **Raise a BAST Perlengkapan**.

**Add / edit** (`accessory-edit`) — three cards: what it is, how many and where, purchase. `Total
owned` is the number owned, not the number on the shelf; the server refuses to take it below what
is currently out. **Location is fixed after creation** — it still shows where the stock is, but
does not open, because moving a pile between locations is a physical event with a count attached,
not a dropdown.

**Empty states** — `No accessories match / Try a different name, or widen the global data scope.`
with a `Reset filters` action when a filter is active.

### 9. Settings

- **Profile card** — 48px navy avatar, name, email, gold `SUPER ADMIN` role badge.
- **Appearance** — `Dark mode` switch (sub-label "On · easier on the eyes at site" /
  "Off · following light theme") and a `Language` segmented control `EN | ID`.
- **User accounts** — `+ New account` reveals an inline form: `Full name` (required),
  `Department` + `Location` selects, a **`Can sign in`** switch
  ("Off = record only, assets can still be assigned"), and — only when the switch is on — role chips
  `Super Admin · Corporate IT · Site IT · Viewer`. Submit = `Create account`; empty name → red border
  - "Full name is required". Toasts: `<name> can now sign in` / `<name> added as assignable record`.
    The account list shows a navy avatar for sign-in-capable accounts, grey for record-only, plus the
    role badge or a `No login` badge.
- **General** — `Notification settings` (6 types on), `Default data scope` (opens the scope
  dropdown), `About CITE Assets` (v1.0.0).
- Destructive `Log out` button, then `CITE Assets v1.0.0 · Build 2026.07`.

### 10. Audit log

"Immutable · every action is recorded". Cards: action badge (`Status Changed`, `BAST Generated`,
`Assignment Created`, `Movement Recorded`, `Asset Updated`), timestamp, target, then an
**old → new** diff (old value struck through in red, arrow, new value in green) and a footer
`Role · User · Device · IP`. Read-only; no edit or delete affordance anywhere.

### 11. Add Asset — to build

Modal/stack form, grouped sections, all fields from the register:
_Identity_ (Asset Code — auto-generated, editable by Super Admin; Asset Name; Category; Brand; Model;
Serial Number) · _Procurement_ (Vendor, Purchase Date, Purchase Price, Warranty Start, Warranty End) ·
_Placement_ (Department, Current Location, Assigned To — optional, Status, Condition) ·
_Details_ (Specifications key/value repeater, Notes, Asset Photo).
Required: name, category, brand, serial number, location, status, condition. Serial number must be
unique — show "Serial number already registered" inline. Save → toast + navigate to the new
Asset Detail. Reuse the wizard's field styling (44px inputs, radius 13, 11.5/600 `sub` labels).

### 12. Transfer / Movement — to build

Form: Asset (pre-filled when entered from Asset Detail), Origin (read-only, current location),
Destination (location select, must differ from origin), Date, Reason (select: project rollout, employee
relocation, repair, redeployment, audit support, other), Remarks. Confirm → movement row + asset
location update + audit entry, toast "Movement recorded".
**Movement history is append-only — never expose edit or delete.** The Movement list shows a rail of
`Origin → Destination` steps with date, user, reason, remarks.

### 13. Import Excel — to build

Stepper: **Download template → Fill → Upload → Preview → Validate → Import.**
Upload accepts .xlsx ≤ 5 MB. The preview table shows the first 50 rows with per-cell error
highlighting; the validation panel groups errors by rule (unknown category, duplicate serial,
invalid date, missing required column, unknown location). `Import n valid rows` is enabled only when
at least one row is valid; invalid rows are skipped and downloadable as an error report.
Completion writes an `import_batches` row and fires the "Import completed" notification
("42 rows imported, 3 skipped with validation errors").

### 14. Reports & Export — to build

Filter sheet: Date range, Department, Category, Location, Status, Vendor, Assigned User.
Export as **Excel** or **PDF**; PDF carries the same CITE letterhead as the BAST document.
Export runs server-side and returns a signed URL; show a progress toast then a download/share sheet.

---

## Interactions & Behavior Summary

| Trigger                      | Behavior                                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope checkbox               | Updates the global scope; every list, count, and chart refetches. Zero locations selected → all lists show the empty state.                                                        |
| Tab / chip change            | Content cross-fades 180ms; no scroll reset on Asset Detail.                                                                                                                        |
| Navigating to Home or Assets | 620ms skeleton, then content. Other screens render immediately.                                                                                                                    |
| Any mutation                 | Optimistic UI + toast; on failure roll back and show a red error toast.                                                                                                            |
| Asset Detail primary button  | `Assigned` → Return flow (asset pre-selected); otherwise → Assign flow.                                                                                                            |
| BAST upload complete         | BAST status → Signed, version history gains an entry, document appears in the asset's Documents tab.                                                                               |
| Notification tap             | Marks read, deep-links to the entity (asset, BAST, or the relevant tab).                                                                                                           |
| Dark-mode switch             | Instant theme swap, persisted per device.                                                                                                                                          |
| Permissions                  | Viewer sees no mutating buttons; Site IT is locked to its own location scope; Corporate IT may not manage accounts; only Super Admin can delete master data or edit an asset code. |

## State Management

Global: `session` (account + role + permissions), `scope: string[]` (selected location ids,
persisted server-side and locally), `theme: 'light' | 'dark'`, `language: 'EN' | 'ID'`,
`toast`, `unreadCount`.

Per-screen: `query`, `statusFilter`, `activeTab`, `assign: {mode, step, employee, asset, date,
expectedReturn, notes, autoBast, errors}`, `bast: {view, currentId, upload: 'idle'|'busy'|'done',
progress}`, `master: {entity, draft, editingId, error}`, `account: {name, dept, loc, canLogin, role,
error}`.

Server state via TanStack Query, keyed with the scope so cache invalidation is automatic:
`['assets', scope, query, status]`, `['asset', code]`, `['bast', scope]`, `['notifications']`,
`['master', entity]`, `['dashboard', scope]`.

## Assets

- `assets/cite-logo.png` — the CITE department logo supplied by the client. Used in the app header
  (32px), the BAST paper preview (22px), and the app icon / splash screen.
- All other icons are 24×24 outlined strokes (1.6–1.8px, round caps) drawn inline in the prototype —
  match them with Lucide (`home, box, file-text, grid, plus, user, move, wrench, bar-chart,
upload, download, settings, shield-check, bell, laptop, printer, monitor, server, network, clock,
file-spreadsheet, arrow-left-right`).
- No illustrations are used; empty states are icon + text only.

## Files

| File                     | What it is                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `CITE Assets.dc.html`    | The full interactive hi-fi prototype (all screens, states, and flows). Open in a browser. |
| `DATABASE.md`            | Postgres/Supabase schema: DDL, enums, indexes, triggers, RLS policies, seed data.         |
| `IMPLEMENTATION_PLAN.md` | Build order, per-module acceptance criteria, and the prompt for each phase.               |
| `assets/cite-logo.png`   | Brand mark.                                                                               |
