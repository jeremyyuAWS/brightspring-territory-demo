import { useState } from 'react'
import { TERRITORIES, ACCOUNTS } from '../seed'
import { useStore, actions } from '../store'
import { statusFor, effectiveTerritoryId, accountCovered, insights } from '../selectors'
import type { Account } from '../types'

const STATUS_FILL: Record<string, string> = {
  Healthy: '#16a34a', Watch: '#d97706', 'At Risk': '#dc2626',
}
function tierRadius(a: Account) { return a.oppTier === 'Tier 1' ? 8 : a.oppTier === 'Tier 2' ? 6 : 4.5 }
function freshStroke(a: Account) { return a.visitFresh === 'fresh' ? '#16a34a' : a.visitFresh === 'aging' ? '#d97706' : '#dc2626' }

export function TerritoryMap() {
  const s = useStore()
  const [hover, setHover] = useState<{ x: number; y: number; html: React.ReactNode } | null>(null)
  const applied = s.optimizationApplied
  const sel = s.selectedTerritoryId
  const activeInsight = insights(s).find(i => i.id === s.selectedInsightId)
  const hlAccounts = new Set(activeInsight?.accountIds ?? [])

  return (
    <div className="map-wrap">
      <svg viewBox="0 0 1000 700" role="img" aria-label="Richmond territory map">
        {/* territory polygons */}
        {TERRITORIES.map(t => {
          const st = statusFor(t, applied)
          const dim = sel && sel !== t.id
          return (
            <polygon key={t.id} points={t.polygon} fill={STATUS_FILL[st]} fillOpacity={0.82}
              className={`terr-poly ${dim ? 'dim' : ''}`}
              onClick={() => actions.selectTerritory(t.id)}
              onMouseMove={e => {
                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                const m = applied ? t.optimized : t.baseline
                setHover({
                  x: e.clientX - r.left, y: e.clientY - r.top,
                  html: <><b>{t.name}</b>{st} · coverage {m.priorityCoveragePct}% · {m.visitsCompleted}/{m.visitsTarget} visits</>,
                })
              }}
              onMouseLeave={() => setHover(null)}
            />
          )
        })}
        {/* labels */}
        {TERRITORIES.map(t => {
          const st = statusFor(t, applied)
          if (sel && sel !== t.id) return null
          return (
            <g key={t.id + '-l'} pointerEvents="none">
              <text className="terr-label" x={t.labelX} y={t.labelY}>{t.name}</text>
              <text className="terr-sub" x={t.labelX} y={t.labelY + 16}>{st}</text>
            </g>
          )
        })}
        {/* account pins */}
        {ACCOUNTS.map(a => {
          const tid = effectiveTerritoryId(a, applied)
          const dim = (sel && sel !== tid) || (hlAccounts.size > 0 && !hlAccounts.has(a.id))
          const covered = accountCovered(a, applied)
          const hl = hlAccounts.has(a.id)
          return (
            <circle key={a.id} cx={a.coord.x} cy={a.coord.y} r={tierRadius(a)}
              fill={covered ? '#0ea5e9' : '#ef4444'} fillOpacity={covered ? 0.9 : 1}
              stroke={hl ? '#111827' : freshStroke(a)} strokeWidth={hl ? 3 : 2}
              className={`pin ${dim ? 'dim' : ''} ${hl ? 'hl' : ''}`}
              onClick={() => actions.openAccount(a.id)}
              onMouseMove={e => {
                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                setHover({
                  x: e.clientX - r.left, y: e.clientY - r.top,
                  html: <><b>{a.name}</b>{a.priority} priority · {covered ? 'covered' : 'uncovered'} · opp {a.opportunityScore}</>,
                })
              }}
              onMouseLeave={() => setHover(null)}
            />
          )
        })}
      </svg>
      {hover && (
        <div className="map-tooltip" style={{ left: Math.min(hover.x + 12, 620), top: hover.y + 12 }}>{hover.html}</div>
      )}
      <div className="map-legend">
        <span className="lg"><span className="legend-sw" style={{ background: '#16a34a' }} /> Healthy</span>
        <span className="lg"><span className="legend-sw" style={{ background: '#d97706' }} /> Watch</span>
        <span className="lg"><span className="legend-sw" style={{ background: '#dc2626' }} /> At Risk</span>
        <span className="lg"><span className="legend-dot" style={{ width: 11, height: 11, background: '#0ea5e9' }} /> Covered account</span>
        <span className="lg"><span className="legend-dot" style={{ width: 11, height: 11, background: '#ef4444' }} /> Uncovered</span>
        <span className="lg muted">Pin size = opportunity · outline = visit freshness</span>
      </div>
    </div>
  )
}
