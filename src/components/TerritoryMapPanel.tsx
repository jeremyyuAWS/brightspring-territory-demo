import { Component, Suspense, lazy, useState, type ReactNode } from 'react'
import { TerritoryMapLeaflet } from './TerritoryMapLeaflet'

// Lazy so mapbox-gl (~1.5 MB) only downloads when the map mounts.
const TerritoryMapMapbox = lazy(() =>
  import('./TerritoryMapMapbox').then(m => ({ default: m.TerritoryMapMapbox })),
)

const TOKEN = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined)?.trim()

// Customer-facing map is Mapbox. If Mapbox is unavailable (no token, auth error,
// blocked tiles, or any runtime failure) we silently drop to the token-free
// Leaflet/CARTO renderer — same territories, accounts, and interactions. The
// provider is never exposed to the customer.
class MapErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch() { /* keep dashboard alive */ }
  render() { return this.state.hasError ? this.props.fallback : this.props.children }
}

export function TerritoryMapPanel() {
  const [failed, setFailed] = useState(false)

  // Invisible fallback: the Leaflet map (not the static SVG) so interactions survive.
  const leafletFallback = (
    <MapErrorBoundary fallback={<TerritoryMapLeaflet />}>
      <TerritoryMapLeaflet />
    </MapErrorBoundary>
  )

  const useMapbox = TOKEN && !failed

  return (
    <div>
      <div className="map-titlebar">
        <span className="map-title">Territory Intelligence — Richmond Market</span>
        <span className="map-sub">CRM · referrals · coverage · capacity in one view</span>
      </div>
      {useMapbox ? (
        <MapErrorBoundary fallback={leafletFallback}>
          <Suspense fallback={<div style={{ height: 460, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>Loading map…</div>}>
            <TerritoryMapMapbox token={TOKEN!} onFail={() => setFailed(true)} />
          </Suspense>
        </MapErrorBoundary>
      ) : leafletFallback}
    </div>
  )
}
