import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useStore, actions } from '../store'
import { TERRITORIES, REPS, ACCOUNTS } from '../seed'
import {
  RICHMOND_CENTER, RICHMOND_BOUNDS, REP_HOME, labelPoints,
  isochroneFC, routeLineFC, territoriesGeoJSON, type GeoJSONFC,
} from '../geo'
import { statusFor, accountCovered, effectiveTerritoryId, effectiveRepId, repById, territoryById } from '../selectors'
import type { Account } from '../types'

const STATUS_HEX: Record<string, string> = { Healthy: '#2E7D5B', Watch: '#D99A22', 'At Risk': '#C74634' }
const REL_HEX: Record<string, string> = { current: '#2563eb', growth: '#0d9488', prospect: '#7c3aed', at_risk: '#dc2626' }
function freshHex(a: Account) { return a.visitFresh === 'fresh' ? '#1f2937' : a.visitFresh === 'aging' ? '#d97706' : '#dc2626' }
function radiusFor(a: Account) { return a.opportunityBand === 'high' ? 9 : a.opportunityBand === 'medium' ? 7 : 5 }

// ---- GeoJSON builders (depend on applied state) ----
function territoriesFC(applied: boolean): GeoJSONFC {
  return territoriesGeoJSON(id => {
    const t = territoryById(id)!
    const status = statusFor(t, applied)
    return { territoryName: t.name, status, color: STATUS_HEX[status] }
  })
}
function territoryLabelsFC(applied: boolean): GeoJSONFC {
  const labels = labelPoints()
  return {
    type: 'FeatureCollection',
    features: TERRITORIES.map(t => {
      const status = statusFor(t, applied)
      const surname = (repById(t.repId)?.name ?? '').split(' ').slice(-1)[0]
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point', coordinates: labels[t.id] },
        properties: { territoryId: t.id, label: `${t.short}\n${surname} · ${status}` },
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
          radius: radiusFor(a), opp: a.opportunityScore,
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

interface Layers { uncovered: boolean; route: boolean; isochrone: boolean }

export function TerritoryMapMapbox({ token, onFail }: { token: string; onFail?: () => void }) {
  const s = useStore()
  const applied = s.optimizationApplied
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [layers, setLayers] = useState<Layers>({ uncovered: false, route: false, isochrone: false })
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const appliedRef = useRef(applied)
  appliedRef.current = applied

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
        cooperativeGestures: false,
      })
    } catch {
      setFailed(true); onFail?.(); return
    }
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
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
      map.addSource('accounts', { type: 'geojson', data: accountsFC(ACCOUNTS, applied) as any, cluster: true, clusterRadius: 42, clusterMaxZoom: 12 })
      map.addSource('iso', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as any })
      map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as any })

      // isochrone (drawn under everything)
      map.addLayer({ id: 'iso-fill', type: 'fill', source: 'iso', paint: { 'fill-color': '#0d5c63', 'fill-opacity': ['interpolate', ['linear'], ['get', 'minutes'], 30, 0.22, 60, 0.08] } })
      map.addLayer({ id: 'iso-line', type: 'line', source: 'iso', paint: { 'line-color': '#0d5c63', 'line-width': 1, 'line-opacity': 0.5 } })

      // territory polygons
      map.addLayer({ id: 'territory-fill', type: 'fill', source: 'territories', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.34 } })
      map.addLayer({ id: 'territory-outline', type: 'line', source: 'territories', paint: { 'line-color': '#334155', 'line-width': 1.5 } })
      map.addLayer({ id: 'territory-selected', type: 'line', source: 'territories', filter: ['==', ['get', 'territoryId'], '__none__'], paint: { 'line-color': '#0f172a', 'line-width': 3 } })

      // route line
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#1d4ed8', 'line-width': 2.5, 'line-dasharray': [2, 1] } })

      // clusters
      map.addLayer({ id: 'clusters', type: 'circle', source: 'accounts', filter: ['has', 'point_count'], paint: { 'circle-color': '#0d5c63', 'circle-opacity': 0.85, 'circle-radius': ['step', ['get', 'point_count'], 15, 5, 20, 10, 26] } })
      map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'accounts', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'] }, paint: { 'text-color': '#fff' } })

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
      // uncovered-priority emphasis (hidden by default)
      map.addLayer({
        id: 'uncovered-priority', type: 'circle', source: 'accounts',
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'covered'], false], ['==', ['get', 'isPriority'], true]],
        layout: { visibility: 'none' },
        paint: { 'circle-radius': ['+', ['get', 'radius'], 4], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#dc2626', 'circle-stroke-width': 3 },
      })

      // territory labels
      map.addLayer({
        id: 'territory-label', type: 'symbol', source: 'territory-labels',
        layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'], 'text-line-height': 1.2, 'text-allow-overlap': false },
        paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
      })

      // interactions
      map.on('click', 'territory-fill', e => {
        const f = e.features?.[0]; if (f) actions.selectTerritory(f.properties!.territoryId)
      })
      map.on('click', 'account-points', e => {
        const f = e.features?.[0]; if (f) actions.openAccount(f.properties!.accountId)
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

      // hover popovers
      const hover = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 8 })
      popupRef.current = hover
      map.on('mouseenter', 'territory-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mousemove', 'territory-fill', e => {
        const f = e.features?.[0]; if (!f) return
        const t = territoryById(f.properties!.territoryId)!; const m = appliedRef.current ? t.optimized : t.baseline
        hover.setLngLat(e.lngLat).setHTML(
          `<div class="mp"><b>${t.name}</b>${repById(t.repId)?.name} · ${f.properties!.status}<br/>coverage ${m.priorityCoveragePct}% · ${m.visitsCompleted}/${m.visitsTarget} visits · cap ${m.capacityPct}%</div>`,
        ).addTo(map)
      })
      map.on('mouseleave', 'territory-fill', () => { map.getCanvas().style.cursor = ''; hover.remove() })
      map.on('mouseenter', 'account-points', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mousemove', 'account-points', e => {
        const f = e.features?.[0]; if (!f) return
        hover.setLngLat(e.lngLat).setHTML(
          `<div class="mp"><b>${f.properties!.name}</b>${f.properties!.priority} priority · ${f.properties!.covered ? 'covered' : 'uncovered'} · opp ${f.properties!.opp}</div>`,
        ).addTo(map)
      })
      map.on('mouseleave', 'account-points', () => { map.getCanvas().style.cursor = ''; hover.remove() })

      setReady(true)
    }
    map.on('load', setup)
    map.on('styledata', setup)

    return () => { clearTimeout(failTimer); map.remove(); mapRef.current = null; setReady(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // update data + styling when applied / selection changes
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return
    const selId = s.selectedTerritoryId
    const repFilter = s.filters.repId
    // filter accounts by selection / rep
    let list = ACCOUNTS
    if (repFilter !== 'all') list = list.filter(a => effectiveRepId(a, applied) === repFilter)
    if (selId) list = list.filter(a => effectiveTerritoryId(a, applied) === selId)
      ; (map.getSource('territories') as mapboxgl.GeoJSONSource)?.setData(territoriesFC(applied) as any)
      ; (map.getSource('territory-labels') as mapboxgl.GeoJSONSource)?.setData(territoryLabelsFC(applied) as any)
      ; (map.getSource('accounts') as mapboxgl.GeoJSONSource)?.setData(accountsFC(list, applied) as any)
    map.setFilter('territory-selected', ['==', ['get', 'territoryId'], selId ?? '__none__'])
    map.setPaintProperty('territory-fill', 'fill-opacity', selId ? ['case', ['==', ['get', 'territoryId'], selId], 0.56, 0.14] : 0.34)
  }, [applied, s.selectedTerritoryId, s.filters.repId, ready])

  // overlays
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return
    const rep = focusRep(s.filters.repId, s.selectedTerritoryId)
    map.setLayoutProperty('uncovered-priority', 'visibility', layers.uncovered ? 'visible' : 'none')
      ; (map.getSource('iso') as mapboxgl.GeoJSONSource)?.setData(
        (layers.isochrone ? isochroneFC(REP_HOME[rep], rep.charCodeAt(2)) : { type: 'FeatureCollection', features: [] }) as any,
      )
      ; (map.getSource('route') as mapboxgl.GeoJSONSource)?.setData(
        (layers.route ? routeLineFC(routeForRep(rep, applied)) : { type: 'FeatureCollection', features: [] }) as any,
      )
  }, [layers, s.filters.repId, s.selectedTerritoryId, applied, ready])

  if (failed) return null // parent will show fallback

  const focused = repById(focusRep(s.filters.repId, s.selectedTerritoryId))

  return (
    <div className="map-wrap" style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ height: 460, width: '100%' }} />
      <div className="layers-control">
        <div className="lc-title">Layers</div>
        <label><input type="checkbox" checked={layers.uncovered} onChange={e => setLayers(l => ({ ...l, uncovered: e.target.checked }))} /> Uncovered priority</label>
        <label><input type="checkbox" checked={layers.route} onChange={e => setLayers(l => ({ ...l, route: e.target.checked }))} /> Rep route <span className="muted">({focused?.initials})</span></label>
        <label><input type="checkbox" checked={layers.isochrone} onChange={e => setLayers(l => ({ ...l, isochrone: e.target.checked }))} /> Drive-time area</label>
        <button className="lc-reset" onClick={() => { mapRef.current?.fitBounds(RICHMOND_BOUNDS, { padding: 30 }); actions.clearSelection() }}>Reset to market</button>
      </div>
      <div className="map-legend">
        <span className="lg"><span className="legend-sw" style={{ background: '#2E7D5B' }} /> Healthy</span>
        <span className="lg"><span className="legend-sw" style={{ background: '#D99A22' }} /> Watch</span>
        <span className="lg"><span className="legend-sw" style={{ background: '#C74634' }} /> At Risk</span>
        <span className="lg"><span className="legend-dot" style={{ width: 11, height: 11, background: '#2563eb' }} /> Current</span>
        <span className="lg"><span className="legend-dot" style={{ width: 11, height: 11, background: '#0d9488' }} /> Growth</span>
        <span className="lg"><span className="legend-dot" style={{ width: 11, height: 11, background: '#7c3aed' }} /> Prospect</span>
        <span className="lg"><span className="legend-dot" style={{ width: 11, height: 11, background: '#dc2626' }} /> At-risk / uncovered</span>
        <span className="lg muted">size = opportunity · outline = freshness · clusters group nearby accounts</span>
      </div>
    </div>
  )
}
