// §6 Calendar drawer — a left-anchored companion panel that opens whenever the copilot does
// something calendar-shaped. Deliberately non-modal (no scrim): the copilot stays live on the
// right, so a presenter can ask for a reschedule and watch it land on a real calendar.
//
// Week view is the default (it's where a reschedule reads best — you see the move cross days).
// Day view drops to the route-level detail with drive legs.
import { useEffect, useMemo, useState } from 'react'
import { useStore, actions } from '../store'
import { REPS } from '../seed'
import {
  DEMO_TODAY, DAY_START, RENDER_END, calendarWithMoves, eventsOn, weekDays, weekLoad,
  addDays, daysBetween, fmtDay, fmtDayShort, fmtTime, fmtTimeLong, isWeekday,
  type CalEvent, type CalMove,
} from '../calendar'

const PX_PER_MIN = 0.62 // ~372px of rendered day — fits without scrolling on a laptop
const KIND_LABEL: Record<string, string> = {
  visit: 'Visit', referral: 'Referral', inservice: 'In-service',
  internal: 'Internal', admin: 'Admin', personal: 'Personal',
}

export function CalendarDrawer() {
  const s = useStore()
  const [view, setView] = useState<'week' | 'day'>('week')
  const [anchor, setAnchor] = useState(DEMO_TODAY) // the week/day currently shown
  const [dayIso, setDayIso] = useState(DEMO_TODAY)

  const repId = s.calendarRepId ?? 'r-jordan'
  const rep = REPS.find(r => r.id === repId)
  const pending = s.calendarPending
  const moves = s.calendarMoves

  // When a proposal arrives, jump to the week that actually contains the change.
  useEffect(() => {
    if (pending.length) {
      setAnchor(pending[0].toDate)
      setView('week')
    }
  }, [pending])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') actions.closeCalendar() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // Applied moves render in place; pending ones render as a ghost at the old slot plus a
  // highlighted preview at the new one, so the before→after is legible at a glance.
  const events = useMemo(() => calendarWithMoves(repId, moves), [repId, moves])
  const pendingById = useMemo(() => new Map(pending.map(m => [m.eventId, m])), [pending])

  if (!s.calendarOpen) return null

  const days = weekDays(anchor)
  const load = weekLoad(repId, anchor, moves)

  return (
    <aside className="drawer left calendar-drawer" role="complementary" aria-label="Rep calendar">
      <div className="dhead">
        <div>
          <h2>🗓️ {rep?.name.split(' ')[0] ?? 'Rep'}’s calendar</h2>
          <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge sim">◆ Synthetic calendar</span>
            {pending.length > 0 && <span className="badge watch">{pending.length} proposed {pending.length === 1 ? 'move' : 'moves'}</span>}
            {!pending.length && moves.length > 0 && <span className="badge healthy">✓ {moves.length} applied</span>}
          </div>
        </div>
        <button className="iconbtn" onClick={() => actions.closeCalendar()} aria-label="Close calendar">×</button>
      </div>

      <div className="cal-toolbar">
        <div className="cal-seg">
          <button className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>Week</button>
          <button className={view === 'day' ? 'on' : ''} onClick={() => { setView('day'); setDayIso(anchor) }}>Day</button>
        </div>
        <div className="cal-nav">
          <button className="iconbtn sm" onClick={() => view === 'week' ? setAnchor(addDays(anchor, -7)) : setDayIso(prevWeekday(dayIso))} aria-label="Previous">‹</button>
          <span className="cal-range">
            {view === 'week'
              ? `${fmtDayShort(days[0])} – ${fmtDayShort(days[4])}`
              : fmtDay(dayIso)}
          </span>
          <button className="iconbtn sm" onClick={() => view === 'week' ? setAnchor(addDays(anchor, 7)) : setDayIso(nextWeekday(dayIso))} aria-label="Next">›</button>
        </div>
        <button className="btn sm" onClick={() => { setAnchor(DEMO_TODAY); setDayIso(DEMO_TODAY) }}>Today</button>
        {/* switching reps drops a pending proposal — it belongs to the rep it was built for */}
        <select className="cal-rep" value={repId} onChange={e => {
          if (e.target.value !== repId && pending.length) actions.clearCalendarProposal()
          actions.openCalendar(e.target.value)
        }}>
          {REPS.filter(r => r.territoryId).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {pending.length > 0 && <ProposedBanner moves={pending} />}

      <div className="dbody cal-body">
        {view === 'week'
          ? <WeekGrid days={days} load={load} events={events} pendingById={pendingById} pending={pending}
              onPickDay={iso => { setDayIso(iso); setView('day') }} />
          : <DayView iso={dayIso} events={events} pendingById={pendingById} pending={pending} />}
      </div>

      <div className="cal-legend">
        <span><i className="sw visit" /> Visit</span>
        <span><i className="sw referral" /> Referral</span>
        <span><i className="sw inservice" /> In-service</span>
        <span><i className="sw internal" /> Internal</span>
        <span><i className="sw personal" /> Protected</span>
        <span><i className="sw moved" /> Proposed move</span>
      </div>
    </aside>
  )
}

function prevWeekday(iso: string) { let d = addDays(iso, -1); while (!isWeekday(d)) d = addDays(d, -1); return d }
function nextWeekday(iso: string) { let d = addDays(iso, 1); while (!isWeekday(d)) d = addDays(d, 1); return d }

// ---------- proposed-change banner ----------
function ProposedBanner({ moves }: { moves: CalMove[] }) {
  return (
    <div className="cal-proposed">
      <div className="cal-proposed-head">
        <b>Proposed changes</b>
        <span className="muted">preview — nothing is written until you approve in the copilot</span>
      </div>
      {moves.map(m => (
        <div key={m.eventId} className="cal-move-row">
          <span className="cal-move-acct">{m.accountName}</span>
          <span className="cal-move-from">{fmtDayShort(m.fromDate)} {fmtTime(m.fromStart)}</span>
          <span className="cal-move-arrow">→</span>
          <span className="cal-move-to">{fmtDayShort(m.toDate)} {fmtTime(m.toStart)}</span>
        </div>
      ))}
    </div>
  )
}

// ---------- week grid ----------
function WeekGrid({ days, load, events, pendingById, pending, onPickDay }: {
  days: string[]
  load: { iso: string; stops: number; driveMin: number; unconfirmed: number }[]
  events: CalEvent[]
  pendingById: Map<string, CalMove>
  pending: CalMove[]
  onPickDay: (iso: string) => void
}) {
  const hours: number[] = []
  for (let h = DAY_START; h <= RENDER_END; h += 60) hours.push(h)
  const height = (RENDER_END - DAY_START) * PX_PER_MIN

  return (
    <div className="cal-week">
      <div className="cal-daybar">
        <div className="cal-gutter-head" />
        {days.map((iso, i) => (
          <button key={iso} className={`cal-dayhead ${iso === DEMO_TODAY ? 'today' : ''}`} onClick={() => onPickDay(iso)}>
            <span className="cal-dh-day">{fmtDay(iso).split(' ')[0]}</span>
            <span className="cal-dh-date">{fmtDayShort(iso)}</span>
            <span className="cal-dh-load">{load[i].stops} stops · {Math.round(load[i].driveMin / 6) / 10}h drive</span>
          </button>
        ))}
      </div>

      <div className="cal-grid" style={{ height }}>
        <div className="cal-gutter">
          {hours.map(h => (
            <div key={h} className="cal-hour-label" style={{ top: (h - DAY_START) * PX_PER_MIN }}>{fmtTime(h)}</div>
          ))}
        </div>
        {days.map(iso => {
          const dayEvents = eventsOn(events, iso)
          // pending arrivals land on this day; pending departures leave a ghost behind
          const arriving = pending.filter(m => m.toDate === iso)
          const leaving = pending.filter(m => m.fromDate === iso)
          return (
            <div key={iso} className={`cal-col ${iso === DEMO_TODAY ? 'today' : ''}`}>
              {hours.map(h => <div key={h} className="cal-hline" style={{ top: (h - DAY_START) * PX_PER_MIN }} />)}
              {dayEvents.map(e => {
                const moving = pendingById.get(e.id)
                if (moving) return <EventBlock key={e.id} e={e} variant="ghost" label={`→ ${fmtDayShort(moving.toDate)}`} />
                return <EventBlock key={e.id} e={e} variant="normal" />
              })}
              {arriving.map(m => {
                const src = events.find(e => e.id === m.eventId)
                if (!src) return null
                return <EventBlock key={`in-${m.eventId}`} e={{ ...src, date: iso, start: m.toStart }} variant="incoming" />
              })}
              {leaving.length > 0 && <div className="cal-col-flag">{leaving.length} moving out</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EventBlock({ e, variant, label }: { e: CalEvent; variant: 'normal' | 'ghost' | 'incoming'; label?: string }) {
  const top = (e.start - DAY_START) * PX_PER_MIN
  const h = Math.max(16, e.dur * PX_PER_MIN)
  const cls = `cal-ev k-${e.kind} ${variant} ${e.status === 'Completed' ? 'done' : ''} ${e.status === 'Unconfirmed' ? 'unconf' : ''} ${e.risk ? 'risk' : ''}`
  const title = `${e.title}${e.purpose ? ` — ${e.purpose}` : ''}\n${fmtTimeLong(e.start)} · ${e.dur} min · ${e.status}${e.hours ? `\nFacility hours ${e.hours}` : ''}`
  return (
    <div className={cls} style={{ top, height: h }} title={title}>
      <span className="cal-ev-t">{fmtTime(e.start)}</span>
      <span className="cal-ev-n">{e.title}</span>
      {label && <span className="cal-ev-moved">{label}</span>}
    </div>
  )
}

// ---------- day view ----------
function DayView({ iso, events, pendingById, pending }: {
  iso: string; events: CalEvent[]; pendingById: Map<string, CalMove>; pending: CalMove[]
}) {
  const day = eventsOn(events, iso)
  const arriving = pending.filter(m => m.toDate === iso)
  const rel = daysBetween(DEMO_TODAY, iso)
  const stops = day.filter(e => e.kind === 'visit' || e.kind === 'referral' || e.kind === 'inservice')
  const drive = stops.reduce((s, e) => s + (e.driveMin ?? 0), 0)

  return (
    <div className="cal-day">
      <div className="cal-day-sum">
        <b>{fmtDay(iso)}</b>
        <span className="muted">
          {rel === 0 ? 'Today' : rel === 1 ? 'Tomorrow' : rel < 0 ? `${-rel} days ago` : `in ${rel} days`}
          {' · '}{stops.length} stops · {Math.round(drive / 6) / 10}h drive
        </span>
      </div>

      {day.length === 0 && arriving.length === 0 && <div className="muted" style={{ padding: '18px 2px' }}>Nothing scheduled.</div>}

      {day.map(e => {
        const moving = pendingById.get(e.id)
        return (
          <div key={e.id} className={`cal-row ${moving ? 'moving' : ''}`}>
            {e.driveMin ? <div className="cal-drive">↳ {e.driveMin} min drive</div> : null}
            <div className={`cal-rowcard k-${e.kind} ${e.status === 'Completed' ? 'done' : ''} ${e.risk ? 'risk' : ''}`}>
              <div className="cal-rc-time">{fmtTime(e.start)}<span>{e.dur}m</span></div>
              <div className="cal-rc-main">
                <b>{e.title}</b>
                <span className="muted">{e.purpose ?? KIND_LABEL[e.kind]}{e.hours ? ` · hours ${e.hours}` : ''}</span>
                {moving && <span className="cal-rc-move">→ moving to {fmtDay(moving.toDate)} at {fmtTimeLong(moving.toStart)}</span>}
              </div>
              <div className="cal-rc-tags">
                {e.protectedTime && <span className="badge sim">protected</span>}
                {e.status === 'Unconfirmed' && <span className="badge watch">unconfirmed</span>}
                {e.status === 'Completed' && <span className="badge healthy">done</span>}
                {e.tier === 1 && <span className="badge risk">Tier 1</span>}
              </div>
            </div>
          </div>
        )
      })}

      {arriving.map(m => {
        const src = events.find(e => e.id === m.eventId)
        return (
          <div key={`in-${m.eventId}`} className="cal-row">
            <div className="cal-rowcard incoming">
              <div className="cal-rc-time">{fmtTime(m.toStart)}<span>{src?.dur ?? 45}m</span></div>
              <div className="cal-rc-main">
                <b>{m.accountName}</b>
                <span className="muted">{m.reason}</span>
                <span className="cal-rc-move">← moved from {fmtDay(m.fromDate)} at {fmtTimeLong(m.fromStart)}</span>
              </div>
              <div className="cal-rc-tags"><span className="badge watch">proposed</span></div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
