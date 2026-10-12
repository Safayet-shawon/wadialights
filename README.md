# WADIA · Lights & Automation

A cinematic landing site with a working backend: pull the cord to light the room, browse a catalogue,
size the lighting for your own room with a matrix-based planner, and send an enquiry that is stored in PostgreSQL (Supabase).

**Live:** https://wahdialights.vercel.app

## What is in here

| Part | What it does |
|---|---|
| **Opening film** | Dragging the cord scrubs `intro-pull.mp4`; past 60 % the intro plays, then the hero loops. Skip crossfades straight to the hero. Works with mouse, touch and keyboard (Enter / Space). |
| **Films** | Hero, collection plates, craft macros, before/after and the turntable are pre-rendered from the site's own 3D models (`public/videos/`, see its README). |
| **Catalogue** | `/api/products`: category filter, debounced full-text search, pagination, skeleton loaders, cached responses. |
| **Lighting planner** | Lumen method + a matrix least-squares model of the room (below), server-computed and memoised, with an instant in-browser preview. |
| **Quote request / newsletter** | `/api/inquiries`, `/api/subscribe`: validated, rate-limited, honeypot-protected, stored in Postgres. The planner's result can travel with the enquiry. |
| **Before / after** | Draggable wipe between two films of the same camera move (mouse, touch, keyboard, buttons). |
| **Button styles** | Clay · Glass · Fabric · Cut, switchable from the header (`Aa`) or the footer, remembered per visitor. |

## Quick start

```bash
npm install
npm run dev          # site + API on http://localhost:5173 (no database needed: demo catalogue)
npm test             # 21 unit + API tests (matrix maths, lighting model, validation, rate limits, compression…)
npm run build && npm start        # production server on :3000 (serves dist/ and /api)
npm run test:e2e     # drives real Chrome through every feature (needs `npm start` on :3100: PORT=3100 npm start)
```

Node 20+ (tested on 22/24).

## Database (Supabase / PostgreSQL)

Without `POSTGRES_URL` the catalogue serves the bundled demo data and the forms answer honestly that the database is not connected.
To store enquiries:

1. Create a Supabase project (or install the integration on Vercel: `vercel integration add supabase`, after accepting the marketplace terms in the browser).
2. Put the **pooled** connection string (Project Settings → Database → Connection pooling, transaction mode, port 6543) in `POSTGRES_URL` (Vercel env vars / `.env`).
3. Create the tables and seed the catalogue: `POSTGRES_URL=… npm run db:migrate`
4. Read enquiries in the Supabase table editor (`inquiries`, `subscribers`).

`db/schema.sql` creates `products`, `inquiries`, `subscribers` with: check constraints, a generated full-text `tsvector` + GIN index for search,
composite indexes for listing and the inbox, a unique index on `lower(email)`, and **Row Level Security enabled with no policies**
(the public key can read/write nothing; only the API's server-side connection can).
Connections go through a `pg.Pool` (max 3 per serverless instance, 10 on a server) behind Supabase's pooler.

## API

| Route | Method | Notes |
|---|---|---|
| `/api/products?category=&q=&page=&limit=` | GET | `limit` ≤ 24. `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600` + in-process TTL cache. |
| `/api/plan` | POST | `{ length, width, height, purpose, targetLux, reflectance, fixtureLumens, efficacy, hours, tariff, automationSaving }` → full plan. Inputs are clamped; results memoised by input hash. |
| `/api/inquiries` | POST | `{ name, email, phone?, room?, message, product?, plan?, website }` (`website` is a honeypot). 422 with per-field errors, 429 + `Retry-After`, 503 if no database. |
| `/api/subscribe` | POST | `{ email }`. Idempotent. |
| `/api/health` | GET | Database status and cache statistics. |

One route table (`server/lib/routes.js`) powers the Vercel functions (`api/*.js`), the Docker/Node server (`server/index.js`) and the Vite dev middleware.

## The maths (`server/lib/matrix.js`, `lighting.js`)

* **Lumen method:** `N = E·A / (Φ·UF·MF)`: fixtures needed for target illuminance `E` over area `A`, with a utilisation factor interpolated from the room index.
* **Point-by-point model:** the task plane is sampled on a grid; the matrix `A[p][i] = h / (4π d³)` gives lux at sample `p` per lumen from fixture `i` (inverse-square law with the cosine term).
* **Tuning:** solve `min ‖AΦ − E_target‖²` subject to `Φ ≥ 0` (ridge-regularised normal equations, Gaussian elimination with partial pivoting, active-set non-negativity). Result: per-fixture lumens, an even-ness figure (min ÷ avg) and a heat map.
* **Energy:** watts, kWh/year, running cost, CO₂ and the saving versus incandescent, with an **editable** automation-saving assumption.

It is a planning estimate (typical utilisation factors, point sources), not a certified photometric design.

## Docker

```bash
docker compose up --build                    # 2 app replicas behind an nginx load balancer on :8080
docker compose --profile db up --build       # + a local Postgres
docker compose run --rm app1 npm run db:migrate   # (with POSTGRES_URL set)
```

`nginx/nginx.conf`: least-connections balancing with passive failover, gzip, rate limiting for `/api`, and an edge cache for public API responses.
The server compresses with Brotli/gzip, serves hashed assets as `immutable`, supports byte ranges (needed for `<video>` seeking) and shuts down gracefully.
(The Docker files were written but could not be built on the machine this was developed on, which has no Docker.)

## Performance

Done: WebP posters/thumbnails and VP9/H.264 video at ≤ 4 MB per clip · `preload="none"` + IntersectionObserver lazy loading and play-only-in-view ·
code splitting (catalogue, planner, forms and the WebGL fallback are separate chunks loaded on demand) · minified, hashed, immutable assets ·
CDN caching headers (`vercel.json`) · API caching (CDN, in-process TTL with request de-duplication, client memory cache) · debounced inputs ·
paginated catalogue with skeletons · pooled DB connections and indexes · memoised planner maths · Brotli/gzip · self-hosted fonts · no unused runtime dependencies.
Lighthouse on the production build (`node server/index.js`, headless Chrome): **mobile performance 95**, accessibility 100, best practices 100, SEO 100; **desktop performance 98**. Mobile LCP 2.0 s, TBT 100 ms, CLS 0.

## Re-rendering the films

`npm run dev`, then `node tools/render-all.mjs`: headless Chrome steps the 3D scene frame by frame and ffmpeg encodes MP4 + WebM + poster. See `public/videos/README.md`.

## Layout

```
api/            Vercel functions (thin wrappers)      server/lib/   handlers, db, cache, validation, matrix + lighting maths
server/index.js Node/Docker server                    server/test/  unit + API tests
db/schema.sql   tables, indexes, RLS                  scripts/      migrate.mjs
src/            site (video experience, ui, catalogue, planner, forms, styles)
src/render/     offline render clips                  tools/        renderer, e2e tests, asset generator
nginx/ Dockerfile docker-compose.yml vercel.json .github/workflows/ci.yml
```
