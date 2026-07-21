// §5 Intelligent Today — realistic per-rep day timelines with drive legs, buffers,
// lunch, personal commitments, facility hours, and deterministic schedule-risk detection.

export type TimelineItem =
  | { kind: 'meeting'; time: string; dur: number; account: string; purpose: string; hours: string; status: 'Confirmed' | 'Unconfirmed' | 'Completed'; risk?: boolean }
  | { kind: 'drive'; minutes: number; to: string }
  | { kind: 'buffer'; label: string; minutes: number }
  | { kind: 'personal'; time: string; label: string }

export interface ScheduleFix { id: string; label: string; detail: string; newHome: string; removesAccount?: string; convertsAccount?: string }

export interface RepDay {
  homeBy: string
  projectedHome: string
  openCapacityMin: number
  totalDriveMin: number
  stops: number
  risk?: { text: string; fixes: ScheduleFix[] }
  timeline: TimelineItem[]
  routeStops: { name: string; lng: number; lat: number }[]
}

export const DAYS: Record<string, RepDay> = {
  'r-jordan': {
    homeBy: '5:30 PM', projectedHome: '6:10 PM', openCapacityMin: 0, totalDriveMin: 156, stops: 6,
    risk: {
      text: 'The 2:00 PM Woodlake visit creates a 22-minute late-arrival risk and puts Jordan home after 6:10 PM — 40 minutes past his 5:30 PM target.',
      fixes: [
        { id: 'fix-move-woodlake', label: 'Move the Woodlake intro to tomorrow 9:00 AM', detail: 'Frees the tight afternoon leg; Woodlake is an unconfirmed intro, not time-sensitive.', newHome: '5:24 PM', removesAccount: 'Woodlake Skilled Nursing' },
        { id: 'fix-call-rockwood', label: 'Convert the Rockwood visit to a phone check-in', detail: 'Keeps the touch without the 30-minute cross-town drive.', newHome: '5:18 PM', convertsAccount: 'Rockwood Assisted Living' },
      ],
    },
    timeline: [
      { kind: 'meeting', time: '8:30a', dur: 45, account: 'Elmington Rehabilitation', purpose: 'Discharge pipeline review', hours: '7a–6p', status: 'Confirmed' },
      { kind: 'drive', minutes: 16, to: 'Bon Air Senior Living' },
      { kind: 'buffer', label: 'Parking & check-in', minutes: 8 },
      { kind: 'meeting', time: '9:40a', dur: 40, account: 'Bon Air Senior Living', purpose: 'Referral follow-up', hours: '8a–5p', status: 'Completed' },
      { kind: 'drive', minutes: 14, to: 'Riverbend Medical Center' },
      { kind: 'meeting', time: '10:45a', dur: 45, account: 'Riverbend Medical Center', purpose: 'Discharge planner sync', hours: '24h', status: 'Confirmed' },
      { kind: 'drive', minutes: 20, to: 'Downtown' },
      { kind: 'buffer', label: 'Lunch', minutes: 30 },
      { kind: 'drive', minutes: 18, to: 'Brandermill Physicians' },
      { kind: 'meeting', time: '1:15p', dur: 40, account: 'Brandermill Physicians', purpose: 'Quarterly check-in', hours: '8a–5p', status: 'Confirmed' },
      { kind: 'drive', minutes: 28, to: 'Woodlake Skilled Nursing' },
      { kind: 'meeting', time: '2:00p', dur: 45, account: 'Woodlake Skilled Nursing', purpose: 'Intro visit', hours: 'closes 5p', status: 'Unconfirmed', risk: true },
      { kind: 'drive', minutes: 30, to: 'Rockwood Assisted Living' },
      { kind: 'meeting', time: '3:30p', dur: 45, account: 'Rockwood Assisted Living', purpose: 'Service expansion', hours: '9a–5p', status: 'Unconfirmed' },
      { kind: 'drive', minutes: 30, to: 'Home' },
      { kind: 'personal', time: '5:30p', label: 'Pick up kids (personal — protected)' },
    ],
    routeStops: [
      { name: 'Elmington Rehabilitation', lng: -77.45, lat: 37.49 },
      { name: 'Bon Air Senior Living', lng: -77.47, lat: 37.48 },
      { name: 'Riverbend Medical Center', lng: -77.44, lat: 37.60 },
      { name: 'Brandermill Physicians', lng: -77.46, lat: 37.50 },
      { name: 'Woodlake Skilled Nursing', lng: -77.485, lat: 37.50 },
      { name: 'Rockwood Assisted Living', lng: -77.42, lat: 37.49 },
    ],
  },
  'r-maya': {
    homeBy: '5:30 PM', projectedHome: '5:05 PM', openCapacityMin: 55, totalDriveMin: 78, stops: 3,
    timeline: [
      { kind: 'meeting', time: '9:00a', dur: 45, account: 'Monument Rehabilitation', purpose: 'In-service', hours: '8a–6p', status: 'Confirmed' },
      { kind: 'drive', minutes: 16, to: 'Shockoe Physicians' },
      { kind: 'meeting', time: '11:00a', dur: 40, account: 'Shockoe Physicians', purpose: 'Referral review', hours: '8a–5p', status: 'Completed' },
      { kind: 'buffer', label: 'Lunch', minutes: 30 },
      { kind: 'drive', minutes: 14, to: 'Carytown Senior Living' },
      { kind: 'meeting', time: '1:30p', dur: 45, account: 'Carytown Senior Living', purpose: 'Relationship visit', hours: '9a–5p', status: 'Confirmed' },
    ],
    routeStops: [
      { name: 'Monument Rehabilitation', lng: -77.46, lat: 37.55 },
      { name: 'Shockoe Physicians', lng: -77.42, lat: 37.53 },
      { name: 'Carytown Senior Living', lng: -77.48, lat: 37.55 },
    ],
  },
  'r-alex': {
    homeBy: '5:00 PM', projectedHome: '4:40 PM', openCapacityMin: 40, totalDriveMin: 64, stops: 3,
    timeline: [
      { kind: 'meeting', time: '8:45a', dur: 45, account: 'Glenmore Skilled Nursing', purpose: 'Discharge planning', hours: '7a–6p', status: 'Confirmed' },
      { kind: 'drive', minutes: 18, to: 'Innsbrook Physicians' },
      { kind: 'meeting', time: '10:30a', dur: 40, account: 'Innsbrook Physicians', purpose: 'Referral follow-up', hours: '8a–5p', status: 'Completed' },
      { kind: 'buffer', label: 'Lunch', minutes: 30 },
      { kind: 'meeting', time: '1:00p', dur: 45, account: 'Lakeside Assisted Living', purpose: 'Check-in', hours: '9a–5p', status: 'Confirmed' },
    ],
    routeStops: [
      { name: 'Glenmore Skilled Nursing', lng: -77.45, lat: 37.59 },
      { name: 'Innsbrook Physicians', lng: -77.47, lat: 37.60 },
      { name: 'Lakeside Assisted Living', lng: -77.46, lat: 37.58 },
    ],
  },
  'r-taylor': {
    homeBy: '5:30 PM', projectedHome: '5:35 PM', openCapacityMin: 20, totalDriveMin: 96, stops: 3,
    risk: {
      text: 'High drive burden today (96 min) leaves Taylor projected home at 5:35 PM. One stop is an unconfirmed intro on the north edge.',
      fixes: [
        { id: 'fix-taylor-move', label: 'Defer the Sandston intro to Thursday', detail: 'Unconfirmed; removes a 24-minute edge leg.', newHome: '5:05 PM', removesAccount: 'Sandston Senior Living' },
      ],
    },
    timeline: [
      { kind: 'meeting', time: '8:30a', dur: 45, account: 'Hanover Medical Center', purpose: 'Discharge review', hours: '24h', status: 'Confirmed' },
      { kind: 'drive', minutes: 26, to: 'Mechanicsville Rehab' },
      { kind: 'meeting', time: '11:15a', dur: 40, account: 'Mechanicsville Rehab', purpose: 'Intro visit', hours: '8a–5p', status: 'Unconfirmed' },
      { kind: 'buffer', label: 'Lunch', minutes: 30 },
      { kind: 'drive', minutes: 24, to: 'Sandston Senior Living' },
      { kind: 'meeting', time: '2:00p', dur: 45, account: 'Sandston Senior Living', purpose: 'Service expansion', hours: '9a–5p', status: 'Unconfirmed', risk: true },
    ],
    routeStops: [
      { name: 'Hanover Medical Center', lng: -77.35, lat: 37.60 },
      { name: 'Mechanicsville Rehab', lng: -77.34, lat: 37.61 },
      { name: 'Sandston Senior Living', lng: -77.32, lat: 37.52 },
    ],
  },
  'r-sam': {
    homeBy: '5:30 PM', projectedHome: '5:00 PM', openCapacityMin: 45, totalDriveMin: 70, stops: 3,
    timeline: [
      { kind: 'meeting', time: '9:15a', dur: 45, account: 'Short Pump Physicians', purpose: 'Referral review', hours: '8a–5p', status: 'Confirmed' },
      { kind: 'drive', minutes: 16, to: 'Westhampton Rehab' },
      { kind: 'meeting', time: '11:30a', dur: 40, account: 'Westhampton Rehab', purpose: 'In-service', hours: '8a–6p', status: 'Completed' },
      { kind: 'buffer', label: 'Lunch', minutes: 30 },
      { kind: 'meeting', time: '1:45p', dur: 45, account: 'Deep Run Assisted Living', purpose: 'Check-in', hours: '9a–5p', status: 'Confirmed' },
    ],
    routeStops: [
      { name: 'Short Pump Physicians', lng: -77.55, lat: 37.55 },
      { name: 'Westhampton Rehab', lng: -77.53, lat: 37.56 },
      { name: 'Deep Run Assisted Living', lng: -77.57, lat: 37.54 },
    ],
  },
}
