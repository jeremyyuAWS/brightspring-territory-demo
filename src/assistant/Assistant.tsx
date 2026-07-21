import { useState, useRef, useEffect } from 'react'
import { useStore, actions } from '../store'
import type { ChatMessage, AssistantProposal } from '../types'
import { runEngine, detectChips, SUGGESTED_PROMPTS } from './engine'

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
    const res = runEngine(clean)
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
              {SUGGESTED_PROMPTS.map((p, i) => (
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
