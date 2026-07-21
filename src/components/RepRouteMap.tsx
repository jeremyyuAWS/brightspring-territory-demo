import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { DAYS } from '../today'
import { TERRITORY_POLYGONS } from '../geo'
import { territoryById, repById } from '../selectors'

// Rep route map: numbered ordered stops + route line, subtle territory, nearby opportunity.
export function RepRouteMap({ repId, selectedStop, onSelectStop }: { repId: string; selectedStop: number | null; onSelectStop: (i: number) => void }) {
  const day = DAYS[repId]
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.CircleMarker[]>([])

  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: true })
    mapRef.current = map
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(map)
    const ro = new ResizeObserver(() => map.invalidateSize()); ro.observe(elRef.current)
    return () => { ro.disconnect(); map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current; if (!map) return
    map.eachLayer(l => { if (!(l instanceof L.TileLayer)) map.removeLayer(l) })
    markersRef.current = []

    // subtle territory boundary
    const t = territoryById(day.territoryId)
    if (t && TERRITORY_POLYGONS[t.id]) {
      L.polygon(TERRITORY_POLYGONS[t.id].map(p => [p[1], p[0]] as [number, number]), {
        color: '#1b5aa8', weight: 2, opacity: 0.6, fillColor: '#1b5aa8', fillOpacity: 0.05, dashArray: '4 3',
      }).addTo(map).bindTooltip(`${t.name} · ${repById(t.repId)?.name}`)
    }

    // route line
    const pts = day.routeStops.map(s => [s.lat, s.lng] as [number, number])
    L.polyline(pts, { color: '#1d4ed8', weight: 3, opacity: 0.7, dashArray: '6 4' }).addTo(map)

    // numbered stops
    day.routeStops.forEach((s, i) => {
      const isNext = i === (day.routeStops.findIndex((_, idx) => idx >= 1)) // 2nd as "next" for demo
      const sel = selectedStop === i
      const color = i === 0 ? '#16a34a' : isNext ? '#1b5aa8' : '#334155'
      const mk = L.circleMarker([s.lat, s.lng], { radius: sel ? 15 : 12, fillColor: color, fillOpacity: 1, color: sel ? '#0f172a' : '#fff', weight: sel ? 3 : 2 })
      mk.bindTooltip(`${i + 1}. ${s.name}`)
      mk.on('click', () => onSelectStop(i))
      mk.addTo(map)
      L.marker([s.lat, s.lng], { icon: L.divIcon({ className: 'rr-num', html: `${i + 1}`, iconSize: [24, 24] }), interactive: false }).addTo(map)
      markersRef.current.push(mk)
    })

    // nearby opportunity
    if (day.nearby) {
      const n = day.nearby
      L.circleMarker([n.lat, n.lng], { radius: 9, fillColor: '#7c3aed', fillOpacity: 0.9, color: '#fff', weight: 2, dashArray: '2 2' })
        .addTo(map).bindTooltip(`★ ${n.name} · ${n.offRouteMin} min off route`, { permanent: false })
      L.marker([n.lat, n.lng], { icon: L.divIcon({ className: 'rr-star', html: '★', iconSize: [22, 22] }), interactive: false }).addTo(map)
    }

    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 13 })
  }, [repId, selectedStop])

  return <div ref={elRef} style={{ height: '100%', minHeight: 420, width: '100%' }} />
}
