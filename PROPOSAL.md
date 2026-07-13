# MCB Real Estate — Interactive Site Plan

**Proposal & Proof of Concept**
Prepared for MCB Real Estate · Annapolis Plaza (150 Jennifer Rd, Annapolis, MD)

---

## 1. What MCB asked for

MCB's property website (built on their own website builder) has a page per
property. The builder exposes a **"box"** on that page which we populate. Inside
that box, MCB wants the **Site Plan**: a top-down diagram of the center where a
visitor can click any unit and see:

- **Tenant name**
- **Square footage**
- **Suite number**
- (and, for empty units, that the space is **available**)

This is the same pattern as the Brixmor reference page
(`brixmor.com/leasing/retail-space/pa/philadelphia/roosevelt-mall`).

Today the underlying data lives in **MRI** (MCB's system of record for leasing).
For this PoC, MCB supplied:

1. The **site plan image** (page 4 of the marketing PDF; orange = vacant).
2. The **tenant data** (name, area, suite #) as a spreadsheet.

---

## 2. The core problem, and how we solve it

A site plan image is just pixels. To make it interactive we need to know **where
each unit is** on the image and **which MRI record it maps to**. The image itself
carries neither boundaries nor a link to leasing data.

**Our answer: a human-in-the-loop admin tool.** An operator draws each unit's
boundary once (a polygon) directly on the uploaded image and links it to its MRI
suite. Boundaries are stored as **percentage coordinates**, so they stay correct
at any screen size and never depend on the image's pixel dimensions. The public
site then renders those polygons as an invisible clickable overlay on top of the
image and hydrates each one with live data.

> **This directly answers MCB's question — "how will our app know the boundaries
> of each unit?"** It doesn't guess. A person draws them once in our admin panel;
> after that they are data we own, editable forever, and independent of MRI.

We deliberately keep two separate layers of data:

| Layer | Owner | Examples | Editable in our tool? |
|-------|-------|----------|----------------------|
| **MRI record** | MRI (system of record) | tenant name, sq ft, lease status, suite # | Read-only (synced) |
| **Site-plan overlay** | MCB, via our admin | polygon boundary, display-name override, category, tenant website/logo, status override | Yes |

Display value = *MRI value, unless MCB has set an override.* This is how MCB
"modifies/overrides MRI data to display what they want on the website" without
ever mutating the system of record.

---

## 3. What the PoC demonstrates (in this repo)

A working Next.js app with two surfaces, seeded with all 18 Annapolis Plaza
units from the provided spreadsheet.

### Public site plan — `/property/annapolis-plaza`
- The real Annapolis Plaza site plan with a clickable polygon over every placed
  unit.
- Click a unit → panel shows **name, square footage, suite number, status**.
- Vacancies render in orange and show an **"Inquire about this space"** call to
  action (mailto the leasing contact). Leased units are navy; "coming soon" green.
- Color legend, hover highlight, tooltips.

### Admin / Site Plan Editor — `/property/annapolis-plaza/admin`
- **Upload site plan** — replace the image; the app reads its natural dimensions.
- **Draw / redraw a unit boundary** — click points on the image to trace a unit,
  then Finish. Drag a placed unit's corners to fine-tune.
- **Tag to MRI** — every shape is attached to an MRI suite from the unit list.
- **Unplaced-units tray** — MRI units with no boundary yet are flagged so nothing
  is silently missed. (In the seed, suites 17 & 18 are intentionally left
  unplaced to show this.)
- **Override MRI for display** — set a display name, sq ft, status, category, or
  website. The MRI value is always shown alongside as read-only reference.
- **Save** — persists via an API; the public page reflects it immediately.

**Two override examples are pre-seeded to make the concept concrete:**
- Suite 7 MRI name `"Est Sprout"` → displayed as **"Sprout"** (data cleanup).
- Suite 16 World Market MRI status `occupied` → displayed as **"Coming soon"**
  (matches the marketing).

### A real-world data mismatch we surfaced
The provided site-plan image labels the pad building **"Atlantic Union Bank"**,
but the rent roll lists suites 17 & 18 as **"Sandy Spring Bank"** and **"Sandy
Spring Financial Center."** This is exactly the kind of image-vs-system-of-record
drift the override + unplaced-tray workflow is designed to absorb: the graphic
and MRI disagree, and MCB decides what the public sees.

---

## 4. Proposed end-to-end solution

```
   ┌────────────┐   nightly sync   ┌──────────────────────┐
   │    MRI      │ ───────────────▶ │  Headless CMS         │
   │ (system of  │  (read-only,     │  • Property            │
   │  record)    │   suite/name/    │  • Unit (MRI snapshot  │
   └────────────┘   sqft/status)    │    + overlay + polygon)│
                                    │  • Site-plan image     │
                                    └───────────┬────────────┘
                          admin panel           │ content API (JSON)
                     (draw polygons, tag,        │
                      override) ─────────────────┤
                                                 ▼
   ┌──────────────────────────────┐   embed    ┌────────────────────────────┐
   │  MCB website "box" on the     │ ◀───────── │  Site Plan widget           │
   │  property page                │  <iframe>  │  (this Next.js app)         │
   └──────────────────────────────┘  / script  └────────────────────────────┘
```

### 4.1 Embedding into MCB's website "box"
MCB's builder gives us a box on the property page. We deliver the widget as a
**self-contained embed** so it drops into that box regardless of their CMS:

- **Recommended: `<iframe>` embed** — one line MCB pastes into the box, e.g.
  `<iframe src="https://siteplans.mcb.../embed/annapolis-plaza">`. Fully isolated
  styling, trivial for them to place, we control everything inside.
- **Alternative: script/web-component embed** — a `<script>` that mounts a
  `<mcb-siteplan property="annapolis-plaza">` element. Better visual blending;
  needs slightly more cooperation from their builder.

The widget takes a **property slug** as its only parameter, so the same embed
powers every property page.

### 4.2 CMS as backend
Content (properties, units, polygons, overrides, images) lives in a **headless
CMS**. In the PoC this is abstracted behind a single module
(`src/lib/store.ts`) backed by a JSON file — swapping it for a real CMS is a
localized change; the rest of the app is untouched. Recommended options:

- **Payload CMS** — runs inside the same Next.js app, self-hosted, great for a
  bespoke admin (like our polygon editor) and role-based access. *Our default
  recommendation.*
- **Sanity / Strapi / Contentful** — viable if MCB prefers a managed/SaaS CMS;
  the polygon editor becomes a custom input plugin.

### 4.3 MRI integration
MRI is the **system of record** and stays read-only from our side.

- **Sync**, not manual entry: a scheduled job pulls suite #, tenant name, area,
  and lease status from MRI into the CMS (MRI exposes API/ODBC/flat-file export
  depending on MCB's deployment — to be confirmed).
- Each unit stores an **MRI snapshot** plus MCB's **overlay/overrides**. On
  sync we update the snapshot and **preserve polygons and overrides**.
- Sync reconciliation surfaces: new MRI suites appear in the **unplaced tray**;
  suites that vanish from MRI are flagged rather than deleted.
- Until the MRI integration is built, the CMS import accepts the same
  **spreadsheet** MCB provided (interim path).

### 4.4 Admin workflow (production)
1. Create/select a property; upload its site plan image.
2. MRI units appear automatically (via sync) in the unplaced tray.
3. For each unit: draw its boundary, confirm the MRI link.
4. Optionally override display fields, add category/website/logo.
5. Publish → the embed updates on the live site.

---

## 5. Assumptions

1. **MCB provides the site-plan image** per property (marketing-quality raster).
   We do not generate it from CAD/GIS in the PoC.
2. **Boundaries are drawn by a person, once per plan.** The image has no machine-
   readable unit geometry, so we do not attempt automatic detection in the PoC.
3. **MRI is the system of record** for name/area/suite/status; our app never
   writes back to MRI. All edits are display-side overrides.
4. **One suite = one clickable unit.** Combined/demised spaces are handled by
   drawing/merging polygons in the admin; the MRI suite mapping still governs data.
5. **The website builder can host an embed** (iframe or script). If it can only
   accept static HTML with no external frames, scope changes and we'd discuss
   a server-rendered snapshot alternative.
6. **Interim data path is the spreadsheet;** the eventual path is a live MRI sync.
   Field names in the sheet map cleanly to MRI (suite, tenant, SF, status).
7. **Square footage from MRI is authoritative** for display unless overridden;
   marketing SF (e.g. the "1,776 SF / 10,562 SF" on the graphic for vacancies)
   is reconciled via overrides.
8. **Auth** — the admin panel sits behind MCB SSO / role-based login in
   production (not implemented in the PoC).

---

## 6. Open questions for MCB

1. **MRI access** — what integration surface is available (REST API, ODBC,
   nightly export)? This drives the sync design and timeline.
2. **Website builder** — which platform, and can it embed an iframe or custom
   script in the box? Any CSP/domain constraints?
3. **Image source of truth** — will MCB keep supplying marketing rasters, or do
   they have CAD/vector plans we could import for pixel-perfect, auto-generated
   boundaries later?
4. **Sync frequency & ownership** — how fresh must lease status be (nightly vs
   real-time)? Who owns re-tagging when a plan image is redrawn?
5. **Scope of overrides** — beyond name/SF/status, do they want logos, hours,
   promotions, floor levels, or leasing brochures per unit?

---

## 7. Suggested phasing

| Phase | Deliverable |
|-------|-------------|
| **0 — PoC (this repo)** | Interactive plan + admin editor, seeded from the spreadsheet, for Annapolis Plaza. |
| **1 — Productionize** | Headless CMS (Payload), auth, spreadsheet importer, iframe embed on one live property page. |
| **2 — MRI sync** | Scheduled MRI → CMS sync with reconciliation (unplaced/removed handling). |
| **3 — Scale & polish** | Roll out across all MCB properties, tenant logos/links, analytics, optional CAD/vector boundary import. |

---

## 8. Future enhancement: reducing manual tagging

The PoC draws boundaries by hand — reliable and cheap to build. If MCB later
wants to cut that effort at scale:

- **CAD/GIS import** — if plans exist as vector (DWG/SVG/GeoJSON), unit polygons
  can be imported directly and matched to MRI suites, largely eliminating manual
  tracing.
- **Assisted detection** — image segmentation to *suggest* unit outlines that an
  operator confirms (human still in the loop; accuracy on stylized marketing art
  is unproven, so we'd pilot before committing).

Neither is required for launch; the manual editor is the dependable baseline.
