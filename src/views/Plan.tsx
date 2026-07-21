import { useState } from 'react'
import { useStore } from '../store'
import { TERRITORIES, PLANS_BASELINE, PLANS_OPTIMIZED } from '../seed'
import { repById } from '../selectors'

export function Plan() {
  const s = useStore()
  const [horizon, setHorizon] = useState<'Week' | 'Period' | 'Month'>('Month')
  const plans = s.optimizationApplied ? PLANS_OPTIMIZED : PLANS_BASELINE
  const weeks = horizon === 'Week' ? [1] : horizon === 'Period' ? [1, 2, 3] : [1, 2, 3, 4]

  return (
    <div>
      <div className="filterbar">
        <div className="field">
          <label>Planning horizon</label>
          <div className="map-toggle">
            {(['Week', 'Period', 'Month'] as const).map(h => (
              <button key={h} className={horizon === h ? 'active' : ''} onClick={() => setHorizon(h)}>{h}</button>
            ))}
          </div>
        </div>
        <div className="spacer" />
        {s.monthlyPlanApplied && <span className="badge sim" style={{ alignSelf: 'center' }}>◇ AI monthly plan applied</span>}
        {s.optimizationApplied
          ? <span className="badge sim" style={{ alignSelf: 'center' }}>◆ Reflecting applied optimization</span>
          : <span className="badge neutral" style={{ alignSelf: 'center' }}>Baseline plan</span>}
      </div>

      {s.monthlyPlanApplied && (
        <div className="callout" style={{ background: '#f2f7fd', borderColor: '#bcd4ee', color: '#12385f', marginBottom: 14 }}>
          <span className="ico">◇</span>
          <div><b>Copilot built this month.</b> Every Tier-1 account covered, your 11 existing meetings protected, and Fridays kept lighter — work distributed W1 26% · W2 27% · W3 25% · W4 22% instead of front-loading. Reversible via Undo.</div>
        </div>
      )}

      <div className="panel">
        <div className="phead">
          <h3>Coverage grid — visit target vs planned vs completed</h3>
          <span className="hint">{horizon} view · Home Health + Hospice</span>
        </div>
        <div className="pbody" style={{ overflowX: 'auto' }}>
          <table className="plan-grid">
            <thead>
              <tr>
                <th>Territory / Rep</th>
                {weeks.map(w => <th key={w}>Week {w}</th>)}
                <th>Period total</th>
              </tr>
            </thead>
            <tbody>
              {TERRITORIES.map(t => {
                const rows = plans.filter(p => p.territoryId === t.id && weeks.includes(p.week))
                const target = rows.reduce((a, r) => a + r.visitTarget, 0)
                const completed = rows.reduce((a, r) => a + r.completed, 0)
                return (
                  <tr key={t.id}>
                    <td>
                      <span className="terr-dot" style={{ background: t.color }} />
                      <b>{t.short}</b> · {repById(t.repId)?.name}
                    </td>
                    {weeks.map(w => {
                      const p = rows.find(r => r.week === w)!
                      const pct = Math.min(100, Math.round((p.completed / p.visitTarget) * 100))
                      const cls = pct >= 90 ? '' : pct >= 70 ? 'under' : 'risk'
                      return (
                        <td key={w}>
                          <div className="wk-cell">
                            <span style={{ fontSize: 12 }}>{p.completed}/{p.visitTarget}</span>
                            <span className={`bar ${cls}`}><span style={{ width: `${pct}%` }} /></span>
                            <span className="muted" style={{ fontSize: 11 }}>{p.visitTarget - p.completed} left</span>
                          </div>
                        </td>
                      )
                    })}
                    <td><b>{completed}/{target}</b></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="two-col" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="phead"><h3>Priority accounts now covered</h3></div>
          <div className="pbody">
            <div className="stat-row">
              <div className="mini-stat"><div className="v">{s.optimizationApplied ? '38' : '32'}<span className="muted" style={{ fontSize: 14 }}> / 42</span></div><div className="l">Priority accounts covered</div></div>
              <div className="mini-stat"><div className="v">{s.optimizationApplied ? '4' : '10'}</div><div className="l">Uncovered priority</div></div>
              <div className="mini-stat"><div className="v">{s.optimizationApplied ? '90%' : '76%'}</div><div className="l">Market coverage</div></div>
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
              {s.optimizationApplied
                ? 'The Month view reflects the applied Balanced proposal: South Richmond week-1 load was redistributed to weeks 3–4, freeing capacity for referral follow-ups.'
                : 'Apply the Balanced optimization on Home to rebalance South Richmond’s front-loaded weeks and lift priority coverage to 89%.'}
            </p>
          </div>
        </div>
        <div className="panel">
          <div className="phead"><h3>Weekly distribution — South Richmond</h3></div>
          <div className="pbody">
            <div className="funnel">
              {plans.filter(p => p.territoryId === 't-south').map(p => {
                const pct = Math.round((p.completed / p.visitTarget) * 100)
                return (
                  <div className="fb" key={p.week}>
                    <span className="lab">Week {p.week} — {p.completed}/{p.visitTarget}</span>
                    <span className="track"><span className="fill" style={{ width: `${Math.max(12, pct)}%` }}>{pct}%</span></span>
                  </div>
                )
              })}
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
              {s.optimizationApplied ? 'Balanced load across the month.' : 'Week 1 is over-scheduled while weeks 3–4 sit idle — the imbalance the optimizer corrects.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
