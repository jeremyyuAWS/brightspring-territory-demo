import type { DemoState } from './store'
import type { Territory, TerritoryMetrics, Referral, Account } from './types'
import {
  TERRITORIES, REPS, ACCOUNTS, ELMINGTON_ID,
  MARKET_BASELINE, MARKET_OPTIMIZED, healthScore, classify,
} from './seed'

export function repById(id: string) { return REPS.find(r => r.id === id) }
export function territoryById(id: string) { return TERRITORIES.find(t => t.id === id) }

// facility size label — physician groups have providers (outpatient), everything else has beds
export function facilitySize(a: Account): string {
  return a.facilityType === 'Physician Group' ? `${a.beds}-provider group` : `${a.beds} beds`
}
// referral-volume noun — physician groups refer, facilities discharge
export function dischargeNoun(a: Account): string {
  return a.facilityType === 'Physician Group' || a.facilityType === 'Hospital Discharge' ? 'referral' : 'discharge'
}

export function metricsFor(t: Territory, applied: boolean): TerritoryMetrics {
  return applied ? t.optimized : t.baseline
}
export function statusFor(t: Territory, applied: boolean) {
  return classify(healthScore(metricsFor(t, applied).dims))
}
export function scoreFor(t: Territory, applied: boolean) {
  return healthScore(metricsFor(t, applied).dims)
}

export interface TerritoryRow {
  territory: Territory
  repName: string
  metrics: TerritoryMetrics
  score: number
  status: 'Healthy' | 'Watch' | 'At Risk'
}

export function territoryRows(s: DemoState): TerritoryRow[] {
  return TERRITORIES.map(t => {
    const m = metricsFor(t, s.optimizationApplied)
    const score = healthScore(m.dims)
    return {
      territory: t,
      repName: repById(t.repId)?.name ?? '—',
      metrics: m,
      score,
      status: classify(score),
    }
  }).filter(row => {
    if (s.filters.repId !== 'all' && row.territory.repId !== s.filters.repId) return false
    if (s.filters.status !== 'all' && row.status !== s.filters.status) return false
    if (s.selectedTerritoryId && row.territory.id !== s.selectedTerritoryId) return false
    return true
  })
}

export interface MarketKpis {
  coveragePct: number
  priorityCovered: number
  priorityTotal: number
  referralConversion: number
  atRiskCount: number
}

export function referralConversion(referrals: Referral[]): number {
  const denom = referrals.length
  if (!denom) return 0
  const converted = referrals.filter(r => r.stage === 'Accepted' || r.stage === 'Admitted').length
  return Math.round((converted / denom) * 100)
}

const PRIORITY_TOTAL = ACCOUNTS.filter(a => a.isPriority).length
export function marketKpis(s: DemoState): MarketKpis {
  const applied = s.optimizationApplied
  // derived from the same account state so KPIs, map, and table stay consistent
  const covered = ACCOUNTS.filter(a => a.isPriority && accountCovered(a, applied)).length
  const atRiskCount = TERRITORIES.filter(t => statusFor(t, applied) === 'At Risk').length
  return {
    coveragePct: Math.round((covered / PRIORITY_TOTAL) * 100),
    priorityCovered: covered,
    priorityTotal: PRIORITY_TOTAL,
    referralConversion: referralConversion(s.referrals),
    atRiskCount,
  }
}

// account currently displayed as belonging to a territory (Elmington moves after optimize)
export function effectiveTerritoryId(a: Account, applied: boolean): string {
  if (applied && a.id === ELMINGTON_ID) return 't-central'
  return a.territoryId
}
export function effectiveRepId(a: Account, applied: boolean): string {
  const tid = effectiveTerritoryId(a, applied)
  return territoryById(tid)?.repId ?? ''
}
export function accountCovered(a: Account, applied: boolean): boolean {
  if (!applied) return a.covered
  // after optimize, 6 of 10 uncovered priority accounts become covered (leaves 4 per PRD)
  if (a.covered) return true
  return !UNCOVERED_AFTER.has(a.id)
}

// after optimize, 4 priority accounts remain uncovered (deterministic)
const remainingUncovered = ACCOUNTS.filter(a => a.isPriority && !a.covered).slice(-4).map(a => a.id)
const UNCOVERED_AFTER = new Set(remainingUncovered)

export function visibleAccounts(s: DemoState): Account[] {
  return ACCOUNTS.filter(a => {
    if (s.filters.repId !== 'all') { if (effectiveRepId(a, s.optimizationApplied) !== s.filters.repId) return false }
    if (s.selectedTerritoryId) { if (effectiveTerritoryId(a, s.optimizationApplied) !== s.selectedTerritoryId) return false }
    return true
  })
}

// ---------- insights ----------
export interface Insight {
  id: string
  severity: 'high' | 'medium' | 'low'
  territoryId: string
  headline: string
  evidence: string
  action: string
  accountIds: string[]
}

export function insights(s: DemoState): Insight[] {
  if (s.optimizationApplied) {
    return [
      { id: 'i-ok', severity: 'low', territoryId: 't-south', headline: 'South Richmond coverage restored to Healthy', evidence: 'Priority coverage 54% → 85%; drive time 9.7 → 7.1 hrs after applying the Balanced proposal.', action: 'Review in Plan → Month', accountIds: [] },
      { id: 'i-ok2', severity: 'low', territoryId: 't-east', headline: 'East Richmond moved out of Watch', evidence: 'Visit attainment 13/18 → 16/18 and referral momentum recovered after the rebalance; coverage steady at 86%.', action: 'Confirm rep capacity', accountIds: [] },
      { id: 'i-ok3', severity: 'low', territoryId: 't-central', headline: 'Elmington Rehabilitation retained under Maya Chen', evidence: 'Strategic relationship preserved; Central capacity 76% → 78%.', action: 'Open account', accountIds: [ELMINGTON_ID] },
    ]
  }
  const southUncovered = ACCOUNTS.filter(a => a.territoryId === 't-south' && a.isPriority && !a.covered).map(a => a.id)
  return [
    {
      id: 'i-1', severity: 'high', territoryId: 't-south',
      headline: 'South Richmond has 6 priority accounts without a visit this month',
      evidence: 'Priority coverage 54% (lowest in market); rep Jordan Ellis at 112% capacity; drive burden 9.7 hrs/wk.',
      action: 'Optimize territories', accountIds: southUncovered,
    },
    {
      id: 'i-2', severity: 'medium', territoryId: 't-east',
      headline: 'East Richmond trending toward At Risk',
      evidence: 'Visit attainment 13/18 and lagging referral momentum; Taylor Brooks at 94% capacity with 8.1 drive hrs/wk. One uncovered priority account remains.',
      action: 'Rebalance load', accountIds: ACCOUNTS.filter(a => a.territoryId === 't-east' && a.isPriority && !a.covered).map(a => a.id),
    },
    {
      id: 'i-3', severity: 'medium', territoryId: 't-south',
      headline: 'Referral momentum lagging in South Richmond',
      evidence: 'Only 4 active referrals vs 6–8 in Healthy territories; follow-ups slipping past service-level threshold.',
      action: 'Review referrals', accountIds: [ELMINGTON_ID],
    },
  ]
}

// ---------- referral funnel ----------
export const FUNNEL_ORDER: Referral['stage'][] = ['Received', 'Contact Attempted', 'Met Patient/Family', 'Evaluating', 'Accepted', 'Admitted']
export const NEGATIVE_STAGES: Referral['stage'][] = ['Declined', 'Ineligible', 'Lost to Competitor']

export function funnel(referrals: Referral[]) {
  return FUNNEL_ORDER.map(stage => ({ stage, count: referrals.filter(r => r.stage === stage).length }))
}
// Cohort funnel: how far each referral progressed. count[i] = referrals that reached stage i or beyond,
// so values only decrease — an executive-readable funnel rather than current-stage inventory.
const COHORT_LABELS: Record<string, string> = {
  'Received': 'Received', 'Contact Attempted': 'Contacted', 'Met Patient/Family': 'Patient/family met',
  'Evaluating': 'Evaluating', 'Accepted': 'Accepted', 'Admitted': 'Admitted',
}
export function cohortFunnel(referrals: Referral[]) {
  const reached = (r: Referral) => {
    const i = FUNNEL_ORDER.indexOf(r.stage)
    if (i >= 0) return i
    return 1 // negative outcomes (declined/ineligible/lost) were received & contacted before dropping out
  }
  return FUNNEL_ORDER.map((stage, i) => ({
    stage, label: COHORT_LABELS[stage] ?? stage,
    count: referrals.filter(r => reached(r) >= i).length,
  }))
}
export function referralsByTerritory(referrals: Referral[]) {
  return TERRITORIES.map(t => ({
    territory: t,
    count: referrals.filter(r => r.territoryId === t.id).length,
    accepted: referrals.filter(r => r.territoryId === t.id && (r.stage === 'Accepted' || r.stage === 'Admitted')).length,
  }))
}
