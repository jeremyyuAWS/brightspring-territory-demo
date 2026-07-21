import { actions, useStore } from '../store'
import { ACCOUNTS, OPTIMIZED_CAPACITY } from '../seed'
import { repById, territoryById, accountCovered } from '../selectors'
import type { Account } from '../types'

const REL_LABEL: Record<string, string> = { current: 'Current customer', growth: 'Growth opportunity', prospect: 'Prospect', at_risk: 'At-risk relationship' }
const REL_HEX: Record<string, string> = { current: '#2563eb', growth: '#0d9488', prospect: '#7c3aed', at_risk: '#dc2626' }

// deterministic small helpers (no PRNG — stable per account)
function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) }
function decisionMaker(a: Account) {
  const roles = ['Administrator', 'Director of Nursing', 'Discharge Planner', 'Case Management Lead']
  const first = ['Angela', 'Marcus', 'Priya', 'Denise', 'Robert', 'Lena', 'Carlos', 'Grace']
  const last = ['Reyes', 'Cole', 'Nguyen', 'Barnes', 'Ellison', 'Okafor', 'Halstead', 'Vaughn']
  const h = hash(a.id)
  return { name: `${first[h % first.length]} ${last[(h >> 3) % last.length]}`, role: roles[(h >> 5) % roles.length], tenure: 2 + (h % 8) }
}
// generalized explainable referral forecast (deterministic from account signals)
function forecast(a: Account) {
  const base = a.opportunityBand === 'high' ? 4 : a.opportunityBand === 'medium' ? 3 : 2
  const low = Math.max(1, base - 1), high = base + 1
  let conf = 55 + (a.opportunityBand === 'high' ? 18 : a.opportunityBand === 'medium' ? 10 : 2)
  conf += a.relationshipStatus === 'current' ? 8 : a.relationshipStatus === 'at_risk' ? -12 : 0
  conf -= a.lastContactDays > 30 ? 8 : 0
  conf = Math.max(40, Math.min(88, conf))
  const dm = decisionMaker(a)
  const evidence = [
    { label: 'Facility capacity', value: `${a.beds} beds · ${a.facilityType.toLowerCase()} discharge volume`, positive: true },
    { label: 'Relationship', value: a.relationshipStatus === 'at_risk' ? 'Relationship cooling — needs attention' : `${dm.role} engaged (${dm.tenure}-yr tenure)`, positive: a.relationshipStatus !== 'at_risk' },
    { label: 'Recent activity', value: a.lastContactDays <= 14 ? `Visited ${a.lastContactDays}d ago` : `No visit in ${a.lastContactDays}d`, positive: a.lastContactDays <= 21 },
    { label: 'Service-line fit', value: a.whitespace.length ? `${a.whitespace[0]} whitespace open` : 'Core services penetrated', positive: a.whitespace.length > 0 },
  ]
  return { low, high, conf, evidence }
}
function nextAction(a: Account, covered: boolean) {
  if (!covered && a.isPriority) return { text: `Schedule a first visit this month — high-priority account with no coverage.`, cta: 'Add to plan' }
  if (a.relationshipStatus === 'at_risk') return { text: `Re-engage: relationship is cooling and a competitor may be circling.`, cta: 'Queue win-back' }
  if (a.whitespace.length) return { text: `Introduce ${a.whitespace[0]} — eligible service line not yet captured.`, cta: 'Draft cross-sell' }
  if (a.referralActive) return { text: `Advance the active referral and confirm preferred-provider terms.`, cta: 'Open account' }
  return { text: `Maintain cadence; account is healthy and well-covered.`, cta: 'Open account' }
}

export function FacilityModal() {
  const s = useStore()
  if (!s.facilityId) return null
  const a = ACCOUNTS.find(x => x.id === s.facilityId)
  if (!a) return null
  const covered = accountCovered(a, s.optimizationApplied)
  const rep = repById(territoryById(a.territoryId)!.repId)
  const ownerCap = rep ? (s.optimizationApplied ? OPTIMIZED_CAPACITY[rep.id] : rep.capacityPct) : 0
  const dm = decisionMaker(a)
  const fc = forecast(a)
  const act = nextAction(a, covered)

  return (
    <>
      <div className="scrim" onClick={() => actions.closeFacility()} />
      <div className="fac-modal" role="dialog" aria-modal="true">
        <div className="fac-head">
          <div>
            <div className="fac-title">{a.name}</div>
            <div className="fac-sub">{a.facilityType} · {a.beds} beds · {territoryById(a.territoryId)!.name}</div>
          </div>
          <button className="iconbtn" onClick={() => actions.closeFacility()}>×</button>
        </div>

        <div className="fac-badges">
          <span className="badge" style={{ background: '#eef4fb', color: 'var(--brand)' }}>{a.priority} priority</span>
          <span className="badge" style={{ background: '#f8fafc', color: REL_HEX[a.relationshipStatus], border: `1px solid ${REL_HEX[a.relationshipStatus]}33` }}>{REL_LABEL[a.relationshipStatus]}</span>
          {covered
            ? <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>Covered</span>
            : <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>Uncovered</span>}
          {a.referralActive && <span className="badge" style={{ background: '#f0fdfa', color: '#0f766e' }}>● Active referral</span>}
        </div>

        {rep && (
          <button className="fac-owner" onClick={() => actions.openRepDrill(rep.id, a.id)}>
            <span>Owner: <b>{rep.name}</b> · {ownerCap}% capacity</span>
            <span className="fac-owner-go">View rep intelligence →</span>
          </button>
        )}

        <div className="fac-body">
          <div className="fac-stats">
            <div className="fac-stat"><div className="v">{a.opportunityScore}</div><div className="l">Opportunity</div></div>
            <div className="fac-stat"><div className="v" style={{ color: a.lastContactDays > 30 ? 'var(--risk)' : 'inherit' }}>{a.lastContactDays}d</div><div className="l">Since last visit</div></div>
            <div className="fac-stat"><div className="v">{a.services.length}</div><div className="l">Live services</div></div>
            <div className="fac-stat"><div className="v" style={{ color: a.whitespace.length ? '#0d9488' : 'inherit' }}>{a.whitespace.length}</div><div className="l">Whitespace</div></div>
          </div>

          <div className="fac-forecast">
            <div className="ff-head">
              <span className="ff-tag">◆ AI-assisted forecast</span>
              <span className="ff-conf">{fc.conf}% confidence</span>
            </div>
            <div className="ff-big">{fc.low}–{fc.high} <span>referrals expected · next 30 days</span></div>
            <div className="ff-why">
              {fc.evidence.map(e => (
                <div className="ff-row" key={e.label}>
                  <span className={'ff-dot ' + (e.positive ? 'pos' : 'neg')} />
                  <span className="ff-l">{e.label}</span>
                  <span className="ff-v">{e.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="fac-cols">
            <div>
              <div className="fac-h">Current services</div>
              <div className="fac-chips">{a.services.map(sv => <span key={sv} className="fac-chip on">{sv}</span>)}</div>
            </div>
            <div>
              <div className="fac-h">Service whitespace</div>
              <div className="fac-chips">{a.whitespace.length ? a.whitespace.map(sv => <span key={sv} className="fac-chip ws">{sv}</span>) : <span className="muted" style={{ fontSize: 12 }}>Fully penetrated</span>}</div>
            </div>
          </div>

          <div className="fac-cols">
            <div>
              <div className="fac-h">Key decision maker</div>
              <div className="fac-dm"><b>{dm.name}</b> · {dm.role}<div className="muted" style={{ fontSize: 12 }}>{dm.tenure}-yr tenure · owner {rep?.name}</div></div>
            </div>
            <div>
              <div className="fac-h">Recommended next action</div>
              <p className="fac-action">{act.text}</p>
            </div>
          </div>
        </div>

        <div className="fac-foot">
          <button className="btn" onClick={() => actions.closeFacility()}>Close</button>
          <button className="btn primary" onClick={() => { const id = a.id; actions.closeFacility(); actions.openAccount(id) }}>Open full account →</button>
        </div>
      </div>
    </>
  )
}
