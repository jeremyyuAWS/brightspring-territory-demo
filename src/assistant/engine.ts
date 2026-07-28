// Deterministic, templated copilot engine — NO live LLM in the demo path.
// Matches user input to one of the agentic flows and returns a scripted reply,
// an optional structured proposal, and any working-memory chips detected.
import type { MemoryChip, AssistantProposal, Activity, FollowUpTask } from '../types'
import {
  DEMO_TODAY, proposeReschedule, calendarWithMoves, eventsOn, findOpenSlots,
  addDays as calAddDays, fmtDay, fmtDayShort, fmtTimeLong, isWeekday, weekDays, weekStart,
  type CalMove,
} from '../calendar'

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
  // §6 — any calendar-shaped turn opens the left calendar drawer. `moves` present = a
  // proposal to preview (ghost → new slot); absent = a read-only look at the calendar.
  calendar?: { repId: string; moves?: CalMove[] }
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
// Reads the rep's real synthetic calendar, moves everything from the cut-off time into genuine
// openings, and hands the moves to the left drawer so the change is visible, not just described.
function rescheduleFlow(text: string, moves: CalMove[]): EngineResult {
  const repId = 'r-jordan'
  const t = text.toLowerCase()
  // "clear my afternoon" → noon; "clear my day" → start of day
  const fromMin = /morning/.test(t) ? 8 * 60 : /day|everything/.test(t) && !/afternoon/.test(t) ? 8 * 60 : 12 * 60
  const cal = proposeReschedule(repId, fromMin, moves)
  const label = fromMin <= 8 * 60 ? 'day' : 'afternoon'

  if (!cal.length) {
    return {
      reply: `Your ${label} is already clear — there's nothing left to move. Want me to look at tomorrow instead?`,
      calendar: { repId },
    }
  }

  const urgent = cal.filter(m => /follow-up|referral/i.test(m.title))
  const openings = cal.map(m => `${fmtDayShort(m.toDate)} ${fmtTimeLong(m.toStart)}`).join(', ')

  const proposal: AssistantProposal = {
    id: uid('p'), kind: 'reschedule', status: 'pending',
    title: `Emergency reschedule — Jordan, this ${label}`,
    summary: `${label[0].toUpperCase() + label.slice(1)} protected. ${cal.length} ${cal.length === 1 ? 'meeting' : 'meetings'} moved into real openings; protected personal time and completed stops untouched.`,
    fields: [
      { label: 'Protected time', value: `Today ${fmtTimeLong(fromMin)} → end of day`, changed: true },
      { label: 'Meetings affected', value: `${cal.length} ${cal.length === 1 ? 'stop' : 'stops'}`, changed: true },
      { label: 'Urgent preserved', value: urgent.length ? `${urgent.length} referral follow-up${urgent.length > 1 ? 's' : ''} kept, not dropped` : 'No time-sensitive referrals in the window' },
      { label: 'New openings used', value: openings, changed: true },
      { label: 'Customer notes', value: `${cal.length} friendly reschedule draft${cal.length > 1 ? 's' : ''} prepared` },
      { label: 'Home-by target', value: 'Restored — home by 5:30 PM', changed: true },
    ],
    changes: cal.map(m => ({
      label: m.accountName,
      detail: `${fmtTimeLong(m.fromStart)} today → ${fmtDay(m.toDate)} ${fmtTimeLong(m.toStart)} — ${m.reason}`,
    })),
  }
  return {
    reply: `I'm sorry to hear that — I've protected your ${label}. I found **${cal.length} affected ${cal.length === 1 ? 'stop' : 'stops'}**, landed each one in a real opening, and drafted friendly customer notes. **Your calendar is open on the left** so you can see exactly what moves. Nothing changes until you approve.`,
    proposal, reschedule: cal.map(m => ({ title: m.title, accountName: m.accountName, dueDate: m.toDate })),
    calendar: { repId, moves: cal }, navigate: 'today',
  }
}

// ---------- Read-only calendar questions ----------
// "What's on Thursday?", "show me my week", "where do I have room?" — opens the drawer without
// proposing anything, so the calendar is a first-class answer surface rather than a wall of text.
function calendarQueryFlow(text: string, moves: CalMove[]): EngineResult {
  const repId = 'r-jordan'
  const t = text.toLowerCase()
  const events = calendarWithMoves(repId, moves)

  // free/open-time question
  if (/free|open|room|availab|slot|gap/.test(t)) {
    const slots = findOpenSlots(repId, DEMO_TODAY, 45, 4, moves)
    if (!slots.length) return { reply: `You're fully committed for the next three weeks — nothing opens up without moving something.`, calendar: { repId } }
    return {
      reply: `You've got room at:\n${slots.map(s => `• **${fmtDay(s.date)}** at ${fmtTimeLong(s.start)}`).join('\n')}\n\nEach one clears your existing stops and protected time with travel buffer. Calendar's open on the left.`,
      calendar: { repId },
    }
  }

  // a specific named weekday
  const NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const named = NAMES.findIndex(n => t.includes(n))
  let target: string | null = null
  if (/tomorrow/.test(t)) { target = calAddDays(DEMO_TODAY, 1); while (!isWeekday(target)) target = calAddDays(target, 1) }
  else if (/today/.test(t)) target = DEMO_TODAY
  else if (named >= 0) {
    // the named day in the current or next week, whichever is next
    const inWeek = weekDays(weekStart(DEMO_TODAY)).find(d => NAMES[new Date(`${d}T00:00:00Z`).getUTCDay()] === NAMES[named])
    target = inWeek && inWeek >= DEMO_TODAY ? inWeek : weekDays(calAddDays(weekStart(DEMO_TODAY), 7)).find(d => NAMES[new Date(`${d}T00:00:00Z`).getUTCDay()] === NAMES[named]) ?? null
  }

  if (target) {
    const day = eventsOn(events, target).filter(e => e.kind !== 'personal' || e.protectedTime)
    if (!day.length) return { reply: `**${fmtDay(target)}** is clear — nothing scheduled yet.`, calendar: { repId } }
    const lines = day.map(e => `• **${fmtTimeLong(e.start)}** — ${e.title}${e.purpose ? ` (${e.purpose})` : ''}${e.status === 'Unconfirmed' ? ' — *unconfirmed*' : ''}`).join('\n')
    return { reply: `**${fmtDay(target)}** — ${day.length} ${day.length === 1 ? 'item' : 'items'}:\n${lines}\n\nOpened it on the left.`, calendar: { repId } }
  }

  // whole-week summary
  const days = weekDays(weekStart(DEMO_TODAY))
  const lines = days.map(d => {
    const n = eventsOn(events, d).filter(e => e.kind === 'visit' || e.kind === 'referral' || e.kind === 'inservice').length
    return `• **${fmtDay(d)}** — ${n} ${n === 1 ? 'stop' : 'stops'}`
  }).join('\n')
  return { reply: `Here's your week:\n${lines}\n\nCalendar's open on the left — click any day to drop into the route detail.`, calendar: { repId } }
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
// `moves` is the set of already-approved calendar reschedules, so a second request reasons
// about the calendar as it now stands rather than the pristine seed.
export function runEngine(text: string, moves: CalMove[] = []): EngineResult {
  const t = text.toLowerCase()
  if (/log (a )?(visit|call)|met with|spoke with|note that/.test(t)) return crmFlow(text)
  if (/emergency|clear (the rest of )?my (afternoon|day|morning)|reschedule (anything|my)|move (my|everything)/.test(t)) return rescheduleFlow(text, moves)
  if (/monthly plan|build.*plan|plan.*month|cover.*tier 1|cover every|month plan/.test(t)) return monthlyPlanFlow()
  // read-only calendar questions — open the drawer, don't propose anything
  if (/calendar|schedule|my week|this week|next week|what('?s| is) on|when am i|free|open slot|availab|room (for|to)|tomorrow|monday|tuesday|wednesday|thursday|friday/.test(t)) {
    return calendarQueryFlow(text, moves)
  }
  if (/move both|move them|both.*next week/.test(t)) {
    return { reply: `Got it — I'll move **both** of the accounts we were discussing to next week. They're still in my working memory, so you didn't have to repeat them. Want me to draft the reschedule?` }
  }
  return {
    reply: `I can act across the whole workflow. Try:\n• “Log a visit at Woodhaven. Met Angela. Interested in the pharmacy proposal. Follow up in two weeks.”\n• “I have a family emergency — clear my afternoon and reschedule anything important.”\n• “What's on my calendar Thursday?”\n• “Build a monthly plan that covers every Tier 1 account, protects my meetings and keeps Fridays lighter.”`,
  }
}

export const SUGGESTED_PROMPTS = [
  'Log a visit at Woodhaven. Met Angela. Interested in the pharmacy proposal. Follow up in two weeks.',
  'I have a family emergency — clear my afternoon and reschedule anything important.',
  "What's on my calendar Thursday?",
  'Where do I have room for a Tier 1 visit this week?',
  'Build a monthly plan that covers every Tier 1 account, protects my meetings and keeps Fridays lighter.',
]
