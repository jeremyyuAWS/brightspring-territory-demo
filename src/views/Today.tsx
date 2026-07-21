import { useState } from 'react'
import { useStore, actions } from '../store'
import { REPS, TERRITORIES, OPTIMIZED_CAPACITY } from '../seed'
import { statusFor } from '../selectors'
import type { Stop } from '../types'
import { Drawer, StatusBadge } from '../ui'

const ITINERARIES: Record<string, { routeEff: number; unplanned: number; risk: string; stops: Stop[] }> = {
  'r-jordan': {
    routeEff: 61, unplanned: 2, risk: '2 priority accounts unvisited; route doubles back through Midlothian',
    stops: [
      { id: 's1', time: '8:30a', accountName: 'Elmington Rehabilitation', purpose: 'Discharge pipeline review', status: 'Confirmed' },
      { id: 's2', time: '10:15a', accountName: 'Bon Air Senior Living', purpose: 'Referral follow-up', status: 'Completed' },
      { id: 's3', time: '12:00p', accountName: 'Woodlake Skilled Nursing', purpose: 'Intro visit', status: 'Unconfirmed' },
      { id: 's4', time: '2:30p', accountName: 'Brandermill Physicians', purpose: 'Quarterly check-in', status: 'Unconfirmed' },
      { id: 's5', time: '4:00p', accountName: 'Rockwood Assisted Living', purpose: 'Service expansion', status: 'Unconfirmed' },
    ],
  },
  'r-maya': {
    routeEff: 84, unplanned: 1, risk: 'On track; capacity for one additional stop',
    stops: [
      { id: 's1', time: '9:00a', accountName: 'Monument Rehabilitation', purpose: 'In-service', status: 'Confirmed' },
      { id: 's2', time: '11:00a', accountName: 'Shockoe Physicians', purpose: 'Referral review', status: 'Completed' },
      { id: 's3', time: '1:30p', accountName: 'Carytown Senior Living', purpose: 'Relationship visit', status: 'Confirmed' },
    ],
  },
  'r-alex': {
    routeEff: 88, unplanned: 0, risk: 'Fully scheduled; healthy route',
    stops: [
      { id: 's1', time: '8:45a', accountName: 'Glenmore Skilled Nursing', purpose: 'Discharge planning', status: 'Confirmed' },
      { id: 's2', time: '10:30a', accountName: 'Innsbrook Physicians', purpose: 'Referral follow-up', status: 'Completed' },
      { id: 's3', time: '1:00p', accountName: 'Lakeside Assisted Living', purpose: 'Check-in', status: 'Confirmed' },
    ],
  },
  'r-taylor': {
    routeEff: 66, unplanned: 2, risk: 'High drive burden; East coverage gap on north edge',
    stops: [
      { id: 's1', time: '8:30a', accountName: 'Hanover Medical Center', purpose: 'Discharge review', status: 'Confirmed' },
      { id: 's2', time: '11:15a', accountName: 'Mechanicsville Rehab', purpose: 'Intro visit', status: 'Unconfirmed' },
      { id: 's3', time: '2:00p', accountName: 'Sandston Senior Living', purpose: 'Service expansion', status: 'Unconfirmed' },
    ],
  },
  'r-sam': {
    routeEff: 81, unplanned: 1, risk: 'Balanced; minor slack midday',
    stops: [
      { id: 's1', time: '9:15a', accountName: 'Short Pump Physicians', purpose: 'Referral review', status: 'Confirmed' },
      { id: 's2', time: '11:30a', accountName: 'Westhampton Rehab', purpose: 'In-service', status: 'Completed' },
      { id: 's3', time: '1:45p', accountName: 'Deep Run Assisted Living', purpose: 'Check-in', status: 'Confirmed' },
    ],
  },
}

export function Today() {
  const s = useStore()
  const applied = s.optimizationApplied
  const [selRep, setSelRep] = useState<string | null>(null)
  const [rebalanceOpen, setRebalanceOpen] = useState(false)
  const reps = REPS.filter(r => r.territoryId)

  return (
    <div>
      <div className="filterbar">
        <div className="field"><label>View</label><select disabled><option>Rep roster · Today</option></select></div>
        <div className="field"><label>Date</label><select disabled><option>Jul 22, 2026</option></select></div>
        <div className="spacer" />
        <span className="badge neutral" style={{ alignSelf: 'center' }}>Manager view</span>
      </div>

      {s.rescheduleApplied && (
        <div className="callout" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', marginBottom: 14 }}>
          <span className="ico">◆</span>
          <div><b>Copilot cleared Jordan's afternoon.</b> 3 unconfirmed stops rescheduled, the urgent R-1042 follow-up preserved, and customer notes drafted. See the follow-up tasks below — reversible via Undo.</div>
        </div>
      )}

      <div className="home-grid">
        <div className="panel">
          <div className="phead"><h3>Rep roster</h3><span className="hint">Select a rep to see the route</span></div>
          <div className="pbody">
            {reps.map(r => {
              const t = TERRITORIES.find(x => x.id === r.territoryId)!
              const it = ITINERARIES[r.id]
              const cap = applied ? OPTIMIZED_CAPACITY[r.id] : r.capacityPct
              return (
                <div key={r.id} className={`rep-card ${selRep === r.id ? 'sel' : ''}`} onClick={() => setSelRep(r.id)}>
                  <span className="avatar" style={{ background: r.color }}>{r.initials}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <b>{r.name}</b><span className="muted">· {t.short}</span>
                      <StatusBadge status={statusFor(t, applied)} />
                    </div>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {it.stops.filter(x => x.status !== 'Completed').length} stops left · route eff. {it.routeEff}% · {it.unplanned} open slot{it.unplanned === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: cap > 100 ? 'var(--risk)' : 'inherit' }}>{cap}%</div>
                    <div className="muted" style={{ fontSize: 11 }}>capacity</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="panel">
          <div className="phead">
            <h3>{selRep ? `${REPS.find(r => r.id === selRep)!.name} — today` : 'Route & itinerary'}</h3>
            {selRep && <button className="btn sm primary" onClick={() => setRebalanceOpen(true)}>◆ Rebalance today</button>}
          </div>
          <div className="pbody">
            {!selRep && <div className="empty">Select a rep from the roster to view their route, timeline, and rebalance options.</div>}
            {selRep && <RepDetail repId={selRep} />}
          </div>
        </div>
      </div>

      {s.tasks.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="phead">
            <h3>Follow-up tasks</h3>
            <span className="badge sim" style={{ fontSize: 11 }}>◆ {s.tasks.length} from Copilot</span>
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
    </div>
  )
}

function RepDetail({ repId }: { repId: string }) {
  const it = ITINERARIES[repId]
  return (
    <>
      <div className="stat-row" style={{ marginBottom: 14 }}>
        <div className="mini-stat"><div className="v">{it.stops.length}</div><div className="l">Scheduled stops</div></div>
        <div className="mini-stat"><div className="v">{it.routeEff}%</div><div className="l">Route efficiency</div></div>
        <div className="mini-stat"><div className="v">{it.unplanned}</div><div className="l">Open capacity</div></div>
      </div>
      {it.risk && <div className="callout" style={{ background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}><span className="ico">⚠</span><div><b>Route risk:</b> {it.risk}</div></div>}
      <div className="section-title">Itinerary</div>
      <div className="timeline">
        {it.stops.map(st => (
          <div key={st.id} className={`tl-item ${st.status === 'Unconfirmed' ? 'unconf' : st.status === 'Completed' ? 'done' : ''}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ fontSize: 13 }}>{st.time}</b> {st.accountName}
              <span className={`badge ${st.status === 'Completed' ? 'healthy' : st.status === 'Unconfirmed' ? 'watch' : 'neutral'}`} style={{ fontSize: 11 }}>{st.status}</span>
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>{st.purpose}</div>
          </div>
        ))}
      </div>
    </>
  )
}

function Rebalance({ repId, onClose }: { repId: string; onClose: () => void }) {
  const it = ITINERARIES[repId]
  const from = REPS.find(r => r.id === repId)!
  const moveable = it.stops.find(st => st.status === 'Unconfirmed')!
  // pick a rep with capacity to receive
  const to = REPS.find(r => r.territoryId && r.id !== repId && r.capacityPct < 90) ?? REPS.find(r => r.id === 'r-maya')!
  const [applied, setApplied] = useState(false)

  return (
    <Drawer title="Rebalance today" onClose={onClose}
      subtitle={<span className="badge sim">◆ Simulated · before / after</span>}
      footer={applied
        ? <button className="btn primary" onClick={onClose}>Done</button>
        : <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { actions.rebalanceToday(from.name, to.name, moveable.accountName); setApplied(true) }}>Apply rebalance</button>
        </>}>
      <p style={{ fontSize: 13.5 }}>Move one <b>unconfirmed</b> stop from an over-scheduled rep to one with open capacity. Confirmed and completed stops are never moved automatically.</p>
      <div className="two-col" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="panel" style={{ boxShadow: 'none' }}>
          <div className="phead"><h3 style={{ fontSize: 13 }}>Before</h3></div>
          <div className="pbody">
            <div style={{ fontWeight: 650 }}>{from.name}</div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Route eff. {it.routeEff}%</div>
            <div className="tl-item unconf" style={{ marginLeft: 12, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>
              <b>{moveable.time}</b> {moveable.accountName}<div className="muted" style={{ fontSize: 12 }}>{moveable.purpose}</div>
            </div>
          </div>
        </div>
        <div className="panel" style={{ boxShadow: 'none' }}>
          <div className="phead"><h3 style={{ fontSize: 13 }}>After</h3></div>
          <div className="pbody">
            <div style={{ fontWeight: 650 }}>{to.name}</div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Route eff. {applied ? it.routeEff + 9 : it.routeEff + 9}% (proj.)</div>
            <div className="tl-item" style={{ marginLeft: 12, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>
              <b>{moveable.time}</b> {moveable.accountName}
              <span className="badge blue" style={{ marginLeft: 6, fontSize: 11 }}>reassigned</span>
              <div className="muted" style={{ fontSize: 12 }}>{moveable.purpose}</div>
            </div>
          </div>
        </div>
      </div>
      {applied && <div className="callout" style={{ marginTop: 14 }}><span className="ico">◆</span><div>Rebalance applied to demo state and logged to the audit trail. Reversible via Undo.</div></div>}
    </Drawer>
  )
}
