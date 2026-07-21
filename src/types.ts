export type Status = 'Healthy' | 'Watch' | 'At Risk'
export type Priority = 'High' | 'Medium' | 'Low'
export type BusinessLine = 'Home Health' | 'Hospice' | 'Home Health + Hospice'
export type VisitFreshness = 'fresh' | 'aging' | 'stale'
export type OppTier = 'Tier 1' | 'Tier 2' | 'Tier 3'

export interface HealthDims {
  priorityCoverage: number // 0-100
  visitAttainment: number
  referralMomentum: number
  freshness: number
  travelEfficiency: number
}

export interface TerritoryMetrics {
  accountCount: number
  priorityCoveragePct: number
  visitsCompleted: number
  visitsTarget: number
  referrals: number
  driveHrs: number
  uncoveredPriority: number
  capacityPct: number
  dims: HealthDims
}

export interface Territory {
  id: string
  name: string
  short: string
  repId: string
  color: string
  polygon: string // svg points
  labelX: number
  labelY: number
  scatter: { x: number; y: number; w: number; h: number } // region for pins
  baseline: TerritoryMetrics
  optimized: TerritoryMetrics
}

export interface Rep {
  id: string
  name: string
  initials: string
  role: string
  businessLine: BusinessLine
  capacityPct: number
  homeBase: string
  territoryId: string | null
  color: string
}

export type RelationshipStatus = 'current' | 'growth' | 'prospect' | 'at_risk'
export type OpportunityBand = 'high' | 'medium' | 'low'

export interface Account {
  id: string
  name: string
  facilityType: string
  territoryId: string
  coord: { x: number; y: number } // svg fallback space
  lng: number
  lat: number
  beds: number
  priority: Priority // derived from priorityTier: 1->High, 2->Medium, 3->Low
  priorityTier: 1 | 2 | 3
  isPriority: boolean // tier 1 or 2
  relationshipStatus: RelationshipStatus
  opportunityBand: OpportunityBand
  services: string[]
  whitespace: string[]
  lastContactDays: number
  opportunityScore: number
  oppTier: OppTier
  visitFresh: VisitFreshness
  referralActive: boolean
  locked: boolean
  strategic: boolean
  covered: boolean
}

export interface Contact {
  id: string
  accountId: string
  name: string
  role: string
  tenureYears: number
  relationship: 'Champion' | 'Strong' | 'Neutral' | 'At Risk'
}

export interface Activity {
  id: string
  accountId: string
  date: string
  channel: 'Visit' | 'Call' | 'Note' | 'Follow-up'
  outcome: string
  owner: string
}

export type ReferralStage =
  | 'Received'
  | 'Contact Attempted'
  | 'Met Patient/Family'
  | 'Evaluating'
  | 'Accepted'
  | 'Admitted'
  | 'Declined'
  | 'Ineligible'
  | 'Lost to Competitor'

export interface Referral {
  id: string
  accountId: string
  sourceOrg: string
  serviceLine: 'Home Health' | 'Hospice'
  receivedDate: string
  territoryId: string
  repId: string
  stage: ReferralStage
  metFamily: 'Yes' | 'No' | 'Not Yet'
  notes: string
  followUpDate: string
  owner: string
}

export interface Deal {
  id: string
  accountId: string
  name: string
  stage: string
  valueBand: string
  serviceLine: string
  nextStep: string
}

export interface WeekPlan {
  repId: string
  territoryId: string
  week: number // 1-4
  visitTarget: number
  planned: number
  completed: number
}

export interface Stop {
  id: string
  time: string
  accountName: string
  purpose: string
  status: 'Confirmed' | 'Unconfirmed' | 'Completed'
}

export interface AuditEntry {
  id: string
  ts: string
  actor: string
  action: string
  detail: string
  before?: string
  after?: string
  reason?: string
}

export interface ProposedChange {
  id: string
  title: string
  detail: string
  reason: string
  impact: string
  constraint?: string
  flagOnly?: boolean
}

// ---- AI copilot ----
export interface MemoryChip {
  id: string
  label: string
  kind: 'account' | 'territory' | 'contact' | 'time' | 'referral' | 'constraint'
}

export interface FollowUpTask {
  id: string
  title: string
  accountName: string
  dueDate: string
  owner: string
  source: string
  done: boolean
}

export type ProposalKind = 'crm' | 'reschedule' | 'monthlyPlan'

export interface AssistantProposal {
  id: string
  kind: ProposalKind
  title: string
  summary: string
  fields?: { label: string; value: string; changed?: boolean }[]
  changes?: { label: string; detail: string }[]
  status: 'pending' | 'applied' | 'undone'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  proposal?: AssistantProposal
}
