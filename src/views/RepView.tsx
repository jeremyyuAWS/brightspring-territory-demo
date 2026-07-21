import { useState } from 'react'
import { useStore, actions } from '../store'
import { REPS } from '../seed'
import { repById } from '../selectors'
import { DAYS, type TimelineItem } from '../today'

export function RepView({ repId }: { repId: string }) {
  const s = useStore()
  const day = DAYS[repId]
  const rep = REPS.find(r => r.id === repId)!
  const [selectedStop, setSelectedStop] = useState<number | null>(1)
  const [lateOpen, setLateOpen] = useState(false)
  const nearbyAdded = s.tasks.some(t => day.nearby && t.id === `tk-near-${day.nearby.name}`)

  const gmaps = `https://www.google.com/maps/dir/${day.routeStops.map(st => `${st.lat},${st.lng}`).join('/')}`

  // map meeting timeline items → route-stop index
  let meetingIdx = -1

  return (
    <div className="rep-view">
      {/* my day summary */}
      <div className="myday">
        <div><span className="myday-l">Territory</span><b>{repById(rep.territoryId!)?.name.replace(' Richmond', '')} · {rep.name.split(' ')[0]}</b></div>
        <div><span className="myday-l">Stops</span><b>{day.stops - 1} left</b></div>
        <div><span className="myday-l">Drive</span><b>{day.totalDriveMin}m</b></div>
        <div><span className="myday-l">Home by</span><b>{day.projectedHome}</b></div>
        <div><span className="myday-l">Open capacity</span><b>{day.openCapacityMin}m</b></div>
        <div className="spacer" />
        <a className="btn primary sm" href={gmaps} target="_blank" rel="noreferrer">▷ Launch route</a>
        <button className="btn sm" onClick={() => actions.optimizeMyDay()}>◆ Optimize my day</button>
      </div>

      <div className="rep-split">
        {/* map */}
        <div className="panel rep-map-panel">
          <RepMapLazy repId={repId} selectedStop={selectedStop} onSelectStop={setSelectedStop} />
        </div>

        {/* right column */}
        <div className="rep-right">
          {/* next stop */}
          {day.nextStop && (
            <div className="panel nextstop">
              <div className="phead"><h3>Next: {day.nextStop.name}</h3><button className="btn sm" onClick={() => setLateOpen(true)}>Running late</button></div>
              <div className="pbody">
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>{day.nextStop.etaMin} min away · arrive {day.nextStop.arrive}</div>
                <dl className="kv" style={{ gridTemplateColumns: '120px 1fr' }}>
                  <dt>Meeting</dt><dd>{day.nextStop.meeting}</dd>
                  <dt>Ask about</dt><dd>{day.nextStop.ask}</dd>
                  <dt>Opportunity</dt><dd>{day.nextStop.opportunity}</dd>
                  <dt>Last contact</dt><dd>{day.nextStop.lastContact}</dd>
                </dl>
                {lateOpen && (
                  <div className="callout" style={{ marginTop: 8, background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}>
                    <span className="ico">⏱</span>
                    <div><b>Running late?</b> I can notify {day.nextStop.name}, shorten the previous visit, or reorder the route.
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button className="btn sm primary" onClick={() => { actions.optimizeMyDay(); setLateOpen(false) }}>Reorder & notify</button>
                        <button className="btn sm" onClick={() => setLateOpen(false)}>Dismiss</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* near my route */}
          {day.nearby && (
            <div className="panel nearby-panel">
              <div className="phead"><h3>Near my route</h3><span className="badge sim" style={{ fontSize: 11 }}>◆ AI</span></div>
              <div className="pbody">
                <div className="nearby-title">★ <b>{day.nearby.name}</b> is {day.nearby.offRouteMin} minutes off your route</div>
                <div className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>{day.nearby.tier} · {day.nearby.daysSince} days since contact · {day.nearby.note} · {day.openCapacityMin} min available</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn sm primary" disabled={nearbyAdded} onClick={() => actions.addNearbyStop(day.nearby!.name, day.nearby!.note)}>{nearbyAdded ? '✓ Added to today' : 'Add to today'}</button>
                  <button className="btn sm">Call instead</button>
                  <button className="btn sm">Dismiss</button>
                </div>
              </div>
            </div>
          )}

          {/* timeline */}
          <div className="panel">
            <div className="phead"><h3>Today’s route</h3></div>
            <div className="pbody rep-timeline">
              {day.timeline.map((item, i) => {
                if (item.kind === 'meeting') meetingIdx++
                const idx = item.kind === 'meeting' ? meetingIdx : -1
                return <RepTimelineRow key={i} item={item} stopNum={idx} selected={selectedStop === idx} onClick={() => idx >= 0 && setSelectedStop(idx)} />
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RepTimelineRow({ item, stopNum, selected, onClick }: { item: TimelineItem; stopNum: number; selected: boolean; onClick: () => void }) {
  if (item.kind === 'drive') return <div className="tl-drive">↓ {item.minutes} min → {item.to}</div>
  if (item.kind === 'buffer') return <div className="tl-buffer">{item.label === 'Lunch' ? '🍽' : '🅿'} {item.label} · {item.minutes} min</div>
  if (item.kind === 'personal') return <div className="tl-personal"><b>{item.time}</b> {item.label}</div>
  const statusCls = item.status === 'Completed' ? 'healthy' : item.status === 'Unconfirmed' ? 'watch' : 'neutral'
  return (
    <div className={`rep-stop ${selected ? 'sel' : ''}`} onClick={onClick}>
      <span className="rep-stop-num">{stopNum + 1}</span>
      <div style={{ flex: 1 }}>
        <div className="stop-title" style={{ fontSize: 13 }}>{item.account} <span className={`badge ${statusCls}`} style={{ fontSize: 10 }}>{item.status}</span></div>
        <div className="muted" style={{ fontSize: 12 }}>{item.time} · {item.purpose} · {item.dur} min</div>
      </div>
    </div>
  )
}

// lazy the map so leaflet loads only when Rep View is opened
import { lazy, Suspense } from 'react'
const RepRouteMap = lazy(() => import('../components/RepRouteMap').then(m => ({ default: m.RepRouteMap })))
function RepMapLazy(props: { repId: string; selectedStop: number | null; onSelectStop: (i: number) => void }) {
  return <Suspense fallback={<div style={{ height: 420, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>Loading map…</div>}><RepRouteMap {...props} /></Suspense>
}
