import { useState } from 'react'
import { useStore, actions } from '../store'
import { REPS, TERRITORIES, OPTIMIZED_CAPACITY } from '../seed'
import { statusFor } from '../selectors'
import { DAYS, type RepDay, type TimelineItem, type ScheduleFix } from '../today'
import { Drawer, StatusBadge } from '../ui'

export function Today() {
  const s = useStore()
  const applied = s.optimizationApplied
  const [selRep, setSelRep] = useState<string | null>('r-jordan')
  const [rebalanceOpen, setRebalanceOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const reps = REPS.filter(r => r.territoryId)

  return (
    <div>
      <div className="filterbar">
        <div className="field"><label>View</label><select disabled><option>Rep roster · Today</option></select></div>
        <div className="field"><label>Date</label><select disabled><option>Jul 22, 2026</option></select></div>
        <div className="spacer" />
        {s.calendarSynced
          ? <span className="badge sim" style={{ alignSelf: 'center' }}>◆ Calendar synced</span>
          : <button className="btn sm" onClick={() => actions.simulateCalendarSync()}>⟳ Sync calendar (Google / M365)</button>}
        <span className="badge neutral" style={{ alignSelf: 'center' }}>Manager view</span>
      </div>

      {s.calendarSynced && <CalendarSyncCard />}

      {s.rescheduleApplied && (
        <div className="callout" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', marginBottom: 14 }}>
          <span className="ico">◆</span>
          <div><b>Copilot cleared Jordan's afternoon.</b> 3 unconfirmed stops rescheduled, the urgent R-1042 follow-up preserved, and customer notes drafted. See the follow-up tasks below — reversible via Undo.</div>
        </div>
      )}

      <div className="home-grid">
        <div className="panel">
          <div className="phead"><h3>Rep roster</h3><span className="hint">Select a rep to see the day</span></div>
          <div className="pbody">
            {reps.map(r => {
              const t = TERRITORIES.find(x => x.id === r.territoryId)!
              const day = DAYS[r.id]
              const cap = applied ? OPTIMIZED_CAPACITY[r.id] : r.capacityPct
              const late = timeToMin(day.projectedHome) > timeToMin(day.homeBy)
              return (
                <div key={r.id} className={`rep-card ${selRep === r.id ? 'sel' : ''}`} onClick={() => setSelRep(r.id)}>
                  <span className="avatar" style={{ background: r.color }}>{r.initials}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <b>{r.name}</b><span className="muted">· {t.short}</span>
                      <StatusBadge status={statusFor(t, applied)} />
                      {day.risk && <span className="badge watch" style={{ fontSize: 10 }}>⚠ risk</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {day.stops} stops · {day.totalDriveMin} min drive · home <span style={{ color: late ? 'var(--risk)' : 'inherit', fontWeight: late ? 700 : 400 }}>{day.projectedHome}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: cap > 100 ? 'var(--risk)' : 'inherit' }}>{cap}%</div>
                    <div className="muted" style={{ fontSize: 11 }}>capacity</div>
                  </div>
                  <span className="rep-chevron" aria-hidden>›</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="panel">
          <div className="phead">
            <h3>{selRep ? `${REPS.find(r => r.id === selRep)!.name} — today` : 'Route & itinerary'}</h3>
            {selRep && <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn sm" onClick={() => setNavOpen(true)}>▷ Launch route</button>
              <button className="btn sm primary" onClick={() => setRebalanceOpen(true)}>◆ Rebalance</button>
            </div>}
          </div>
          <div className="pbody">
            {!selRep && <div className="empty">Select a rep to view their day, schedule risks, and route.</div>}
            {selRep && <RepDetail repId={selRep} />}
          </div>
        </div>
      </div>

      {s.tasks.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="phead">
            <h3>Follow-up tasks</h3>
            <span className="badge sim" style={{ fontSize: 11 }}>◆ {s.tasks.length} queued</span>
          </div>
          <div className="pbody">
            {s.tasks.map(tk => (
              <label key={tk.id} className="task-row">
                <input type="checkbox" checked={tk.done} onChange={() => actions.toggleTask(tk.id)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, textDecoration: tk.done ? 'line-through' : 'none', color: tk.done ? 'var(--text-3)' : 'inherit' }}>{tk.title}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{tk.accountName} · due {tk.dueDate} · {tk.owner}</div>
                </div>
                <span className="badge neutral" style={{ fontSize: 10.5 }}>{tk.source}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {rebalanceOpen && selRep && <Rebalance repId={selRep} onClose={() => setRebalanceOpen(false)} />}
      {navOpen && selRep && <NavLaunch repId={selRep} onClose={() => setNavOpen(false)} />}
    </div>
  )
}

function timeToMin(t: string) {
  const m = t.match(/(\d+):(\d+)\s*(am|pm|a|p)?/i)
  if (!m) return 0
  let h = +m[1]; const min = +m[2]; const ap = (m[3] || '').toLowerCase()
  if (ap.startsWith('p') && h !== 12) h += 12
  if (ap.startsWith('a') && h === 12) h = 0
  return h * 60 + min
}

// ---------- intelligent day ----------
function RepDetail({ repId }: { repId: string }) {
  const s = useStore()
  const day = DAYS[repId]
  const appliedFixId = s.scheduleFixes[repId]
  const appliedFix = day.risk?.fixes.find(f => f.id === appliedFixId)
  const projectedHome = appliedFix ? appliedFix.newHome : day.projectedHome
  const late = timeToMin(projectedHome) > timeToMin(day.homeBy)

  return (
    <>
      <div className="stat-row" style={{ marginBottom: 14 }}>
        <div className="mini-stat"><div className="v">{day.stops}</div><div className="l">Stops</div></div>
        <div className="mini-stat"><div className="v">{day.totalDriveMin}<span style={{ fontSize: 12 }}>m</span></div><div className="l">Drive time</div></div>
        <div className="mini-stat"><div className="v" style={{ color: late ? 'var(--risk)' : 'var(--healthy)' }}>{projectedHome}</div><div className="l">Home by (target {day.homeBy})</div></div>
        <div className="mini-stat"><div className="v">{appliedFix ? day.openCapacityMin + 45 : day.openCapacityMin}<span style={{ fontSize: 12 }}>m</span></div><div className="l">Open capacity</div></div>
      </div>

      {day.risk && !appliedFix && (
        <div className="risk-warn">
          <div className="risk-warn-head"><span>⚠ Schedule risk</span></div>
          <p style={{ margin: '4px 0 10px', fontSize: 13 }}>{day.risk.text}</p>
          <div className="section-title" style={{ margin: '0 0 6px' }}>Two ways to fix it</div>
          {day.risk.fixes.map(fix => (
            <div key={fix.id} className="fix-card">
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 13 }}>{fix.label}</b>
                <div className="muted" style={{ fontSize: 12.5 }}>{fix.detail}</div>
                <div style={{ fontSize: 12, color: 'var(--healthy)', fontWeight: 650, marginTop: 3 }}>→ Home by {fix.newHome}</div>
              </div>
              <button className="btn sm primary" onClick={() => actions.applyScheduleFix(repId, fix.id, fix.label, day.projectedHome, fix.newHome)}>Apply</button>
            </div>
          ))}
        </div>
      )}
      {appliedFix && (
        <div className="callout" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}>
          <span className="ico">✓</span>
          <div><b>Fix applied:</b> {appliedFix.label}. Projected home now <b>{appliedFix.newHome}</b> — within target. Logged to audit; reversible via Undo. <button className="btn ghost sm" style={{ padding: 0 }} onClick={() => actions.clearScheduleFix(repId)}>undo here</button></div>
        </div>
      )}

      <div className="section-title">Timeline</div>
      <div className="day-timeline">
        {day.timeline.map((item, i) => <TimelineRow key={i} item={item} appliedFix={appliedFix} />)}
      </div>
    </>
  )
}

function TimelineRow({ item, appliedFix }: { item: TimelineItem; appliedFix?: ScheduleFix }) {
  if (item.kind === 'drive') return <div className="tl-drive">↓ {item.minutes} min drive → {item.to}</div>
  if (item.kind === 'buffer') return <div className="tl-buffer">{item.label === 'Lunch' ? '🍽' : '🅿'} {item.label} · {item.minutes} min</div>
  if (item.kind === 'personal') return <div className="tl-personal"><b>{item.time}</b> {item.label}</div>
  // meeting
  const moved = appliedFix?.removesAccount === item.account
  const converted = appliedFix?.convertsAccount === item.account
  const statusCls = item.status === 'Completed' ? 'healthy' : item.status === 'Unconfirmed' ? 'watch' : 'neutral'
  return (
    <div className={`stop-card ${item.risk && !moved && !converted ? 'risk' : ''} ${moved ? 'moved' : ''}`}>
      <div className="stop-time">{item.time}</div>
      <div className="stop-body">
        <div className="stop-title">
          {item.account}
          <span className={`badge ${statusCls}`} style={{ fontSize: 10 }}>{item.status}</span>
          {item.risk && !moved && !converted && <span className="badge risk" style={{ fontSize: 10 }}>late-arrival risk</span>}
          {moved && <span className="badge blue" style={{ fontSize: 10 }}>→ moved to tomorrow</span>}
          {converted && <span className="badge blue" style={{ fontSize: 10 }}>→ phone check-in</span>}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>{item.purpose} · {item.dur} min · hours {item.hours}</div>
      </div>
    </div>
  )
}

// ---------- §18 calendar sync ----------
function CalendarSyncCard() {
  const s = useStore()
  const day = DAYS['r-jordan']
  const hasFix = !!s.scheduleFixes['r-jordan']
  return (
    <div className="callout" style={{ background: '#f2f7fd', borderColor: '#bcd4ee', color: '#12385f', marginBottom: 14, display: 'block' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <span className="ico">◆</span>
        <div>
          <b>Two-way calendar sync — simulated.</b> Imported busy blocks from Google / M365, protected personal time (Jordan's 5:30 PM pickup), and kept home-by preferences.
          {!hasFix && <div style={{ marginTop: 6 }}><b>External change detected:</b> a personal commitment now conflicts with Jordan's projected {day.projectedHome} finish. Open Jordan's day to resolve the schedule risk.</div>}
        </div>
      </div>
    </div>
  )
}

// ---------- §19 nav launch ----------
function NavLaunch({ repId, onClose }: { repId: string; onClose: () => void }) {
  const day = DAYS[repId]
  const stops = day.routeStops
  const gmaps = `https://www.google.com/maps/dir/${stops.map(s => `${s.lat},${s.lng}`).join('/')}`
  const apple = `https://maps.apple.com/?daddr=${stops.map(s => `${s.lat},${s.lng}`).join('+to:')}`
  const waze = `https://waze.com/ul?ll=${stops[0].lat},${stops[0].lng}&navigate=yes`
  return (
    <Drawer title="Launch route" onClose={onClose}
      subtitle={<span className="muted">{stops.length} stops · {day.totalDriveMin} min total drive</span>}
      footer={<button className="btn" onClick={onClose}>Close</button>}>
      <p style={{ fontSize: 13 }}>Mapbox plans the visualization; your phone's navigation app handles turn-by-turn. Ordered stops:</p>
      <ol className="route-list">
        {stops.map((st, i) => <li key={i}><b>{i + 1}.</b> {st.name}</li>)}
      </ol>
      <div className="section-title">Open in</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a className="btn primary sm" href={gmaps} target="_blank" rel="noreferrer">Google Maps</a>
        <a className="btn sm" href={apple} target="_blank" rel="noreferrer">Apple Maps</a>
        <a className="btn sm" href={waze} target="_blank" rel="noreferrer">Waze</a>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Deep links open the installed app with these Richmond waypoints. Demo uses synthetic coordinates.</p>
    </Drawer>
  )
}

function Rebalance({ repId, onClose }: { repId: string; onClose: () => void }) {
  const day = DAYS[repId]
  const from = REPS.find(r => r.id === repId)!
  const moveable = day.timeline.find((t): t is Extract<TimelineItem, { kind: 'meeting' }> => t.kind === 'meeting' && t.status === 'Unconfirmed')
  const to = REPS.find(r => r.territoryId && r.id !== repId && r.capacityPct < 90) ?? REPS.find(r => r.id === 'r-maya')!
  const [applied, setApplied] = useState(false)
  if (!moveable) return (
    <Drawer title="Rebalance today" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Close</button>}>
      <div className="empty">No unconfirmed stops available to move for {from.name}.</div>
    </Drawer>
  )
  return (
    <Drawer title="Rebalance today" onClose={onClose}
      subtitle={<span className="badge sim">◆ Simulated · before / after</span>}
      footer={applied
        ? <button className="btn primary" onClick={onClose}>Done</button>
        : <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { actions.rebalanceToday(from.name, to.name, moveable.account); setApplied(true) }}>Apply rebalance</button>
        </>}>
      <p style={{ fontSize: 13.5 }}>Move one <b>unconfirmed</b> stop to a rep with open capacity. Confirmed and completed stops are never moved automatically.</p>
      <div className="two-col" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="panel" style={{ boxShadow: 'none' }}>
          <div className="phead"><h3 style={{ fontSize: 13 }}>Before — {from.name}</h3></div>
          <div className="pbody"><div className="tl-item unconf" style={{ marginLeft: 12, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}><b>{moveable.time}</b> {moveable.account}<div className="muted" style={{ fontSize: 12 }}>{moveable.purpose}</div></div></div>
        </div>
        <div className="panel" style={{ boxShadow: 'none' }}>
          <div className="phead"><h3 style={{ fontSize: 13 }}>After — {to.name}</h3></div>
          <div className="pbody"><div className="tl-item" style={{ marginLeft: 12, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}><b>{moveable.time}</b> {moveable.account}<span className="badge blue" style={{ marginLeft: 6, fontSize: 11 }}>reassigned</span></div></div>
        </div>
      </div>
      {applied && <div className="callout" style={{ marginTop: 14 }}><span className="ico">◆</span><div>Rebalance applied and logged to the audit trail. Reversible via Undo.</div></div>}
    </Drawer>
  )
}
