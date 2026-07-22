import { useState, useRef, useEffect } from 'react'
import { useStore, actions, type DemoState } from '../store'
import type { ChatMessage, AssistantProposal } from '../types'
import { runEngine, detectChips, SUGGESTED_PROMPTS } from './engine'
import { ACCOUNTS, OPTIMIZED_CAPACITY, REPS } from '../seed'
import { territoryById, repById, metricsFor, accountCovered, facilitySize } from '../selectors'

// ---- map-context awareness: chips + grounded answers about the current selection ----
function mapContext(s: DemoState) {
  const terr = s.selectedTerritoryId ? territoryById(s.selectedTerritoryId) : null
  const rep = s.repDrillId ? repById(s.repDrillId) : null
  const acct = (s.facilityId || s.fromAccountId) ? ACCOUNTS.find(a => a.id === (s.facilityId || s.fromAccountId)) : null
  return { terr, rep, acct, period: s.filters.period }
}
function contextChips(s: DemoState) {
  const { terr, rep, acct, period } = mapContext(s)
  const chips: { icon: string; label: string }[] = []
  if (terr) chips.push({ icon: '📍', label: terr.name })
  if (rep) chips.push({ icon: '🧑‍💼', label: rep.name })
  if (acct) chips.push({ icon: '🏥', label: acct.name })
  chips.push({ icon: '🗓️', label: period })
  return chips
}
function contextQuestions(s: DemoState): string[] {
  const { terr, rep, acct } = mapContext(s)
  if (acct) return [`Why is ${acct.name} ${acct.priority.toLowerCase()} priority?`, `What's the next best action for ${acct.name}?`, `What changes if ${acct.name} moves to another rep?`]
  if (rep) return [`What should ${rep.name.split(' ')[0]} do next?`, `Which rep is better positioned for ${terr?.name}?`, `What changes if we rebalance ${rep.name.split(' ')[0]}'s load?`]
  if (terr) return [`Why is ${terr.name} under-covered?`, `Build a visit plan for ${terr.name}.`]
  return SUGGESTED_PROMPTS
}
// grounded, deterministic answers using live selection data (returns null → fall through to runEngine)
function contextAnswer(text: string, s: DemoState): string | null {
  const t = text.toLowerCase()
  const { terr, rep, acct } = mapContext(s)
  const applied = s.optimizationApplied
  const otherRep = REPS.filter(r => r.territoryId && r.id !== rep?.id).sort((a, b) => a.capacityPct - b.capacityPct)[0]
  if (acct && /why.*(priority|high priority)/.test(t)) {
    const covered = accountCovered(acct, applied)
    return `**${acct.name}** is ${acct.priority} priority because of its size and opportunity: ${facilitySize(acct)}, ${acct.facilityType}, opportunity score ${acct.opportunityScore}. It's currently **${covered ? 'covered' : 'uncovered'}**, ${acct.lastContactDays} days since the last meaningful touch${acct.whitespace.length ? `, with **${acct.whitespace[0]}** whitespace still open` : ''}.`
  }
  if (acct && /(next best action|next action|do next|should.*do)/.test(t)) {
    const covered = accountCovered(acct, applied)
    if (!covered && acct.isPriority) return `Next best action for **${acct.name}**: schedule a first visit this month — it's a high-priority account with no coverage. I can add it to ${rep?.name.split(' ')[0] ?? 'the'} plan and draft an intro agenda.`
    if (acct.whitespace.length) return `Next best action for **${acct.name}**: introduce **${acct.whitespace[0]}** — an eligible service line not yet captured. Want me to draft the cross-sell talking points?`
    return `Next best action for **${acct.name}**: advance the active referral and confirm preferred-provider terms with the decision maker.`
  }
  if (acct && /what changes if.*(move|reassign)/.test(t) && rep && otherRep) {
    return `Moving **${acct.name}** from ${rep.name.split(' ')[0]} to ${otherRep.name.split(' ')[0]} shifts ~4 capacity points: ${rep.name.split(' ')[0]} eases from ${applied ? OPTIMIZED_CAPACITY[rep.id] : rep.capacityPct}% toward the ceiling, and ${otherRep.name.split(' ')[0]} (currently ${otherRep.capacityPct}%) still has headroom. Priority coverage in the receiving territory ticks up. Reversible — want a preview?`
  }
  if (rep && /(do next|should.*do)/.test(t)) {
    const terrM = terr ? metricsFor(terr, applied) : null
    return `${rep.name.split(' ')[0]}'s priority right now: the ${terrM?.uncoveredPriority ?? 'uncovered'} priority accounts with no visit this month. ${rep.capacityPct > 100 ? `But ${rep.name.split(' ')[0]} is at ${applied ? OPTIMIZED_CAPACITY[rep.id] : rep.capacityPct}% capacity — the fix is rebalancing load, not adding activity.` : `There's capacity to absorb them — I can build the visit plan.`}`
  }
  if (rep && otherRep && /(which rep|better positioned|better own)/.test(t)) {
    return `**${otherRep.name}** is better positioned to absorb work — ${otherRep.capacityPct}% capacity vs ${rep.name.split(' ')[0]}'s ${applied ? OPTIMIZED_CAPACITY[rep.id] : rep.capacityPct}%. Moving two border accounts near the shared boundary would drop ${rep.name.split(' ')[0]} toward ~96% and lift priority coverage. Want the reassignment preview?`
  }
  if (rep && /rebalance.*load|what changes.*rebalance/.test(t)) {
    return `Rebalancing ${rep.name.split(' ')[0]}: move two western-border accounts to ${otherRep?.name.split(' ')[0] ?? 'an adjacent rep'} and shift one follow-up to next week. Projected: capacity ${applied ? OPTIMIZED_CAPACITY[rep.id] : rep.capacityPct}% → ~96%, priority coverage up, drive hours down. Run it through the optimizer to preview?`
  }
  if (terr && /why.*(under.?covered|coverage|at.?risk)/.test(t)) {
    const m = metricsFor(terr, applied); const r = repById(terr.repId)
    return `**${terr.name}** sits at ${m.priorityCoveragePct}% priority coverage — ${m.uncoveredPriority} priority accounts have no visit this month. The root cause is capacity: ${r?.name} is at ${applied ? OPTIMIZED_CAPACITY[terr.repId] : r?.capacityPct}% with ${m.driveHrs} drive hrs/week. It's a load problem, not an effort problem.`
  }
  if (terr && /(visit plan|build.*plan)/.test(t)) {
    const accts = ACCOUNTS.filter(a => a.territoryId === terr.id)
    const unc = accts.filter(a => a.isPriority && !accountCovered(a, applied)).slice(0, 3)
    return `Visit plan for **${terr.name}**: start with the uncovered priority accounts — ${unc.map(a => a.name).join(', ') || 'none outstanding'} — then the overdue-contact accounts. That's roughly ${unc.length + 2} stops; I can sequence them by drive time and drop them into the month plan. Want me to draft it?`
  }
  return null
}

let mid = 0
const msgId = () => `m-${++mid}`

const CHIP_ICON: Record<string, string> = { account: '🏥', territory: '📍', contact: '👤', time: '🗓️', referral: '↪', constraint: '⛭' }

// tiny **bold** renderer
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <span key={i} style={{ display: 'block' }}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
            seg.startsWith('**') ? <b key={j}>{seg.slice(2, -2)}</b> : <span key={j}>{seg}</span>)}
        </span>
      ))}
    </>
  )
}

export function Assistant() {
  const s = useStore()
  const [input, setInput] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' }) }, [s.messages, s.assistantOpen])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') actions.toggleAssistant(false) }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])

  if (!s.assistantOpen) return null

  const send = (text: string) => {
    const clean = text.trim(); if (!clean) return
    setInput('')
    actions.pushMemory(detectChips(clean))
    actions.addMessage({ id: msgId(), role: 'user', text: clean })
    const grounded = contextAnswer(clean, s)
    const res = grounded ? { reply: grounded } : runEngine(clean)
    if (res.navigate) actions.setTab(res.navigate)
    // brief “thinking” delay for realism
    setTimeout(() => {
      actions.addMessage({ id: msgId(), role: 'assistant', text: res.reply, proposal: res.proposal })
        ; (window as any).__lastEngine = res // stash concrete writes for approve
    }, 260)
  }

  const approve = (m: ChatMessage) => {
    const p = m.proposal!; const res = (window as any).__lastEngine
    if (p.kind === 'crm' && res?.crm) actions.applyCrm(res.crm.activity, res.crm.task)
    else if (p.kind === 'reschedule' && res?.reschedule) actions.applyReschedule(res.reschedule)
    else if (p.kind === 'monthlyPlan') actions.applyMonthlyPlan()
    actions.setProposalStatus(m.id, 'applied')
  }

  return (
    <>
      <div className="scrim" onClick={() => actions.toggleAssistant(false)} />
      <aside className="drawer copilot" role="dialog" aria-modal="true">
        <div className="dhead">
          <div>
            <h2>◇ BrightSpring Copilot</h2>
            <div style={{ marginTop: 4 }}><span className="badge sim">◆ Simulated · templated, no live LLM</span></div>
          </div>
          <button className="iconbtn" onClick={() => actions.toggleAssistant(false)} aria-label="Close">×</button>
        </div>

        {/* map context — the copilot knows what you're looking at */}
        {(s.selectedTerritoryId || s.repDrillId || s.facilityId || s.fromAccountId) && (
          <div className="cp-context">
            <span className="cp-mem-label">Map context</span>
            {contextChips(s).map((c, i) => <span key={i} className="memchip context">{c.icon} {c.label}</span>)}
          </div>
        )}

        {/* working memory */}
        <div className="cp-memory">
          <span className="cp-mem-label">Working memory</span>
          {s.memory.length === 0 && <span className="muted" style={{ fontSize: 12 }}>—</span>}
          {s.memory.map(c => <span key={c.id} className={`memchip ${c.kind}`}>{CHIP_ICON[c.kind]} {c.label}</span>)}
          {s.memory.length > 0 && <button className="cp-mem-clear" onClick={() => actions.clearMemory()}>clear</button>}
        </div>

        <div className="dbody cp-body" ref={bodyRef}>
          {s.messages.length === 0 && (
            <div className="cp-empty">
              <p style={{ fontWeight: 650, marginBottom: 4 }}>Ask me to act across the workflow.</p>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>I keep context in working memory and every action previews before it writes.</p>
              {contextQuestions(s).map((p, i) => (
                <button key={i} className="cp-suggest" onClick={() => send(p)}>{p}</button>
              ))}
            </div>
          )}
          {s.messages.map(m => (
            <div key={m.id} className={`cp-msg ${m.role}`}>
              <div className="cp-bubble"><RichText text={m.text} /></div>
              {m.proposal && <ProposalCard m={m} onApprove={() => approve(m)} />}
            </div>
          ))}
        </div>

        <div className="cp-input">
          <button className="cp-mic" title="Simulated voice" onClick={() => setInput(SUGGESTED_PROMPTS[0])}>🎙️</button>
          <input placeholder="Ask the copilot…" value={input}
            onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(input) }} />
          <button className="btn primary sm" onClick={() => send(input)}>Send</button>
        </div>
      </aside>
    </>
  )
}

function ProposalCard({ m, onApprove }: { m: ChatMessage; onApprove: () => void }) {
  const p = m.proposal as AssistantProposal
  return (
    <div className={`cp-proposal ${p.status}`}>
      <div className="cp-prop-head">
        <b>{p.title}</b>
        {p.status === 'applied' ? <span className="badge healthy">✓ Applied</span> : <span className="badge sim">Preview</span>}
      </div>
      <div className="cp-prop-sum">{p.summary}</div>
      {p.fields && (
        <dl className="cp-fields">
          {p.fields.map((f, i) => (
            <div key={i} className={f.changed ? 'chg' : ''}>
              <dt>{f.label}</dt><dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {p.changes && (
        <div className="cp-changes">
          <div className="section-title" style={{ margin: '8px 0 4px' }}>What will update</div>
          {p.changes.map((c, i) => <div key={i} className="cp-change"><b>{c.label}</b><span>{c.detail}</span></div>)}
        </div>
      )}
      {p.status === 'pending'
        ? <div className="cp-prop-actions">
          <button className="btn sm" onClick={() => actions.setProposalStatus(m.id, 'undone')}>Dismiss</button>
          <button className="btn primary sm" onClick={onApprove}>Approve &amp; apply</button>
        </div>
        : p.status === 'applied'
          ? <div className="cp-applied-note">◆ Applied to demo state — the app updated and it's in the audit trail. Reversible via Undo.</div>
          : <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Dismissed.</div>}
    </div>
  )
}
