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
          radius: radiusFor(a), opp: a.opportunityScore, referralActive: a.referralActive,
          facilityType: a.facilityType, rep: repById(effectiveRepId(a, applied))?.name ?? '',
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

export function TerritoryMapMapbox({ token, onFail }: { token: string; onFail?: () => void }) {
  const s = useStore()
  const applied = s.optimizationApplied
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [layers, setLayers] = useState<Layers>({ uncovered: false, route: false, isochrone: false, heatmap: false, referralFlow: false })
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
      map.addSource('accounts', { type: 'geojson', data: accountsFC(ACCOUNTS, applied) as any, cluster: true, clusterRadius: 42, clusterMaxZoom: 12 })
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
      map.addLayer({ id: 'territory-fill', type: 'fill', source: 'territories', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.34, 'fill-color-transition': { duration: 600 } as any, 'fill-opacity-transition': { duration: 600 } as any } })
      map.addLayer({ id: 'territory-outline', type: 'line', source: 'territories', paint: { 'line-color': '#334155', 'line-width': 1.5 } })
      map.addLayer({ id: 'territory-selected', type: 'line', source: 'territories', filter: ['==', ['get', 'territoryId'], '__none__'], paint: { 'line-color': '#0f172a', 'line-width': 3 } })

      // route line
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#1d4ed8', 'line-width': 2.5, 'line-dasharray': [2, 1] } })
      // §13 referral flow lines (source → service location), colored by status, width by volume
      map.addLayer({ id: 'flow-line', type: 'line', source: 'flow', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': 0.75 } })
      map.addLayer({ id: 'flow-src-pt', type: 'circle', source: 'flow-src', paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 3 } })

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
      map.setPaintProperty('territory-fill', 'fill-opacity', 0.6)
    } else {
      map.setPaintProperty('territory-fill', 'fill-color', ['get', 'color'])
      if (kpi === 'atRisk') {
        map.setPaintProperty('territory-fill', 'fill-opacity', ['match', ['get', 'status'], 'Healthy', 0.1, 0.62])
      } else if (selId) {
        map.setPaintProperty('territory-fill', 'fill-opacity', ['case', ['==', ['get', 'territoryId'], selId], 0.56, 0.14])
      } else {
        map.setPaintProperty('territory-fill', 'fill-opacity', 0.34)
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

  const focused = repById(focusRep(s.filters.repId, s.selectedTerritoryId))

  return (
    <div className="map-wrap" style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ height: 460, width: '100%' }} />
      <div className="layers-control">
        <div className="lc-title">Layers</div>
        <label><input type="checkbox" checked={layers.uncovered} onChange={e => setLayers(l => ({ ...l, uncovered: e.target.checked }))} /> Uncovered priority</label>
        <label><input type="checkbox" checked={layers.route} onChange={e => setLayers(l => ({ ...l, route: e.target.checked }))} /> Rep route <span className="muted">({focused?.initials})</span></label>
        <label><input type="checkbox" checked={layers.isochrone} onChange={e => setLayers(l => ({ ...l, isochrone: e.target.checked }))} /> Drive-time area</label>
        <label><input type="checkbox" checked={layers.heatmap} onChange={e => setLayers(l => ({ ...l, heatmap: e.target.checked }))} /> Opportunity heatmap</label>
        <label><input type="checkbox" checked={layers.referralFlow} onChange={e => setLayers(l => ({ ...l, referralFlow: e.target.checked }))} /> Referral flow</label>
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
