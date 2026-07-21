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

      <div className="section-title">Capacity vs 100% target</div>
      <BarChart reps={reps} applied={applied} metric="capacity" />
      <div className="section-title" style={{ marginTop: 16 }}>Priority coverage</div>
      <BarChart reps={reps} applied={applied} metric="coverage" />

      <div className="section-title" style={{ marginTop: 16 }}>Detail</div>
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

function BarChart({ reps, applied, metric }: { reps: typeof REPS; applied: boolean; metric: 'capacity' | 'coverage' }) {
  const rows = reps.map(r => {
    const t = TERRITORIES.find(x => x.id === r.territoryId)!
    const m = metricsFor(t, applied)
    const val = metric === 'capacity' ? (applied ? OPTIMIZED_CAPACITY[r.id] : r.capacityPct) : m.priorityCoveragePct
    return { r, t, val }
  }).sort((a, b) => b.val - a.val)
  const scaleMax = metric === 'capacity' ? 120 : 100
  return (
    <div className="barchart">
      {rows.map(({ r, val }) => {
        const over = metric === 'capacity' && val > 100
        const low = metric === 'coverage' && val < 65
        const color = over || low ? '#c74634' : metric === 'coverage' && val < 80 ? '#d99a22' : r.color
        return (
          <div className="barrow" key={r.id}>
            <span className="barlabel"><span className="avatar" style={{ background: r.color, width: 22, height: 22, fontSize: 10 }}>{r.initials}</span>{r.name.split(' ')[0]}</span>
            <span className="bartrack">
              <span className="barfill" style={{ width: `${Math.min(100, (val / scaleMax) * 100)}%`, background: color }} />
              {metric === 'capacity' && <span className="bar100" style={{ left: `${(100 / scaleMax) * 100}%` }} />}
            </span>
            <span className="barval" style={{ color: over || low ? 'var(--risk)' : 'inherit', fontWeight: over || low ? 700 : 600 }}>{val}%</span>
          </div>
        )
      })}
    </div>
  )
}
