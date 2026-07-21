import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { useStore, actions } from '../store'
import { ACCOUNTS, TERRITORIES } from '../seed'
import { RICHMOND_CENTER, TERRITORY_POLYGONS } from '../geo'
import { statusFor, accountCovered, effectiveTerritoryId, effectiveRepId, repById, territoryById, insights } from '../selectors'
import type { Account } from '../types'

const STATUS_HEX: Record<string, string> = { Healthy: '#2E7D5B', Watch: '#D99A22', 'At Risk': '#C74634' }
const REL_HEX: Record<string, string> = { current: '#2563eb', growth: '#0d9488', prospect: '#7c3aed', at_risk: '#dc2626' }
function radiusFor(a: Account) { return a.opportunityBand === 'high' ? 8 : a.opportunityBand === 'medium' ? 6 : 4.5 }
function freshHex(a: Account) { return a.visitFresh === 'fresh' ? '#1f2937' : a.visitFresh === 'aging' ? '#d97706' : '#dc2626' }

// tight bounds around the actual territory polygons (so they fill the view, not the wide market box)
function territoryExtent(): L.LatLngBoundsExpression {
  let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90
  for (const ring of Object.values(TERRITORY_POLYGONS)) for (const [lng, lat] of ring) {
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng); minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat)
  }
  return [[minLat, minLng], [maxLat, maxLng]]
}

export function TerritoryMapLeaflet() {
  const s = useStore()
  const applied = s.optimizationApplied
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const polyRef = useRef<L.GeoJSON | null>(null)
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)

  // init once
  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current, { center: [RICHMOND_CENTER[1], RICHMOND_CENTER[0]], zoom: 11, zoomControl: true, attributionControl: true })
    mapRef.current = map
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map)
    map.fitBounds(territoryExtent(), { padding: [24, 24] })

    polyRef.current = L.geoJSON(undefined, {
      style: () => ({ weight: 1.5, color: '#334155', fillOpacity: 0.34 }),
      onEachFeature: (f, layer) => {
        layer.on('click', () => actions.selectTerritory(f.properties.territoryId))
      },
    }).addTo(map)

    clusterRef.current = (L as any).markerClusterGroup({
      maxClusterRadius: 42, showCoverageOnHover: false,
      iconCreateFunction: (cluster: any) => L.divIcon({ html: `<div class="lf-cluster">${cluster.getChildCount()}</div>`, className: 'lf-cluster-wrap', iconSize: [34, 34] }),
    })
    map.addLayer(clusterRef.current!)

    // keep tiles filling the container when it resizes
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(elRef.current)

    return () => { ro.disconnect(); map.remove(); mapRef.current = null }
  }, [])

  // rebuild layers + cross-filter on state change
  useEffect(() => {
    const map = mapRef.current, poly = polyRef.current, cluster = clusterRef.current
    if (!map || !poly || !cluster) return
    const selId = s.selectedTerritoryId
    const kpi = s.selectedKpi
    const insight = insights(s).find(i => i.id === s.selectedInsightId)
    const hlIds = new Set(insight?.accountIds ?? [])

    // territories
    poly.clearLayers()
    poly.addData({
      type: 'FeatureCollection',
      features: TERRITORIES.map(t => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [TERRITORY_POLYGONS[t.id]] },
        properties: { territoryId: t.id },
      })),
    } as any)
    poly.eachLayer((layer: any) => {
      const id = layer.feature.properties.territoryId
      const t = territoryById(id)!
      const st = statusFor(t, applied)
      const m = applied ? t.optimized : t.baseline
      // light, elegant tint: soft fill + crisp colored outline (basemap stays readable)
      let fillOpacity = 0.3
      if (kpi === 'atRisk') fillOpacity = st === 'Healthy' ? 0.08 : 0.42
      else if (selId) fillOpacity = id === selId ? 0.42 : 0.08
      let color = STATUS_HEX[st]
      if (kpi === 'conversion') {
        const inT = s.referrals.filter(r => r.territoryId === id)
        const conv = inT.length ? Math.round(inT.filter(r => r.stage === 'Accepted' || r.stage === 'Admitted').length / inT.length * 100) : 0
        color = conv >= 55 ? '#16a34a' : conv >= 40 ? '#65a30d' : conv >= 25 ? '#d99a22' : '#c74634'
        fillOpacity = 0.62
      }
      layer.setStyle({ fillColor: color, fillOpacity, weight: id === selId ? 3 : 1.75, color: id === selId ? '#0f172a' : color, opacity: 0.9 })
      layer.bindTooltip(`<b>${t.name}</b><br/>${repById(t.repId)?.name} · ${st}<br/>coverage ${m.priorityCoveragePct}% · ${m.visitsCompleted}/${m.visitsTarget} visits`, { sticky: true })
    })

    // accounts
    cluster.clearLayers()
    let list = ACCOUNTS
    if (s.filters.repId !== 'all') list = list.filter(a => effectiveRepId(a, applied) === s.filters.repId)
    if (selId) list = list.filter(a => effectiveTerritoryId(a, applied) === selId)
    const coverageKpi = kpi === 'coverage' || kpi === 'priorityCovered'
    for (const a of list) {
      const covered = accountCovered(a, applied)
      const dim = coverageKpi && covered
      const emphasize = (coverageKpi && !covered && a.isPriority) || hlIds.has(a.id)
      const mk = L.circleMarker([a.lat, a.lng], {
        radius: radiusFor(a) + (emphasize ? 2 : 0),
        fillColor: REL_HEX[a.relationshipStatus], fillOpacity: dim ? 0.22 : 0.85,
        color: emphasize ? '#111827' : (covered ? freshHex(a) : '#dc2626'), weight: emphasize ? 2.5 : 1.75,
      })
      mk.bindTooltip(`<b>${a.name}</b><br/>${a.priority} priority · ${covered ? 'covered' : 'uncovered'} · opp ${a.opportunityScore}`)
      const covLabel = covered ? 'Covered' : '<span style="color:#dc2626">Uncovered</span>'
      mk.bindPopup(
        `<div class="lf-pop"><b>${a.name}</b><div class="lf-sub">${a.facilityType} · ${a.priority} priority</div>`
        + `<div class="lf-kv"><span>Owner</span>${repById(effectiveRepId(a, applied))?.name ?? ''}</div>`
        + `<div class="lf-kv"><span>Coverage</span>${covLabel}</div>`
        + `<div class="lf-kv"><span>Opportunity</span>${a.opportunityScore}</div>`
        + `${a.referralActive ? '<div class="lf-tag">● Active referral</div>' : ''}`
        + `<button class="lf-open" data-id="${a.id}">Open account →</button></div>`,
      )
      cluster.addLayer(mk)
    }

  }, [applied, s.selectedTerritoryId, s.selectedKpi, s.selectedInsightId, s.filters.repId, s.referrals])

  // fly-to selected territory
  useEffect(() => {
    const map = mapRef.current; if (!map) return
    const selId = s.selectedTerritoryId
    if (selId && TERRITORY_POLYGONS[selId]) {
      const ll = TERRITORY_POLYGONS[selId].map(p => [p[1], p[0]] as [number, number])
      map.flyToBounds(L.latLngBounds(ll), { padding: [50, 50], maxZoom: 13, duration: 0.7 })
    } else {
      map.flyToBounds(L.latLngBounds(territoryExtent() as any), { padding: [24, 24], duration: 0.7 })
    }
  }, [s.selectedTerritoryId])

  // wire "Open account" button inside popups
  useEffect(() => {
    const map = mapRef.current; if (!map) return
    const handler = (e: L.LeafletEvent) => {
      const el = (e as any).popup?.getElement()?.querySelector('.lf-open') as HTMLButtonElement | null
      if (el) el.onclick = () => { const id = el.getAttribute('data-id')!; map.closePopup(); actions.openAccount(id) }
    }
    map.on('popupopen', handler)
    return () => { map.off('popupopen', handler) }
  }, [])

  return (
    <div className="map-wrap" style={{ position: 'relative' }}>
      <div ref={elRef} style={{ height: 460, width: '100%' }} />
      <div className="map-legend">
        <span className="lg"><span className="legend-sw" style={{ background: '#2E7D5B' }} /> Healthy</span>
        <span className="lg"><span className="legend-sw" style={{ background: '#D99A22' }} /> Watch</span>
        <span className="lg"><span className="legend-sw" style={{ background: '#C74634' }} /> At Risk</span>
        <span className="lg"><span className="legend-dot" style={{ width: 11, height: 11, background: '#2563eb' }} /> Current</span>
        <span className="lg"><span className="legend-dot" style={{ width: 11, height: 11, background: '#0d9488' }} /> Growth</span>
        <span className="lg"><span className="legend-dot" style={{ width: 11, height: 11, background: '#7c3aed' }} /> Prospect</span>
        <span className="lg muted">Leaflet · CARTO basemap (no token) · click a territory to drill down</span>
      </div>
    </div>
  )
}
