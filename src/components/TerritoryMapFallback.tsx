import { TerritoryMap } from './TerritoryMap'

// Token-free visual fallback: reuses the self-contained SVG map so the full
// dashboard remains usable with no Mapbox token and no network. (AC-01)
export function TerritoryMapFallback({ devNotice }: { devNotice: boolean }) {
  return (
    <div style={{ position: 'relative' }}>
      <TerritoryMap />
      {devNotice && import.meta.env.DEV && (
        <div style={{
          position: 'absolute', top: 10, left: 10, background: 'rgba(15,23,42,.82)', color: '#fff',
          fontSize: 11.5, padding: '5px 10px', borderRadius: 7, pointerEvents: 'none',
        }}>
          Map preview available after Mapbox token is configured.
        </div>
      )}
    </div>
  )
}
