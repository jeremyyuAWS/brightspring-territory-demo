import { useState } from 'react'
import { useStore, actions } from '../store'
import { REPS } from '../seed'
import { TerritoryMapPanel } from '../components/TerritoryMapPanel'
import { TerritoryBuilder } from '../components/TerritoryBuilder'
import { CompareReps } from '../components/CompareReps'
import { marketKpis, territoryRows, insights, territoryById } from '../selectors'
import type { MarketKpis } from '../selectors'
import { StatusBadge } from '../ui'

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

      {s.selectedTerritoryId && (
        <div style={{ marginBottom: 12 }}>
          <span className="chip">{selTerr?.name} selected <button onClick={() => actions.clearSelection()} aria-label="clear">×</button></span>
        </div>
      )}

      <KpiCards k={kpis} applied={s.optimizationApplied} />

      <div className="home-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel">
            <div className="phead">
              <h3>Territory health — Richmond market</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary sm" onClick={() => actions.openBuilder()}>◆ Optimize territories</button>
              </div>
            </div>
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
              <h3>Manager insights</h3>
              <span className="badge sim">◆ AI · templated</span>
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
  return (
    <div className="kpis">
      <div className="kpi">
        {applied ? <span className="delta up">+14 pts</span> : <span className="delta up" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>vs 71% last mo</span>}
        <div className="label">Priority Coverage</div>
        <div className="value">{k.coveragePct}%</div>
        <div className="sub">Priority-account coverage, market-wide</div>
      </div>
      <div className="kpi">
        <div className="label">Priority accounts covered</div>
        <div className="value">{k.priorityCovered}<span style={{ fontSize: 18, color: 'var(--text-3)' }}> / {k.priorityTotal}</span></div>
        <div className="sub">{k.priorityTotal - k.priorityCovered} uncovered high-priority accounts</div>
      </div>
      <div className="kpi">
        <div className="label">Referral conversion</div>
        <div className="value">{k.referralConversion}%</div>
        <div className="sub">Accepted + admitted ÷ all referrals</div>
      </div>
      <div className="kpi">
        {applied && <span className="delta up">−1</span>}
        <div className="label">At-Risk Territories</div>
        <div className="value">{k.atRiskCount}</div>
        <div className="sub">Territories below the At-Risk threshold (&lt; 65)</div>
      </div>
    </div>
  )
}

function CoverageTable({ rows }: { rows: ReturnType<typeof territoryRows> }) {
  const s = useStore()
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Territory</th><th>Rep</th><th className="num">Accts</th><th className="num">Priority cov.</th>
          <th className="num">Visits / target</th><th className="num">Referrals</th><th className="num">Conv.</th>
          <th className="num">Drive hrs</th><th className="num">Capacity</th><th className="num">Score</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={11} className="empty">No territories match the current filter.</td></tr>}
        {rows.map(r => (
          <tr key={r.territory.id} className={s.selectedTerritoryId === r.territory.id ? 'sel' : ''}
            onClick={() => actions.selectTerritory(r.territory.id)}>
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
        ))}
      </tbody>
    </table>
  )
}
