import { useState } from 'react'
import { useStore, actions } from '../store'
import { REPS, ACCOUNTS } from '../seed'
import { TerritoryMapPanel } from '../components/TerritoryMapPanel'
import { TerritoryBuilder } from '../components/TerritoryBuilder'
import { CompareReps } from '../components/CompareReps'
import { marketKpis, territoryRows, insights, territoryById, cohortFunnel } from '../selectors'
import type { MarketKpis } from '../selectors'
import { StatusBadge, AnimatedNumber } from '../ui'
import { RiskRecoveryCard, LoyaltyLossCard } from '../components/ReferralIntel'
import { ZipTerritoryBuilder } from '../components/ZipTerritoryBuilder'

const KPI_LABEL: Record<string, string> = {
  coverage: 'covered vs uncovered priority accounts',
  priorityCovered: 'covered vs uncovered priority accounts',
  conversion: 'territories by referral conversion',
  atRisk: 'at-risk & watch territories',
}

export function Home() {
  const s = useStore()
  const [compareOpen, setCompareOpen] = useState(false)
  const kpis = marketKpis(s)
  const rows = territoryRows(s)
  const ins = insights(s)
  const selTerr = s.selectedTerritoryId ? territoryById(s.selectedTerritoryId) : null

  return (
    <div>
      <FilterBar />

      {selTerr && (
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <button className="crumb" onClick={() => actions.clearSelection()}>Richmond</button>
          <span className="crumb-sep">›</span>
          <span className="crumb current">{selTerr.name}</span>
          <span className="muted" style={{ fontSize: 12, marginLeft: 4 }}>· map & table filtered to this territory</span>
        </nav>
      )}

      {!selTerr && (s.selectedKpi || s.selectedInsightId) && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="chip">
            {s.selectedKpi ? `Highlight: ${KPI_LABEL[s.selectedKpi] ?? s.selectedKpi}` : 'Insight highlighted'}
            <button onClick={() => actions.clearSelection()} aria-label="clear">×</button>
          </span>
          <span className="muted" style={{ fontSize: 12 }}>Map and table filtered — click ✕ to clear highlight</span>
        </div>
      )}

      <KpiCards k={kpis} applied={s.optimizationApplied} />

      <div className="home-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel">
            <TerritoryMapPanel />
          </div>

          <div className="panel">
            <div className="phead">
              <h3>Coverage scorecard</h3>
              <span className="hint">Click a territory to drill down</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <CoverageTable rows={rows} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel">
            <div className="phead">
              <h3>Management insights</h3>
              <span className="badge sim">◆ AI-assisted</span>
            </div>
            <div className="pbody">
              {ins.map(i => (
                <div key={i.id} className={`insight ${s.selectedInsightId === i.id ? 'sel' : ''}`}
                  onClick={() => actions.selectInsight(i.id, i.territoryId)}>
                  <div className="row1">
                    <span className={`sev ${i.severity}`} />
                    <h4>{i.headline}</h4>
                  </div>
                  <div className="ev">{i.evidence}</div>
                  <div className="act">
                    {i.action === 'Optimize territories'
                      ? <button className="btn sm primary" onClick={e => { e.stopPropagation(); actions.openBuilder() }}>{i.action} →</button>
                      : i.action === 'Open account'
                        ? <button className="btn sm" onClick={e => { e.stopPropagation(); actions.openAccount(i.accountIds[0]) }}>{i.action} →</button>
                        : <button className="btn sm" onClick={e => { e.stopPropagation(); actions.selectInsight(i.id, i.territoryId) }}>{i.action} →</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <ReferralFunnelCard />
          <RiskRecoveryCard />
          <LoyaltyLossCard />

          <div className="panel">
            <div className="phead"><h3>Leadership actions</h3></div>
            <div className="pbody" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="btn" onClick={() => setCompareOpen(true)}>⇄ Compare reps</button>
              <button className="btn" onClick={() => actions.exportSnapshot()}>⇩ Export leadership snapshot</button>
              <button className="btn ghost" onClick={() => actions.simulateSync()}>⟳ Simulate Salesforce sync</button>
              {s.audit.length > 0 && (
                <div>
                  <div className="section-title" style={{ marginTop: 8 }}>Audit trail</div>
                  <ul className="list-reset">
                    {s.audit.slice(0, 5).map(a => (
                      <li key={a.id} className="audit-item">
                        <div className="a-act">{a.action} <span className="badge sim" style={{ fontSize: 10 }}>◆</span></div>
                        <div className="a-meta">{a.ts} · {a.actor}{a.after ? ` · ${a.after}` : ''}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {s.builderOpen && <TerritoryBuilder />}
      {compareOpen && <CompareReps onClose={() => setCompareOpen(false)} />}
      {s.zipBuilderOpen && <ZipTerritoryBuilder onClose={() => actions.closeZipBuilder()} />}
    </div>
  )
}

function FilterBar() {
  const s = useStore()
  const f = s.filters
  return (
    <div className="filterbar">
      <div className="field">
        <label>Region</label>
        <select value={f.region} onChange={e => actions.setFilter({ region: e.target.value })}>
          <option>Richmond</option><option>Norfolk</option><option>Roanoke</option>
        </select>
      </div>
      <div className="field">
        <label>Business line</label>
        <select value={f.businessLine} onChange={e => actions.setFilter({ businessLine: e.target.value })}>
          <option>Home Health + Hospice</option><option>Home Health</option><option>Hospice</option>
        </select>
      </div>
      <div className="field">
        <label>Period</label>
        <select value={f.period} onChange={e => actions.setFilter({ period: e.target.value })}>
          <option>Current Month</option><option>Current Period</option><option>Current Week</option>
        </select>
      </div>
      <div className="field">
        <label>Rep</label>
        <select value={f.repId} onChange={e => actions.setFilter({ repId: e.target.value })}>
          <option value="all">All Reps</option>
          {REPS.filter(r => r.territoryId).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Territory status</label>
        <select value={f.status} onChange={e => actions.setFilter({ status: e.target.value })}>
          <option value="all">All</option><option>Healthy</option><option>Watch</option><option>At Risk</option>
        </select>
      </div>
      <div className="spacer" />
      {s.optimizationApplied && <span className="badge sim" style={{ alignSelf: 'center' }}>◆ Optimization applied</span>}
    </div>
  )
}

function KpiCards({ k, applied }: { k: MarketKpis; applied: boolean }) {
  const s = useStore()
  const sel = s.selectedKpi
  const card = (id: string, cls = '') => `kpi kpi-click ${cls} ${sel === id ? 'kpi-sel' : ''}`
  return (
    <div className="kpis">
      <div className={card('coverage')} onClick={() => actions.selectKpi('coverage')} title="Click to highlight covered vs uncovered priority accounts">
        {applied ? <span className="delta up">+14 pts</span> : <span className="delta up" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>vs 71% last mo</span>}
        <div className="label">Priority Coverage</div>
        <div className="value"><AnimatedNumber value={k.coveragePct} suffix="%" /></div>
        <div className="sub">Priority-account coverage, market-wide</div>
      </div>
      <div className={card('priorityCovered')} onClick={() => actions.selectKpi('priorityCovered')} title="Click to highlight covered vs uncovered priority accounts">
        <div className="label">Priority accounts covered</div>
        <div className="value"><AnimatedNumber value={k.priorityCovered} /><span style={{ fontSize: 18, color: 'var(--text-3)' }}> / {k.priorityTotal}</span></div>
        <div className="sub">{k.priorityTotal - k.priorityCovered} uncovered high-priority accounts</div>
      </div>
      <div className={card('conversion')} onClick={() => actions.selectKpi('conversion')} title="Click to color territories by referral conversion">
        <div className="label">Referral conversion</div>
        <div className="value"><AnimatedNumber value={k.referralConversion} suffix="%" /></div>
        <div className="sub">Accepted + admitted ÷ all referrals</div>
      </div>
      <div className={card('atRisk')} onClick={() => actions.selectKpi('atRisk')} title="Click to highlight at-risk & watch territories">
        {applied && <span className="delta up">−1</span>}
        <div className="label">At-Risk Territories</div>
        <div className="value"><AnimatedNumber value={k.atRiskCount} /></div>
        <div className="sub">Territories below the At-Risk threshold (&lt; 65)</div>
      </div>
    </div>
  )
}

function ReferralFunnelCard() {
  const s = useStore()
  const f = cohortFunnel(s.referrals)
  const max = Math.max(...f.map(x => x.count), 1)
  const received = f[0]?.count ?? 0
  const admitted = f[f.length - 1]?.count ?? 0
  const conv = received ? Math.round((admitted / received) * 100) : 0
  return (
    <div className="panel">
      <div className="phead">
        <div>
          <h3>Referrals by cohort</h3>
          <span className="muted" style={{ fontSize: 11.5 }}>Received Jul 1–22 · {conv}% reach admission</span>
        </div>
        <span className="badge sim" style={{ fontSize: 11 }}>◆ {admitted} of {received}</span>
      </div>
      <div className="pbody">
        <div className="funnel">
          {f.map(x => (
            <div className="fb" key={x.stage}>
              <span className="lab" style={{ width: 128 }}>{x.label}</span>
              <span className="track"><span className="fill" style={{ width: `${Math.max(7, (x.count / max) * 100)}%` }}>{x.count}</span></span>
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Cohort of referrals received this period, tracked to their furthest stage. Click the “Referral conversion” KPI to color territories by conversion.</p>
      </div>
    </div>
  )
}

type SortKey = 'name' | 'rep' | 'accts' | 'coverage' | 'visits' | 'referrals' | 'conv' | 'drive' | 'capacity' | 'score'
const SORT_VAL: Record<SortKey, (r: ReturnType<typeof territoryRows>[number]) => number | string> = {
  name: r => r.territory.name, rep: r => r.repName, accts: r => r.metrics.accountCount,
  coverage: r => r.metrics.priorityCoveragePct, visits: r => r.metrics.visitsCompleted / r.metrics.visitsTarget,
  referrals: r => r.metrics.referrals, conv: r => r.metrics.visitsCompleted / r.metrics.visitsTarget,
  drive: r => r.metrics.driveHrs, capacity: r => r.metrics.capacityPct, score: r => r.score,
}

function CoverageTable({ rows }: { rows: ReturnType<typeof territoryRows> }) {
  const s = useStore()
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'score', dir: 1 })
  const clickSort = (key: SortKey) => setSort(p => p.key === key ? { key, dir: (p.dir * -1) as 1 | -1 } : { key, dir: -1 })

  let view = rows.filter(r => !q || r.territory.name.toLowerCase().includes(q.toLowerCase()) || r.repName.toLowerCase().includes(q.toLowerCase()))
  view = [...view].sort((a, b) => {
    const av = SORT_VAL[sort.key](a), bv = SORT_VAL[sort.key](b)
    return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir
  })
  const arrow = (key: SortKey) => sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''
  const H = ({ k, label, num }: { k: SortKey; label: string; num?: boolean }) => (
    <th className={`${num ? 'num ' : ''}th-sort`} onClick={() => clickSort(k)}>{label}{arrow(k)}</th>
  )
  return (
    <div>
      <div style={{ padding: '0 4px 10px' }}>
        <input className="tbl-search" placeholder="Search territory or rep…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <table className="data">
        <thead>
          <tr>
            <th className="th-sort" style={{ width: 22 }} aria-label="expand" />
            <H k="name" label="Territory" /><H k="rep" label="Rep" /><H k="accts" label="Accts" num /><H k="coverage" label="Priority cov." num />
            <H k="visits" label="Visits / target" num /><H k="referrals" label="Referrals" num /><H k="conv" label="Conv." num />
            <H k="drive" label="Drive hrs" num /><H k="capacity" label="Capacity" num /><H k="score" label="Score" num /><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {view.length === 0 && <tr><td colSpan={12} className="empty">No territories match.</td></tr>}
          {view.map(r => {
            const isOpen = expanded === r.territory.id
            return (
              <ScoreRowGroup key={r.territory.id} r={r} isOpen={isOpen} selected={s.selectedTerritoryId === r.territory.id}
                onToggle={() => setExpanded(isOpen ? null : r.territory.id)}
                onSelect={() => actions.selectTerritory(r.territory.id)} />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ScoreRowGroup({ r, isOpen, selected, onToggle, onSelect }: {
  r: ReturnType<typeof territoryRows>[number]; isOpen: boolean; selected: boolean; onToggle: () => void; onSelect: () => void
}) {
  const tid = r.territory.id
  const accts = ACCOUNTS.filter(a => a.territoryId === tid)
  const uncoveredPriority = accts.filter(a => a.isPriority && !a.covered)
  const growth = accts.filter(a => a.whitespace && a.whitespace.length > 0).sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 3)
  const intervention = r.status === 'At Risk'
    ? `Move ${Math.min(2, uncoveredPriority.length || 2)} accounts and one follow-up to adjacent reps, then re-run the optimizer.`
    : r.status === 'Watch'
      ? 'Rebalance one account to a rep with headroom before it slips to At Risk.'
      : 'On track — apply spare capacity to nearby growth opportunities.'
  const openAcct = (id: string) => (e: React.MouseEvent) => { e.stopPropagation(); actions.openAccount(id) }
  return (
    <>
      <tr className={selected ? 'sel' : ''} onClick={onSelect}>
        <td className="num" style={{ paddingRight: 0 }}>
          <button className={'row-exp' + (isOpen ? ' open' : '')} onClick={e => { e.stopPropagation(); onToggle() }} aria-label="expand">›</button>
        </td>
        <td><span className="terr-dot" style={{ background: r.territory.color }} />{r.territory.name}</td>
        <td>{r.repName}</td>
        <td className="num">{r.metrics.accountCount}</td>
        <td className="num">{r.metrics.priorityCoveragePct}%</td>
        <td className="num">{r.metrics.visitsCompleted}/{r.metrics.visitsTarget}</td>
        <td className="num">{r.metrics.referrals}</td>
        <td className="num">{Math.round((r.metrics.visitsCompleted / r.metrics.visitsTarget) * 100)}%</td>
        <td className="num">{r.metrics.driveHrs}</td>
        <td className="num" style={{ color: r.metrics.capacityPct > 100 ? 'var(--risk)' : 'inherit', fontWeight: r.metrics.capacityPct > 100 ? 700 : 400 }}>{r.metrics.capacityPct}%</td>
        <td className="num" style={{ fontWeight: 700 }}>{r.score}</td>
        <td><StatusBadge status={r.status} /></td>
      </tr>
      {isOpen && (
        <tr className="row-detail">
          <td colSpan={12}>
            <div className="rd-grid">
              <div className="rd-col">
                <div className="rd-h">Uncovered priority ({uncoveredPriority.length})</div>
                {uncoveredPriority.length === 0 ? <div className="rd-empty">All priority accounts covered.</div>
                  : uncoveredPriority.slice(0, 5).map(a => (
                    <button key={a.id} className="rd-chip risk" onClick={openAcct(a.id)}>{a.name} →</button>
                  ))}
              </div>
              <div className="rd-col">
                <div className="rd-h">Top growth opportunities</div>
                {growth.length === 0 ? <div className="rd-empty">No open whitespace.</div>
                  : growth.map(a => (
                    <button key={a.id} className="rd-chip" onClick={openAcct(a.id)}>{a.name} · {a.whitespace[0]} →</button>
                  ))}
              </div>
              <div className="rd-col">
                <div className="rd-h">Rep workload</div>
                <div className="rd-kv"><span>Capacity</span><b style={{ color: r.metrics.capacityPct > 100 ? 'var(--risk)' : 'inherit' }}>{r.metrics.capacityPct}%</b></div>
                <div className="rd-kv"><span>Drive burden</span><b>{r.metrics.driveHrs} hrs/wk</b></div>
                <div className="rd-kv"><span>Active referrals</span><b>{r.metrics.referrals}</b></div>
              </div>
              <div className="rd-col rd-action">
                <div className="rd-h">Recommended intervention</div>
                <p>{intervention}</p>
                <button className="btn sm primary" onClick={e => { e.stopPropagation(); actions.setTab('plan') }}>Open Plan →</button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
