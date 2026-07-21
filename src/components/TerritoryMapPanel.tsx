import { Component, Suspense, lazy, useState, type ReactNode } from 'react'
import { TerritoryMapFallback } from './TerritoryMapFallback'

// Lazy so mapbox-gl (~1.5 MB) only downloads when a token is actually present —
// the token-free demo path stays lightweight and loads fast. (AC-01, §15)
const TerritoryMapMapbox = lazy(() =>
  import('./TerritoryMapMapbox').then(m => ({ default: m.TerritoryMapMapbox })),
)

const TOKEN = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined)?.trim()

// error boundary so any Mapbox runtime failure degrades to the SVG fallback, never a blank page (§15)
class MapErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch() { /* keep dashboard alive */ }
  render() { return this.state.hasError ? this.props.fallback : this.props.children }
}

export function TerritoryMapPanel() {
  const [failed, setFailed] = useState(false)

  if (!TOKEN || failed) {
    return <TerritoryMapFallback devNotice={!TOKEN} />
  }
  const fallback = <TerritoryMapFallback devNotice={false} />
  return (
    <MapErrorBoundary fallback={fallback}>
      <Suspense fallback={<div style={{ height: 460, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>Loading map…</div>}>
        <TerritoryMapMapbox token={TOKEN} onFail={() => setFailed(true)} />
      </Suspense>
    </MapErrorBoundary>
  )
}
