import { useState } from 'react'
import { actions } from '../store'
import { ACCOUNTS, TERRITORIES, REPS } from '../seed'
import { Drawer } from '../ui'
import type { Referral } from '../types'

export function ReferralForm({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const acct = ACCOUNTS.find(a => a.id === accountId)!
  const terr = TERRITORIES.find(t => t.id === acct.territoryId)!
  const rep = REPS.find(r => r.id === terr.repId)!
  const [saved, setSaved] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<Referral, 'id'>>({
    accountId,
    sourceOrg: acct.name,
    serviceLine: 'Home Health',
    receivedDate: '2026-07-22',
    territoryId: terr.id,
    repId: rep.id,
    stage: 'Received',
    metFamily: 'Not Yet',
    notes: '',
    followUpDate: '2026-07-27',
    owner: rep.name,
  })
  const upd = (p: Partial<Omit<Referral, 'id'>>) => setForm(f => ({ ...f, ...p }))

  return (
    <Drawer title="Add referral" onClose={onClose}
      subtitle={<span className="badge sim">◆ Synthetic · use identifiers only, no PHI</span>}
      footer={saved
        ? <button className="btn primary" onClick={onClose}>Done</button>
        : <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { const id = actions.addReferral(form); setSaved(id) }}>Save referral</button>
        </>}>
      {saved ? (
        <div className="callout" style={{ background: '#dcfce7', borderColor: '#bbf7d0', color: '#166534' }}>
          <span className="ico">✓</span>
          <div>Referral <b>{saved}</b> logged. The market funnel, account activity, and territory metrics have been updated. Reversible via Undo.</div>
        </div>
      ) : (
        <>
          <div className="callout"><span className="ico">◆</span><div>Use fictional identifiers (e.g. “Referral R-1042”). Do not enter patient names, DOB, diagnosis, or payer.</div></div>
          <div className="form-grid">
            <div className="full">
              <label>Source organization</label>
              <input value={form.sourceOrg} onChange={e => upd({ sourceOrg: e.target.value })} />
            </div>
            <div>
              <label>Service line</label>
              <select value={form.serviceLine} onChange={e => upd({ serviceLine: e.target.value as Referral['serviceLine'] })}>
                <option>Home Health</option><option>Hospice</option>
              </select>
            </div>
            <div>
              <label>Received date</label>
              <input type="date" value={form.receivedDate} onChange={e => upd({ receivedDate: e.target.value })} />
            </div>
            <div>
              <label>Territory / Rep</label>
              <select value={form.territoryId} onChange={e => { const t = TERRITORIES.find(x => x.id === e.target.value)!; const r = REPS.find(x => x.id === t.repId)!; upd({ territoryId: t.id, repId: r.id, owner: r.name }) }}>
                {TERRITORIES.map(t => <option key={t.id} value={t.id}>{t.name} · {REPS.find(r => r.id === t.repId)?.name}</option>)}
              </select>
            </div>
            <div>
              <label>Stage</label>
              <select value={form.stage} onChange={e => upd({ stage: e.target.value as Referral['stage'] })}>
                <option>Received</option><option>Contact Attempted</option><option>Met Patient/Family</option><option>Evaluating</option><option>Accepted</option>
              </select>
            </div>
            <div>
              <label>Patient / family met</label>
              <select value={form.metFamily} onChange={e => upd({ metFamily: e.target.value as Referral['metFamily'] })}>
                <option>Not Yet</option><option>Yes</option><option>No</option>
              </select>
            </div>
            <div>
              <label>Follow-up date</label>
              <input type="date" value={form.followUpDate} onChange={e => upd({ followUpDate: e.target.value })} />
            </div>
            <div className="full">
              <label>Notes (no PHI)</label>
              <textarea value={form.notes} placeholder="e.g. Post-surgical rehab discharge; strong home-health fit." onChange={e => upd({ notes: e.target.value })} />
            </div>
          </div>
        </>
      )}
    </Drawer>
  )
}
