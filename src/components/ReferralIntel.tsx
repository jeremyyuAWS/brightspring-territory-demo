import { useStore, actions } from '../store'
import { referralRisks, riskSummary, dormantSources } from '../intel'
import { territoryById, repById } from '../selectors'

export function RiskRecoveryCard() {
  const s = useStore()
  const risks = referralRisks(s.referrals).slice(0, 4)
  const sum = riskSummary(s.referrals)
  const queued = new Set(s.tasks.map(t => t.id))
  if (sum.total === 0) return null
  return (
    <div className="panel">
      <div className="phead">
        <h3>Referral risk &amp; recovery</h3>
        <span className="badge risk" style={{ fontSize: 11 }}>{sum.total} need attention</span>
      </div>
      <div className="pbody">
        <button className="intel-summary" onClick={() => actions.selectTerritory('t-south')}>
          <b>{sum.southCount} South Richmond referrals are at risk.</b> Reassigning one follow-up and moving two account visits could protect an estimated <b>{sum.protectedAdmissions} admissions</b>.
          <span className="badge sim" style={{ marginLeft: 6, fontSize: 10 }}>◆ simulated</span>
        </button>
        {risks.map(r => (
          <div key={r.referral.id} className="risk-row">
            <div className="risk-head">
              <span className={`sev-dot ${r.severity}`} />
              <b>{r.referral.id}</b>
              <span className="muted" style={{ fontSize: 12 }}>{territoryById(r.referral.territoryId)?.short} · {r.aging}d aging</span>
              <span className="badge neutral" style={{ fontSize: 10, marginLeft: 'auto' }}>{r.reasons[0]}</span>
            </div>
            <div className="risk-rec">→ {r.recovery}</div>
            <button className="btn sm" disabled={queued.has(`tk-rec-${r.referral.id}`)}
              onClick={() => actions.applyRecovery(r.referral.id, r.referral.sourceOrg, r.recovery)}>
              {queued.has(`tk-rec-${r.referral.id}`) ? '✓ Queued' : 'Queue recovery'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LoyaltyLossCard() {
  const s = useStore()
  const sources = dormantSources()
  const queued = new Set(s.tasks.map(t => t.id))
  return (
    <div className="panel">
      <div className="phead">
        <h3>Loyalty-loss watch</h3>
        <span className="badge watch" style={{ fontSize: 11 }}>{sources.length} dormant sources</span>
      </div>
      <div className="pbody">
        {sources.map((src, i) => (
          <div key={src.id} className={`loyalty-row ${i === 0 ? 'hero' : ''}`}>
            <div className="loyalty-head">
              <b>{src.name}</b>
              {src.competitorSignal && <span className="badge risk" style={{ fontSize: 10 }}>competitor signal</span>}
            </div>
            <div className="loyalty-body">
              Averaged <b>{src.avgPerMonth}/mo</b> → <b style={{ color: 'var(--risk)' }}>0 in {src.daysSinceLast} days</b>
              {src.adminChangeDays ? `, following an administrator change ${src.adminChangeDays} days ago.` : '.'}
              <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Rep: {src.currentRep} · recoverable ≈ {src.recoverablePerMonth}/mo <span className="badge sim" style={{ fontSize: 10 }}>◆ est.</span></div>
            </div>
            <div className="loyalty-win">→ {src.winBack}</div>
            <button className="btn sm" disabled={queued.has(`tk-src-${src.name}`)}
              onClick={() => actions.addSourceToPlan(src.name, src.winBack)}>
              {queued.has(`tk-src-${src.name}`) ? '✓ Added to plan' : 'Add to planning period'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// small helper kept for potential reuse
export function repOf(territoryId: string) { return repById(territoryById(territoryId)?.repId ?? '')?.name ?? '' }
