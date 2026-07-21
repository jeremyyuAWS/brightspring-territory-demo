// Deterministic, templated copilot engine — NO live LLM in the demo path.
// Matches user input to one of the agentic flows and returns a scripted reply,
// an optional structured proposal, and any working-memory chips detected.
import type { MemoryChip, AssistantProposal, Activity, FollowUpTask } from '../types'

const DEMO_TODAY = '2026-07-22'
let seq = 0
const uid = (p: string) => `${p}-${++seq}`

// entities the copilot "knows" about (for extraction + memory chips)
const KNOWN_ACCOUNTS = ['Elmington Rehabilitation', 'Woodhaven', 'Woodlake Skilled Nursing', 'Brandermill Physicians', 'Rockwood Assisted Living', 'Bon Air Senior Living']
const KNOWN_CONTACTS: Record<string, string> = { angela: 'Angela — Administrator', patricia: 'Patricia Hale — Administrator', marcus: 'Marcus Boyd — DON' }
const TERRITORY_WORDS = ['South Richmond', 'North Richmond', 'Central Richmond', 'East Richmond', 'West Richmond']

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

export function detectChips(text: string): MemoryChip[] {
  const chips: MemoryChip[] = []
  const t = text.toLowerCase()
  for (const a of KNOWN_ACCOUNTS) {
    const short = a.split(' ')[0]
    if (t.includes(short.toLowerCase())) chips.push({ id: `acct-${short}`, label: short, kind: 'account' })
  }
  for (const terr of TERRITORY_WORDS) if (t.includes(terr.toLowerCase())) chips.push({ id: `terr-${terr}`, label: terr, kind: 'territory' })
  for (const key of Object.keys(KNOWN_CONTACTS)) if (t.includes(key)) chips.push({ id: `c-${key}`, label: KNOWN_CONTACTS[key], kind: 'contact' })
  if (/next week/.test(t)) chips.push({ id: 'time-nextweek', label: 'Next week', kind: 'time' })
  if (/(home by|back by)\s*(\d{1,2}[:.]?\d{0,2}\s*(am|pm)?)/i.test(text)) {
    const m = text.match(/(home by|back by)\s*([\d:.\sapm]+)/i)
    if (m) chips.push({ id: 'con-homeby', label: `Home by ${m[2].trim()}`, kind: 'constraint' })
  }
  if (/friday/.test(t)) chips.push({ id: 'con-fridays', label: 'Lighter Fridays', kind: 'constraint' })
  if (/tier 1|tier-1/.test(t)) chips.push({ id: 'con-tier1', label: 'Cover all Tier 1', kind: 'constraint' })
  return chips
}

export interface EngineResult {
  reply: string
  proposal?: AssistantProposal
  // when the CRM flow applies, these are the concrete writes
  crm?: { activity: Activity; task: FollowUpTask }
  reschedule?: { title: string; accountName: string; dueDate: string }[]
  monthlyPlan?: boolean
  navigate?: 'plan' | 'today' | 'accounts' | 'home'
}

// ---------- CRM capture ----------
function crmFlow(text: string): EngineResult {
  const t = text.toLowerCase()
  const acct = KNOWN_ACCOUNTS.find(a => t.includes(a.split(' ')[0].toLowerCase())) ?? 'Woodhaven'
  const channel: Activity['channel'] = /call|phone|spoke/.test(t) ? 'Call' : 'Visit'
  const contactKey = Object.keys(KNOWN_CONTACTS).find(k => t.includes(k))
  const contact = contactKey ? KNOWN_CONTACTS[contactKey] : 'Angela — Administrator'
  const interestPharmacy = /pharmacy/.test(t)
  const followWeeks = /two weeks|2 weeks/.test(t) ? 2 : /next week/.test(t) ? 1 : /month/.test(t) ? 4 : 2
  const dueDate = addDays(DEMO_TODAY, followWeeks * 7)
  const opp = interestPharmacy ? 'BrightSpring Pharmacy' : 'Home Health'

  const activity: Activity = {
    id: uid('act'), accountId: acct.includes('Elmington') ? 'a-south-0' : `x-${acct.split(' ')[0].toLowerCase()}`,
    date: DEMO_TODAY, channel,
    outcome: `Met ${contact.split(' — ')[0]}; interested in the ${opp} proposal`, owner: 'Jordan Ellis',
  }
  const task: FollowUpTask = {
    id: uid('tk'), title: `Send ${opp} proposal & follow up`, accountName: acct.split(' ')[0],
    dueDate, owner: 'Jordan Ellis', source: 'CRM capture', done: false,
  }
  const proposal: AssistantProposal = {
    id: uid('p'), kind: 'crm', status: 'pending',
    title: `CRM activity — ${acct.split(' ')[0]}`,
    summary: `Extracted a ${channel.toLowerCase()} activity and a follow-up task from one spoken sentence.`,
    fields: [
      { label: 'Activity type', value: channel, changed: true },
      { label: 'Account', value: acct.split(' ')[0] },
      { label: 'Contact / decision maker', value: contact },
      { label: 'Outcome', value: 'Positive — proposal interest', changed: true },
      { label: 'Interest level', value: 'High', changed: true },
      { label: 'Service-line opportunity', value: opp, changed: true },
      { label: 'Next action', value: `Send ${opp} proposal`, changed: true },
      { label: 'Follow-up date', value: dueDate, changed: true },
      { label: 'Owner', value: 'Jordan Ellis' },
      { label: 'AI confidence', value: '92%' },
    ],
    changes: [
      { label: 'Account timeline', detail: `New ${channel.toLowerCase()} activity added to ${acct.split(' ')[0]}` },
      { label: 'Follow-up list', detail: `Task created, due ${dueDate}` },
      { label: 'Audit trail', detail: 'Simulated CRM write recorded' },
    ],
  }
  return {
    reply: `I turned that into a manager-ready CRM entry. I recognized **${acct.split(' ')[0]}**, **${contact}**, interest in the **${opp}** proposal, and a **${followWeeks}-week** follow-up. Review and approve to write it.`,
    proposal, crm: { activity, task },
  }
}

// ---------- Emergency reschedule ----------
function rescheduleFlow(): EngineResult {
  const moved = [
    { title: 'Intro visit — Woodlake Skilled Nursing', accountName: 'Woodlake', dueDate: addDays(DEMO_TODAY, 1) },
    { title: 'Quarterly check-in — Brandermill Physicians', accountName: 'Brandermill', dueDate: addDays(DEMO_TODAY, 2) },
    { title: 'Service expansion — Rockwood Assisted Living', accountName: 'Rockwood', dueDate: addDays(DEMO_TODAY, 3) },
  ]
  const proposal: AssistantProposal = {
    id: uid('p'), kind: 'reschedule', status: 'pending',
    title: 'Emergency reschedule — Jordan, this afternoon',
    summary: 'Afternoon protected. 3 unconfirmed stops moved; the urgent R-1042 follow-up is preserved and drafts are ready.',
    fields: [
      { label: 'Protected time', value: 'Today 12:00 PM → end of day', changed: true },
      { label: 'Meetings affected', value: '3 unconfirmed stops', changed: true },
      { label: 'Urgent preserved', value: 'R-1042 (Elmington) follow-up → tomorrow 9:00 AM', changed: true },
      { label: 'New openings used', value: 'Tomorrow 9:00 / 10:30, Thu 1:00', changed: true },
      { label: 'Customer notes', value: '3 friendly reschedule drafts prepared' },
      { label: 'Home-by target', value: 'Restored — home by 5:30 PM', changed: true },
    ],
    changes: [
      { label: 'Woodlake Skilled Nursing', detail: '12:00 PM today → tomorrow 9:00 AM (draft: “A family matter came up…”)' },
      { label: 'Brandermill Physicians', detail: '2:30 PM today → Wed 10:30 AM (draft prepared)' },
      { label: 'Rockwood Assisted Living', detail: '4:00 PM today → Thu 1:00 PM (draft prepared)' },
      { label: 'R-1042 follow-up (Elmington)', detail: 'Kept as high priority — moved to tomorrow 9:00 AM, not dropped' },
      { label: 'Monthly plan', detail: "Week's coverage rebalanced so no Tier-1 account slips" },
    ],
  }
  return {
    reply: `I'm sorry to hear that — I've protected your afternoon. I found **3 affected stops**, kept the **urgent R-1042 follow-up**, found new openings, and drafted friendly customer notes. Nothing changes until you approve.`,
    proposal, reschedule: moved, navigate: 'today',
  }
}

// ---------- Monthly plan ----------
function monthlyPlanFlow(): EngineResult {
  const proposal: AssistantProposal = {
    id: uid('p'), kind: 'monthlyPlan', status: 'pending',
    title: 'AI monthly plan — 4-week distribution',
    summary: 'Covers every Tier-1 account, protects your existing meetings, and keeps Fridays lighter.',
    fields: [
      { label: 'Tier-1 accounts covered', value: '18 of 18', changed: true },
      { label: 'Existing meetings', value: 'All 11 protected' },
      { label: 'Friday load', value: 'Reduced ~40% vs other days', changed: true },
      { label: 'Week distribution', value: 'W1 26% · W2 27% · W3 25% · W4 22%', changed: true },
      { label: 'Uncovered priority', value: '6 → 0', changed: true },
      { label: 'Avg. weekly drive', value: '7.3 → 6.6 hrs', changed: true },
    ],
    changes: [
      { label: 'Week 1', detail: 'Tier-1 in South & East first (highest risk); Fri light' },
      { label: 'Week 2', detail: 'Central & North Tier-1 + referral follow-ups' },
      { label: 'Week 3', detail: 'West Tier-1 + second-touch priority accounts' },
      { label: 'Week 4', detail: 'Buffer + slipped visits; Fridays reserved for admin' },
    ],
  }
  return {
    reply: `Here's a balanced 4-week plan: **every Tier-1 account covered**, your **existing meetings protected**, and **Fridays kept lighter**. It spreads work across the month instead of front-loading week 1. Approve to update the Month plan.`,
    proposal, monthlyPlan: true, navigate: 'plan',
  }
}

// ---------- router ----------
export function runEngine(text: string): EngineResult {
  const t = text.toLowerCase()
  if (/log (a )?(visit|call)|met with|spoke with|note that/.test(t)) return crmFlow(text)
  if (/emergency|clear (the rest of )?my (afternoon|day)|reschedule (anything|my)/.test(t)) return rescheduleFlow()
  if (/monthly plan|build.*plan|plan.*month|cover.*tier 1|cover every|month plan/.test(t)) return monthlyPlanFlow()
  if (/move both|move them|both.*next week/.test(t)) {
    return { reply: `Got it — I'll move **both** of the accounts we were discussing to next week. They're still in my working memory, so you didn't have to repeat them. Want me to draft the reschedule?` }
  }
  return {
    reply: `I can act across the whole workflow. Try:\n• “Log a visit at Woodhaven. Met Angela. Interested in the pharmacy proposal. Follow up in two weeks.”\n• “I have a family emergency — clear my afternoon and reschedule anything important.”\n• “Build a monthly plan that covers every Tier 1 account, protects my meetings and keeps Fridays lighter.”`,
  }
}

export const SUGGESTED_PROMPTS = [
  'Log a visit at Woodhaven. Met Angela. Interested in the pharmacy proposal. Follow up in two weeks.',
  'I have a family emergency — clear my afternoon and reschedule anything important.',
  'Build a monthly plan that covers every Tier 1 account, protects my meetings and keeps Fridays lighter.',
]
