import type {
  Territory, Rep, Account, Contact, Activity, Referral, Deal,
  WeekPlan, Priority, OppTier, VisitFreshness, ProposedChange,
  RelationshipStatus, OpportunityBand,
} from './types'
import { TERRITORY_BBOX } from './geo'

// ---------- deterministic PRNG ----------
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- reps ----------
export const REPS: Rep[] = [
  { id: 'r-alex', name: 'Alex Morgan', initials: 'AM', role: 'Account Executive', businessLine: 'Home Health + Hospice', capacityPct: 84, homeBase: 'Glen Allen', territoryId: 't-north', color: '#2563eb' },
  { id: 'r-maya', name: 'Maya Chen', initials: 'MC', role: 'Senior Account Executive', businessLine: 'Home Health + Hospice', capacityPct: 76, homeBase: 'Downtown RVA', territoryId: 't-central', color: '#0891b2' },
  { id: 'r-jordan', name: 'Jordan Ellis', initials: 'JE', role: 'Account Executive', businessLine: 'Home Health + Hospice', capacityPct: 112, homeBase: 'Midlothian', territoryId: 't-south', color: '#db2777' },
  { id: 'r-taylor', name: 'Taylor Brooks', initials: 'TB', role: 'Account Executive', businessLine: 'Home Health + Hospice', capacityPct: 94, homeBase: 'Mechanicsville', territoryId: 't-east', color: '#7c3aed' },
  { id: 'r-sam', name: 'Sam Patel', initials: 'SP', role: 'Account Executive', businessLine: 'Home Health + Hospice', capacityPct: 88, homeBase: 'Short Pump', territoryId: 't-west', color: '#059669' },
  { id: 'r-riley', name: 'Riley Nguyen', initials: 'RN', role: 'Hospice Liaison (Float)', businessLine: 'Hospice', capacityPct: 60, homeBase: 'Downtown RVA', territoryId: null, color: '#ca8a04' },
]

// optimized capacities (after Balanced) → spread 92-78 = 14
export const OPTIMIZED_CAPACITY: Record<string, number> = {
  'r-alex': 84, 'r-maya': 78, 'r-jordan': 92, 'r-taylor': 88, 'r-sam': 86, 'r-riley': 64,
}

function dims(priorityCoverage: number, visitAttainment: number, referralMomentum: number, freshness: number, travelEfficiency: number) {
  return { priorityCoverage, visitAttainment, referralMomentum, freshness, travelEfficiency }
}

// ---------- territories (baseline = PRD seeded scenario) ----------
export const TERRITORIES: Territory[] = [
  {
    id: 't-north', name: 'North Richmond', short: 'North', repId: 'r-alex', color: '#3b82f6',
    polygon: '300,60 720,60 700,230 520,268 320,230',
    labelX: 505, labelY: 150,
    scatter: { x: 345, y: 92, w: 320, h: 108 },
    baseline: { accountCount: 11, priorityCoveragePct: 91, visitsCompleted: 18, visitsTarget: 20, referrals: 8, driveHrs: 6.2, uncoveredPriority: 1, capacityPct: 84, dims: dims(91, 90, 80, 85, 78) },
    optimized: { accountCount: 11, priorityCoveragePct: 92, visitsCompleted: 18, visitsTarget: 20, referrals: 8, driveHrs: 6.1, uncoveredPriority: 0, capacityPct: 84, dims: dims(92, 90, 82, 86, 80) },
  },
  {
    id: 't-central', name: 'Central Richmond', short: 'Central', repId: 'r-maya', color: '#06b6d4',
    polygon: '320,230 520,268 700,230 690,430 500,468 330,430',
    labelX: 508, labelY: 348,
    scatter: { x: 362, y: 280, w: 288, h: 118 },
    baseline: { accountCount: 10, priorityCoveragePct: 86, visitsCompleted: 17, visitsTarget: 18, referrals: 7, driveHrs: 5.8, uncoveredPriority: 1, capacityPct: 76, dims: dims(86, 94, 75, 82, 80) },
    optimized: { accountCount: 11, priorityCoveragePct: 88, visitsCompleted: 18, visitsTarget: 19, referrals: 7, driveHrs: 6.0, uncoveredPriority: 0, capacityPct: 78, dims: dims(88, 94, 76, 83, 80) },
  },
  {
    id: 't-south', name: 'South Richmond', short: 'South', repId: 'r-jordan', color: '#ec4899',
    polygon: '330,430 500,468 690,430 660,650 380,650',
    labelX: 500, labelY: 548,
    scatter: { x: 392, y: 468, w: 248, h: 150 },
    baseline: { accountCount: 13, priorityCoveragePct: 54, visitsCompleted: 12, visitsTarget: 21, referrals: 4, driveHrs: 9.7, uncoveredPriority: 6, capacityPct: 112, dims: dims(54, 57, 45, 50, 40) },
    optimized: { accountCount: 12, priorityCoveragePct: 86, visitsCompleted: 16, visitsTarget: 18, referrals: 6, driveHrs: 7.1, uncoveredPriority: 2, capacityPct: 92, dims: dims(86, 88, 70, 80, 75) },
  },
  {
    id: 't-east', name: 'East Richmond', short: 'East', repId: 'r-taylor', color: '#8b5cf6',
    polygon: '720,60 900,180 900,420 880,560 660,650 690,430 700,230',
    labelX: 772, labelY: 338,
    scatter: { x: 728, y: 180, w: 150, h: 320 },
    baseline: { accountCount: 9, priorityCoveragePct: 68, visitsCompleted: 13, visitsTarget: 18, referrals: 5, driveHrs: 8.1, uncoveredPriority: 1, capacityPct: 94, dims: dims(68, 72, 60, 65, 55) },
    optimized: { accountCount: 9, priorityCoveragePct: 85, visitsCompleted: 16, visitsTarget: 18, referrals: 6, driveHrs: 7.4, uncoveredPriority: 1, capacityPct: 88, dims: dims(85, 89, 70, 80, 76) },
  },
  {
    id: 't-west', name: 'West Richmond', short: 'West', repId: 'r-sam', color: '#10b981',
    polygon: '120,180 300,60 320,230 330,430 380,650 180,600 100,380',
    labelX: 232, labelY: 360,
    scatter: { x: 150, y: 250, w: 150, h: 280 },
    baseline: { accountCount: 9, priorityCoveragePct: 82, visitsCompleted: 15, visitsTarget: 17, referrals: 6, driveHrs: 6.7, uncoveredPriority: 1, capacityPct: 88, dims: dims(82, 88, 70, 78, 78) },
    optimized: { accountCount: 9, priorityCoveragePct: 84, visitsCompleted: 15, visitsTarget: 17, referrals: 6, driveHrs: 6.6, uncoveredPriority: 0, capacityPct: 86, dims: dims(84, 88, 72, 80, 78) },
  },
]

// ---------- health model ----------
export const HEALTH_WEIGHTS = {
  priorityCoverage: 0.35, visitAttainment: 0.25, referralMomentum: 0.20, freshness: 0.10, travelEfficiency: 0.10,
}
export function healthScore(d: { priorityCoverage: number; visitAttainment: number; referralMomentum: number; freshness: number; travelEfficiency: number }) {
  return Math.round(
    d.priorityCoverage * HEALTH_WEIGHTS.priorityCoverage +
    d.visitAttainment * HEALTH_WEIGHTS.visitAttainment +
    d.referralMomentum * HEALTH_WEIGHTS.referralMomentum +
    d.freshness * HEALTH_WEIGHTS.freshness +
    d.travelEfficiency * HEALTH_WEIGHTS.travelEfficiency,
  )
}
export function classify(score: number): 'Healthy' | 'Watch' | 'At Risk' {
  if (score >= 80) return 'Healthy'
  if (score >= 65) return 'Watch'
  return 'At Risk'
}

// ---------- account generation ----------
const FACILITY_TYPES = ['Skilled Nursing Facility', 'Rehabilitation Center', 'Assisted Living', 'Hospital Discharge', 'Physician Group', 'Memory Care', 'Senior Living']
const NAME_A = ['Elmington', 'Riverbend', 'Oak Hollow', 'Fairfield', 'Stonegate', 'Brookhaven', 'Maplewood', 'Crestview', 'Willow Park', 'Ashford', 'Beaumont', 'Cedar Ridge', 'Harborview', 'Kingsley', 'Wellspring', 'Meadowbrook', 'Sinclair', 'Tuckahoe', 'Glenmore', 'Bellwood', 'Cypress', 'Ravenscroft', 'Monument', 'Shockoe', 'Patterson', 'Grove Park', 'Huguenot', 'Carytown', 'Innsbrook', 'Lakeside', 'Ginter', 'Boulevard', 'Westhampton', 'Hanover', 'Chesterfield', 'Powhatan', 'Deep Run', 'Salisbury', 'Bon Air', 'Woodlake', 'Rockwood', 'Brandermill', 'Sycamore', 'Amelia', 'Petersburg', 'Colonial', 'Hopewell', 'Varina', 'Sandston', 'Highland', 'Ridgefield', 'Dumbarton']
const NAME_B: Record<string, string> = {
  'Skilled Nursing Facility': 'Skilled Nursing', 'Rehabilitation Center': 'Rehabilitation', 'Assisted Living': 'Assisted Living',
  'Hospital Discharge': 'Medical Center', 'Physician Group': 'Physicians', 'Memory Care': 'Memory Care', 'Senior Living': 'Senior Living',
}
const SERVICES = ['Home Health', 'Hospice', 'Personal Care', 'Rehab Therapy', 'Palliative']

// per-territory account plan. priority = tier1 + tier2; sums → 42 priority, 32 covered, 10 uncovered, 10 tier3.
const PLAN: Record<string, { tier1: number; tier2: number; tier3: number; uncovered: number }> = {
  't-north': { tier1: 4, tier2: 4, tier3: 3, uncovered: 1 },
  't-central': { tier1: 4, tier2: 4, tier3: 2, uncovered: 1 },
  't-south': { tier1: 7, tier2: 6, tier3: 0, uncovered: 6 },
  't-east': { tier1: 4, tier2: 3, tier3: 2, uncovered: 1 },
  't-west': { tier1: 3, tier2: 3, tier3: 3, uncovered: 1 },
}

function tierFromScore(s: number): OppTier { return s >= 78 ? 'Tier 1' : s >= 55 ? 'Tier 2' : 'Tier 3' }
function bandFromScore(s: number): OpportunityBand { return s >= 70 ? 'high' : s >= 45 ? 'medium' : 'low' }

function genAccounts(): Account[] {
  const rnd = mulberry32(20260722)
  const out: Account[] = []
  let nameIdx = 1
  for (const t of TERRITORIES) {
    const plan = PLAN[t.id]
    const priorityCount = plan.tier1 + plan.tier2
    const total = priorityCount + plan.tier3
    const bb = TERRITORY_BBOX[t.id]
    const { scatter } = t
    for (let i = 0; i < total; i++) {
      const tier: 1 | 2 | 3 = i < plan.tier1 ? 1 : i < priorityCount ? 2 : 3
      const isPriority = tier !== 3
      const priority: Priority = tier === 1 ? 'High' : tier === 2 ? 'Medium' : 'Low'
      // last `uncovered` of the priority accounts are uncovered
      const uncovered = isPriority && i >= priorityCount - plan.uncovered
      const covered = !uncovered
      let ft = FACILITY_TYPES[Math.floor(rnd() * FACILITY_TYPES.length)]
      // Elmington is fixed as first South account (tier1, covered, strategic)
      let name: string
      if (t.id === 't-south' && i === 0) { name = 'Elmington Rehabilitation'; ft = 'Rehabilitation Center' }
      else { name = `${NAME_A[nameIdx % NAME_A.length]} ${NAME_B[ft]}`; nameIdx++ }
      const opp = tier === 1 ? 62 + Math.floor(rnd() * 36) : tier === 2 ? 40 + Math.floor(rnd() * 30) : 18 + Math.floor(rnd() * 28)
      const days = uncovered ? 34 + Math.floor(rnd() * 40) : Math.floor(rnd() * 26)
      const fresh: VisitFreshness = days <= 14 ? 'fresh' : days <= 30 ? 'aging' : 'stale'
      const svcCount = 1 + Math.floor(rnd() * 2)
      const services: string[] = []
      const eligible: string[] = []
      for (const s of SERVICES) { if (rnd() < 0.4 && services.length < svcCount) services.push(s); else if (rnd() < 0.4) eligible.push(s) }
      if (services.length === 0) services.push('Home Health')
      const x = scatter.x + rnd() * scatter.w
      const y = scatter.y + rnd() * scatter.h
      const lng = bb.minLng + rnd() * (bb.maxLng - bb.minLng)
      const lat = bb.minLat + rnd() * (bb.maxLat - bb.minLat)
      const strategic = t.id === 't-south' && (i === 0 || name.startsWith('Wellspring'))
      const locked = name.startsWith('Wellspring')
      const relationshipStatus: RelationshipStatus = !covered
        ? (fresh === 'stale' ? 'at_risk' : 'prospect')
        : tier === 1 ? 'current' : tier === 2 ? 'growth' : 'prospect'
      out.push({
        id: `a-${t.short.toLowerCase()}-${i}`, name, facilityType: ft, territoryId: t.id,
        coord: { x: Math.round(x), y: Math.round(y) }, lng: +lng.toFixed(5), lat: +lat.toFixed(5),
        beds: 20 + Math.floor(rnd() * 160),
        priority, priorityTier: tier, isPriority, relationshipStatus, opportunityBand: bandFromScore(opp),
        services, whitespace: eligible, lastContactDays: days, opportunityScore: opp,
        oppTier: tierFromScore(opp), visitFresh: fresh, referralActive: rnd() < 0.35,
        locked, strategic, covered,
      })
    }
  }
  return out
}

export const ACCOUNTS: Account[] = genAccounts()
export const ELMINGTON_ID = ACCOUNTS.find(a => a.name === 'Elmington Rehabilitation')!.id

// ---------- contacts / activities / deals ----------
// Hand-crafted hero data for Elmington + deterministic synthetic data for every OTHER account,
// so every Account 360 tab is populated (no empty "no data" states anywhere in the demo).
function acctSeed(id: string) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0) || 1 }
const FIRST_NAMES = ['Angela', 'Marcus', 'Priya', 'Denise', 'Robert', 'Lena', 'Carlos', 'Grace', 'Nina', 'Omar', 'Sophia', 'Derek', 'Talia', 'Victor', 'Renee', 'Malik', 'Joan', 'Felix', 'Carmen', 'Blake', 'Rosa', 'Hank', 'Yara', 'Devon']
const LAST_NAMES = ['Reyes', 'Cole', 'Nguyen', 'Barnes', 'Ellison', 'Okafor', 'Halstead', 'Vaughn', 'Meadows', 'Pierce', 'Bryant', 'Sandoval', 'Chase', 'Delgado', 'Frost', 'Whitaker', 'Novak', 'Iqbal', 'Beaumont', 'Ramsey', 'Salazar', 'Kimura', 'Odom', 'Pruitt']
const CONTACT_ROLES = ['Administrator', 'Director of Nursing (DON)', 'Discharge Planner', 'Case Manager', 'Medical Director', 'Social Worker', 'Referral Coordinator']
function repNameForAcct(a: Account) { return REPS.find(r => r.territoryId === a.territoryId)?.name ?? 'Unassigned' }
function isoDaysAgo(n: number) { return new Date(Date.UTC(2026, 6, 21) - n * 86400000).toISOString().slice(0, 10) }
function pickAt<T>(arr: T[], seed: number) { return arr[seed % arr.length] }

function genContactsFor(a: Account): Contact[] {
  const rnd = mulberry32(acctSeed(a.id)); const seed = acctSeed(a.id)
  const n = 2 + Math.floor(rnd() * 3) // 2–4
  const picks = [0, 1] // Administrator + DON always
  while (picks.length < n) { const r = 2 + Math.floor(rnd() * 5); if (!picks.includes(r)) picks.push(r) }
  return picks.map((ri, i) => {
    let rel: Contact['relationship']
    if (a.relationshipStatus === 'at_risk') rel = i === 0 ? 'At Risk' : (rnd() < 0.5 ? 'Neutral' : 'At Risk')
    else if (a.relationshipStatus === 'current') rel = i === 0 ? 'Champion' : (rnd() < 0.6 ? 'Strong' : 'Neutral')
    else rel = i === 0 ? (rnd() < 0.5 ? 'Strong' : 'Neutral') : (rnd() < 0.5 ? 'Neutral' : 'Strong')
    return {
      id: `c-${a.id}-${i}`, accountId: a.id,
      name: `${pickAt(FIRST_NAMES, seed + ri * 7 + i)} ${pickAt(LAST_NAMES, seed + ri * 13 + i * 3)}`,
      role: CONTACT_ROLES[ri], tenureYears: 1 + Math.floor(rnd() * 9), relationship: rel,
    }
  })
}
function actOutcome(ch: Activity['channel'], a: Account, rnd: () => number): string {
  const ws = a.whitespace[0]; const sv = a.services[0] ?? 'Home Health'
  const visit = ['Reviewed discharge pipeline with the DON', `In-service on ${(ws ?? sv).toLowerCase()} transitions`, 'Toured the unit; discussed rising census', 'Met the discharge-planning team', 'Quarterly business review with administrator']
  const call = ['Confirmed referral criteria and turnaround times', 'Checked in on pending discharges', ws ? `Floated ${ws} cross-sell; interest noted` : 'Reviewed active referrals', 'Coordinated a family meeting time']
  const follow = ['Sent referral-packet templates', `Emailed ${sv} outcomes one-pager`, 'Shared preferred-provider terms', 'Recapped the in-service and next steps']
  const note = ['Administrator flagged upcoming census growth', 'New DON starting next month — plan intro', a.referralActive ? 'Active referral progressing well' : 'Relationship steady; maintain cadence', 'Competitor outreach noted — stay close']
  const p = ch === 'Visit' ? visit : ch === 'Call' ? call : ch === 'Follow-up' ? follow : note
  return p[Math.floor(rnd() * p.length)]
}
function genActivitiesFor(a: Account): Activity[] {
  const rnd = mulberry32(acctSeed(a.id) ^ 0x9e3779b9); const owner = repNameForAcct(a)
  const n = 3 + Math.floor(rnd() * 4) // 3–6
  const chans: Activity['channel'][] = ['Visit', 'Call', 'Follow-up', 'Note']
  const out: Activity[] = []; let day = Math.max(2, Math.min(a.lastContactDays, 40))
  for (let i = 0; i < n; i++) {
    const ch = i === 0 ? 'Visit' : chans[Math.floor(rnd() * 4)]
    out.push({ id: `v-${a.id}-${i}`, accountId: a.id, date: isoDaysAgo(day), channel: ch, outcome: actOutcome(ch, a, rnd), owner })
    day += 6 + Math.floor(rnd() * 12)
  }
  return out
}
const DEAL_STAGES = ['Prospecting', 'Qualification', 'Proposal', 'Negotiation']
function genDealsFor(a: Account): Deal[] {
  const rnd = mulberry32(acctSeed(a.id) ^ 0x85ebca6b)
  const lines: string[] = [...a.whitespace]
  if (a.referralActive && a.services[0]) lines.unshift(a.services[0])
  if (!lines.length) { if (a.opportunityBand === 'high' && rnd() < 0.6) lines.push(a.services[0] ?? 'Home Health'); else return [] }
  const n = Math.min(lines.length, 1 + Math.floor(rnd() * 2)) // 1–2
  return lines.slice(0, n).map((sl, i) => {
    const band = a.opportunityBand === 'high' ? '$$$' : a.opportunityBand === 'medium' ? '$$' : '$'
    const stage = DEAL_STAGES[Math.floor(rnd() * DEAL_STAGES.length)]
    return {
      id: `d-${a.id}-${i}`, accountId: a.id,
      name: `${sl} ${a.whitespace.includes(sl) ? 'service-line expansion' : 'preferred-provider agreement'}`,
      stage, valueBand: band, serviceLine: sl,
      nextStep: stage === 'Negotiation' ? 'Legal review of coverage terms' : stage === 'Proposal' ? 'Schedule stakeholder review' : stage === 'Qualification' ? 'Confirm decision-maker and budget' : 'Book discovery meeting',
    }
  })
}

const ELMINGTON_CONTACTS: Contact[] = [
  { id: 'c-1', accountId: ELMINGTON_ID, name: 'Patricia Hale', role: 'Administrator', tenureYears: 6, relationship: 'Champion' },
  { id: 'c-2', accountId: ELMINGTON_ID, name: 'Marcus Boyd', role: 'Director of Nursing (DON)', tenureYears: 4, relationship: 'Strong' },
  { id: 'c-3', accountId: ELMINGTON_ID, name: 'Dana Whitfield', role: 'Discharge Planner', tenureYears: 2, relationship: 'Neutral' },
  { id: 'c-4', accountId: ELMINGTON_ID, name: 'Grace Okafor', role: 'Case Manager', tenureYears: 3, relationship: 'Strong' },
]
const ELMINGTON_ACTIVITIES: Activity[] = [
  { id: 'v-1', accountId: ELMINGTON_ID, date: '2026-07-14', channel: 'Visit', outcome: 'Reviewed discharge pipeline with DON', owner: 'Jordan Ellis' },
  { id: 'v-2', accountId: ELMINGTON_ID, date: '2026-07-07', channel: 'Call', outcome: 'Confirmed hospice eligibility criteria', owner: 'Jordan Ellis' },
  { id: 'v-3', accountId: ELMINGTON_ID, date: '2026-06-30', channel: 'Visit', outcome: 'In-service on home health transitions', owner: 'Jordan Ellis' },
  { id: 'v-4', accountId: ELMINGTON_ID, date: '2026-06-22', channel: 'Follow-up', outcome: 'Sent referral packet templates', owner: 'Jordan Ellis' },
  { id: 'v-5', accountId: ELMINGTON_ID, date: '2026-06-15', channel: 'Note', outcome: 'Administrator flagged upcoming census growth', owner: 'Jordan Ellis' },
]
const ELMINGTON_DEALS: Deal[] = [
  { id: 'd-1', accountId: ELMINGTON_ID, name: 'Home Health preferred-provider agreement', stage: 'Negotiation', valueBand: '$$$', serviceLine: 'Home Health', nextStep: 'Legal review of coverage terms' },
  { id: 'd-2', accountId: ELMINGTON_ID, name: 'Hospice education partnership', stage: 'Proposal', valueBand: '$$', serviceLine: 'Hospice', nextStep: 'Schedule staff in-service' },
]
const OTHER_ACCOUNTS = ACCOUNTS.filter(a => a.id !== ELMINGTON_ID)
export const CONTACTS: Contact[] = [...ELMINGTON_CONTACTS, ...OTHER_ACCOUNTS.flatMap(genContactsFor)]
export const ACTIVITIES: Activity[] = [...ELMINGTON_ACTIVITIES, ...OTHER_ACCOUNTS.flatMap(genActivitiesFor)]
export const DEALS: Deal[] = [...ELMINGTON_DEALS, ...OTHER_ACCOUNTS.flatMap(genDealsFor)]

// ---------- referrals ----------
const REF_STAGES_POS: Referral['stage'][] = ['Received', 'Contact Attempted', 'Met Patient/Family', 'Evaluating', 'Accepted', 'Admitted']
const SOURCE_ORGS = ['Elmington Rehabilitation', 'Riverbend Medical Center', 'Oak Hollow Skilled Nursing', 'Stonegate Physicians', 'Crestview Assisted Living', 'Bon Air Senior Living', 'Chesterfield Medical Center', 'Tuckahoe Rehabilitation']

function genReferrals(): Referral[] {
  const rnd = mulberry32(90210)
  const out: Referral[] = []
  const total = 36
  // Fixed hero referral R-1042 on Elmington
  out.push({
    id: 'R-1042', accountId: ELMINGTON_ID, sourceOrg: 'Elmington Rehabilitation', serviceLine: 'Home Health',
    receivedDate: '2026-07-16', territoryId: 't-south', repId: 'r-jordan', stage: 'Met Patient/Family',
    metFamily: 'Yes', notes: 'Post-surgical rehab discharge; strong home health fit. Family engaged.', followUpDate: '2026-07-23', owner: 'Jordan Ellis',
  })
  for (let i = 1; i < total; i++) {
    const t = TERRITORIES[Math.floor(rnd() * TERRITORIES.length)]
    const acct = ACCOUNTS.filter(a => a.territoryId === t.id)[Math.floor(rnd() * ACCOUNTS.filter(a => a.territoryId === t.id).length)]
    const roll = rnd()
    let stage: Referral['stage']
    // tuned (deterministic seed) so Accepted+Admitted = 11/36 ≈ 31% baseline conversion
    if (roll < 0.08) stage = 'Declined'
    else if (roll < 0.13) stage = 'Ineligible'
    else if (roll < 0.18) stage = 'Lost to Competitor'
    else if (roll < 0.32) stage = 'Received'
    else if (roll < 0.46) stage = 'Contact Attempted'
    else if (roll < 0.60) stage = 'Met Patient/Family'
    else if (roll < 0.71) stage = 'Evaluating'
    else if (roll < 0.855) stage = 'Accepted'
    else stage = 'Admitted'
    const rep = REPS.find(r => r.territoryId === t.id)!
    const recv = new Date(2026, 6, 1 + Math.floor(rnd() * 20))
    const fu = new Date(recv.getTime() + (3 + Math.floor(rnd() * 10)) * 86400000)
    out.push({
      id: `R-${1043 + i}`, accountId: acct.id, sourceOrg: SOURCE_ORGS[Math.floor(rnd() * SOURCE_ORGS.length)],
      serviceLine: rnd() < 0.6 ? 'Home Health' : 'Hospice', receivedDate: recv.toISOString().slice(0, 10),
      territoryId: t.id, repId: rep.id, stage, metFamily: stage === 'Received' || stage === 'Contact Attempted' ? 'Not Yet' : rnd() < 0.7 ? 'Yes' : 'No',
      notes: '', followUpDate: fu.toISOString().slice(0, 10), owner: rep.name,
    })
  }
  // Deterministically make ~3 South Richmond referrals clearly at-risk (backdated / overdue / lost)
  // for the §12 demo narrative. Only mutates non-converted, non-hero referrals → referral count and
  // conversion are unchanged.
  const southOpen = out.filter(r => r.territoryId === 't-south' && r.id !== 'R-1042'
    && !['Accepted', 'Admitted'].includes(r.stage))
  const atRiskSpecs: { stage: Referral['stage']; received: string; follow: string }[] = [
    { stage: 'Received', received: '2026-07-02', follow: '2026-07-08' },
    { stage: 'Contact Attempted', received: '2026-07-04', follow: '2026-07-10' },
    { stage: 'Lost to Competitor', received: '2026-07-06', follow: '2026-07-12' },
  ]
  southOpen.slice(0, 3).forEach((r, i) => {
    const spec = atRiskSpecs[i]
    r.stage = spec.stage; r.receivedDate = spec.received; r.followUpDate = spec.follow
    r.metFamily = spec.stage === 'Lost to Competitor' ? 'No' : 'Not Yet'
  })
  return out
}
export const REFERRALS: Referral[] = genReferrals()

// ---------- week plans (5 territories x 4 weeks), summing exactly to territory metrics ----------
// distribute `total` across 4 weeks, front-loaded remainder, summing exactly to total
function split4(total: number): number[] {
  const base = Math.floor(total / 4)
  const rem = total - base * 4
  return [0, 1, 2, 3].map(i => base + (i < rem ? 1 : 0))
}
function genPlans(optimized: boolean): WeekPlan[] {
  const out: WeekPlan[] = []
  for (const t of TERRITORIES) {
    const m = optimized ? t.optimized : t.baseline
    let targets: number[], completes: number[]
    if (t.id === 't-south' && !optimized) {
      targets = [7, 6, 4, 4]; completes = [4, 4, 2, 2] // over-scheduled week 1 → 21 target / 12 completed
    } else if (t.id === 't-south' && optimized) {
      targets = [5, 5, 4, 4]; completes = [5, 5, 3, 3] // balanced → 18 / 16
    } else {
      targets = split4(m.visitsTarget)
      completes = split4(m.visitsCompleted)
    }
    for (let w = 1; w <= 4; w++) {
      out.push({ repId: t.repId, territoryId: t.id, week: w, visitTarget: targets[w - 1], planned: targets[w - 1], completed: completes[w - 1] })
    }
  }
  return out
}
export const PLANS_BASELINE = genPlans(false)
export const PLANS_OPTIMIZED = genPlans(true)

// ---------- market KPIs ----------
export const MARKET_BASELINE = { coveragePct: 76, priorityCovered: 32, priorityTotal: 42, atRiskCount: 1 }
export const MARKET_OPTIMIZED = { coveragePct: 90, priorityCovered: 38, priorityTotal: 42, atRiskCount: 0 }

// ---------- Before/After panel (deterministic per PRD) ----------
export const BEFORE_AFTER = [
  { metric: 'Priority coverage', before: '76%', after: '90%', change: '+14 pts', good: true },
  { metric: 'At-risk territories', before: '1', after: '0', change: '−1', good: true },
  { metric: 'Uncovered priority accounts', before: '10', after: '4', change: '−6', good: true },
  { metric: 'Avg. weekly drive time', before: '7.3 hrs', after: '6.6 hrs', change: '−0.7 hrs', good: true },
  { metric: 'Rep capacity spread', before: '36 pts', after: '14 pts', change: 'More balanced', good: true },
]

// ---------- proposed changes (Balanced strategy, deterministic) ----------
export const PROPOSED_CHANGES: ProposedChange[] = [
  {
    id: 'pc-1', title: 'Move Elmington Rehabilitation to Central Richmond',
    detail: 'Reassign from South Richmond / Jordan Ellis → Central Richmond / Maya Chen.',
    reason: 'Adjacent route; Maya has capacity (74%); strategic relationship retained.',
    impact: 'South drive time −1.1 hrs; Central coverage +2 pts.',
    constraint: 'Strategic relationship — retained under Maya, not dropped.',
  },
  {
    id: 'pc-2', title: 'Assign 4 unowned priority accounts',
    detail: 'Distribute four uncovered or underserved priority accounts by geographic adjacency and business-line fit.',
    reason: 'Closes the largest coverage gap in South and East Richmond.',
    impact: 'Uncovered priority accounts 10 → 4; priority coverage +12 pts.',
  },
  {
    id: 'pc-3', title: 'Shift two low-priority visits from Week 1 to Week 3',
    detail: 'Rebalance South Richmond weekly load to free capacity for referral follow-ups.',
    reason: 'Week 1 is over-scheduled (112% capacity); later weeks have slack.',
    impact: 'Rep capacity spread 36 → 14 pts.',
  },
  {
    id: 'pc-4', title: 'Flag Wellspring Senior Living for manager review',
    detail: 'Do not auto-move — strategic, locked account.',
    reason: 'Named strategic relationship; reassignment requires manager judgment.',
    impact: 'No automatic change; added to review queue.',
    constraint: 'Locked account — cannot move automatically.',
    flagOnly: true,
  },
]
