import { useStore, actions } from '../store'
import { ACCOUNTS, OPTIMIZED_CAPACITY } from '../seed'
import { DAYS } from '../today'
import { repById, territoryById, metricsFor, statusFor, accountCovered } from '../selectors'
import { StatusBadge } from '../ui'
import type { Account } from '../types'

function pipelineOf(list: Account[]) { return list.reduce((s, a) => s + Math.round(a.opportunityScore * 3.2) * 1000, 0) }
function money(v: number) { return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1000)}K` }

// ranked "needs attention" list: uncovered priority first, then overdue, then at-risk relationship
function rankedAttention(accts: Account[], applied: boolean) {
  const rows: { a: Account; tag: string; cls: string; rank: number }[] = []
  for (const a of accts) {
    const covered = accountCovered(a, applied)
    if (a.isPriority && !covered) rows.push({ a, tag: 'Uncovered priority', cls: 'risk', rank: 0 })
    else if (a.relationshipStatus === 'at_risk') rows.push({ a, tag: 'At-risk relationship', cls: 'risk', rank: 1 })
    else if (a.lastContactDays > 30) rows.push({ a, tag: `${a.lastContactDays}d since contact`, cls: 'warn', rank: 2 })
    else if (a.whitespace.length) rows.push({ a, tag: `${a.whitespace[0]} whitespace`, cls: 'ok', rank: 3 })
  }
  return rows.sort((x, y) => x.rank - y.rank || y.a.opportunityScore - x.a.opportunityScore)
}

function coaching(rep: any, capacity: number, conv: number) {
  if (capacity > 100) return `${rep.name.split(' ')[0]}'s effectiveness is solid — conversion is ${conv}%. The constraint is territory capacity (${capacity}%), not insufficient activity. Rebalancing load will help more than coaching.`
  if (conv < 30) return `${rep.name.split(' ')[0]} has capacity headroom but referral conversion is low (${conv}%). Coaching on follow-up cadence is likely to move outcomes.`
  return `${rep.name.split(' ')[0]} is well-balanced — capacity at ${capacity}% and conversion at ${conv}%. Maintain cadence and lean into nearby growth.`
}

export function RepIntel() {
  const s = useStore()
  if (!s.repDrillId) return null
  const rep = repById(s.repDrillId)
  if (!rep || !rep.territoryId) return null
  const applied = s.optimizationApplied
  const terr = territoryById(rep.territoryId)!
  const m = metricsFor(terr, applied)
  const status = statusFor(terr, applied)
  const capacity = applied ? OPTIMIZED_CAPACITY[rep.id] : rep.capacityPct
  const accts = ACCOUNTS.filter(a => a.territoryId === rep.territoryId)
  const uncovered = accts.filter(a => a.isPriority && !accountCovered(a, applied))
  const activeRef = accts.filter(a => a.referralActive)
  const inT = s.referrals.filter(r => r.territoryId === terr.id)
  const conv = inT.length ? Math.round(inT.filter(r => r.stage === 'Accepted' || r.stage === 'Admitted').length / inT.length * 100) : 0
  const day = DAYS[rep.id]
  const attention = rankedAttention(accts, applied)
  const fromAcct = s.fromAccountId ? ACCOUNTS.find(a => a.id === s.fromAccountId) : null

  const stat = (label: string, value: string, warn = false) => (
    <div className="ts-stat"><span>{label}</span><b style={warn ? { color: 'var(--risk)' } : undefined}>{value}</b></div>
  )
  return (
    <div className="panel">
      <div className="phead">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="drawer-kind">Representative</span>
          <h3>{rep.name}</h3>
          <StatusBadge status={status} />
        </div>
        <button className="iconbtn" onClick={() => actions.closeRepDrill()} aria-label="close">×</button>
      </div>
      <div className="pbody">
        <div className="ts-rep">{terr.name} · {rep.businessLine}</div>
        {fromAcct && <div className="ri-from">↳ viewing owner of <b>{fromAcct.name}</b></div>}

        <div className="ts-grid">
          {stat('Accounts', `${m.accountCount}`)}
          {stat('Priority coverage', `${m.priorityCoveragePct}%`, m.priorityCoveragePct < 65)}
          {stat('Visits / target', `${m.visitsCompleted}/${m.visitsTarget}`)}
          {stat('Conversion', `${conv}%`)}
          {stat('Capacity', `${capacity}%`, capacity > 100)}
          {stat('Drive burden', `${m.driveHrs} hrs/wk`, m.driveHrs > 8.5)}
          {stat('Active referrals', `${m.referrals}`)}
          {stat('Pipeline', money(pipelineOf(accts)))}
        </div>

        {day && (
          <div className="ri-today">
            <span className="ri-today-h">Today</span>
            <span>{day.stops} stops · {day.totalDriveMin}m drive · home <b style={{ color: day.risk ? 'var(--risk)' : 'var(--healthy)' }}>{day.projectedHome}</b> {day.risk ? '⚠ late risk' : `(${day.openCapacityMin}m open)`}</span>
          </div>
        )}

        <div className="ri-coach">
          <span className="ri-coach-tag">◆ Coaching signal</span>
          <p>{coaching(rep, capacity, conv)}</p>
        </div>

        <div className="ri-listhead">
          <span>Accounts needing attention</span>
          <span className="ri-counts">{uncovered.length} uncovered · {activeRef.length} referrals</span>
        </div>
        <div className="ri-list">
          {attention.length === 0 && <div className="rd-empty">All accounts on track.</div>}
          {attention.slice(0, 6).map(({ a, tag, cls }) => (
            <button key={a.id} className="ri-acct" onClick={() => actions.openFacility(a.id)}>
              <span className="ri-acct-name">{a.name}</span>
              <span className={`ri-acct-tag ${cls}`}>{tag}</span>
            </button>
          ))}
        </div>

        <div className="ts-actions">
          <button className="btn sm primary" onClick={() => actions.setTab('today')}>Open Today →</button>
          <button className="btn sm" onClick={() => actions.setTab('plan')}>Open Plan</button>
          <button className="btn sm" onClick={() => actions.openBuilder()}>Rebalance load</button>
        </div>
      </div>
    </div>
  )
}
