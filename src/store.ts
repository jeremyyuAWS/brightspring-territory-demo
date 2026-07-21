import { useSyncExternalStore } from 'react'
import type { Referral, AuditEntry, ReferralStage } from './types'
import { REFERRALS, TERRITORIES, MARKET_BASELINE, MARKET_OPTIMIZED } from './seed'

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
  // undo: snapshot of the reversible slice captured before the last op
  undoLabel: string | null
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
    undoLabel: null,
  }
}

// ---- undo memory (kept outside serialized state) ----
let undoSnapshot: Pick<DemoState, 'referrals' | 'optimizationApplied'> | null = null

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
  setTab(tab: TabKey) { set({ tab }) },
  openAccount(id: string | null) { set({ openAccountId: id, tab: id ? 'accounts' : state.tab }) },
  setFilter(patch: Partial<Filters>) { set({ filters: { ...state.filters, ...patch } }) },
  selectTerritory(id: string | null) {
    set({ selectedTerritoryId: state.selectedTerritoryId === id ? null : id, selectedInsightId: null, selectedKpi: null })
  },
  selectKpi(id: string | null) {
    set({ selectedKpi: state.selectedKpi === id ? null : id, selectedInsightId: null })
  },
  clearSelection() { set({ selectedTerritoryId: null, selectedInsightId: null, selectedKpi: null, filters: { ...state.filters, status: 'all' } }) },
  selectInsight(id: string | null, territoryId?: string | null) {
    set({ selectedInsightId: state.selectedInsightId === id ? null : id, selectedTerritoryId: territoryId ?? state.selectedTerritoryId, selectedKpi: null })
  },
  openBuilder() { set({ builderOpen: true, selectedTerritoryId: 't-south' }) },
  closeBuilder() { set({ builderOpen: false }) },

  applyOptimization() {
    undoSnapshot = { referrals: state.referrals.map(r => ({ ...r })), optimizationApplied: state.optimizationApplied }
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
      set({ referrals: undoSnapshot.referrals, optimizationApplied: undoSnapshot.optimizationApplied, undoLabel: null })
      undoSnapshot = null
    }
  },

  addReferral(r: Omit<Referral, 'id'>) {
    const nextId = `R-${1043 + state.referrals.length}`
    const referral: Referral = { ...r, id: nextId }
    undoSnapshot = { referrals: state.referrals.map(x => ({ ...x })), optimizationApplied: state.optimizationApplied }
    addAudit({ actor: 'Demo Manager', action: `Logged referral ${nextId}`, detail: `Simulated · ${r.serviceLine} · ${r.sourceOrg}`, after: `Stage: ${r.stage}` })
    set({ referrals: [referral, ...state.referrals], undoLabel: `Undo ${nextId}` })
    return nextId
  },

  updateReferralStage(id: string, stage: ReferralStage, metFamily?: Referral['metFamily'], note?: string) {
    undoSnapshot = { referrals: state.referrals.map(x => ({ ...x })), optimizationApplied: state.optimizationApplied }
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

  reset() {
    undoSnapshot = null
    state = freshState()
    emit()
  },

  hasChanges(): boolean {
    return state.optimizationApplied || state.audit.length > 0 || state.referrals.length !== REFERRALS.length
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
