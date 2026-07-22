import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { actions } from '../store'
import { ACCOUNTS, TERRITORIES, REPS } from '../seed'
import { repById, territoryById } from '../selectors'
import { zipCells, type ZipCell } from '../geo'
import { useEscClose } from '../ui'

const BASE_CELLS = zipCells()
// nearest ZIP for each account (deterministic)
function nearestZip(lng: number, lat: number): string {
  let best = BASE_CELLS[0].zip, bd = Infinity
  for (const c of BASE_CELLS) { const dx = c.center[0] - lng, dy = c.center[1] - lat; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = c.zip } }
  return best
}
const ACCT_ZIP: Record<string, string> = {}
for (const a of ACCOUNTS) ACCT_ZIP[a.id] = nearestZip(a.lng, a.lat)

export function ZipTerritoryBuilder({ onClose }: { onClose: () => void }) {
  useEscClose(onClose)
  const [assign, setAssign] = useState<Record<string, string>>(() => Object.fromEntries(BASE_CELLS.map(c => [c.zip, c.territoryId])))
  const [selTerr, setSelTerr] = useState('t-south')
  const [saved, setSaved] = useState(false)
  const original = useMemo(() => Object.fromEntries(BASE_CELLS.map(c => [c.zip, c.territoryId])), [])

  const toggleZip = (zip: string) => {
    setAssign(prev => {
      const next = { ...prev }
      next[zip] = prev[zip] === selTerr ? original[zip] : selTerr // remove -> revert to original owner; else add
      return next
    })
  }

  // impact per territory (working)
  const stats = (tid: string) => {
    const zips = BASE_CELLS.filter(c => assign[c.zip] === tid).map(c => c.zip)
    const accts = ACCOUNTS.filter(a => zips.includes(ACCT_ZIP[a.id]))
    const priority = accts.filter(a => a.isPriority).length
    return { zips: zips.length, accounts: accts.length, priority, workload: Math.round(accts.length * 1.4) }
  }
  const sel = stats(selTerr)
  const origSel = (() => { const zips = BASE_CELLS.filter(c => original[c.zip] === selTerr).map(c => c.zip); const accts = ACCOUNTS.filter(a => zips.includes(ACCT_ZIP[a.id])); return { zips: zips.length, accounts: accts.length } })()
  const rep = repById(territoryById(selTerr)!.repId)!
  const acctDelta = sel.accounts - origSel.accounts
  const cap = rep.capacityPct + acctDelta * 4 // rough capacity impact
  const overloaded = cap > 100 && acctDelta > 0
  // recommend the territory rep (other than the current one) with the most headroom
  const recRep = REPS.filter(r => r.territoryId && r.id !== rep.id).sort((a, b) => a.capacityPct - b.capacityPct)[0]
  const recCap = recRep ? recRep.capacityPct + acctDelta * 4 : 0

  // move the newly-added ZIPs to the recommended rep's territory and focus it (preview the balanced option)
  const assignToRec = () => {
    if (!recRep) return
    const recTerr = recRep.territoryId!
    setAssign(prev => {
      const next = { ...prev }
      for (const c of BASE_CELLS) if (next[c.zip] === selTerr && original[c.zip] !== selTerr) next[c.zip] = recTerr
      return next
    })
    setSelTerr(recTerr)
    setSaved(false)
  }

  const save = () => {
    actions.saveTerritoryEdit(territoryById(selTerr)!.name, `${origSel.zips} ZIPs · ${origSel.accounts} accts`, `${sel.zips} ZIPs · ${sel.accounts} accts · rep ${cap}%`)
    setSaved(true)
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="tb-modal" role="dialog" aria-modal="true">
        <div className="tb-head">
          <div><b>Territory Builder</b> <span className="badge sim" style={{ fontSize: 11 }}>◆ Simulated · no PHI</span></div>
          <button className="iconbtn" onClick={onClose}>×</button>
        </div>
        <div className="tb-body">
          <ZipMap assign={assign} selTerr={selTerr} onToggle={toggleZip} />
          <div className="tb-panel">
            <div className="tb-steps"><span className="on">1 · Select territory</span> → <span className="on">2 · Add / remove ZIPs</span> → <span>3 · Review & save</span></div>

            <label className="tb-field">Territory
              <select value={selTerr} onChange={e => { setSelTerr(e.target.value); setSaved(false) }}>
                {TERRITORIES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <div className="tb-meta">
              <div><span>Assigned rep</span><b>{rep.name}</b></div>
              <div><span>Business line</span><b>{rep.businessLine}</b></div>
            </div>

            <div className="tb-hint">Click a ZIP tile on the map to <b>add</b> it to {territoryById(selTerr)!.short}. Click one of its own tiles to <b>remove</b> it.</div>

            <div className="tb-impact">
              <div className="tb-stat"><div className="v">{sel.zips}</div><div className="l">ZIP codes {delta(sel.zips, origSel.zips)}</div></div>
              <div className="tb-stat"><div className="v">{sel.accounts}</div><div className="l">Accounts {delta(sel.accounts, origSel.accounts)}</div></div>
              <div className="tb-stat"><div className="v">{sel.priority}</div><div className="l">Priority accounts</div></div>
              <div className="tb-stat"><div className="v" style={{ color: cap > 100 ? 'var(--risk)' : 'inherit' }}>{cap}%</div><div className="l">Est. rep capacity {cap > 100 ? '⚠' : ''}</div></div>
            </div>
            <div className="tb-workload muted">Estimated workload ≈ {sel.workload} visits / week</div>

            {overloaded && (
              <div className="tb-warn">
                <span className="ico">⚠</span>
                <div>
                  <b>Adding {acctDelta} account{acctDelta > 1 ? 's' : ''} would overload {rep.name.split(' ')[0]}</b> — capacity rises to <b>{cap}%</b>, past the 100% ceiling.
                  {recRep && recCap <= 100 && (
                    <>
                      {' '}<b>{recRep.name.split(' ')[0]}</b> has the most headroom ({recRep.capacityPct}%) — assigning {sel.zips - origSel.zips > 1 ? 'these ZIPs' : 'this ZIP'} there keeps the market balanced.
                      <div><button className="tb-rec-btn" onClick={assignToRec}>Assign to {recRep.name.split(' ')[0]} instead →</button></div>
                    </>
                  )}
                </div>
              </div>
            )}

            {saved
              ? <div className="callout" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}><span className="ico">✓</span><div>Simulation saved to the audit trail. Reversible via Undo. No production CRM or territory records were changed.</div></div>
              : <div className="tb-actions">
                <button className="btn" onClick={onClose}>Cancel</button>
                <button className="btn" onClick={() => setAssign(Object.fromEntries(BASE_CELLS.map(c => [c.zip, c.territoryId])))}>Reset edits</button>
                <button className="btn primary" onClick={save}>Save simulation</button>
              </div>}
          </div>
        </div>
      </div>
    </>
  )
}
function delta(a: number, b: number) { const d = a - b; return d === 0 ? '' : `(${d > 0 ? '+' : ''}${d})` }

function ZipMap({ assign, selTerr, onToggle }: { assign: Record<string, string>; selTerr: string; onToggle: (zip: string) => void }) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: false })
    mapRef.current = map
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19 }).addTo(map)
    const all = BASE_CELLS.flatMap(c => c.ring.map(p => [p[1], p[0]] as [number, number]))
    map.fitBounds(L.latLngBounds(all), { padding: [12, 12] })
    const ro = new ResizeObserver(() => map.invalidateSize()); ro.observe(elRef.current)
    return () => { ro.disconnect(); map.remove(); mapRef.current = null }
  }, [])
  useEffect(() => {
    const map = mapRef.current; if (!map) return
    map.eachLayer(l => { if (!(l instanceof L.TileLayer)) map.removeLayer(l) })
    for (const c of BASE_CELLS) {
      const tid = assign[c.zip]
      const t = territoryById(tid)!
      const isSel = tid === selTerr
      const poly = L.polygon(c.ring.map(p => [p[1], p[0]] as [number, number]), {
        color: isSel ? '#0f172a' : '#fff', weight: isSel ? 2 : 1,
        fillColor: t.color, fillOpacity: isSel ? 0.55 : 0.22,
      }).addTo(map)
      poly.bindTooltip(`ZIP ${c.zip} · ${t.short}`, { direction: 'center', className: 'zip-tt' })
      poly.on('click', () => onToggle(c.zip))
      poly.on('mouseover', () => poly.setStyle({ weight: 2.5, fillOpacity: isSel ? 0.65 : 0.4 }))
      poly.on('mouseout', () => poly.setStyle({ weight: isSel ? 2 : 1, fillOpacity: isSel ? 0.55 : 0.22 }))
    }
  }, [assign, selTerr])
  return <div ref={elRef} className="tb-map" />
}
