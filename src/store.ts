import { useSyncExternalStore } from 'react'
import type { Referral, AuditEntry, ReferralStage, MemoryChip, ChatMessage, FollowUpTask, Activity, AssistantProposal } from './types'
import { REFERRALS, TERRITORIES, MARKET_BASELINE, MARKET_OPTIMIZED, REPS } from './seed'

export type TabKey = 'home' | 'plan' | 'today' | 'accounts'

export interface Filters {
  region: string
  businessLine: string
  period: string
  repId: string // 'all' or rep id
  status: string // 'all' | 'Healthy' | 'Watch' | 'At Risk'
}

export interface DemoState {
  tab: TabKey
  openAccountId: string | null
  filters: Filters
  selectedTerritoryId: string | null
  selectedInsightId: string | null
  selectedKpi: string | null // 'coverage' | 'priorityCovered' | 'conversion' | 'atRisk'
  optimizationApplied: boolean
  referrals: Referral[]
  audit: AuditEntry[]
  snapshotReady: boolean
  builderOpen: boolean
  zipBuilderOpen: boolean
  facilityId: string | null
  repDrillId: string | null // rep whose Intelligence drawer is open (map-level rep drill)
  fromAccountId: string | null // account we cross-drilled from (kept highlighted in the rep drawer)
  compareOpen: boolean
  // undo: snapshot of the reversible slice captured before the last op
  undoLabel: string | null
  // ---- AI copilot ----
  assistantOpen: boolean
  memory: MemoryChip[]
  messages: ChatMessage[]
  tasks: FollowUpTask[]
  extraActivities: Activity[]
  monthlyPlanApplied: boolean
  rescheduleApplied: boolean
  scheduleFixes: Record<string, string> // repId -> fixId
  planStrategy: string | null // §4 applied plan-optimization strategy
  calendarSynced: boolean
  mapProvider: 'leaflet' | 'mapbox'
  placedRemaining: boolean
}

const SEED_VERSION = 'seed-v1'
const LS_KEY = 'brightspring.demoState.v1'

const defaultFilters: Filters = {
  region: 'Richmond',
  businessLine: 'Home Health + Hospice',
  period: 'Current Month',
  repId: 'all',
  status: 'all',
}

function freshState(): DemoState {
  return {
    tab: 'home',
    openAccountId: null,
    filters: { ...defaultFilters },
    selectedTerritoryId: null,
    selectedInsightId: null,
    selectedKpi: null,
    optimizationApplied: false,
    referrals: REFERRALS.map(r => ({ ...r })),
    audit: [],
    snapshotReady: false,
    builderOpen: false,
    zipBuilderOpen: false,
    facilityId: null,
    repDrillId: null,
    fromAccountId: null,
    compareOpen: false,
    undoLabel: null,
    assistantOpen: false,
    memory: [],
    messages: [],
    tasks: [],
    extraActivities: [],
    monthlyPlanApplied: false,
    rescheduleApplied: false,
    scheduleFixes: {},
    planStrategy: null,
    calendarSynced: false,
    mapProvider: 'leaflet',
    placedRemaining: false,
  }
}

// ---- undo memory (kept outside serialized state) ----
type UndoSlice = Pick<DemoState, 'referrals' | 'optimizationApplied' | 'tasks' | 'extraActivities' | 'monthlyPlanApplied' | 'rescheduleApplied' | 'planStrategy' | 'placedRemaining'>
let undoSnapshot: UndoSlice | null = null
function snapUndo(): UndoSlice {
  return {
    referrals: state.referrals.map(r => ({ ...r })),
    optimizationApplied: state.optimizationApplied,
    tasks: state.tasks.map(t => ({ ...t })),
    extraActivities: state.extraActivities.map(a => ({ ...a })),
    monthlyPlanApplied: state.monthlyPlanApplied,
    rescheduleApplied: state.rescheduleApplied,
    planStrategy: state.planStrategy,
    placedRemaining: state.placedRemaining,
  }
}

let state: DemoState = load()
const listeners = new Set<() => void>()

function load(): DemoState {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.__v === SEED_VERSION) return { ...freshState(), ...parsed.state }
    }
  } catch { /* ignore */ }
  return freshState()
}

function persist() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ __v: SEED_VERSION, state })) } catch { /* ignore */ }
}

function emit() { persist(); listeners.forEach(l => l()) }

function set(patch: Partial<DemoState>) {
  state = { ...state, ...patch }
  emit()
}

let auditSeq = 0
function stamp() {
  // deterministic-ish timestamp for demo; uses real clock but formatted
  const d = new Date()
  auditSeq++
  return { id: `au-${Date.now()}-${auditSeq}`, ts: d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }
}

function addAudit(e: Omit<AuditEntry, 'id' | 'ts'>) {
  const s = stamp()
  const entry: AuditEntry = { id: s.id, ts: s.ts, ...e }
  state = { ...state, audit: [entry, ...state.audit] }
}

// ---------- actions ----------
export const actions = {
  setTab(tab: TabKey) { set({ tab, undoLabel: null }) }, // dismiss the undo toast when navigating away
  openAccount(id: string | null) { set({ openAccountId: id, tab: id ? 'accounts' : state.tab }) },
  setFilter(patch: Partial<Filters>) { set({ filters: { ...state.filters, ...patch } }) },
  selectTerritory(id: string | null) {
    set({ selectedTerritoryId: state.selectedTerritoryId === id ? null : id, selectedInsightId: null, selectedKpi: null })
  },
  selectKpi(id: string | null) {
    set({ selectedKpi: state.selectedKpi === id ? null : id, selectedInsightId: null })
  },
  clearSelection() { set({ selectedTerritoryId: null, selectedInsightId: null, selectedKpi: null, repDrillId: null, fromAccountId: null, filters: { ...state.filters, status: 'all' } }) },
  selectInsight(id: string | null, territoryId?: string | null) {
    set({ selectedInsightId: state.selectedInsightId === id ? null : id, selectedTerritoryId: territoryId ?? state.selectedTerritoryId, selectedKpi: null })
  },
  openBuilder() { set({ builderOpen: true, selectedTerritoryId: 't-south' }) },
  closeBuilder() { set({ builderOpen: false }) },
  openZipBuilder() { set({ zipBuilderOpen: true, tab: 'home' }) },
  closeZipBuilder() { set({ zipBuilderOpen: false }) },
  openFacility(id: string) { set({ facilityId: id }) },
  closeFacility() { set({ facilityId: null }) },
  // Rep Intelligence drill: highlight the rep's territory + open the rep drawer. fromAcct keeps the
  // account we cross-drilled from visible in the drawer.
  openRepDrill(repId: string, fromAcct: string | null = null) {
    const terr = REPS.find(r => r.id === repId)?.territoryId ?? null
    set({ repDrillId: repId, fromAccountId: fromAcct, facilityId: null, selectedTerritoryId: terr, selectedInsightId: null, selectedKpi: null, tab: 'home' })
  },
  closeRepDrill() { set({ repDrillId: null, fromAccountId: null }) },
  openCompare() { set({ compareOpen: true }) },
  closeCompare() { set({ compareOpen: false }) },

  applyOptimization() {
    undoSnapshot = snapUndo()
    addAudit({
      actor: 'Demo Manager', action: 'Applied territory optimization (Balanced Coverage)',
      detail: 'Simulated', before: 'Priority coverage 76% · 1 at-risk · 10 uncovered priority',
      after: 'Priority coverage 90% · 0 at-risk · 4 uncovered priority',
      reason: 'Rebalance South Richmond load and close priority coverage gaps',
    })
    set({ optimizationApplied: true, builderOpen: false, undoLabel: 'Undo optimization' })
  },
  undo() {
    if (undoSnapshot) {
      addAudit({ actor: 'Demo Manager', action: 'Undo last operation', detail: 'Simulated · restored prior state' })
      set({ ...undoSnapshot, undoLabel: null })
      undoSnapshot = null
    }
  },

  addReferral(r: Omit<Referral, 'id'>) {
    const nextId = `R-${1043 + state.referrals.length}`
    const referral: Referral = { ...r, id: nextId }
    undoSnapshot = snapUndo()
    addAudit({ actor: 'Demo Manager', action: `Logged referral ${nextId}`, detail: `Simulated · ${r.serviceLine} · ${r.sourceOrg}`, after: `Stage: ${r.stage}` })
    set({ referrals: [referral, ...state.referrals], undoLabel: `Undo ${nextId}` })
    return nextId
  },

  updateReferralStage(id: string, stage: ReferralStage, metFamily?: Referral['metFamily'], note?: string) {
    undoSnapshot = snapUndo()
    const prev = state.referrals.find(r => r.id === id)
    const referrals = state.referrals.map(r => r.id === id ? { ...r, stage, metFamily: metFamily ?? r.metFamily, notes: note ? note : r.notes } : r)
    addAudit({ actor: 'Demo Manager', action: `Updated ${id} disposition`, detail: 'Simulated', before: `Stage: ${prev?.stage}`, after: `Stage: ${stage}` })
    set({ referrals, undoLabel: `Undo ${id} update` })
  },

  rebalanceToday(fromRep: string, toRep: string, stop: string) {
    addAudit({ actor: 'Demo Manager', action: 'Rebalanced today (preview applied)', detail: 'Simulated', before: `${stop} · ${fromRep}`, after: `${stop} · ${toRep}`, reason: 'Move one unconfirmed stop to available rep' })
    set({ undoLabel: 'Undo rebalance' })
  },

  exportSnapshot() {
    addAudit({ actor: 'Demo Manager', action: 'Generated leadership snapshot', detail: 'Simulated export' })
    set({ snapshotReady: true })
  },
  clearSnapshot() { set({ snapshotReady: false }) },
  exportSnapshotDownload() {
    const applied = state.optimizationApplied
    const html = buildSnapshotHtml(applied)
    try {
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Richmond_Leadership_Snapshot_${applied ? 'post-optimization' : 'baseline'}.html`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch { /* ignore */ }
    set({ snapshotReady: false })
  },

  simulateSync() {
    addAudit({ actor: 'Demo Manager', action: 'Salesforce sync (queued)', detail: 'Demo simulation · no live write' })
  },

  // ---------- AI copilot ----------
  toggleAssistant(open?: boolean) { set({ assistantOpen: open ?? !state.assistantOpen }) },
  pushMemory(chips: MemoryChip[]) {
    const have = new Set(state.memory.map(m => m.id))
    const merged = [...state.memory, ...chips.filter(c => !have.has(c.id))]
    set({ memory: merged.slice(-8) })
  },
  clearMemory() { set({ memory: [] }) },
  addMessage(msg: ChatMessage) { set({ messages: [...state.messages, msg] }) },
  setProposalStatus(messageId: string, status: AssistantProposal['status']) {
    set({ messages: state.messages.map(m => m.proposal && m.id === messageId ? { ...m, proposal: { ...m.proposal, status } } : m) })
  },
  addTask(task: FollowUpTask) { set({ tasks: [task, ...state.tasks] }) },
  toggleTask(id: string) { set({ tasks: state.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) }) },

  applyCrm(activity: Activity, task: FollowUpTask) {
    undoSnapshot = snapUndo()
    addAudit({ actor: 'Jordan Ellis (AI capture)', action: `Logged ${activity.channel.toLowerCase()} at ${task.accountName}`, detail: 'Simulated · voice → CRM', after: `${activity.outcome}; follow-up ${task.dueDate}` })
    set({ extraActivities: [activity, ...state.extraActivities], tasks: [task, ...state.tasks], undoLabel: `Undo CRM entry` })
  },

  applyReschedule(moved: { title: string; accountName: string; dueDate: string }[]) {
    undoSnapshot = snapUndo()
    const newTasks: FollowUpTask[] = moved.map((m, i) => ({
      id: `tk-resched-${i}`, title: m.title, accountName: m.accountName, dueDate: m.dueDate,
      owner: 'Jordan Ellis', source: 'Emergency reschedule', done: false,
    }))
    addAudit({ actor: 'Jordan Ellis (AI agent)', action: 'Applied emergency reschedule', detail: 'Simulated · afternoon cleared', before: '3 afternoon stops + 1 referral follow-up', after: `${moved.length} rescheduled; urgent R-1042 follow-up preserved` })
    set({ rescheduleApplied: true, tasks: [...newTasks, ...state.tasks], undoLabel: 'Undo reschedule' })
  },

  applyMonthlyPlan() {
    undoSnapshot = snapUndo()
    addAudit({ actor: 'Demo Manager (AI plan)', action: 'Applied AI monthly plan', detail: 'Simulated', before: 'Front-loaded, 6 Tier-1 uncovered', after: 'Balanced 4-week plan · all Tier-1 covered · Fridays lighter' })
    set({ monthlyPlanApplied: true, undoLabel: 'Undo monthly plan' })
  },

  applyRecovery(referralId: string, source: string, action: string) {
    undoSnapshot = snapUndo()
    const task: FollowUpTask = { id: `tk-rec-${referralId}`, title: `Recovery: ${action}`, accountName: source, dueDate: '2026-07-23', owner: 'Jordan Ellis', source: 'Referral recovery', done: false }
    addAudit({ actor: 'Demo Manager', action: `Recovery action queued for ${referralId}`, detail: 'Simulated', after: action })
    set({ tasks: [task, ...state.tasks], undoLabel: `Undo recovery` })
  },

  applyScheduleFix(repId: string, fixId: string, label: string, before: string, after: string) {
    addAudit({ actor: 'Jordan Ellis (AI)', action: 'Applied schedule fix', detail: `Simulated · ${label}`, before: `Home ${before}`, after: `Home ${after}` })
    set({ scheduleFixes: { ...state.scheduleFixes, [repId]: fixId }, undoLabel: 'Undo schedule fix' })
  },
  clearScheduleFix(repId: string) {
    const next = { ...state.scheduleFixes }; delete next[repId]
    set({ scheduleFixes: next })
  },

  applyPlanStrategy(strategy: string, summary: string) {
    undoSnapshot = snapUndo()
    addAudit({ actor: 'Demo Manager (AI plan)', action: `Applied plan optimization — ${strategy}`, detail: 'Simulated', after: summary })
    set({ planStrategy: strategy, monthlyPlanApplied: true, undoLabel: 'Undo plan optimization' })
  },

  setMapProvider(p: 'leaflet' | 'mapbox') { set({ mapProvider: p }) },

  placeRemaining(accounts: { name: string }[]) {
    undoSnapshot = snapUndo()
    const tasks: FollowUpTask[] = accounts.map((a, i) => ({ id: `tk-place-${i}`, title: `Place & schedule ${a.name}`, accountName: a.name, dueDate: '2026-07-25', owner: 'Demo Manager', source: 'Coverage placement', done: false }))
    addAudit({ actor: 'Demo Manager', action: `Placed ${accounts.length} remaining priority accounts`, detail: 'Simulated', after: `${accounts.map(a => a.name).join(', ')}` })
    set({ placedRemaining: true, tasks: [...tasks, ...state.tasks], undoLabel: 'Undo placement' })
  },

  addNearbyStop(name: string, note: string) {
    const task: FollowUpTask = { id: `tk-near-${name}`, title: `Added to today: ${name}`, accountName: name, dueDate: '2026-07-22', owner: 'Field rep', source: 'Near-my-route', done: false }
    addAudit({ actor: 'Field rep (AI)', action: `Added ${name} to today's route`, detail: 'Simulated', after: note })
    set({ tasks: [task, ...state.tasks], undoLabel: 'Undo add stop' })
  },
  saveTerritoryEdit(territoryName: string, before: string, after: string) {
    addAudit({ actor: 'Demo Manager', action: `Saved territory edit — ${territoryName}`, detail: 'Simulated · ZIP reassignment', before, after })
    set({ undoLabel: 'Undo territory edit' })
  },
  optimizeMyDay() {
    addAudit({ actor: 'Field rep (AI)', action: 'Optimized my day', detail: 'Simulated', after: 'Route reordered; 12 min drive saved; home-by preserved' })
    set({ undoLabel: 'Undo optimize day' })
  },

  simulateCalendarSync() {
    addAudit({ actor: 'Demo Manager', action: 'Calendar sync (Google / M365)', detail: 'Demo simulation · busy blocks imported, personal time protected' })
    set({ calendarSynced: true })
  },

  addSourceToPlan(sourceName: string, winBack: string) {
    undoSnapshot = snapUndo()
    const task: FollowUpTask = { id: `tk-src-${sourceName}`, title: `Win-back: ${winBack}`, accountName: sourceName, dueDate: '2026-07-28', owner: 'Jordan Ellis', source: 'Loyalty win-back', done: false }
    addAudit({ actor: 'Demo Manager', action: `Added ${sourceName} to next planning period`, detail: 'Simulated · loyalty win-back', after: winBack })
    set({ tasks: [task, ...state.tasks], undoLabel: `Undo win-back` })
  },

  reset() {
    undoSnapshot = null
    state = freshState()
    emit()
  },

  hasChanges(): boolean {
    return state.optimizationApplied || state.audit.length > 0 || state.referrals.length !== REFERRALS.length
      || state.tasks.length > 0 || state.extraActivities.length > 0 || state.monthlyPlanApplied || state.rescheduleApplied || state.messages.length > 0
  },
}

// ---------- react binding ----------
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb) } }
function getSnapshot() { return state }

export function useStore(): DemoState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ---------- snapshot export (simulated leadership report) ----------
function buildSnapshotHtml(applied: boolean): string {
  const k = applied ? MARKET_OPTIMIZED : MARKET_BASELINE
  const rows = TERRITORIES.map(t => {
    const m = applied ? t.optimized : t.baseline
    return `<tr><td>${t.name}</td><td style="text-align:right">${m.priorityCoveragePct}%</td><td style="text-align:right">${m.visitsCompleted}/${m.visitsTarget}</td><td style="text-align:right">${m.referrals}</td><td style="text-align:right">${m.driveHrs}</td></tr>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Richmond Leadership Snapshot</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:820px;margin:32px auto;padding:0 20px}
h1{color:#1b5aa8}.sim{display:inline-block;background:#f3e8ff;color:#7c3aed;font-weight:700;font-size:12px;padding:3px 10px;border-radius:999px}
table{width:100%;border-collapse:collapse;margin:14px 0}th,td{border:1px solid #e2e8f0;padding:8px 10px;font-size:13px}th{background:#f8fafc;text-align:left}
.kpis{display:flex;gap:16px;margin:18px 0}.kpi{border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;flex:1}.kpi .v{font-size:26px;font-weight:700}</style></head>
<body><span class="sim">◆ Simulated demonstration data</span>
<h1>Richmond Market — Territory Leadership Snapshot</h1>
<p>Business line: Home Health + Hospice · Period: Current Month · State: ${applied ? 'Post-optimization (Balanced)' : 'Baseline'}</p>
<div class="kpis">
<div class="kpi"><div class="v">${k.coveragePct}%</div>Priority coverage</div>
<div class="kpi"><div class="v">${k.priorityCovered}/${k.priorityTotal}</div>Priority accounts covered</div>
<div class="kpi"><div class="v">${k.atRiskCount}</div>At-risk / watch territories</div>
</div>
<table><thead><tr><th>Territory</th><th style="text-align:right">Priority coverage</th><th style="text-align:right">Visits / target</th><th style="text-align:right">Referrals</th><th style="text-align:right">Drive hrs</th></tr></thead><tbody>${rows}</tbody></table>
<p style="color:#94a3b8;font-size:12px">Generated by the BrightSpring Territory Command Center demo. Synthetic, non-PHI data. Not a production report.</p>
</body></html>`
}

