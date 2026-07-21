// Referral intelligence — deterministic, simulated. Risk & recovery (§12),
// loyalty-loss detection (§14), and explainable prediction (§15).
import type { Referral } from './types'
import { TERRITORIES } from './seed'
import { repById } from './selectors'

const DEMO_TODAY = '2026-07-22'
function daysBetween(a: string, b: string) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

// ---------- §12 Referral risk & recovery ----------
export type RiskReason = 'Overdue follow-up' | 'No contact attempt' | 'Stalled in stage' | 'At risk of competitor loss' | 'Appointment incomplete'
export interface ReferralRisk {
  referral: Referral
  aging: number
  reasons: RiskReason[]
  severity: 'high' | 'medium'
  recovery: string
}

const EARLY: Referral['stage'][] = ['Received', 'Contact Attempted']

export function referralRisks(referrals: Referral[]): ReferralRisk[] {
  const out: ReferralRisk[] = []
  for (const r of referrals) {
    const aging = Math.max(0, daysBetween(r.receivedDate, DEMO_TODAY))
    const overdueDays = daysBetween(r.followUpDate, DEMO_TODAY)
    const openStage = !['Admitted', 'Accepted', 'Declined', 'Ineligible'].includes(r.stage)
    const reasons: RiskReason[] = []
    if (r.stage === 'Lost to Competitor') reasons.push('At risk of competitor loss')
    if (r.stage === 'Received' && aging >= 9) reasons.push('No contact attempt')
    if (EARLY.includes(r.stage) && aging >= 12) reasons.push('Stalled in stage')
    if (overdueDays >= 5 && openStage) reasons.push('Overdue follow-up')
    if (r.stage === 'Evaluating' && r.metFamily !== 'Yes' && aging >= 11) reasons.push('Appointment incomplete')
    if (!reasons.length) continue
    const severity: 'high' | 'medium' = reasons.includes('At risk of competitor loss') || reasons.length >= 2 || aging >= 12 ? 'high' : 'medium'
    out.push({ referral: r, aging, reasons, severity, recovery: recoveryFor(reasons[0], r) })
  }
  return out.sort((a, b) => (a.severity === b.severity ? b.aging - a.aging : a.severity === 'high' ? -1 : 1))
}

function recoveryFor(reason: RiskReason, r: Referral): string {
  switch (reason) {
    case 'At risk of competitor loss': return `Manager call to ${r.sourceOrg}; expedite evaluation before competitor commits`
    case 'No contact attempt': return `Reassign to an available rep and attempt contact today`
    case 'Stalled in stage': return `Escalate — schedule the patient/family meeting this week`
    case 'Overdue follow-up': return `Complete the overdue follow-up now; confirm next step with ${r.owner}`
    case 'Appointment incomplete': return `Re-book the evaluation and confirm decision-maker availability`
  }
}

export function riskSummary(referrals: Referral[]) {
  const risks = referralRisks(referrals)
  const south = risks.filter(r => r.referral.territoryId === 't-south')
  return {
    total: risks.length,
    high: risks.filter(r => r.severity === 'high').length,
    southCount: south.length,
    protectedAdmissions: Math.max(1, Math.round(south.length * 0.6)), // simulated estimate
  }
}

// ---------- §14 Loyalty-loss detection ----------
export interface LoyaltySource {
  id: string
  name: string
  territoryId: string
  avgPerMonth: number
  daysSinceLast: number
  currentRep: string
  adminChangeDays?: number
  competitorSignal: boolean
  recoverablePerMonth: number
  winBack: string
}

export const LOYALTY_SOURCES: LoyaltySource[] = [
  { id: 'ls-woodhaven', name: 'Woodhaven Medical Center', territoryId: 't-south', avgPerMonth: 6, daysSinceLast: 74, currentRep: 'Jordan Ellis', adminChangeDays: 68, competitorSignal: true, recoverablePerMonth: 4, winBack: 'Coordinated intro to the new administrator + service review; add to next planning period' },
  { id: 'ls-stonegate', name: 'Stonegate Physicians', territoryId: 't-central', avgPerMonth: 3, daysSinceLast: 52, currentRep: 'Maya Chen', competitorSignal: false, recoverablePerMonth: 2, winBack: 'Re-engage discharge planner; share updated outcomes data' },
  { id: 'ls-chesterfield', name: 'Chesterfield Medical Center', territoryId: 't-east', avgPerMonth: 4, daysSinceLast: 41, currentRep: 'Taylor Brooks', adminChangeDays: 30, competitorSignal: true, recoverablePerMonth: 3, winBack: 'Executive-level relationship reset; competitor displacement play' },
]

export function dormantSources(): LoyaltySource[] {
  return LOYALTY_SOURCES.filter(s => s.daysSinceLast >= 30).sort((a, b) => b.recoverablePerMonth - a.recoverablePerMonth)
}

// ---------- §15 Explainable predictor ----------
export interface Prediction {
  accountName: string
  low: number
  high: number
  window: string
  confidence: number
  evidence: { label: string; value: string; positive: boolean }[]
}

export function predictElmington(): Prediction {
  return {
    accountName: 'Elmington Rehabilitation', low: 3, high: 5, window: 'next 30 days', confidence: 78,
    evidence: [
      { label: 'Historical pattern', value: 'Avg 4 referrals/mo over 6 months', positive: true },
      { label: 'Facility capacity', value: 'High post-acute discharge volume', positive: true },
      { label: 'Relationship', value: 'Champion administrator (6-yr tenure)', positive: true },
      { label: 'Recent activity', value: 'Visit 8 days ago; R-1042 progressing', positive: true },
      { label: 'Administrator change', value: 'None — leadership stable', positive: true },
      { label: 'Service-line fit', value: 'Post-surgical rehab → Home Health', positive: true },
      { label: 'Market trend', value: 'Richmond post-acute demand up ~6%', positive: true },
    ],
  }
}

export function referralsByTerritoryConversion(referrals: Referral[]) {
  return TERRITORIES.map(t => {
    const inT = referrals.filter(r => r.territoryId === t.id)
    const conv = inT.length ? Math.round(inT.filter(r => r.stage === 'Accepted' || r.stage === 'Admitted').length / inT.length * 100) : 0
    return { territory: t, rep: repById(t.repId)?.name ?? '', count: inT.length, conversion: conv }
  })
}
