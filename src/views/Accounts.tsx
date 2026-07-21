import { useState } from 'react'
import { useStore, actions } from '../store'
import { ACCOUNTS, CONTACTS, ACTIVITIES, DEALS, TERRITORIES } from '../seed'
import { effectiveTerritoryId, effectiveRepId, accountCovered, territoryById, repById, funnel, FUNNEL_ORDER } from '../selectors'
import type { Account, Priority, ReferralStage } from '../types'
import { Drawer } from '../ui'
import { ReferralForm } from '../components/ReferralForm'
import { DispositionForm } from '../components/DispositionForm'

const PRIORITY_CLASS: Record<Priority, string> = { High: 'risk', Medium: 'watch', Low: 'neutral' }

export function Accounts() {
  const s = useStore()
  if (s.openAccountId) return <AccountDetail id={s.openAccountId} />
  return <AccountList />
}

function AccountList() {
  const s = useStore()
  const [q, setQ] = useState('')
  const [terr, setTerr] = useState('all')
  const [prio, setPrio] = useState('all')
  const applied = s.optimizationApplied
  const list = ACCOUNTS.filter(a => {
    if (q && !a.name.toLowerCase().includes(q.toLowerCase())) return false
    if (terr !== 'all' && effectiveTerritoryId(a, applied) !== terr) return false
    if (prio !== 'all' && a.priority !== prio) return false
    return true
  })
  return (
    <div>
      <div className="filterbar">
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label>Search accounts</label>
          <input placeholder="Account name…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="field">
          <label>Territory</label>
          <select value={terr} onChange={e => setTerr(e.target.value)}>
            <option value="all">All territories</option>
            {TERRITORIES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Priority</label>
          <select value={prio} onChange={e => setPrio(e.target.value)}>
            <option value="all">All</option><option>High</option><option>Medium</option><option>Low</option>
          </select>
        </div>
      </div>
      <div className="panel">
        <div className="phead"><h3>Accounts</h3><span className="hint">{list.length} of {ACCOUNTS.length}</span></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead><tr><th>Account</th><th>Type</th><th>Territory</th><th>Rep</th><th>Priority</th><th className="num">Opp.</th><th className="num">Days since visit</th><th>Coverage</th></tr></thead>
            <tbody>
              {list.map(a => (
                <tr key={a.id} onClick={() => actions.openAccount(a.id)}>
                  <td style={{ fontWeight: 600 }}>{a.name}{a.strategic && <span className="badge blue" style={{ marginLeft: 6, fontSize: 10 }}>Strategic</span>}</td>
                  <td className="muted">{a.facilityType}</td>
                  <td><span className="terr-dot" style={{ background: territoryById(effectiveTerritoryId(a, applied))?.color }} />{territoryById(effectiveTerritoryId(a, applied))?.short}</td>
                  <td>{repById(effectiveRepId(a, applied))?.name}</td>
                  <td><span className={`badge ${PRIORITY_CLASS[a.priority]}`}>{a.priority}</span></td>
                  <td className="num">{a.opportunityScore}</td>
                  <td className="num">{a.lastContactDays}d</td>
                  <td>{accountCovered(a, applied) ? <span className="badge healthy">Covered</span> : <span className="badge risk">Uncovered</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const TABS = ['Overview', 'Contacts', 'Activities', 'BrightSpring Relationship', 'Referrals', 'Open Deals', 'Services & White Space'] as const
type Tab = typeof TABS[number]

function AccountDetail({ id }: { id: string }) {
  const s = useStore()
  const [tab, setTab] = useState<Tab>('Overview')
  const a = ACCOUNTS.find(x => x.id === id)!
  const applied = s.optimizationApplied
  const tid = effectiveTerritoryId(a, applied)
  const t = territoryById(tid)!
  const rep = repById(effectiveRepId(a, applied))!

  return (
    <div>
      <button className="btn ghost sm" onClick={() => actions.openAccount(null)}>← All accounts</button>
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="pbody">
          <div className="acct-head">
            <div className="ico">🏥</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 20 }}>{a.name}</h1>
                <span className={`badge ${PRIORITY_CLASS[a.priority]}`}>{a.priority} priority</span>
                {a.strategic && <span className="badge blue">Strategic relationship</span>}
                {accountCovered(a, applied) ? <span className="badge healthy">Covered</span> : <span className="badge risk">Uncovered</span>}
              </div>
              <div className="muted" style={{ marginTop: 4 }}>
                {a.facilityType} · {a.beds} beds · {t.name} · Owner: {rep.name}
                {applied && a.strategic && <span className="badge sim" style={{ marginLeft: 8 }}>◆ Reassigned to {rep.name}</span>}
              </div>
            </div>
            <button className="btn primary" onClick={() => actions.setTab('accounts')} style={{ visibility: 'hidden' }}>x</button>
          </div>
          <div className="tabs">
            {TABS.map(tb => <button key={tb} className={tab === tb ? 'active' : ''} onClick={() => setTab(tb)}>{tb}</button>)}
          </div>
        </div>
        <div className="pbody" style={{ paddingTop: 4 }}>
          {tab === 'Overview' && <Overview a={a} tName={t.name} repName={rep.name} />}
          {tab === 'Contacts' && <Contacts id={id} />}
          {tab === 'Activities' && <Activities id={id} />}
          {tab === 'BrightSpring Relationship' && <Relationship a={a} />}
          {tab === 'Referrals' && <Referrals id={id} />}
          {tab === 'Open Deals' && <OpenDeals id={id} />}
          {tab === 'Services & White Space' && <Services a={a} />}
        </div>
      </div>
    </div>
  )
}

function Overview({ a, tName, repName }: { a: Account; tName: string; repName: string }) {
  return (
    <div className="two-col">
      <div>
        <div className="section-title">Snapshot</div>
        <dl className="kv">
          <dt>Priority</dt><dd>{a.priority}</dd>
          <dt>Owner</dt><dd>{repName}</dd>
          <dt>Territory</dt><dd>{tName}</dd>
          <dt>Last touch</dt><dd>{a.lastContactDays} days ago</dd>
          <dt>Opportunity score</dt><dd>{a.opportunityScore} ({a.oppTier})</dd>
          <dt>Facility</dt><dd>{a.facilityType} · {a.beds} beds</dd>
        </dl>
      </div>
      <div>
        <div className="section-title">Next action</div>
        <div className="callout" style={{ background: '#ecfeff', borderColor: '#a5f3fc', color: '#155e75' }}>
          <span className="ico">→</span>
          <div>Advance referral <b>R-1042</b> to Evaluating and confirm home-health preferred-provider terms. Follow-up due Jul 23.</div>
        </div>
        <div className="section-title">Territory context</div>
        <p className="muted" style={{ fontSize: 13 }}>Anchor account for {tName} coverage. Strong discharge volume; a strategic relationship retained across the recent territory rebalance.</p>
      </div>
    </div>
  )
}

function Contacts({ id }: { id: string }) {
  const list = CONTACTS.filter(c => c.accountId === id)
  const relClass: Record<string, string> = { Champion: 'healthy', Strong: 'blue', Neutral: 'neutral', 'At Risk': 'risk' }
  if (!list.length) return <div className="empty">No contacts recorded for this account in the demo dataset.</div>
  return (
    <table className="data">
      <thead><tr><th>Name</th><th>Role</th><th className="num">Tenure</th><th>Relationship</th></tr></thead>
      <tbody>
        {list.map(c => (
          <tr key={c.id} style={{ cursor: 'default' }}>
            <td style={{ fontWeight: 600 }}>{c.name}</td><td>{c.role}</td><td className="num">{c.tenureYears} yrs</td>
            <td><span className={`badge ${relClass[c.relationship]}`}>{c.relationship}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Activities({ id }: { id: string }) {
  const list = ACTIVITIES.filter(a => a.accountId === id)
  if (!list.length) return <div className="empty">No activity in the selected period.</div>
  return (
    <div className="timeline">
      {list.map(v => (
        <div key={v.id} className="tl-item done">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b style={{ fontSize: 13 }}>{v.date}</b>
            <span className="badge neutral" style={{ fontSize: 11 }}>{v.channel}</span>
          </div>
          <div style={{ fontSize: 13 }}>{v.outcome}</div>
          <div className="muted" style={{ fontSize: 12 }}>{v.owner}</div>
        </div>
      ))}
    </div>
  )
}

function Relationship({ a }: { a: Account }) {
  return (
    <div className="two-col">
      <div>
        <div className="section-title">Current relationships</div>
        <ul style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
          <li><b>Home Health</b> — active preferred provider · champion: Patricia Hale</li>
          <li><b>Hospice</b> — education partnership in progress</li>
          <li><b>Personal Care</b> — whitespace, not yet engaged</li>
        </ul>
      </div>
      <div>
        <div className="section-title">Champions &amp; risks</div>
        <div className="callout" style={{ background: '#dcfce7', borderColor: '#bbf7d0', color: '#166534' }}><span className="ico">★</span><div><b>Champion:</b> Patricia Hale (Administrator) — 6-yr tenure, drives referral volume.</div></div>
        <div className="callout" style={{ background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}><span className="ico">⚠</span><div><b>Risk:</b> Discharge planner is newer (2 yrs) and fields competing home-health outreach.</div></div>
      </div>
    </div>
  )
}

function OpenDeals({ id }: { id: string }) {
  const list = DEALS.filter(d => d.accountId === id)
  if (!list.length) return <div className="empty">No open deals for this account.</div>
  return (
    <table className="data">
      <thead><tr><th>Deal</th><th>Stage</th><th>Value</th><th>Service line</th><th>Next step</th></tr></thead>
      <tbody>
        {list.map(d => (
          <tr key={d.id} style={{ cursor: 'default' }}>
            <td style={{ fontWeight: 600 }}>{d.name}</td>
            <td><span className="badge blue">{d.stage}</span></td>
            <td>{d.valueBand}</td><td>{d.serviceLine}</td><td className="muted">{d.nextStep}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Services({ a }: { a: Account }) {
  return (
    <div className="two-col">
      <div>
        <div className="section-title">Current services</div>
        {a.services.map(s => <span key={s} className="badge healthy" style={{ marginRight: 6, marginBottom: 6 }}>{s}</span>)}
      </div>
      <div>
        <div className="section-title">Eligible / white space</div>
        {a.whitespace.length ? a.whitespace.map(s => <span key={s} className="badge neutral" style={{ marginRight: 6, marginBottom: 6 }}>{s}</span>) : <span className="muted">Fully penetrated across demo service lines.</span>}
        <div className="callout" style={{ marginTop: 12, background: '#ecfeff', borderColor: '#a5f3fc', color: '#155e75' }}>
          <span className="ico">◆</span><div><b>Cross-sell signal:</b> discharge mix suggests hospice referral potential is under-captured.</div>
        </div>
      </div>
    </div>
  )
}

// ---------- Referrals tab ----------
function Referrals({ id }: { id: string }) {
  const s = useStore()
  const [addOpen, setAddOpen] = useState(false)
  const [dispId, setDispId] = useState<string | null>(null)
  const acct = ACCOUNTS.find(a => a.id === id)!
  const refs = s.referrals.filter(r => r.accountId === id)
  const fun = funnel(s.referrals) // market funnel to feel connected

  const stageClass = (st: ReferralStage) =>
    st === 'Admitted' || st === 'Accepted' ? 'healthy'
      : st === 'Declined' || st === 'Ineligible' || st === 'Lost to Competitor' ? 'risk'
        : 'blue'

  const maxF = Math.max(...fun.map(f => f.count), 1)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="badge sim">◆ Synthetic referrals · no PHI</div>
        <button className="btn primary sm" onClick={() => setAddOpen(true)}>+ Add referral</button>
      </div>

      <div className="two-col">
        <div>
          <div className="section-title">Referrals for {acct.name}</div>
          {refs.length === 0 && <div className="empty">No referrals yet. Use “Add referral” to log one.</div>}
          {refs.map(r => (
            <div key={r.id} className="change-card" onClick={() => setDispId(r.id)}>
              <h4>{r.id} <span className={`badge ${stageClass(r.stage)}`}>{r.stage}</span></h4>
              <div className="meta">{r.serviceLine} · from {r.sourceOrg} · received {r.receivedDate}</div>
              <div className="meta">Met patient/family: {r.metFamily} · follow-up {r.followUpDate} · owner {r.owner}</div>
              {r.notes && <div className="why" style={{ marginTop: 4 }}>{r.notes}</div>}
              <button className="btn sm" style={{ marginTop: 8 }} onClick={e => { e.stopPropagation(); setDispId(r.id) }}>Update disposition →</button>
            </div>
          ))}
        </div>
        <div>
          <div className="section-title">Conversion funnel (market)</div>
          <div className="funnel">
            {fun.map(f => (
              <div className="fb" key={f.stage}>
                <span className="lab">{f.stage}</span>
                <span className="track"><span className="fill" style={{ width: `${Math.max(8, (f.count / maxF) * 100)}%` }}>{f.count}</span></span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Logging or advancing a referral updates this funnel, the account activity, and territory KPIs so the app feels connected.</p>
        </div>
      </div>

      {addOpen && <ReferralForm accountId={id} onClose={() => setAddOpen(false)} />}
      {dispId && <DispositionForm referralId={dispId} onClose={() => setDispId(null)} />}
    </div>
  )
}
