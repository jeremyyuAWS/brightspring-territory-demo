import { Component, Suspense, lazy, useState, type ReactNode } from 'react'
import { useStore, actions } from '../store'
import { TerritoryMapFallback } from './TerritoryMapFallback'
import { TerritoryMapLeaflet } from './TerritoryMapLeaflet'

// Lazy so mapbox-gl (~1.5 MB) only downloads when the Mapbox provider is actually selected.
const TerritoryMapMapbox = lazy(() =>
  import('./TerritoryMapMapbox').then(m => ({ default: m.TerritoryMapMapbox })),
)

const TOKEN = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined)?.trim()

// error boundary so any map runtime failure degrades to the SVG fallback, never a blank page (§15)
class MapErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch() { /* keep dashboard alive */ }
  render() { return this.state.hasError ? this.props.fallback : this.props.children }
}

export function TerritoryMapPanel() {
  const s = useStore()
  const [failed, setFailed] = useState(false)
  const fallback = <TerritoryMapFallback devNotice={false} />

  const body = () => {
    if (s.mapProvider === 'leaflet') {
      return (
        <MapErrorBoundary fallback={fallback}>
          <TerritoryMapLeaflet />
        </MapErrorBoundary>
      )
    }
    // mapbox
    if (!TOKEN || failed) return <TerritoryMapFallback devNotice={!TOKEN} />
    return (
      <MapErrorBoundary fallback={fallback}>
        <Suspense fallback={<div style={{ height: 460, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>Loading map…</div>}>
          <TerritoryMapMapbox token={TOKEN} onFail={() => setFailed(true)} />
        </Suspense>
      </MapErrorBoundary>
    )
  }

  return (
    <div>
      <div className="map-provider">
        <span className="mp-label">Basemap</span>
        <div className="map-toggle">
          <button className={s.mapProvider === 'leaflet' ? 'active' : ''} onClick={() => actions.setMapProvider('leaflet')}>Leaflet</button>
          <button className={s.mapProvider === 'mapbox' ? 'active' : ''} onClick={() => actions.setMapProvider('mapbox')}>Mapbox</button>
        </div>
        {s.mapProvider === 'leaflet' && <span className="muted" style={{ fontSize: 11.5 }}>CARTO tiles · no token</span>}
        {s.mapProvider === 'mapbox' && !TOKEN && <span className="muted" style={{ fontSize: 11.5 }}>no token → SVG fallback</span>}
      </div>
      {body()}
    </div>
  )
}
