import { useState } from 'react'
import { useStore, actions } from '../store'
import { Drawer } from '../ui'
import type { ReferralStage, Referral } from '../types'

const STAGES: ReferralStage[] = ['Received', 'Contact Attempted', 'Met Patient/Family', 'Evaluating', 'Accepted', 'Admitted']
const EXITS: ReferralStage[] = ['Declined', 'Ineligible', 'Lost to Competitor']

export function DispositionForm({ referralId, onClose }: { referralId: string; onClose: () => void }) {
  const s = useStore()
  const ref = s.referrals.find(r => r.id === referralId)!
  const [stage, setStage] = useState<ReferralStage>(ref.stage)
  const [metFamily, setMetFamily] = useState<Referral['metFamily']>(ref.metFamily)
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)

  return (
    <Drawer title={`Update disposition — ${ref.id}`} onClose={onClose}
      subtitle={<span className="badge sim">◆ Simulated · audit-logged</span>}
      footer={saved
        ? <button className="btn primary" onClick={onClose}>Done</button>
        : <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { actions.updateReferralStage(ref.id, stage, metFamily, note); setSaved(true) }}>Save disposition</button>
        </>}>
      {saved ? (
        <div className="callout" style={{ background: '#dcfce7', borderColor: '#bbf7d0', color: '#166534' }}>
          <span className="ico">✓</span>
          <div>{ref.id} advanced to <b>{stage}</b>. Funnel, account activity, and territory KPIs refreshed. An audit entry with timestamp was recorded. Reversible via Undo.</div>
        </div>
      ) : (
        <>
          <dl className="kv" style={{ marginBottom: 14 }}>
            <dt>Source</dt><dd>{ref.sourceOrg}</dd>
            <dt>Service line</dt><dd>{ref.serviceLine}</dd>
            <dt>Current stage</dt><dd>{ref.stage}</dd>
            <dt>Owner</dt><dd>{ref.owner}</dd>
          </dl>
          <div className="form-grid">
            <div>
              <label>Advance to stage</label>
              <select value={stage} onChange={e => setStage(e.target.value as ReferralStage)}>
                <optgroup label="Progression">{STAGES.map(st => <option key={st}>{st}</option>)}</optgroup>
                <optgroup label="Alternate exit">{EXITS.map(st => <option key={st}>{st}</option>)}</optgroup>
              </select>
            </div>
            <div>
              <label>Patient / family met</label>
              <select value={metFamily} onChange={e => setMetFamily(e.target.value as Referral['metFamily'])}>
                <option>Not Yet</option><option>Yes</option><option>No</option>
              </select>
            </div>
            <div className="full">
              <label>Disposition note (no PHI)</label>
              <textarea value={note} placeholder="e.g. Family confirmed home-health preference; scheduling evaluation." onChange={e => setNote(e.target.value)} />
            </div>
          </div>
          <div className="section-title">Stage flow</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {STAGES.map((st, i) => (
              <span key={st} className={`badge ${st === stage ? 'blue' : 'neutral'}`}>
                {i + 1}. {st}
              </span>
            ))}
          </div>
        </>
      )}
    </Drawer>
  )
}
