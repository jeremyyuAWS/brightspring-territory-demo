import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { useStore, actions } from '../store'
import { ACCOUNTS, TERRITORIES, OPTIMIZED_CAPACITY } from '../seed'
import { RICHMOND_CENTER, TERRITORY_POLYGONS } from '../geo'
import { statusFor, accountCovered, effectiveTerritoryId, effectiveRepId, repById, territoryById, insights } from '../selectors'
import type { Account } from '../types'

const STATUS_HEX: Record<string, string> = { Healthy: '#2E7D5B', Watch: '#D99A22', 'At Risk': '#C74634' }
const REL_HEX: Record<string, string> = { current: '#2563eb', growth: '#0d9488', prospect: '#7c3aed', at_risk: '#dc2626' }
function radiusFor(a: Account) { return a.opportunityBand === 'high' ? 8 : a.opportunityBand === 'medium' ? 6 : 4.5 }
function freshHex(a: Account) { return a.visitFresh === 'fresh' ? '#1f2937' : a.visitFresh === 'aging' ? '#d97706' : '#dc2626' }

// ---- thematic overlays (one primary theme at a time) ----
type Theme = 'health' | 'cadence' | 'whitespace' | 'capacity'
const THEMES: { id: Theme; label: string }[] = [
  { id: 'health', label: 'Territory health' },
  { id: 'cadence', label: 'Visit cadence' },
  { id: 'whitespace', label: 'Service whitespace' },
  { id: 'capacity', label: 'Rep capacity' },
]
function cadenceColor(a: Account) { return a.lastContactDays <= 14 ? '#16a34a' : a.lastContactDays <= 30 ? '#d99a22' : '#dc2626' }
function whitespaceColor(a: Account) { return a.whitespace.length ? '#0d9488' : a.relationshipStatus === 'current' ? '#2563eb' : '#94a3b8' }
function capacityHex(cap: number) { return cap > 100 ? '#C74634' : cap >= 90 ? '#D99A22' : '#2E7D5B' }
const THEME_LEGEND: Record<Theme, { sw: string; label: string }[]> = {
  health: [{ sw: '#2E7D5B', label: 'Healthy' }, { sw: '#D99A22', label: 'Watch' }, { sw: '#C74634', label: 'At Risk' }],
  cadence: [{ sw: '#16a34a', label: 'Within target' }, { sw: '#d99a22', label: 'Approaching' }, { sw: '#dc2626', label: 'Overdue 30+ d' }],
  whitespace: [{ sw: '#2563eb', label: 'Current customer' }, { sw: '#0d9488', label: 'Whitespace opportunity' }, { sw: '#94a3b8', label: 'Penetrated' }],
  capacity: [{ sw: '#2E7D5B', label: 'Has capacity' }, { sw: '#D99A22', label: 'Near limit' }, { sw: '#C74634', label: 'Over capacity' }],
}

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
  const [theme, setTheme] = useState<Theme>('health')

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
      } else if (theme === 'capacity') {
        const cap = applied ? OPTIMIZED_CAPACITY[t.repId] : repById(t.repId)!.capacityPct
        color = capacityHex(cap); fillOpacity = 0.4
      } else if (theme !== 'health') {
        color = '#94a3b8'; fillOpacity = selId && id === selId ? 0.25 : 0.12 // neutral polygons when an account-level theme is active
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
      const markerFill = theme === 'cadence' ? cadenceColor(a) : theme === 'whitespace' ? whitespaceColor(a) : REL_HEX[a.relationshipStatus]
      const mk = L.circleMarker([a.lat, a.lng], {
        radius: radiusFor(a) + (emphasize ? 2 : 0),
        fillColor: markerFill, fillOpacity: dim ? 0.22 : 0.85,
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

  }, [applied, s.selectedTerritoryId, s.selectedKpi, s.selectedInsightId, s.filters.repId, s.referrals, theme])

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

  const action = themeAction(theme)
  return (
    <div className="map-wrap" style={{ position: 'relative' }}>
      <div className="map-themes" role="tablist" aria-label="Map overlay">
        {THEMES.map(t => (
          <button key={t.id} role="tab" aria-selected={theme === t.id}
            className={'theme-tab' + (theme === t.id ? ' on' : '')}
            onClick={() => setTheme(t.id)}>{t.label}</button>
        ))}
      </div>
      <div ref={elRef} style={{ height: 460, width: '100%' }} />
      <div className="map-legend">
        {THEME_LEGEND[theme].map(l => (
          <span className="lg" key={l.label}><span className="legend-sw" style={{ background: l.sw }} /> {l.label}</span>
        ))}
        {theme === 'health' && <>
          <span className="lg"><span className="legend-dot" style={{ width: 11, height: 11, background: '#2563eb' }} /> Current</span>
          <span className="lg"><span className="legend-dot" style={{ width: 11, height: 11, background: '#0d9488' }} /> Growth</span>
          <span className="lg"><span className="legend-dot" style={{ width: 11, height: 11, background: '#7c3aed' }} /> Prospect</span>
        </>}
        <span className="lg muted">Leaflet · CARTO basemap (no token)</span>
      </div>
      {action && (
        <div className="map-action">
          <span>{action.hint}</span>
          <button className="btn primary sm" onClick={action.run}>{action.cta}</button>
        </div>
      )}
    </div>
  )

  function themeAction(t: Theme) {
    switch (t) {
      case 'cadence': return { hint: 'Accounts overdue for a visit are red.', cta: 'Build a re-visit route', run: () => actions.setTab('today') }
      case 'whitespace': return { hint: 'Teal accounts are service-line whitespace.', cta: 'Review whitespace plays', run: () => actions.setTab('plan') }
      case 'capacity': return { hint: 'Red territories are over capacity — rebalance ZIPs.', cta: 'Open Territory Builder', run: () => actions.openZipBuilder() }
      default: return null
    }
  }
}
