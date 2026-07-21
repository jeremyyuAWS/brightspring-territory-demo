import { useState } from 'react'
import { actions } from '../store'
import { BEFORE_AFTER, PROPOSED_CHANGES } from '../seed'
import { Drawer, LoadingSteps, useChoreography } from '../ui'

const STRATEGIES = [
  { id: 'balanced', name: 'Balanced Coverage', desc: 'Even coverage and capacity across territories', enabled: true },
  { id: 'more', name: 'More Priority Coverage', desc: 'Maximize priority-account coverage', enabled: false },
  { id: 'drive', name: 'Reduce Drive Time', desc: 'Minimize weekly travel burden', enabled: false },
  { id: 'protect', name: 'Protect Strategic Relationships', desc: 'Preserve named strategic accounts and champions', enabled: false },
]

const STEPS = ['Analyzing representative capacity', 'Checking priority coverage gaps', 'Building territory proposal']

type Phase = 'configure' | 'generating' | 'proposal'

export function TerritoryBuilder() {
  const [phase, setPhase] = useState<Phase>('configure')
  const [strategy, setStrategy] = useState('balanced')
  const [selChange, setSelChange] = useState<string | null>(null)
  const done = useChoreography(STEPS, phase === 'generating', () => setPhase('proposal'))

  return (
    <Drawer wide title="Territory Builder" onClose={() => actions.closeBuilder()}
      subtitle={<span className="badge sim">◆ Simulated · South Richmond</span>}
      footer={
        phase === 'proposal'
          ? <>
            <button className="btn" onClick={() => setPhase('configure')}>Back</button>
            <button className="btn primary" onClick={() => actions.applyOptimization()}>Apply simulation</button>
          </>
          : phase === 'configure'
            ? <>
              <button className="btn" onClick={() => actions.closeBuilder()}>Cancel</button>
              <button className="btn primary" onClick={() => setPhase('generating')}>Generate proposal</button>
            </>
            : <button className="btn" disabled>Generating…</button>
      }>

      {phase === 'configure' && (
        <>
          <div className="callout">
            <span className="ico">◆</span>
            <div><b>Diagnosis:</b> South Richmond is At Risk — 6 priority accounts uncovered, rep at 112% capacity, 9.7 drive hrs/wk.</div>
          </div>
          <div className="section-title">Optimization strategy</div>
          {STRATEGIES.map(st => (
            <label key={st.id} className={`change-card ${strategy === st.id ? 'sel' : ''}`} style={{ display: 'block', opacity: st.enabled ? 1 : 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="radio" name="strat" checked={strategy === st.id} disabled={!st.enabled}
                  onChange={() => st.enabled && setStrategy(st.id)} />
                <div>
                  <h4 style={{ display: 'inline' }}>{st.name}</h4>{!st.enabled && <span className="badge neutral" style={{ marginLeft: 8 }}>Demo: Balanced only</span>}
                  <div className="meta">{st.desc}</div>
                </div>
              </div>
            </label>
          ))}
          <div className="section-title">Locked constraints</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-2)' }}>
            <li>Retain named strategic accounts</li>
            <li>Cap daily visits per rep</li>
            <li>Respect geographic / zip adjacency</li>
            <li>Locked accounts cannot move automatically</li>
          </ul>
        </>
      )}

      {phase === 'generating' && (
        <div style={{ padding: '20px 0' }}>
          <div className="section-title">Building Balanced Coverage proposal</div>
          <LoadingSteps steps={STEPS} done={done} />
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Deterministic simulation — no live optimization call.</p>
        </div>
      )}

      {phase === 'proposal' && (
        <>
          <div className="section-title">Before / After — expected impact</div>
          <table className="ba-table">
            <thead><tr><th>Metric</th><th>Before</th><th></th><th>After</th><th>Change</th></tr></thead>
            <tbody>
              {BEFORE_AFTER.map(r => (
                <tr key={r.metric}>
                  <td>{r.metric}</td>
                  <td className="before">{r.before}</td>
                  <td><span className="arrow">→</span></td>
                  <td className="after">{r.after}</td>
                  <td className="chg">{r.change}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="section-title">Proposed changes — select to inspect</div>
          {PROPOSED_CHANGES.map(c => (
            <div key={c.id} className={`change-card ${selChange === c.id ? 'sel' : ''}`} onClick={() => setSelChange(selChange === c.id ? null : c.id)}>
              <h4>
                {c.flagOnly ? '⚑' : '↔'} {c.title}
                {c.flagOnly && <span className="badge watch" style={{ marginLeft: 4 }}>Review flag</span>}
              </h4>
              <div className="meta">{c.detail}</div>
              {selChange === c.id && (
                <div className="why">
                  <div><b>Why:</b> {c.reason}</div>
                  <div><b>Impact:</b> {c.impact}</div>
                  {c.constraint && <div><b>Constraint:</b> {c.constraint}</div>}
                </div>
              )}
            </div>
          ))}
          <div className="callout" style={{ background: '#ecfeff', borderColor: '#a5f3fc', color: '#155e75' }}>
            <span className="ico">ℹ</span>
            <div>Applying <b>updates demonstration data only</b>. No CRM, territory, or calendar records will be changed. Reversible via Undo; Reset restores the full baseline.</div>
          </div>
        </>
      )}
    </Drawer>
  )
}
