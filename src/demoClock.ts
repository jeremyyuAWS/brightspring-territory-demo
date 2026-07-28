// The demo clock — single source of truth for "today" across seed data, referral intelligence,
// the calendar and the copilot.
//
// Everything in this repo was authored around a fixed anchor date (ANCHOR). Rather than rewrite
// those literals whenever the demo is shown, we keep them exactly as written and map them into
// the current era at module load: shift() slides an authored date by the same number of days that
// separates the anchor from today. The demo therefore never looks stale, and every *relative*
// fact the narrative depends on — "overdue by 6 days", "last contact 38 days ago", "referral
// received 3 weeks back" — is preserved exactly, because the whole timeline moves together.
//
// The shift is computed ONCE at load, so a long-running demo can't change eras mid-session.

// ---------- pure date helpers (UTC throughout, so the demo renders identically in any timezone) ----------
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
export function dow(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=Sun … 6=Sat
}
export function isWeekday(iso: string) { const w = dow(iso); return w >= 1 && w <= 5 }
export function daysBetween(a: string, b: string): number {
  const p = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((p(b) - p(a)) / 86400000)
}

/** The date all seeded content was written around. Do not change — shift() rebases it instead. */
export const ANCHOR = '2026-07-22' // Wednesday

// NOTE: seed.ts seeds its PRNG with the number 20260722. That looks like this date but is a
// bare seed value — changing it would reshuffle every generated account and break the tuned
// conversion figures. It is deliberately not derived from ANCHOR.

/** Real-world today in local terms, as an ISO date. */
function realTodayIso(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

/** Today, snapped back to Friday on a weekend — a field rep's day only makes sense on a weekday. */
function resolveToday(): string {
  const t = realTodayIso()
  const w = dow(t)
  return w === 6 ? addDays(t, -1) : w === 0 ? addDays(t, -2) : t
}

/** The demo's "today". Fixed for the lifetime of the page. */
export const DEMO_TODAY: string = resolveToday()

/** Days between the authored anchor and the demo's today. */
export const SHIFT_DAYS: number = daysBetween(ANCHOR, DEMO_TODAY)

/** Map a date authored against ANCHOR into the current demo era. */
export function shift(iso: string): string {
  return SHIFT_DAYS === 0 ? iso : addDays(iso, SHIFT_DAYS)
}

/** Same, for dates expressed as an offset from the anchor (negative = in the past). */
export function fromAnchor(days: number): string {
  return addDays(DEMO_TODAY, days)
}
