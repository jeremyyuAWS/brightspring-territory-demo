import { useState } from 'react'
import { useStore, actions } from '../store'
import { TERRITORIES, PLANS_BASELINE, PLANS_OPTIMIZED } from '../seed'
import { repById } from '../selectors'
import { Drawer } from '../ui'

export function Plan() {
  const s = useStore()
  const [horizon, setHorizon] = useState<'Week' | 'Period' | 'Month'>('Month')
  const [optOpen, setOptOpen] = useState(false)
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
        <button className="btn primary sm" style={{ alignSelf: 'center' }} onClick={() => setOptOpen(true)}>◆ Optimize plan</button>
        {s.planStrategy && <span className="badge sim" style={{ alignSelf: 'center' }}>◇ {s.planStrategy} applied</span>}
        {s.optimizationApplied
          ? <span className="badge sim" style={{ alignSelf: 'center' }}>◆ Reflecting territory optimization</span>
          : <span className="badge neutral" style={{ alignSelf: 'center' }}>Baseline plan</span>}
      </div>

      {optOpen && <PlanOptimizer onClose={() => setOptOpen(false)} />}

      {s.planStrategy && (
        <div className="callout" style={{ background: '#f2f7fd', borderColor: '#bcd4ee', color: '#12385f', marginBottom: 14 }}>
          <span className="ico">◆</span>
          <div><b>{s.planStrategy} plan applied.</b> The coverage grid, calendar, and route map now reflect the optimized 4-week distribution — existing meetings protected. Reversible via Undo.</div>
        </div>
      )}
      {s.monthlyPlanApplied && !s.planStrategy && (
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

// §4 plan optimization strategies + approval
interface PlanStrategy {
  id: string; name: string; desc: string
  metrics: { label: string; value: string; good?: boolean }[]
  constraints: string[]
}
const PLAN_STRATEGIES: PlanStrategy[] = [
  {
    id: 'Balanced', name: 'Balanced', desc: 'Even coverage and capacity across the four weeks.',
    metrics: [
      { label: 'Meetings moved', value: '6' }, { label: 'Accounts added', value: '4', good: true },
      { label: 'Visits deferred', value: '2' }, { label: 'Coverage gained', value: '+14 pts', good: true },
      { label: 'Drive time saved', value: '−0.7 hrs/wk', good: true }, { label: 'Conflicts resolved', value: '3', good: true },
    ],
    constraints: ['Existing meetings protected', 'Locked strategic accounts unchanged', 'Daily visit cap respected'],
  },
  {
    id: 'More Coverage', name: 'More Coverage', desc: 'Maximize priority-account coverage this period.',
    metrics: [
      { label: 'Meetings moved', value: '9' }, { label: 'Accounts added', value: '7', good: true },
      { label: 'Visits deferred', value: '4' }, { label: 'Coverage gained', value: '+19 pts', good: true },
      { label: 'Drive time saved', value: '−0.2 hrs/wk' }, { label: 'Conflicts resolved', value: '2', good: true },
    ],
    constraints: ['Existing meetings protected', 'Higher drive burden accepted'],
  },
  {
    id: 'Front-load Priority', name: 'Front-load Priority', desc: 'Hit Tier-1 accounts early in the period.',
    metrics: [
      { label: 'Meetings moved', value: '7' }, { label: 'Accounts added', value: '5', good: true },
      { label: 'Visits deferred', value: '3' }, { label: 'Coverage gained', value: '+15 pts', good: true },
      { label: 'Drive time saved', value: '−0.3 hrs/wk', good: true }, { label: 'Conflicts resolved', value: '3', good: true },
    ],
    constraints: ['Tier-1 first two weeks', 'Existing meetings protected'],
  },
  {
    id: 'Reduce Drive Time', name: 'Reduce Drive Time', desc: 'Cluster visits geographically to cut travel.',
    metrics: [
      { label: 'Meetings moved', value: '8' }, { label: 'Accounts added', value: '2', good: true },
      { label: 'Visits deferred', value: '1' }, { label: 'Coverage gained', value: '+9 pts', good: true },
      { label: 'Drive time saved', value: '−1.4 hrs/wk', good: true }, { label: 'Conflicts resolved', value: '4', good: true },
    ],
    constraints: ['Zip-adjacency clustering', 'Existing meetings protected'],
  },
  {
    id: 'Lighter Fridays', name: 'Lighter Fridays', desc: 'Keep Fridays open for admin and buffer.',
    metrics: [
      { label: 'Meetings moved', value: '5' }, { label: 'Accounts added', value: '3', good: true },
      { label: 'Visits deferred', value: '2' }, { label: 'Coverage gained', value: '+12 pts', good: true },
      { label: 'Drive time saved', value: '−0.6 hrs/wk', good: true }, { label: 'Friday load', value: '−40%', good: true },
    ],
    constraints: ['Fridays reserved for admin', 'Existing meetings protected'],
  },
]

function PlanOptimizer({ onClose }: { onClose: () => void }) {
  const [sel, setSel] = useState('Balanced')
  const [applied, setApplied] = useState(false)
  const strat = PLAN_STRATEGIES.find(x => x.id === sel)!
  return (
    <Drawer wide title="Optimize plan" onClose={onClose}
      subtitle={<span className="badge sim">◆ Simulated · preview before apply</span>}
      footer={applied
        ? <button className="btn primary" onClick={onClose}>Done</button>
        : <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { actions.applyPlanStrategy(strat.name, `Coverage ${strat.metrics.find(m => m.label === 'Coverage gained')?.value}; ${strat.metrics[0].value} meetings moved`); setApplied(true) }}>Apply simulation</button>
        </>}>
      {applied ? (
        <div className="callout" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}>
          <span className="ico">✓</span>
          <div><b>{strat.name} plan applied.</b> The coverage grid, calendar, and route map update together. Logged to the audit trail — reversible via Undo.</div>
        </div>
      ) : (
        <>
          <div className="section-title">Strategy</div>
          {PLAN_STRATEGIES.map(st => (
            <label key={st.id} className={`change-card ${sel === st.id ? 'sel' : ''}`} style={{ display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="radio" name="planstrat" checked={sel === st.id} onChange={() => setSel(st.id)} />
                <div><h4 style={{ display: 'inline' }}>{st.name}</h4><div className="meta">{st.desc}</div></div>
              </div>
            </label>
          ))}
          <div className="section-title">Expected impact — {strat.name}</div>
          <div className="stat-row">
            {strat.metrics.map(m => (
              <div className="mini-stat" key={m.label} style={{ minWidth: 130 }}>
                <div className="v" style={{ fontSize: 17, color: m.good ? 'var(--healthy)' : 'inherit' }}>{m.value}</div>
                <div className="l">{m.label}</div>
              </div>
            ))}
          </div>
          <div className="section-title">Constraints protected</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-2)' }}>
            {strat.constraints.map(c => <li key={c}>{c}</li>)}
          </ul>
          <div className="callout" style={{ marginTop: 12, background: '#ecfeff', borderColor: '#a5f3fc', color: '#155e75' }}>
            <span className="ico">ℹ</span><div>Applying updates the coverage grid, calendar, and route map together — preview and approval required. Reversible via Undo.</div>
          </div>
        </>
      )}
    </Drawer>
  )
}
