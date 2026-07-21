import { useState } from 'react'
import { useStore, actions } from '../store'
import { TERRITORIES, PLANS_BASELINE, PLANS_OPTIMIZED, ACCOUNTS } from '../seed'
import { repById, territoryById } from '../selectors'
import { Drawer } from '../ui'

type Horizon = 'Week' | 'Period' | 'Month'
const HORIZON_RANGE: Record<Horizon, string> = {
  Week: 'Jul 20 – 24, 2026',
  Period: 'Jul 6 – Aug 14, 2026 · 6 weeks',
  Month: 'July 1 – 31, 2026',
}
const CONSTRAINTS = [
  { label: 'Existing meetings protected', detail: '11 confirmed meetings are never moved automatically.' },
  { label: 'Home by 5:30', detail: 'Daily schedules keep each rep home by their target.' },
  { label: 'Fridays lighter', detail: 'Fridays reserved ~40% for admin & buffer.' },
  { label: 'Max 6 visits/day', detail: 'Per-rep daily visit cap respected.' },
  { label: 'Lunch protected', detail: '30-minute midday hold kept on every route.' },
  { label: 'Strategic accounts locked', detail: '3 named strategic accounts cannot move automatically.' },
]
const UNCOVERED = [
  { name: 'Greenfield Manor', reason: 'No rep capacity this period', territory: 'South' },
  { name: 'Riverside Hospice', reason: 'Decision-maker contact unavailable', territory: 'East' },
  { name: 'Westlake ALF', reason: 'Outside current route clusters', territory: 'West' },
  { name: 'Memorial Clinic', reason: 'Awaiting manager review (strategic)', territory: 'Central' },
]

interface CellStatus { label: string; cls: string }
function cellStatus(completed: number, target: number, capacity: number): CellStatus {
  if (completed >= target) return { label: 'Complete', cls: 'complete' }
  if (target > capacity) return { label: 'Over capacity', cls: 'over' }
  const pct = completed / target
  if (pct >= 0.9) return { label: 'On track', cls: 'ontrack' }
  if (pct >= 0.6) return { label: 'Needs planning', cls: 'needs' }
  return { label: 'At risk', cls: 'atrisk' }
}

export function Plan() {
  const s = useStore()
  const [horizon, setHorizon] = useState<Horizon>('Month')
  const [optOpen, setOptOpen] = useState(false)
  const [cell, setCell] = useState<{ territoryId: string; week: number } | null>(null)
  const plans = s.optimizationApplied ? PLANS_OPTIMIZED : PLANS_BASELINE
  const weeks = horizon === 'Week' ? [1] : horizon === 'Period' ? [1, 2, 3] : [1, 2, 3, 4]
  const applied = s.optimizationApplied || s.planStrategy

  const covered = applied ? 38 : 32
  const risks = applied ? UNCOVERED.length : 6

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
        <div className="field">
          <label>Date range</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '6px 0' }}>
            <button className="date-nav" disabled>‹</button>
            {HORIZON_RANGE[horizon]}
            <button className="date-nav" disabled>›</button>
          </div>
        </div>
        <div className="spacer" />
        <button className="btn primary sm" style={{ alignSelf: 'center' }} onClick={() => setOptOpen(true)}>◆ Optimize plan ▾</button>
        {s.planStrategy && (
          <span className="status-chip" style={{ alignSelf: 'center' }}>
            <span className="dot" /> {s.planStrategy} plan · applied
            <button onClick={() => actions.undo()}>Undo</button>
          </span>
        )}
      </div>

      {/* plan-health summary */}
      <div className="plan-health">
        <div className="ph-headline"><b>{HORIZON_RANGE[horizon].split(' · ')[0]} · Richmond · 5 reps</b></div>
        <div className="ph-stats">
          <span><b>{covered} of 42</b> priority accounts covered</span>
          <span><b>82</b> visits planned</span>
          <span><b>6</b> open slots</span>
          <span className={risks ? 'ph-risk' : ''}><b>{risks}</b> unresolved risk{risks === 1 ? '' : 's'}</span>
        </div>
      </div>

      {/* constraint chips */}
      <div className="constraint-chips">
        <span className="cc-label">Constraints:</span>
        {CONSTRAINTS.map(c => <span key={c.label} className="cchip" title={c.detail}>🔒 {c.label}</span>)}
      </div>

      {optOpen && <PlanOptimizer onClose={() => setOptOpen(false)} />}
      {cell && <CellDetail territoryId={cell.territoryId} week={cell.week} onClose={() => setCell(null)} />}

      <div className="panel">
        <div className="phead">
          <h3>Coverage grid</h3>
          <span className="hint">{horizon} · click any cell to see the accounts</span>
        </div>
        <div className="pbody" style={{ overflowX: 'auto' }}>
          <table className="plan-grid">
            <thead>
              <tr>
                <th>Territory / Rep</th>
                {weeks.map(w => <th key={w}>Week {w}</th>)}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {TERRITORIES.map(t => {
                const rows = plans.filter(p => p.territoryId === t.id && weeks.includes(p.week))
                const target = rows.reduce((a, r) => a + r.visitTarget, 0)
                const completed = rows.reduce((a, r) => a + r.completed, 0)
                return (
                  <tr key={t.id}>
                    <td><span className="terr-dot" style={{ background: t.color }} /><b>{t.short}</b> · {repById(t.repId)?.name}</td>
                    {weeks.map(w => {
                      const p = rows.find(r => r.week === w)!
                      const cap = p.visitTarget + 1
                      const st = cellStatus(p.completed, p.visitTarget, cap)
                      const upcoming = p.planned - p.completed
                      return (
                        <td key={w} className="grid-cell" onClick={() => setCell({ territoryId: t.id, week: w })}>
                          <div className="wk-cell2">
                            <div className="wk-nums"><b>{p.planned}</b>/{p.visitTarget} <span className="muted">target</span></div>
                            <div className="wk-bar">
                              <span className="seg done" style={{ width: `${(p.completed / cap) * 100}%` }} />
                              <span className="seg sched" style={{ width: `${(Math.max(0, upcoming) / cap) * 100}%` }} />
                            </div>
                            <div className="wk-meta"><span className="muted">{p.completed} done · {Math.max(0, upcoming)} upcoming</span></div>
                            <span className={`cell-status ${st.cls}`}>{st.label}</span>
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
          <div className="grid-legend">
            <span><span className="seg done" style={{ display: 'inline-block', width: 14, height: 8, borderRadius: 2 }} /> completed</span>
            <span><span className="seg sched" style={{ display: 'inline-block', width: 14, height: 8, borderRadius: 2 }} /> scheduled</span>
            <span className="muted">remaining is the empty track</span>
          </div>
        </div>
      </div>

      <div className="two-col" style={{ marginTop: 16 }}>
        <CoveragePanel applied={!!applied} placed={s.placedRemaining} />
        <div className="panel">
          <div className="phead"><h3>Weekly distribution — South Richmond</h3><span className="hint">planned vs capacity</span></div>
          <div className="pbody">
            <table className="dist-table">
              <thead><tr><th>Week</th><th className="num">Planned</th><th className="num">Target</th><th className="num">Capacity</th><th>Status</th></tr></thead>
              <tbody>
                {plans.filter(p => p.territoryId === 't-south').map(p => {
                  const cap = p.visitTarget + 1
                  const st = cellStatus(p.completed, p.visitTarget, cap)
                  return (
                    <tr key={p.week}>
                      <td>Week {p.week}</td>
                      <td className="num">{p.planned}</td><td className="num">{p.visitTarget}</td><td className="num">{cap}</td>
                      <td><span className={`cell-status ${st.cls}`}>{st.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              {applied ? 'Balanced load across the month — no week over capacity.' : 'Week 1 is over-scheduled while weeks 3–4 sit idle — the imbalance the optimizer corrects.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- compact coverage + uncovered panel ----------
function CoveragePanel({ applied, placed }: { applied: boolean; placed: boolean }) {
  const covered = applied ? 38 : 32
  const remaining = placed ? [] : UNCOVERED.slice(0, applied ? 4 : UNCOVERED.length)
  const pct = Math.round((covered / 42) * 100)
  return (
    <div className="panel">
      <div className="phead"><h3>Priority coverage</h3>{placed && <span className="badge healthy" style={{ fontSize: 11 }}>✓ all placed</span>}</div>
      <div className="pbody">
        <div className="cov-head">
          <div className="cov-big">{covered} / 42 <span>· {pct}%</span></div>
          <div className="muted" style={{ fontSize: 12.5 }}>{remaining.length ? `${remaining.length} account${remaining.length === 1 ? '' : 's'} still need placement.` : 'Every priority account is placed.'}</div>
        </div>
        {remaining.length > 0 && (
          <>
            <div className="section-title" style={{ margin: '10px 0 4px' }}>Still uncovered</div>
            {remaining.map(a => (
              <div key={a.name} className="uncov-row">
                <div><b>{a.name}</b> <span className="muted" style={{ fontSize: 12 }}>· {a.territory}</span><div className="muted" style={{ fontSize: 12 }}>{a.reason}</div></div>
              </div>
            ))}
            <button className="btn primary" style={{ width: '100%', marginTop: 10 }} onClick={() => actions.placeRemaining(remaining)}>Place remaining {remaining.length}</button>
          </>
        )}
        {placed && <div className="callout" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', marginTop: 4 }}><span className="ico">✓</span><div>All {UNCOVERED.length} accounts placed and added to the follow-up queue. Reversible via Undo.</div></div>}
      </div>
    </div>
  )
}

// ---------- cell detail drawer ----------
function CellDetail({ territoryId, week, onClose }: { territoryId: string; week: number; onClose: () => void }) {
  const t = territoryById(territoryId)!
  const accts = ACCOUNTS.filter(a => a.territoryId === territoryId).slice(0, 4)
  const days = ['Mon 10:00', 'Tue 1:30', 'Wed 11:00', 'Thu 9:30']
  return (
    <Drawer title={`${t.name} · Week ${week}`} onClose={onClose}
      subtitle={<span className="muted">{repById(t.repId)?.name} · scheduled visits</span>}
      footer={<>
        <button className="btn" onClick={onClose}>Close</button>
        <button className="btn" onClick={() => { actions.setTab('today'); onClose() }}>Open in Today →</button>
      </>}>
      <div className="section-title">Scheduled this week</div>
      {accts.map((a, i) => (
        <div key={a.id} className="cell-visit">
          <span className="cv-time">{days[i]}</span>
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 13 }}>{a.name}</b>
            <div className="muted" style={{ fontSize: 12 }}>{a.priority} priority · {a.facilityType}</div>
          </div>
          <button className="btn sm" onClick={() => { actions.openAccount(a.id); onClose() }}>Open →</button>
        </div>
      ))}
      <div className="cell-visit" style={{ opacity: .7 }}>
        <span className="cv-time muted">—</span>
        <div style={{ flex: 1 }}><b style={{ fontSize: 13 }}>1 unscheduled priority account</b><div className="muted" style={{ fontSize: 12 }}>needs placement</div></div>
        <span className="badge watch" style={{ fontSize: 10 }}>open slot</span>
      </div>
      <div className="section-title" style={{ marginTop: 14 }}>Actions</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn sm">+ Add account</button>
        <button className="btn sm">Move visit</button>
        <button className="btn sm">Reorder route</button>
        <button className="btn sm">Assign to another rep</button>
      </div>
    </Drawer>
  )
}

// ---------- §4 plan optimization strategies + full change summary ----------
interface PlanStrategy { id: string; name: string; desc: string }
const PLAN_STRATEGIES: PlanStrategy[] = [
  { id: 'Balanced', name: 'Balanced', desc: 'Even coverage and capacity across the four weeks.' },
  { id: 'More Coverage', name: 'More Coverage', desc: 'Maximize priority-account coverage this period.' },
  { id: 'Front-load Priority', name: 'Front-load Priority', desc: 'Hit Tier-1 accounts early in the period.' },
  { id: 'Reduce Drive Time', name: 'Reduce Drive Time', desc: 'Cluster visits geographically to cut travel.' },
  { id: 'Lighter Fridays', name: 'Lighter Fridays', desc: 'Keep Fridays open for admin and buffer.' },
  { id: 'Protect Relationships', name: 'Protect Relationships', desc: 'Preserve named strategic accounts and champions.' },
]
const BEFORE_AFTER = [
  { metric: 'Priority coverage', before: '76%', after: '90%' },
  { metric: 'Uncovered priority accounts', before: '10', after: '4' },
  { metric: 'Over-capacity reps', before: '2', after: '0' },
  { metric: 'Weekly drive time', before: '38.4 hrs', after: '34.1 hrs' },
  { metric: 'Schedule conflicts', before: '3', after: '0' },
]
const CHANGES = [
  'Elmington moved from Jordan to Maya',
  'Woodhaven moved from Week 1 to Week 3',
  'Six priority accounts added',
  'Two lower-priority visits deferred',
  'Three existing meetings protected',
]
const PROTECTED = ['3 locked strategic accounts', '2 confirmed meetings', 'Personal commitments', 'Existing referral appointments']
const REMAINING = ['4 uncovered priority accounts', '1 strategic account awaiting manager decision', '2 referrals without follow-up dates', '1 rep with limited Week 4 availability']
const DOWNSTREAM = ['Calendar: 8 events updated', 'Route map: 3 routes recalculated', 'Coverage plan: 6 accounts added', 'Referral follow-ups: 2 protected', 'CRM: no changes made']

function PlanOptimizer({ onClose }: { onClose: () => void }) {
  const s = useStore()
  const [sel, setSel] = useState('Balanced')
  const [phase, setPhase] = useState<'configure' | 'applied'>(s.planStrategy ? 'applied' : 'configure')
  const strat = PLAN_STRATEGIES.find(x => x.id === (s.planStrategy ?? sel))!

  return (
    <Drawer wide title="Optimize plan" onClose={onClose}
      subtitle={<span className="badge sim">◆ Simulated · preview before apply</span>}
      footer={phase === 'applied'
        ? <>
          <button className="btn" onClick={() => actions.undo()}>Undo</button>
          <button className="btn primary" onClick={onClose}>View updated plan</button>
        </>
        : <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { actions.applyPlanStrategy(strat.name, `Coverage 76%→90%; 6 meetings moved`); setPhase('applied') }}>Apply simulation</button>
        </>}>

      {phase === 'configure' && (
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
          <div className="callout" style={{ marginTop: 8, background: '#ecfeff', borderColor: '#a5f3fc', color: '#155e75' }}>
            <span className="ico">ℹ</span><div>Applying updates the coverage grid, calendar, and route map together — preview and approval required. Reversible via Undo.</div>
          </div>
        </>
      )}

      {phase === 'applied' && (
        <>
          <div className="cp-prop-head" style={{ borderRadius: 10, marginBottom: 12 }}>
            <b>{strat.name} plan applied</b><span className="badge healthy">✓ Applied</span>
          </div>

          <div className="section-title">Before / after</div>
          <table className="ba-table">
            <thead><tr><th>Impact</th><th>Before</th><th></th><th>After</th></tr></thead>
            <tbody>
              {BEFORE_AFTER.map(r => (
                <tr key={r.metric}><td>{r.metric}</td><td className="before">{r.before}</td><td><span className="arrow">→</span></td><td className="after">{r.after}</td></tr>
              ))}
            </tbody>
          </table>

          <div className="section-title">Changes made</div>
          <ul className="plan-list">{CHANGES.map(c => <li key={c}>✓ {c}</li>)}</ul>

          <div className="section-title">Constraints protected</div>
          <ul className="plan-list muted-list">{PROTECTED.map(c => <li key={c}>🔒 {c}</li>)}</ul>

          <div className="section-title">Still needs attention</div>
          <ul className="plan-list warn-list">{REMAINING.map(c => <li key={c}>⚠ {c}</li>)}</ul>

          <div className="section-title">Downstream impact <span className="badge sim" style={{ fontSize: 10 }}>◆ simulated</span></div>
          <ul className="plan-list muted-list">{DOWNSTREAM.map(c => <li key={c}>↳ {c}</li>)}</ul>
        </>
      )}
    </Drawer>
  )
}
