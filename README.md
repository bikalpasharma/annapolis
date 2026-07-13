# MCB Site Plan — PoC

Interactive, clickable property **Site Plan** for MCB Real Estate, built with
Next.js. See [`PROPOSAL.md`](./PROPOSAL.md) for the full solution proposal and
assumptions.

## Run it

```bash
npm install
npm run dev
# open http://localhost:3000
```

Typecheck with `npx tsc --noEmit`. No env vars are needed for local dev — the
app persists to `data/site.json` on disk (see **Persistence** below).

| Page | Route |
|------|-------|
| Property list (add / delete properties) | `/` |
| **Add a property** (name, address, GLA, upload site plan) | `/property/new` |
| **Public site plan** (click a unit → name / SF / suite) | `/property/<slug>` |
| **Admin editor** (upload, draw/tag boundaries, override MRI) | `/property/<slug>/admin` |

## Multiple properties

The app is multi-property. From the home page, **+ Add a property** opens a form
(name, address, GLA, and a site-plan image upload); on submit it creates the
property with a unique slug and drops you into its admin editor to start tagging
units. Each home-page card has a **×** to delete a property. New properties start
empty — build them up with **+ Add new space** in the editor (or, in production,
via the MRI sync described in the proposal).

## What's here

- **Public viewer** — the Annapolis Plaza plan with a clickable overlay; leased
  (navy), available (orange), coming-soon (green); detail panel + inquiry CTA.
- **Admin editor** — upload a plan, trace each unit's boundary, drag corners to
  adjust, tag it to an MRI suite, and override MRI values for display. You can
  also **+ Add new space** — create a unit that isn't in MRI (a `source:
  "manual"` unit, e.g. a new pad/kiosk), draw its boundary, and edit its name /
  suite / SF / status directly. Save persists to the content store and the
  public page updates.

## How it works

- **Data** lives in [`data/site.json`](./data/site.json) behind a single content
  module ([`src/lib/store.ts`](./src/lib/store.ts)) — the seam you swap for a real
  headless CMS + MRI sync in production.
- Each **Unit** holds an **MRI snapshot** (`mri`, read-only, system of record),
  editor **`override`s**, and a **`polygon`** (the drawn boundary).
- **Boundaries** are stored as `[x%, y%]` vertices (0–100), so the overlay is
  resolution-independent. It's rendered as an SVG with
  `viewBox="0 0 100 100"` + `preserveAspectRatio="none"` sized to the image box.
- Display values apply overrides on top of MRI (see `displayName` / `displaySqft`
  / `displayStatus` in [`src/lib/types.ts`](./src/lib/types.ts)).

## Structure

```
data/site.json                          seed: property + 18 MRI units + polygons
src/lib/types.ts                        domain model + display helpers
src/lib/store.ts                        content layer (swap for CMS)
src/app/api/property/route.ts           GET list / POST create property
src/app/api/property/[slug]/route.ts    GET / PUT / DELETE property
src/app/page.tsx                        property list
src/app/property/new/page.tsx           create-property form
src/app/property/[slug]/page.tsx        public property page
src/app/property/[slug]/admin/page.tsx  admin page
src/components/PropertyCard.tsx         home-page card (with delete)
src/components/SitePlanViewer.tsx       public interactive overlay
src/components/SitePlanEditor.tsx       admin polygon editor
public/siteplan-annapolis.png           site plan (page 4 of the PDF)
```

## Persistence

The content layer ([src/lib/store.ts](src/lib/store.ts)) has two backends and
picks automatically:

- **Local dev** — reads/writes `data/site.json` on disk (zero infra).
- **Vercel / production** — when the KV env vars are present it uses **Upstash
  Redis / Vercel KV**, storing the whole document under one key. This is
  required because Vercel's serverless filesystem is **read-only**, so the file
  store cannot persist there.

On first request against an empty Redis, the store seeds itself from the bundled
`data/site.json`. Both `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Vercel KV) and
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash) are supported —
see [.env.example](.env.example).

> This JSON-document store is still a stand-in for the CMS. In production,
> content lives in the headless CMS + MRI sync described in the proposal.

## Deploy to Vercel

1. Push to GitHub and import the repo in Vercel (framework auto-detected as
   Next.js; build `next build`, install via npm).
2. Add a KV store: **Storage → Upstash Redis** (or Vercel KV) and connect it to
   the project — this injects `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
3. Redeploy. Without a KV store the site still builds and renders, but any
   Save / Add / Delete returns a 500 (nothing to persist to).
# annapolis
