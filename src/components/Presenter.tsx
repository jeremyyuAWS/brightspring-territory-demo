import { useEffect } from 'react'
import { actions, useStore } from '../store'

// Guided walkthrough of the management decision, for presenting to leadership.
// Each step's canonical app state is set by actions.presenterStepTo(n) in the store;
// this component is just the narration + transport controls.
const SCRIPT: { title: string; caption: string; narration: string }[] = [
  {
    title: 'Baseline',
    caption: 'Richmond market today',
    narration: 'Richmond is at 76% priority coverage. One territory — South Richmond — is At Risk: 6 priority accounts have no visit this month, and its rep is at 112% capacity.',
  },
  {
    title: 'Diagnose',
    caption: 'Pinpoint the problem',
    narration: 'Open Territory Builder on South Richmond. The 6 uncovered priority accounts pulse on the map. The diagnosis is capacity, not effort — Jordan Ellis is overloaded with 9.7 drive hours a week.',
  },
  {
    title: 'Analyze',
    caption: 'Evaluate the options',
    narration: 'The optimizer evaluates rep capacity, priority-coverage gaps, and geographic adjacency — within locked constraints like retaining strategic accounts. Deterministic, no live call.',
  },
  {
    title: 'Proposal',
    caption: 'Balanced Coverage plan',
    narration: 'The Balanced Coverage proposal lifts priority coverage 76% → 90% and clears the at-risk territory. Elmington Rehabilitation reassigns South → Central, staying with Maya Chen who has capacity.',
  },
  {
    title: 'Apply',
    caption: 'Commit the simulation',
    narration: 'Apply the plan. Market coverage moves to 90%, at-risk territories to zero, and South Richmond turns Healthy. Nothing is written to any live CRM, territory, or calendar system — it is reversible.',
  },
  {
    title: 'Business impact',
    caption: 'One decision, propagated',
    narration: 'South Richmond is now Healthy, the strategic relationship is retained, and the change flows through to rep capacity, plans, and coverage. That is the point: one management decision, coherently propagated.',
  },
]

export function Presenter() {
  const s = useStore()
  const on = s.presenterOn
  const step = s.presenterStep
  const last = SCRIPT.length - 1

  const go = (n: number) => actions.presenterStepTo(Math.max(0, Math.min(last, n)))

  // keyboard transport: ← / → to move, Esc to exit
  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(step + 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(step - 1) }
      else if (e.key === 'Escape') { e.preventDefault(); actions.exitPresenter() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on, step])

  if (!on) return null
  const cur = SCRIPT[step]

  return (
    <div className={'presenter' + (s.builderOpen ? ' with-drawer' : '')} role="region" aria-label="Guided walkthrough">
      <div className="presenter-rail">
        <div className="presenter-head">
          <span className="presenter-badge">◆ Guided walkthrough</span>
          <div className="presenter-dots">
            {SCRIPT.map((st, i) => (
              <button key={st.title} className={'pdot' + (i === step ? ' on' : i < step ? ' done' : '')}
                title={st.title} aria-label={`Step ${i + 1}: ${st.title}`} onClick={() => go(i)} />
            ))}
          </div>
          <button className="presenter-exit" onClick={() => actions.exitPresenter()} aria-label="Exit walkthrough">✕ Exit</button>
        </div>
        <div className="presenter-body">
          <div className="presenter-step">
            <span className="presenter-n">{step + 1}/{SCRIPT.length}</span>
            <div>
              <div className="presenter-title">{cur.title} <span className="presenter-caption">· {cur.caption}</span></div>
              <div className="presenter-narration">{cur.narration}</div>
            </div>
          </div>
          <div className="presenter-controls">
            <button className="btn" onClick={() => go(0)} disabled={step === 0} title="Restart">↺</button>
            <button className="btn" onClick={() => go(step - 1)} disabled={step === 0}>‹ Prev</button>
            {step < last
              ? <button className="btn primary" onClick={() => go(step + 1)}>Next ›</button>
              : <button className="btn primary" onClick={() => actions.exitPresenter()}>Finish</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
