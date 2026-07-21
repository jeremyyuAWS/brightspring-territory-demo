import { useStore } from '../store'
import { REPS, TERRITORIES, OPTIMIZED_CAPACITY } from '../seed'
import { metricsFor, statusFor } from '../selectors'
import { Drawer, StatusBadge } from '../ui'

export function CompareReps({ onClose }: { onClose: () => void }) {
  const s = useStore()
  const applied = s.optimizationApplied
  const reps = REPS.filter(r => r.territoryId)
  return (
    <Drawer wide title="Compare reps" onClose={onClose}
      subtitle={<span className="muted">Capacity, coverage, and opportunity by rep</span>}
      footer={<button className="btn primary" onClick={onClose}>Close</button>}>
      <div style={{ overflowX: 'auto' }}>
        <table className="data">
          <thead>
            <tr><th>Rep</th><th>Territory</th><th className="num">Capacity</th><th className="num">Priority cov.</th><th className="num">Visits</th><th className="num">Conv.</th><th className="num">Drive hrs</th><th>Status</th></tr>
          </thead>
          <tbody>
            {reps.map(r => {
              const t = TERRITORIES.find(x => x.id === r.territoryId)!
              const m = metricsFor(t, applied)
              const cap = applied ? OPTIMIZED_CAPACITY[r.id] : r.capacityPct
              const over = cap > 100
              return (
                <tr key={r.id} style={{ cursor: 'default' }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="avatar" style={{ background: r.color, width: 28, height: 28, fontSize: 11 }}>{r.initials}</span>
                      {r.name}
                    </div>
                  </td>
                  <td>{t.name}</td>
                  <td className="num" style={{ color: over ? 'var(--risk)' : 'inherit', fontWeight: over ? 700 : 400 }}>{cap}%</td>
                  <td className="num">{m.priorityCoveragePct}%</td>
                  <td className="num">{m.visitsCompleted}/{m.visitsTarget}</td>
                  <td className="num">{Math.round((m.visitsCompleted / m.visitsTarget) * 100)}%</td>
                  <td className="num">{m.driveHrs}</td>
                  <td><StatusBadge status={statusFor(t, applied)} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="callout" style={{ marginTop: 16 }}>
        <span className="ico">◆</span>
        <div>{applied
          ? 'After optimization, rep capacity spread narrowed from 36 to 14 points. No rep is over 100%.'
          : 'Jordan Ellis (South) is the only rep over capacity at 112%, while Maya Chen (Central) has headroom at 76%. This is the imbalance the Balanced strategy resolves.'}</div>
      </div>
    </Drawer>
  )
}
