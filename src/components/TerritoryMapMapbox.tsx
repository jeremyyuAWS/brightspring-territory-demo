import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useStore, actions } from '../store'
import { TERRITORIES, REPS, ACCOUNTS, ELMINGTON_ID } from '../seed'
import {
  RICHMOND_CENTER, RICHMOND_BOUNDS, REP_HOME, labelPoints, TERRITORY_POLYGONS,
  isochroneFC, routeLineFC, referralFlowFC, referralSourceFC, territoriesGeoJSON, type GeoJSONFC,
} from '../geo'
import { statusFor, accountCovered, effectiveTerritoryId, effectiveRepId, repById, territoryById, insights } from '../selectors'
import type { Account, Referral } from '../types'

const STATUS_HEX: Record<string, string> = { Healthy: '#2E7D5B', Watch: '#D99A22', 'At Risk': '#C74634' }

// per-territory referral-conversion choropleth color (live from current referrals)
function conversionColorExpr(referrals: Referral[]): any {
  const ramp = (pct: number) => pct >= 55 ? '#16a34a' : pct >= 40 ? '#65a30d' : pct >= 25 ? '#d99a22' : '#c74634'
  const pairs: any[] = []
  for (const t of TERRITORIES) {
    const inT = referrals.filter(r => r.territoryId === t.id)
    const conv = inT.length ? Math.round(inT.filter(r => r.stage === 'Accepted' || r.stage === 'Admitted').length / inT.length * 100) : 0
    pairs.push(t.id, ramp(conv))
  }
  return ['match', ['get', 'territoryId'], ...pairs, '#e5e7eb']
}
const REL_HEX: Record<string, string> = { current: '#2563eb', growth: '#0d9488', prospect: '#7c3aed', at_risk: '#dc2626' }
const REL_LABEL: Record<string, string> = { current: 'Current', growth: 'Growth', prospect: 'Prospect', at_risk: 'At risk' }
function freshHex(a: Account) { return a.visitFresh === 'fresh' ? '#1f2937' : a.visitFresh === 'aging' ? '#d97706' : '#dc2626' }
function radiusFor(a: Account) { return a.opportunityBand === 'high' ? 9 : a.opportunityBand === 'medium' ? 7 : 5 }

// ---- GeoJSON builders (depend on applied state) ----
// Territory features carry TWO visual dimensions: fill = health (status), outline = rep identity.
function territoriesFC(applied: boolean): GeoJSONFC {
  return territoriesGeoJSON(id => {
    const t = territoryById(id)!
    const status = statusFor(t, applied)
    const m = applied ? t.optimized : t.baseline
    return {
      territoryName: t.name, status, color: STATUS_HEX[status],
      repColor: repById(t.repId)?.color ?? '#334155',
      repName: repById(t.repId)?.name ?? '',
      coverage: m.priorityCoveragePct,
    }
  })
}
function territoryLabelsFC(applied: boolean): GeoJSONFC {
  const labels = labelPoints()
  return {
    type: 'FeatureCollection',
    features: TERRITORIES.map(t => {
      const m = applied ? t.optimized : t.baseline
      const rep = repById(t.repId)?.name ?? ''
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point', coordinates: labels[t.id] },
        properties: {
          territoryId: t.id,
          name: t.name,
          detail: `${rep} · ${m.priorityCoveragePct}% covered`,
        },
      }
    }),
  }
}
function accountsFC(list: Account[], applied: boolean): GeoJSONFC {
  return {
    type: 'FeatureCollection',
    features: list.map(a => {
      const covered = accountCovered(a, applied)
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point', coordinates: [a.lng, a.lat] },
        properties: {
          accountId: a.id, name: a.name, covered, priority: a.priority, isPriority: a.isPriority,
          relColor: REL_HEX[a.relationshipStatus], strokeColor: covered ? freshHex(a) : '#dc2626',
          radius: radiusFor(a), opp: a.opportunityScore, referralActive: a.referralActive,
          facilityType: a.facilityType, rep: repById(effectiveRepId(a, applied))?.name ?? '',
          rel: a.relationshipStatus, growth: a.relationshipStatus === 'growth' || a.whitespace.length > 0 ? 1 : 0,
          lastContactDays: a.lastContactDays, oppTier: a.oppTier, stale: a.visitFresh === 'stale',
          // simulated pipeline value (deterministic from opportunity score)
          pipeline: Math.round(a.opportunityScore * 3.2) * 1000,
        },
      }
    }),
  }
}

// which rep is "focused" for route / isochrone overlays
function focusRep(repFilter: string, selectedTerritoryId: string | null): string {
  if (repFilter !== 'all') return repFilter
  if (selectedTerritoryId) return territoryById(selectedTerritoryId)?.repId ?? 'r-jordan'
  return 'r-jordan'
}
function routeForRep(repId: string, applied: boolean): [number, number][] {
  const accts = ACCOUNTS.filter(a => effectiveRepId(a, applied) === repId && a.isPriority)
    .sort((x, y) => y.lat - x.lat).slice(0, 6)
  return [REP_HOME[repId], ...accts.map(a => [a.lng, a.lat] as [number, number])]
}

interface Layers { uncovered: boolean; route: boolean; isochrone: boolean; heatmap: boolean; referralFlow: boolean }

// Four executive preset views instead of a long checkbox list. Each preset is a
// curated combination of overlays that tells one story.
type Preset = 'coverage' | 'growth' | 'referrals' | 'today'
const PRESETS: { id: Preset; label: string; hint: string; layers: Layers }[] = [
  { id: 'coverage', label: 'Coverage', hint: 'Territory health, priority accounts & capacity', layers: { uncovered: true, route: false, isochrone: false, heatmap: false, referralFlow: false } },
  { id: 'growth', label: 'Growth', hint: 'Opportunity heatmap & whitespace', layers: { uncovered: false, route: false, isochrone: false, heatmap: true, referralFlow: false } },
  { id: 'referrals', label: 'Referrals', hint: 'Referral sources, flows & conversion', layers: { uncovered: false, route: false, isochrone: false, heatmap: false, referralFlow: true } },
  { id: 'today', label: 'Today', hint: 'Rep routes & drive-time coverage', layers: { uncovered: false, route: true, isochrone: true, heatmap: false, referralFlow: false } },
]

export function TerritoryMapMapbox({ token, onFail }: { token: string; onFail?: () => void }) {
  const s = useStore()
  const applied = s.optimizationApplied
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [preset, setPreset] = useState<Preset>('coverage')
  const [layers, setLayers] = useState<Layers>(PRESETS[0].layers)
  const [zoom, setZoom] = useState(10.4)
  const [legendOpen, setLegendOpen] = useState(false)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const appliedRef = useRef(applied)
  appliedRef.current = applied
  const sRef = useRef(s)
  sRef.current = s

  // init once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapboxgl.accessToken = token
    let map: mapboxgl.Map
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: RICHMOND_CENTER,
        zoom: 10.4,
        pitch: 30, // gentle 3D
        bearing: -6,
        cooperativeGestures: false,
      })
    } catch {
      setFailed(true); onFail?.(); return
    }
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new mapboxgl.FullscreenControl(), 'top-right')
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 90, unit: 'imperial' }), 'bottom-left')
    // Fall back gracefully if the style never loads. Generous window so a cold start or Vite
    // dependency (re)optimization isn't mistaken for a failure; a real auth error trips it early.
    let setupDone = false
    const failTimer = setTimeout(() => { if (!setupDone) { setFailed(true); onFail?.() } }, 15000)
    map.on('error', (e: any) => {
      const status = e?.error?.status
      if (!setupDone && (status === 401 || status === 403 || status === 404)) { setFailed(true); onFail?.() }
    })

    // Add sources/layers as soon as the style is parsed — GeoJSON territories/points/overlays render
    // locally via WebGL and do NOT require basemap tiles, so the dashboard map works even if tiles are
    // slow or blocked. We attempt on every load/styledata and retry-on-throw rather than gating on
    // isStyleLoaded() (unreliable with mapbox-gl v3's standard-style pipeline).
    const setup = () => {
      if (setupDone) return
      try {
        map.addSource('territories', { type: 'geojson', data: territoriesFC(applied) as any })
      } catch { return } // style not ready yet — the next styledata will retry
      setupDone = true
      clearTimeout(failTimer)
      map.fitBounds(RICHMOND_BOUNDS, { padding: 30, duration: 0 })

      map.addSource('territory-labels', { type: 'geojson', data: territoryLabelsFC(applied) as any })
      map.addSource('accounts', {
        type: 'geojson', data: accountsFC(ACCOUNTS, applied) as any, cluster: true, clusterRadius: 42, clusterMaxZoom: 12,
        // native per-cluster aggregates — lets cluster PAINT (ring color, badge) reflect what's
        // inside without an async leaves fetch (that's still used for the hover card's exact counts/$)
        clusterProperties: {
          uncoveredCount: ['+', ['case', ['all', ['==', ['get', 'isPriority'], true], ['==', ['get', 'covered'], false]], 1, 0]],
          staleCount: ['+', ['case', ['==', ['get', 'stale'], true], 1, 0]],
          referralCount: ['+', ['case', ['==', ['get', 'referralActive'], true], 1, 0]],
        } as any,
      })
      map.addSource('accounts-raw', { type: 'geojson', data: accountsFC(ACCOUNTS, applied) as any }) // unclustered, for heatmap
      map.addSource('iso', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as any })
      map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as any })
      map.addSource('pulse', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as any })
      map.addSource('flow', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as any })
      map.addSource('flow-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as any })

      // isochrone (drawn under everything)
      map.addLayer({ id: 'iso-fill', type: 'fill', source: 'iso', paint: { 'fill-color': '#0d5c63', 'fill-opacity': ['interpolate', ['linear'], ['get', 'minutes'], 30, 0.22, 60, 0.08] } })
      map.addLayer({ id: 'iso-line', type: 'line', source: 'iso', paint: { 'line-color': '#0d5c63', 'line-width': 1, 'line-opacity': 0.5 } })

      // territory polygons (smooth recolor/opacity transitions for the optimize animation)
      // FILL = health (subtle). OUTLINE = rep identity (each rep a distinct color).
      map.addLayer({ id: 'territory-fill', type: 'fill', source: 'territories', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22, 'fill-color-transition': { duration: 600 } as any, 'fill-opacity-transition': { duration: 600 } as any } })
      map.addLayer({ id: 'territory-outline', type: 'line', source: 'territories', paint: { 'line-color': ['get', 'repColor'], 'line-width': 2.4, 'line-opacity': 0.9, 'line-width-transition': { duration: 400 } as any } })
      map.addLayer({ id: 'territory-selected', type: 'line', source: 'territories', filter: ['==', ['get', 'territoryId'], '__none__'], paint: { 'line-color': ['get', 'repColor'], 'line-width': 4.5 } })

      // route line
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#1d4ed8', 'line-width': 2.5, 'line-dasharray': [2, 1] } })
      // §13 referral flow lines (source → service location), colored by status, width by volume
      map.addLayer({ id: 'flow-line', type: 'line', source: 'flow', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': 0.75 } })
      map.addLayer({ id: 'flow-src-pt', type: 'circle', source: 'flow-src', paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 3 } })

      // clusters — size still = account count; a RING now encodes the most urgent thing
      // inside (red = uncovered priority present, amber = overdue/stale accounts present,
      // green = neither) so a manager reads risk before ever hovering.
      const CLUSTER_URGENCY_RING: any = [
        'case',
        ['>', ['get', 'uncoveredCount'], 0], '#dc2626',
        ['>', ['get', 'staleCount'], 0], '#d99a22',
        '#16a34a',
      ]
      map.addLayer({
        id: 'clusters', type: 'circle', source: 'accounts', filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#1b3a4b', 'circle-opacity': 0.88,
          'circle-radius': ['step', ['get', 'point_count'], 15, 5, 20, 10, 26],
          'circle-stroke-width': 3, 'circle-stroke-color': CLUSTER_URGENCY_RING, 'circle-stroke-opacity': 0.95,
        },
      })
      map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'accounts', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'] }, paint: { 'text-color': '#fff' } })
      // small badge for "active referral(s) inside" — the one positive signal worth a glance
      map.addLayer({
        id: 'cluster-referral-badge', type: 'circle', source: 'accounts',
        filter: ['all', ['has', 'point_count'], ['>', ['get', 'referralCount'], 0]],
        paint: {
          'circle-radius': 6, 'circle-color': '#0d9488', 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff',
          'circle-translate': ['literal', [14, -14]], 'circle-translate-anchor': 'viewport',
        },
      })
      map.addLayer({
        id: 'cluster-referral-badge-ic', type: 'symbol', source: 'accounts',
        filter: ['all', ['has', 'point_count'], ['>', ['get', 'referralCount'], 0]],
        layout: {
          'text-field': '+', 'text-size': 10, 'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
          'text-offset': [0, 0], 'text-anchor': 'center', 'text-allow-overlap': true, 'text-ignore-placement': true,
        },
        paint: { 'text-color': '#fff', 'text-translate': ['literal', [14, -14]], 'text-translate-anchor': 'viewport' } as any,
      })

      // unclustered account points
      map.addLayer({
        id: 'account-points', type: 'circle', source: 'accounts', filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['get', 'radius'],
          'circle-color': ['get', 'relColor'],
          'circle-stroke-color': ['get', 'strokeColor'],
          'circle-stroke-width': 2,
          'circle-opacity': 0.92,
        },
      })
      // active-referral halo (under the points)
      map.addLayer({
        id: 'referral-halo', type: 'circle', source: 'accounts',
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'referralActive'], true]],
        paint: { 'circle-radius': ['+', ['get', 'radius'], 6], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#0d9488', 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.7 },
      }, 'account-points')
      // selected-account focus ring (under the points)
      map.addLayer({
        id: 'account-focus', type: 'circle', source: 'accounts',
        filter: ['==', ['get', 'accountId'], '__none__'],
        paint: { 'circle-radius': ['+', ['get', 'radius'], 9], 'circle-color': 'rgba(27,90,168,.12)', 'circle-stroke-color': '#1b5aa8', 'circle-stroke-width': 3 },
      }, 'account-points')
      // opportunity heatmap (hidden by default; toggled via Layers)
      map.addLayer({
        id: 'opp-heat', type: 'heatmap', source: 'accounts-raw',
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'opp'], 0, 0.1, 100, 1],
          'heatmap-intensity': 1.1,
          'heatmap-radius': 38,
          'heatmap-opacity': 0.75,
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)', 0.2, '#dbeafe', 0.45, '#60a5fa', 0.7, '#2563eb', 1, '#1e3a8a'],
        },
      }, 'territory-fill')
      // optimize pulse ring (animated on Apply)
      map.addLayer({
        id: 'pulse-ring', type: 'circle', source: 'pulse',
        paint: { 'circle-radius': 6, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#1b5aa8', 'circle-stroke-width': 3, 'circle-stroke-opacity': 0.9 },
      }, 'account-points')
      // uncovered-priority emphasis (hidden by default)
      map.addLayer({
        id: 'uncovered-priority', type: 'circle', source: 'accounts',
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'covered'], false], ['==', ['get', 'isPriority'], true]],
        layout: { visibility: 'none' },
        paint: { 'circle-radius': ['+', ['get', 'radius'], 4], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#dc2626', 'circle-stroke-width': 3 },
      })

      // account labels — only the accounts worth naming at a glance (Tier 1, uncovered
      // priority, or an active referral source); everything else stays a plain dot even
      // fully zoomed in, so the map never turns into wall-to-wall text.
      map.addLayer({
        id: 'account-label', type: 'symbol', source: 'accounts', minzoom: 12.5,
        filter: ['all', ['!', ['has', 'point_count']],
          ['any', ['==', ['get', 'oppTier'], 'Tier 1'], ['==', ['get', 'referralActive'], true],
            ['all', ['==', ['get', 'isPriority'], true], ['==', ['get', 'covered'], false]]]],
        layout: {
          'text-field': ['get', 'name'], 'text-size': 11, 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-allow-overlap': false, 'text-optional': true,
        },
        paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
      })

      // territory labels — name always; rep + coverage detail appears from zoom 11 up
      map.addLayer({
        id: 'territory-label', type: 'symbol', source: 'territory-labels',
        layout: {
          'text-field': ['step', ['zoom'], ['get', 'name'], 10, ['format', ['get', 'name'], { 'font-scale': 1.0 }, '\n', {}, ['get', 'detail'], { 'font-scale': 0.82 }]],
          'text-size': 13, 'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'], 'text-line-height': 1.3, 'text-allow-overlap': false,
        },
        paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 2.2 },
      })

      // interactions
      map.on('click', 'territory-fill', e => {
        const f = e.features?.[0]; if (f) actions.selectTerritory(f.properties!.territoryId)
      })
      const clickPopup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true, offset: 12, maxWidth: '260px' })
      map.on('click', 'account-points', e => {
        const f = e.features?.[0]; if (!f) return
        const p = f.properties!
        const html = `<div class="mp-acct">
          <b>${p.name}</b>
          <div class="mp-sub">${p.facilityType} · ${p.priority} priority</div>
          <div class="mp-kv"><span>Owner</span>${p.rep}</div>
          <div class="mp-kv"><span>Coverage</span>${p.covered ? 'Covered' : '<span style="color:#dc2626">Uncovered</span>'}</div>
          <div class="mp-kv"><span>Opportunity</span>${p.opp}</div>
          ${p.referralActive ? '<div class="mp-tag">● Active referral</div>' : ''}
          <button class="mp-open" type="button">Open account →</button>
        </div>`
        clickPopup.setLngLat((f.geometry as any).coordinates).setHTML(html).addTo(map)
        const btn = clickPopup.getElement()?.querySelector('.mp-open') as HTMLButtonElement | null
        if (btn) btn.onclick = () => { const id = p.accountId; clickPopup.remove(); actions.openAccount(id) }
      })
      map.on('click', 'clusters', async e => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0]
        if (!f) return
        const center = (f.geometry as any).coordinates as [number, number]
        const src = map.getSource('accounts') as any // v3 returns a Promise; older versions use a callback
        try {
          const zoom = await src.getClusterExpansionZoom(f.properties!.cluster_id)
          map.easeTo({ center, zoom: (zoom ?? map.getZoom() + 1.5) + 0.3 })
        } catch {
          map.easeTo({ center, zoom: map.getZoom() + 1.6 })
        }
      })
      // Rich cluster hover — an executive sees WHY a cluster matters, not just a count.
      const clusterPop = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12, maxWidth: '240px' })
      const leavesOf = (src: any, id: number, count: number): Promise<any[]> =>
        new Promise(resolve => {
          try {
            const p = src.getClusterLeaves(id, count, 0, (err: any, leaves: any[]) => resolve(err ? [] : leaves))
            if (p && typeof p.then === 'function') p.then((l: any[]) => resolve(l ?? [])).catch(() => resolve([]))
          } catch { resolve([]) }
        })
      map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; clusterPop.remove() })
      map.on('mousemove', 'clusters', async e => {
        const f = e.features?.[0]; if (!f) return
        const count = f.properties!.point_count as number
        const src = map.getSource('accounts') as any
        const leaves = await leavesOf(src, f.properties!.cluster_id, count)
        if (!leaves.length) return
        const pr = (k: string) => leaves.filter(l => l.properties[k]).length
        const priority = leaves.filter(l => l.properties.isPriority).length
        const uncovered = leaves.filter(l => !l.properties.covered).length
        const growth = leaves.filter(l => l.properties.growth).length
        const referrals = pr('referralActive')
        const pipeline = leaves.reduce((sum, l) => sum + (l.properties.pipeline || 0), 0)
        const money = pipeline >= 1e6 ? `$${(pipeline / 1e6).toFixed(1)}M` : `$${Math.round(pipeline / 1000)}K`
        const row = (v: number, label: string, cls = '') => v ? `<div class="mp-cl-row ${cls}"><b>${v}</b> ${label}</div>` : ''
        clusterPop.setLngLat((f.geometry as any).coordinates).setHTML(
          `<div class="mp-cl"><div class="mp-cl-h">${count} accounts</div>`
          + row(priority, 'priority accounts')
          + row(uncovered, 'uncovered', 'warn')
          + row(growth, 'growth opportunities')
          + row(referrals, 'active referrals')
          + `<div class="mp-cl-pipe">${money} simulated pipeline</div>`
          + `<div class="mp-cl-hint">Click to expand</div></div>`,
        ).addTo(map)
      })

      // hover popovers
      const hover = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 8 })
      popupRef.current = hover
      // §13 referral flow hover
      map.on('mouseenter', 'flow-src-pt', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mousemove', 'flow-src-pt', e => {
        const f = e.features?.[0]; if (!f) return
        hover.setLngLat(e.lngLat).setHTML(`<div class="mp"><b>${f.properties!.name}</b>Referral source · hover a flow line for status</div>`).addTo(map)
      })
      map.on('mouseleave', 'flow-src-pt', () => { map.getCanvas().style.cursor = ''; hover.remove() })
      map.on('mousemove', 'flow-line', e => {
        const f = e.features?.[0]; if (!f) return
        hover.setLngLat(e.lngLat).setHTML(`<div class="mp"><b>${f.properties!.name}</b>${f.properties!.volume}/mo referrals · ${f.properties!.status}</div>`).addTo(map)
      })
      map.on('mouseleave', 'flow-line', () => { hover.remove() })
      map.on('mouseenter', 'territory-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mousemove', 'territory-fill', e => {
        const f = e.features?.[0]; if (!f) return
        const t = territoryById(f.properties!.territoryId)!; const m = appliedRef.current ? t.optimized : t.baseline
        const status = f.properties!.status as string
        // "main issue" — the same manager-exception data already shown in the Insights
        // panel, so the hover card and the insights list never disagree about what's wrong.
        const topIssue = insights(sRef.current).find(i => i.territoryId === t.id)
        const issueLine = topIssue
          ? topIssue.headline
          : m.uncoveredPriority > 0
            ? `${m.uncoveredPriority} overdue priority account${m.uncoveredPriority > 1 ? 's' : ''}`
            : 'None — on track'
        hover.setLngLat(e.lngLat).setHTML(
          `<div class="mp mp-terr">
            <div class="mp-terr-h">${t.name} · ${repById(t.repId)?.name}</div>
            <div>${status} · ${m.priorityCoveragePct}% priority coverage</div>
            <div>${m.capacityPct}% capacity</div>
            <div class="mp-terr-issue${topIssue || m.uncoveredPriority > 0 ? ' warn' : ''}">Main issue: ${issueLine}</div>
          </div>`,
        ).addTo(map)
      })
      map.on('mouseleave', 'territory-fill', () => { map.getCanvas().style.cursor = ''; hover.remove() })
      map.on('mouseenter', 'account-points', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mousemove', 'account-points', e => {
        const f = e.features?.[0]; if (!f) return
        const p = f.properties!
        hover.setLngLat(e.lngLat).setHTML(
          `<div class="mp mp-acct-hover">
            <b>${p.name}</b>
            <div>${p.facilityType} · ${REL_LABEL[p.rel] ?? p.rel}</div>
            <div>Opportunity ${p.opp} · ${p.lastContactDays}d since contact</div>
            ${p.referralActive ? '<div class="mp-tag">● Active referral</div>' : ''}
          </div>`,
        ).addTo(map)
      })
      map.on('mouseleave', 'account-points', () => { map.getCanvas().style.cursor = ''; hover.remove() })

      map.on('zoom', () => setZoom(map.getZoom()))

      // reduce basemap POI/transit noise for a cleaner management view
      try {
        for (const layer of map.getStyle().layers ?? []) {
          if (/poi|transit|natural-point|airport|road-label-small/.test(layer.id)) {
            map.setLayoutProperty(layer.id, 'visibility', 'none')
          }
        }
      } catch { /* style variant without these layers */ }

      setReady(true)
    }
    map.on('load', setup)
    map.on('styledata', setup)

    return () => { clearTimeout(failTimer); map.remove(); mapRef.current = null; setReady(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // update data + cross-filter styling when applied / selection / KPI / insight changes
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return
    const selId = s.selectedTerritoryId
    const repFilter = s.filters.repId
    const kpi = s.selectedKpi
    const insight = insights(s).find(i => i.id === s.selectedInsightId)
    const hlIds = insight?.accountIds ?? []

    // account list (territory / rep filter)
    let list = ACCOUNTS
    if (repFilter !== 'all') list = list.filter(a => effectiveRepId(a, applied) === repFilter)
    if (selId) list = list.filter(a => effectiveTerritoryId(a, applied) === selId)
      ; (map.getSource('territories') as mapboxgl.GeoJSONSource)?.setData(territoriesFC(applied) as any)
      ; (map.getSource('territory-labels') as mapboxgl.GeoJSONSource)?.setData(territoryLabelsFC(applied) as any)
      ; (map.getSource('accounts') as mapboxgl.GeoJSONSource)?.setData(accountsFC(list, applied) as any)
      ; (map.getSource('accounts-raw') as mapboxgl.GeoJSONSource)?.setData(accountsFC(list, applied) as any)

    map.setFilter('territory-selected', ['==', ['get', 'territoryId'], selId ?? '__none__'])

    // territory fill: conversion choropleth, at-risk emphasis, selection dim, or base health
    if (kpi === 'conversion') {
      map.setPaintProperty('territory-fill', 'fill-color', conversionColorExpr(s.referrals))
      map.setPaintProperty('territory-fill', 'fill-opacity', 0.42)
    } else {
      map.setPaintProperty('territory-fill', 'fill-color', ['get', 'color'])
      if (kpi === 'atRisk') {
        map.setPaintProperty('territory-fill', 'fill-opacity', ['match', ['get', 'status'], 'Healthy', 0.07, 0.42])
      } else if (selId) {
        // selected territory brightens; the rest fade to ~20-30% (never fully flat, still readable)
        map.setPaintProperty('territory-fill', 'fill-opacity', ['case', ['==', ['get', 'territoryId'], selId], 0.48, 0.24])
      } else {
        // at rest, keep the whole market legible but quiet — problem territories don't need
        // help standing out yet (Watch/At Risk already read via their own fill color)
        map.setPaintProperty('territory-fill', 'fill-opacity', 0.18)
      }
    }

    // uncovered-priority emphasis: Layers toggle OR coverage KPI
    const showUncovered = layers.uncovered || kpi === 'coverage' || kpi === 'priorityCovered'
    map.setLayoutProperty('uncovered-priority', 'visibility', showUncovered ? 'visible' : 'none')

    // dim covered points when a coverage KPI is active
    const dimCovered = kpi === 'coverage' || kpi === 'priorityCovered'
    map.setPaintProperty('account-points', 'circle-opacity', dimCovered ? ['case', ['==', ['get', 'covered'], true], 0.22, 1] : 0.92)

    // focus ring on insight-highlighted accounts
    map.setFilter('account-focus', hlIds.length ? ['in', ['get', 'accountId'], ['literal', hlIds]] : ['==', ['get', 'accountId'], '__none__'])
  }, [applied, s.selectedTerritoryId, s.filters.repId, s.selectedKpi, s.selectedInsightId, s.referrals, layers.uncovered, ready])

  // overlays
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return
    const rep = focusRep(s.filters.repId, s.selectedTerritoryId)
    map.setLayoutProperty('opp-heat', 'visibility', layers.heatmap ? 'visible' : 'none')
      ; (map.getSource('flow') as mapboxgl.GeoJSONSource)?.setData((layers.referralFlow ? referralFlowFC() : { type: 'FeatureCollection', features: [] }) as any)
      ; (map.getSource('flow-src') as mapboxgl.GeoJSONSource)?.setData((layers.referralFlow ? referralSourceFC() : { type: 'FeatureCollection', features: [] }) as any)
      ; (map.getSource('iso') as mapboxgl.GeoJSONSource)?.setData(
        (layers.isochrone ? isochroneFC(REP_HOME[rep], rep.charCodeAt(2)) : { type: 'FeatureCollection', features: [] }) as any,
      )
      ; (map.getSource('route') as mapboxgl.GeoJSONSource)?.setData(
        (layers.route ? routeLineFC(routeForRep(rep, applied)) : { type: 'FeatureCollection', features: [] }) as any,
      )
  }, [layers, s.filters.repId, s.selectedTerritoryId, applied, ready])

  // optimize animation: pulse affected accounts + ease camera when Apply flips false→true
  const prevApplied = useRef(applied)
  useEffect(() => {
    const map = mapRef.current
    const was = prevApplied.current
    prevApplied.current = applied
    if (!map || !ready || was === applied || !applied) return

    const affected = ACCOUNTS.filter(a => a.id === ELMINGTON_ID || (!a.covered && accountCovered(a, true)))
    const src = map.getSource('pulse') as mapboxgl.GeoJSONSource | undefined
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: affected.map(a => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [a.lng, a.lat] }, properties: {} })),
    } as any)
    map.easeTo({ padding: { top: 20, bottom: 20, left: 20, right: 20 }, duration: 700 })

    let raf = 0
    const start = performance.now()
    const DUR = 1500
    const tick = (now: number) => {
      const elapsed = now - start
      const cyc = (elapsed % 750) / 750 // two ~0.75s pulses
      map.setPaintProperty('pulse-ring', 'circle-radius', 6 + cyc * 26)
      map.setPaintProperty('pulse-ring', 'circle-stroke-opacity', 0.9 * (1 - cyc))
      if (elapsed < DUR) raf = requestAnimationFrame(tick)
      else src.setData({ type: 'FeatureCollection', features: [] } as any)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [applied, ready])

  // smooth fly-to a selected territory; fit the whole market when cleared
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return
    const selId = s.selectedTerritoryId
    if (selId && TERRITORY_POLYGONS[selId]) {
      const ring = TERRITORY_POLYGONS[selId]
      const lngs = ring.map(p => p[0]); const lats = ring.map(p => p[1])
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 70, duration: 850, maxZoom: 12.5 })
    } else {
      map.fitBounds(RICHMOND_BOUNDS, { padding: 30, duration: 850 })
    }
  }, [s.selectedTerritoryId, ready])

  if (failed) return null // parent will show fallback

  return (
    <div className="map-wrap" style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ height: 560, width: '100%' }} />
      <div className="map-presets" role="tablist" aria-label="Map view">
        {PRESETS.map(p => (
          <button key={p.id} role="tab" aria-selected={preset === p.id}
            className={'preset-tab' + (preset === p.id ? ' on' : '')}
            title={p.hint}
            onClick={() => { setPreset(p.id); setLayers(p.layers) }}>{p.label}</button>
        ))}
        <span className="preset-hint">{PRESETS.find(p => p.id === preset)!.hint}</span>
      </div>
      <div className={'map-legend-wrap' + (legendOpen ? ' open' : '')}>
        <button className="map-legend-toggle" onClick={() => setLegendOpen(o => !o)} aria-expanded={legendOpen}>
          {legendOpen ? '▾' : '▸'} Legend
        </button>
        {legendOpen && (
          <div className="map-legend">
            <span className="lg lg-head">Territory fill</span>
            <span className="lg"><span className="legend-sw" style={{ background: '#2E7D5B' }} /> Healthy</span>
            <span className="lg"><span className="legend-sw" style={{ background: '#D99A22' }} /> Watch</span>
            <span className="lg"><span className="legend-sw" style={{ background: '#C74634' }} /> At Risk</span>
            <span className="lg lg-head" style={{ marginLeft: 6 }}>Outline = rep</span>
            {REPS.filter(r => r.territoryId).map(r => (
              <span className="lg" key={r.id}><span className="legend-line" style={{ background: r.color }} /> {r.name.split(' ')[0]}</span>
            ))}
            {zoom < 12 && (
              <>
                <span className="lg lg-head" style={{ marginLeft: 6 }}>Cluster ring</span>
                <span className="lg"><span className="legend-sw" style={{ background: '#dc2626' }} /> Uncovered priority inside</span>
                <span className="lg"><span className="legend-sw" style={{ background: '#d99a22' }} /> Overdue accounts inside</span>
                <span className="lg"><span className="legend-sw" style={{ background: '#16a34a' }} /> Healthy</span>
                <span className="lg"><span className="legend-sw" style={{ background: '#0d9488', borderRadius: '50%' }} /> + active referral</span>
              </>
            )}
            <span className="lg muted">Dot size = opportunity · click a territory to drill in</span>
          </div>
        )}
      </div>
    </div>
  )
}
