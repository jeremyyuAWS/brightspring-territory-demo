# BrightSpring | Adoration Health — Territory Command Center (Demo)

A standalone, offline-capable demo of a territory-management app for management: view covered
territory, assign reps to ensure coverage, and track referral attribution. Built per the
_Territory Management Demo PRD_ (demo date July 22, 2026).

**Synthetic, non-PHI, resettable data. No live Salesforce / HCHB / Morado integration.**
Every operation is deterministic and reversible.

**Live demo:** https://brightspring-territory-demo.netlify.app
**Repository:** https://github.com/jeremyyuAWS/brightspring-territory-demo

_The hosted demo runs on the built-in inline-SVG map (no token embedded in the public bundle).
To enable the live Mapbox basemap on the deployment, set `VITE_MAPBOX_ACCESS_TOKEN` in Netlify
(Site settings → Environment variables) and add the `*.netlify.app` domain to the token's URL
restrictions in your Mapbox account._

## Run it

```bash
cd brightspring-territory-demo
npm install
npm run dev        # opens on http://localhost:5180
```

For a static build to serve at the demo (no dev server needed):

```bash
npm run build      # outputs dist/
npm run preview    # serves dist/ locally
```

The app works **fully offline with no token** — data is a local seed, state lives in the
browser (localStorage), and the map degrades to a self-contained inline‑SVG fallback.

## Interactive Mapbox map (optional, recommended for the demo)

Home renders a real **Mapbox GL** map when a public token is present; without one it falls back
to the inline‑SVG map automatically (no crash, no blank page). To enable the live map:

```bash
# brightspring-territory-demo/.env.local   (gitignored — never commit a token)
VITE_MAPBOX_ACCESS_TOKEN=pk.your_public_token_here
```

Restart `npm run dev` after adding it. Use a **public** token (`pk.…`) restricted to your demo
URLs — never a secret (`sk.…`) token. The live map adds: real Richmond basemap, territory
polygons colored by health, opportunity‑sized account points, clustering, hover/click popovers,
camera + reset‑to‑market controls, and a **Layers** control for the P1 overlays (uncovered‑priority
emphasis, rep route line, and 30/45/60‑minute drive‑time areas). Drive‑time areas are precomputed
locally (no Isochrone API call) so the critical demo path stays deterministic and offline‑safe.

> Mapbox GL is lazy‑loaded — its ~1.5 MB bundle only downloads when a token is configured, so the
> token‑free path stays fast.

## The 8–10 minute demo flow (from the PRD)

1. **Home** — Territory Command Center. Point to the health map, South Richmond at 54% coverage,
   and the ranked manager insights.
2. **Optimize territories** → choose **Balanced Coverage** → **Generate proposal**. Inspect the
   Before/After panel (76% → 90%) and proposed changes → **Apply simulation** (with Undo).
3. **Plan → Month** — priority accounts now covered; weekly distribution rebalanced.
4. **Today** — select **Jordan Ellis** (112% capacity); view route, risk, and **Rebalance today**.
5. **Accounts → Elmington Rehabilitation → Referrals** — update **R-1042** disposition; watch the
   funnel and KPIs refresh.
6. Return **Home** — improved coverage, audit trail, **Export leadership snapshot**.
7. **Data & Simulation** (top bar) — states what is mocked, simulated, and future-integrated.
8. **Reset demo** — restores the seeded baseline (seed-v1) for a clean re-run.

## Key details

- **Territory health model** — weighted score (priority coverage 35%, visit attainment 25%,
  referral momentum 20%, freshness 10%, travel efficiency 10%); Healthy ≥ 80, Watch 65–79,
  At Risk < 65. Computed in `src/seed.ts`.
- **Determinism** — the Balanced proposal produces the exact PRD Before/After values every time.
- **Safety** — referrals use identifiers only (e.g. `R-1042`); no patient names, DOB, diagnosis,
  or payer anywhere.

## Structure

```
src/
  seed.ts        deterministic synthetic data + health model + fixed proposal
  geo.ts         Richmond lng/lat polygons, GeoJSON builders, mock isochrones/routes
  store.ts       demoState (localStorage), audit, undo, reset, snapshot export
  selectors.ts   derived KPIs, insights, funnel, effective assignments
  views/         Home, Plan, Today, Accounts
  components/
    TerritoryMapPanel      picks Mapbox vs SVG fallback (token check + error boundary)
    TerritoryMapMapbox     Mapbox GL map, layers, clustering, popups, P1 overlays, Layers control
    TerritoryMapFallback   token-free inline-SVG map (also used as the resilience fallback)
    TerritoryMap           the SVG map itself
    TerritoryBuilder, CompareReps, ReferralForm, DispositionForm, DataSimPanel
```
