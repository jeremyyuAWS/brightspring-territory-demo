import { useState, useEffect } from 'react'
import { actions } from '../store'
import { BEFORE_AFTER, PROPOSED_CHANGES } from '../seed'
import { Drawer, LoadingSteps, useChoreography, AnimatedNumber } from '../ui'

// The proposal is optimized for Balanced Coverage. Secondary goals are honored as constraints
// by the optimizer, rather than shown as separate (and disabled) strategy toggles.
const OBJECTIVE = {
  name: 'Balanced Coverage',
  desc: 'Even priority coverage and rep capacity across territories, within the locked constraints below.',
  honors: ['Maximizes priority-account coverage', 'Contains weekly drive time', 'Preserves strategic relationships'],
}

const STEPS = ['Analyzing representative capacity', 'Checking priority coverage gaps', 'Building territory proposal']

type Phase = 'configure' | 'generating' | 'proposal'

export function TerritoryBuilder() {
  const [phase, setPhase] = useState<Phase>('configure')
  const [selChange, setSelChange] = useState<string | null>(null)
  const done = useChoreography(STEPS, phase === 'generating', () => setPhase('proposal'))
  // drive the map choreography: diagnose (pulse the problem) → proposal (show the move)
  useEffect(() => { actions.setOptimizePhase(phase === 'proposal' ? 'proposal' : 'diagnose') }, [phase])

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
          <div className="callout risk">
            <span className="ico">▲</span>
            <div><b>Diagnosis:</b> South Richmond is At Risk — 6 priority accounts uncovered, rep at 112% capacity, 9.7 drive hrs/wk.</div>
          </div>
          <div className="section-title">Optimization objective</div>
          <div className="change-card sel" style={{ cursor: 'default' }}>
            <h4>◎ {OBJECTIVE.name}</h4>
            <div className="meta">{OBJECTIVE.desc}</div>
            <div className="obj-honors">
              {OBJECTIVE.honors.map(h => <span key={h} className="obj-chip">✓ {h}</span>)}
            </div>
          </div>
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
              {BEFORE_AFTER.map((r, i) => (
                <tr key={r.metric}>
                  <td>{r.metric}</td>
                  <td className="before">{r.before}</td>
                  <td><span className="arrow">→</span></td>
                  <td className="after">
                    <AnimatedNumber value={r.aNum} startFrom={r.bNum} decimals={r.dec} suffix={r.sfx} ms={900 + i * 120} />
                  </td>
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
