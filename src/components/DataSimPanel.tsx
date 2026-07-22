import { Drawer } from '../ui'
import { actions } from '../store'

const ROWS: { feature: string; kind: 'Mocked' | 'Simulated' | 'Future'; note: string }[] = [
  { feature: 'Territory, rep & account data', kind: 'Mocked', note: 'Synthetic, non-PHI seed (seed-v1). 5 territories, 6 reps, 52 accounts.' },
  { feature: 'Health scores & KPIs', kind: 'Mocked', note: 'Deterministic weighted model; identical every run.' },
  { feature: 'Optimize territories', kind: 'Simulated', note: 'Fixed Balanced proposal; no live solver in the demo path.' },
  { feature: 'Apply / Undo / Reset', kind: 'Simulated', note: 'Writes to in-browser demo state only.' },
  { feature: 'Referral logging & disposition', kind: 'Simulated', note: 'Synthetic identifiers (e.g. R-1042). No patient PHI.' },
  { feature: 'Leadership snapshot export', kind: 'Simulated', note: 'Generates a static HTML summary of current state.' },
  { feature: 'Salesforce / HCHB / Morado sync', kind: 'Future', note: 'Shown as a queued mock; no live integration.' },
]

const KIND_CLASS: Record<string, string> = { Mocked: 'blue', Simulated: 'sim', Future: 'neutral' }

export function DataSimPanel({ onClose }: { onClose: () => void }) {
  return (
    <Drawer title="Data & Simulation" subtitle={<span className="muted">What is real, mocked, or future in this demo</span>} onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Got it</button>}>
      <div className="callout">
        <span className="ico">◆</span>
        <div>This environment uses <b>synthetic, non-PHI data</b>. Every action is deterministic and reversible. Nothing here writes to production Salesforce, HCHB, or referral feeds.</div>
      </div>
      <table className="data">
        <thead><tr><th>Capability</th><th>Status</th><th>Detail</th></tr></thead>
        <tbody>
          {ROWS.map(r => (
            <tr key={r.feature} style={{ cursor: 'default' }}>
              <td style={{ fontWeight: 600 }}>{r.feature}</td>
              <td><span className={`badge ${KIND_CLASS[r.kind]}`}>{r.kind}</span></td>
              <td className="muted" style={{ fontSize: 12.5 }}>{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Production path: the same model can be fed by Salesforce / Morado account data and HCHB referral signals once interfaces are agreed.
      </p>

      <div className="section-title">Presenting to leadership</div>
      <div className="callout" style={{ marginBottom: 10 }}>
        <span className="ico">▶</span>
        <div>Guided walkthrough steps the whole story — Baseline → Diagnose → Analyze → Proposal → Apply → Business impact — with narration and ← / → keys. The app drives itself; no manual clicking mid-demo.</div>
      </div>
      <button className="btn primary" style={{ width: '100%' }} onClick={() => { actions.startPresenter(); onClose() }}>
        ▶ Start guided walkthrough
      </button>
    </Drawer>
  )
}
