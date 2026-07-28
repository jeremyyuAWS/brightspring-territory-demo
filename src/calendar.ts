// §6 Synthetic calendar — deterministic multi-week calendars for every rep, generated from
// the seeded accounts/referrals so names, territories and tiers stay self-consistent with the
// rest of the demo. Weekday-only, working-hours aware, with lunch, Monday huddles, protected
// personal time, lighter Fridays, and deliberate open gaps so the copilot's reschedule flow
// lands meetings in real openings instead of invented ones.
//
// Today's column is transcribed from today.ts rather than generated, so the Today view and the
// calendar never disagree about the same day.
import type { Account } from './types'
import { ACCOUNTS, REPS, REFERRALS, mulberry32 } from './seed'
import { DAYS, type TimelineItem } from './today'
import { DEMO_TODAY, addDays, dow, isWeekday, daysBetween } from './demoClock'

// The demo clock lives in demoClock.ts and rolls with the real date; re-exported here because
// most callers reach for it alongside the calendar helpers.
export { DEMO_TODAY, addDays, dow, isWeekday, daysBetween }

// window rendered by the calendar: 2 weeks back → 3 weeks forward
export const WEEKS_BACK = 2
export const WEEKS_FWD = 3

export type CalKind = 'visit' | 'referral' | 'inservice' | 'internal' | 'admin' | 'personal'
export type CalStatus = 'Confirmed' | 'Unconfirmed' | 'Completed'

export interface CalEvent {
  id: string
  repId: string
  date: string // ISO yyyy-mm-dd
  start: number // minutes from midnight
  dur: number // minutes
  kind: CalKind
  title: string
  accountId?: string
  accountName?: string
  purpose?: string
  territoryId?: string
  tier?: 1 | 2 | 3
  status: CalStatus
  driveMin?: number // travel leg immediately before this stop
  hours?: string // facility operating hours, for the "can it even be moved there" story
  protectedTime?: boolean // personal commitments the optimizer must not touch
  risk?: boolean
}

export interface CalMove {
  eventId: string
  title: string
  accountName: string
  fromDate: string
  fromStart: number
  toDate: string
  toStart: number
  reason: string
  draft: string // friendly customer note the copilot prepares
}

// ---------- date helpers ----------
/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const w = dow(iso)
  return addDays(iso, w === 0 ? -6 : 1 - w)
}
/** Mon→Fri ISO dates for the week containing `iso`. */
export function weekDays(iso: string): string[] {
  const mon = weekStart(iso)
  return [0, 1, 2, 3, 4].map(i => addDays(mon, i))
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export function fmtDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${DOW_LABEL[dow(iso)]} ${MONTHS[m - 1]} ${d}`
}
export function fmtDayShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}
/** "Jul 22, 2026" — the long form used in filter bars and headers. */
export function fmtDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}
/** 510 → "8:30a" (matches the compact style already used in today.ts) */
export function fmtTime(mins: number): string {
  const h24 = Math.floor(mins / 60), m = mins % 60
  const ap = h24 >= 12 ? 'p' : 'a'
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${String(m).padStart(2, '0')}${ap}`
}
/** 510 → "8:30 AM" (long form, for proposal copy) */
export function fmtTimeLong(mins: number): string {
  const h24 = Math.floor(mins / 60), m = mins % 60
  const ap = h24 >= 12 ? 'PM' : 'AM'
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${String(m).padStart(2, '0')} ${ap}`
}
/** "8:30a" / "2:00p" → minutes from midnight */
export function parseClock(s: string): number {
  const m = s.trim().match(/^(\d{1,2})[:.](\d{2})\s*([ap])/i)
  if (!m) return 9 * 60
  let h = Number(m[1]) % 12
  if (m[3].toLowerCase() === 'p') h += 12
  return h * 60 + Number(m[2])
}

// ---------- day shape ----------
export const DAY_START = 8 * 60 // 8:00a — earliest a stop may be scheduled
export const DAY_END = 18 * 60 // 6:00p — scheduling ceiling (respects the home-by target)
// The grid renders past DAY_END so late protected blocks (e.g. a 5:30p school pickup) aren't clipped.
export const RENDER_END = 18 * 60 + 30
const LUNCH_START = 12 * 60
const LUNCH_DUR = 30

const PURPOSES = [
  'Discharge pipeline review', 'Referral follow-up', 'Quarterly check-in', 'Intro visit',
  'Service expansion', 'Discharge planner sync', 'Relationship visit', 'Preferred-provider review',
  'Census & capacity review', 'Care-transition alignment',
]
const HOURS_BY_TYPE: Record<string, string> = {
  'Skilled Nursing Facility': '7a–6p', 'Rehabilitation Center': '8a–6p', 'Assisted Living': '9a–5p',
  'Hospital Discharge': '24h', 'Physician Group': '8a–5p', 'Memory Care': '9a–5p', 'Senior Living': '8a–5p',
}

// FNV-1a — same seeding idiom as seed.ts, so a rep+date pair always produces the same day.
function keySeed(k: string) {
  let h = 2166136261
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) || 1
}

/** Stops per weekday, scaled by rep load. Fridays deliberately lighter — the copilot's
 *  monthly-plan narrative promises it, so the baseline calendar has to show it. */
function stopsFor(repId: string, iso: string, rnd: () => number): number {
  const cap = REPS.find(r => r.id === repId)?.capacityPct ?? 90
  const base = cap >= 105 ? 5 : cap >= 90 ? 4 : cap >= 80 ? 4 : 3
  const w = dow(iso)
  if (w === 5) return Math.max(2, base - 2) // Friday
  if (w === 1) return Math.max(2, base - 1) // Monday, after the huddle
  return base - (rnd() < 0.3 ? 1 : 0)
}

function accountsForRep(repId: string): Account[] {
  const terr = REPS.find(r => r.id === repId)?.territoryId
  if (!terr) return ACCOUNTS.filter(a => a.priorityTier <= 2).slice(0, 8) // float liaison covers the market
  return ACCOUNTS.filter(a => a.territoryId === terr)
}

// ---------- today, transcribed from today.ts ----------
// Keeps the Today view and the calendar in exact agreement for the current day.
function todayEvents(repId: string): CalEvent[] {
  const day = DAYS[repId]
  if (!day) return []
  const out: CalEvent[] = []
  let pendingDrive = 0
  let i = 0
  for (const item of day.timeline as TimelineItem[]) {
    if (item.kind === 'drive') { pendingDrive += item.minutes; continue }
    if (item.kind === 'buffer') continue // parking, lunch — real time, but not drive time
    if (item.kind === 'personal') {
      out.push({
        id: `cal-${repId}-today-p${i++}`, repId, date: DEMO_TODAY, start: parseClock(item.time), dur: 45,
        kind: 'personal', title: item.label, status: 'Confirmed', protectedTime: true,
      })
      continue
    }
    const acct = ACCOUNTS.find(a => a.name === item.account)
    out.push({
      id: `cal-${repId}-today-${i++}`, repId, date: DEMO_TODAY,
      start: parseClock(item.time), dur: item.dur,
      kind: /in-service/i.test(item.purpose) ? 'inservice' : /referral/i.test(item.purpose) ? 'referral' : 'visit',
      title: item.account, accountId: acct?.id, accountName: item.account, purpose: item.purpose,
      territoryId: acct?.territoryId, tier: acct?.priorityTier, status: item.status,
      driveMin: pendingDrive || undefined, hours: item.hours, risk: item.risk,
    })
    pendingDrive = 0
  }
  // The authored day is weekday-agnostic, but the clock rolls — so if today happens to land on a
  // Monday or Friday, add that weekday's fixture the generator would otherwise have supplied.
  // Skipped when it would collide with the authored timeline, which always wins.
  const free = (start: number, dur: number) => !out.some(e => start < e.start + e.dur && start + dur > e.start)
  if (dow(DEMO_TODAY) === 1 && free(8 * 60, 45)) {
    out.push({
      id: `cal-${repId}-today-huddle`, repId, date: DEMO_TODAY, start: 8 * 60, dur: 45, kind: 'internal',
      title: 'Market team huddle', purpose: 'Pipeline & coverage review', status: 'Completed',
    })
  }
  if (dow(DEMO_TODAY) === 5 && free(15 * 60, 60)) {
    out.push({
      id: `cal-${repId}-today-admin`, repId, date: DEMO_TODAY, start: 15 * 60, dur: 60, kind: 'admin',
      title: 'CRM catch-up & week close', purpose: 'Notes, follow-ups, next-week plan', status: 'Confirmed',
    })
  }
  return out.sort((a, b) => a.start - b.start)
}

// ---------- generation ----------
function generateDay(repId: string, iso: string): CalEvent[] {
  if (!isWeekday(iso)) return []
  if (iso === DEMO_TODAY) return todayEvents(repId)

  const rnd = mulberry32(keySeed(`${repId}|${iso}`))
  const out: CalEvent[] = []
  const past = daysBetween(DEMO_TODAY, iso) < 0
  const pool = accountsForRep(repId)
  if (!pool.length) return out

  // Monday: market huddle before the road starts
  if (dow(iso) === 1) {
    out.push({
      id: `cal-${repId}-${iso}-huddle`, repId, date: iso, start: 8 * 60, dur: 45, kind: 'internal',
      title: 'Market team huddle', purpose: 'Pipeline & coverage review',
      status: past ? 'Completed' : 'Confirmed',
    })
  }
  // Friday: admin / CRM block in the afternoon — the "lighter Friday" made visible
  if (dow(iso) === 5) {
    out.push({
      id: `cal-${repId}-${iso}-admin`, repId, date: iso, start: 15 * 60, dur: 60, kind: 'admin',
      title: 'CRM catch-up & week close', purpose: 'Notes, follow-ups, next-week plan',
      status: past ? 'Completed' : 'Confirmed',
    })
  }

  // pick stops, biased toward priority accounts, no repeats within the day
  const n = stopsFor(repId, iso, rnd)
  const ranked = [...pool].sort((a, b) => (a.priorityTier - b.priorityTier) || (b.opportunityScore - a.opportunityScore))
  const chosen: Account[] = []
  let guard = 0
  while (chosen.length < n && guard++ < 60) {
    // weight the front of the ranked list (priority accounts get visited more often)
    const idx = Math.floor(Math.pow(rnd(), 1.7) * ranked.length)
    const a = ranked[Math.min(idx, ranked.length - 1)]
    if (a && !chosen.includes(a)) chosen.push(a)
  }

  // lay them out across the day, leaving genuine gaps between blocks
  let cursor = dow(iso) === 1 ? 9 * 60 + 15 : 8 * 60 + 30 + Math.floor(rnd() * 3) * 15
  for (let i = 0; i < chosen.length; i++) {
    const a = chosen[i]
    const drive = 12 + Math.floor(rnd() * 22)
    if (i > 0) cursor += drive + Math.floor(rnd() * 3) * 15 // travel + slack → the open gaps
    const dur = [30, 40, 45, 45, 60][Math.floor(rnd() * 5)]
    // push past lunch if this stop would overlap it at all — either starting before and running
    // into it, or starting inside it
    if (cursor < LUNCH_START + LUNCH_DUR && cursor + dur > LUNCH_START) cursor = LUNCH_START + LUNCH_DUR + 10
    if (cursor + dur > DAY_END - 30) break // respect the home-by target
    const purpose = PURPOSES[Math.floor(rnd() * PURPOSES.length)]
    out.push({
      id: `cal-${repId}-${iso}-${i}`, repId, date: iso, start: cursor, dur,
      kind: /in-service/i.test(purpose) ? 'inservice' : /referral/i.test(purpose) ? 'referral' : 'visit',
      title: a.name, accountId: a.id, accountName: a.name, purpose,
      territoryId: a.territoryId, tier: a.priorityTier,
      status: past ? 'Completed' : rnd() < 0.72 ? 'Confirmed' : 'Unconfirmed',
      driveMin: i > 0 ? drive : undefined,
      hours: HOURS_BY_TYPE[a.facilityType] ?? '8a–5p',
    })
    cursor += dur
  }

  // lunch, once the road plan exists
  if (out.some(e => e.kind !== 'internal' && e.kind !== 'admin')) {
    out.push({
      id: `cal-${repId}-${iso}-lunch`, repId, date: iso, start: LUNCH_START, dur: LUNCH_DUR,
      kind: 'personal', title: 'Lunch', status: past ? 'Completed' : 'Confirmed',
    })
  }

  // an occasional protected personal commitment the optimizer must route around
  if (rnd() < 0.22) {
    const start = [16 * 60 + 30, 17 * 60, 8 * 60][Math.floor(rnd() * 3)]
    if (!out.some(e => start < e.start + e.dur && start + 45 > e.start)) {
      out.push({
        id: `cal-${repId}-${iso}-prot`, repId, date: iso, start, dur: 45, kind: 'personal',
        title: rnd() < 0.5 ? 'Family commitment (protected)' : 'Personal — protected',
        status: 'Confirmed', protectedTime: true,
      })
    }
  }

  // referral follow-ups the rep owns, landed on their due date
  for (const r of REFERRALS.filter(r => r.repId === repId && r.followUpDate === iso)) {
    const a = ACCOUNTS.find(x => x.id === r.accountId)
    const slot = 15 * 60 + 30
    if (!out.some(e => slot < e.start + e.dur && slot + 30 > e.start)) {
      out.push({
        id: `cal-${repId}-${iso}-ref-${r.id}`, repId, date: iso, start: slot, dur: 30, kind: 'referral',
        title: `${r.id} follow-up — ${r.sourceOrg}`, accountId: r.accountId, accountName: a?.name ?? r.sourceOrg,
        purpose: `${r.serviceLine} referral · ${r.stage}`, territoryId: r.territoryId, tier: a?.priorityTier,
        status: past ? 'Completed' : 'Confirmed',
      })
    }
  }

  return out.sort((a, b) => a.start - b.start)
}

// Built once per rep across the whole window, then cached — generation is pure and deterministic.
const cache = new Map<string, CalEvent[]>()
export function calendarFor(repId: string): CalEvent[] {
  const hit = cache.get(repId)
  if (hit) return hit
  const from = addDays(weekStart(DEMO_TODAY), -7 * WEEKS_BACK)
  const out: CalEvent[] = []
  for (let i = 0; i < 7 * (WEEKS_BACK + WEEKS_FWD + 1); i++) out.push(...generateDay(repId, addDays(from, i)))
  cache.set(repId, out)
  return out
}

/** The rep's calendar with any approved reschedules applied. */
export function calendarWithMoves(repId: string, moves: CalMove[]): CalEvent[] {
  if (!moves.length) return calendarFor(repId)
  const byId = new Map(moves.map(m => [m.eventId, m]))
  return calendarFor(repId).map(e => {
    const m = byId.get(e.id)
    return m ? { ...e, date: m.toDate, start: m.toStart, status: 'Confirmed' as CalStatus } : e
  }).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
}

export function eventsOn(events: CalEvent[], iso: string): CalEvent[] {
  return events.filter(e => e.date === iso).sort((a, b) => a.start - b.start)
}

// ---------- open-slot finding ----------
/** Genuine openings in the rep's week: gaps inside working hours that clear every existing
 *  block (including protected personal time) with a little breathing room for travel. */
export function findOpenSlots(repId: string, afterIso: string, dur: number, limit = 6, moves: CalMove[] = []): { date: string; start: number }[] {
  const events = calendarWithMoves(repId, moves)
  const out: { date: string; start: number }[] = []
  const pad = 15 // travel/settle buffer either side
  for (let d = 1; d <= 7 * WEEKS_FWD && out.length < limit; d++) {
    const iso = addDays(afterIso, d)
    if (!isWeekday(iso)) continue
    const busy = eventsOn(events, iso).map(e => [e.start - pad, e.start + e.dur + pad] as const)
    for (let t = DAY_START + 30; t + dur <= DAY_END - 60 && out.length < limit; t += 15) {
      if (t < LUNCH_START + LUNCH_DUR && t + dur > LUNCH_START) continue // don't eat lunch
      if (busy.some(([s, e]) => t < e && t + dur > s)) continue
      out.push({ date: iso, start: t })
      break // one opening per day keeps the proposal readable
    }
  }
  return out
}

/** Build a concrete reschedule: everything from `fromMin` today that can move, landed in real
 *  openings. Completed stops and protected personal time are never touched. */
export function proposeReschedule(repId: string, fromMin: number, moves: CalMove[] = []): CalMove[] {
  const today = eventsOn(calendarWithMoves(repId, moves), DEMO_TODAY)
  const affected = today.filter(e =>
    e.start >= fromMin && e.status !== 'Completed' && !e.protectedTime &&
    e.kind !== 'personal' && e.kind !== 'admin' && e.kind !== 'internal')
  const slots = findOpenSlots(repId, DEMO_TODAY, 45, affected.length, moves)
  return affected.map((e, i) => {
    const slot = slots[i] ?? { date: addDays(DEMO_TODAY, i + 1), start: 9 * 60 }
    const urgent = e.kind === 'referral'
    return {
      eventId: e.id,
      title: `${e.purpose ?? 'Visit'} — ${e.accountName ?? e.title}`,
      accountName: e.accountName ?? e.title,
      fromDate: e.date, fromStart: e.start,
      toDate: slot.date, toStart: slot.start,
      reason: urgent
        ? 'Time-sensitive referral — moved to the earliest opening rather than dropped'
        : e.status === 'Unconfirmed'
          ? 'Unconfirmed and not time-sensitive — safe to move'
          : 'Confirmed visit — moved with a note to the account',
      draft: urgent
        ? `Hi — a family matter came up this afternoon. I don't want this to slip, so I've moved our ${e.purpose?.toLowerCase() ?? 'follow-up'} to ${fmtDay(slot.date)} at ${fmtTimeLong(slot.start)}. It stays my priority.`
        : `Hi — apologies, a family matter came up and I need to move today's visit. Would ${fmtDay(slot.date)} at ${fmtTimeLong(slot.start)} work? Happy to find another time if not.`,
    }
  })
}

/** Week-level load, used for the drawer's week strip. */
export function weekLoad(repId: string, mondayIso: string, moves: CalMove[] = []) {
  const events = calendarWithMoves(repId, moves)
  return weekDays(mondayIso).map(iso => {
    const day = eventsOn(events, iso)
    const stops = day.filter(e => e.kind === 'visit' || e.kind === 'referral' || e.kind === 'inservice')
    // Today's total comes straight from today.ts (it includes the drive home, which no stop
    // owns) so the week strip and the Today view never quote different numbers — unless a
    // reschedule has already changed the day, in which case the per-stop sum is the truth.
    const authored = iso === DEMO_TODAY && !moves.some(m => m.fromDate === DEMO_TODAY)
      ? DAYS[repId]?.totalDriveMin
      : undefined
    return {
      iso,
      stops: stops.length,
      driveMin: authored ?? stops.reduce((s, e) => s + (e.driveMin ?? 0), 0),
      unconfirmed: stops.filter(e => e.status === 'Unconfirmed').length,
    }
  })
}
