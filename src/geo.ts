// Richmond, VA synthetic geography for the demo map.
// Coordinates are plausible (real Richmond area) but territory shapes are stylized, not official.

export const RICHMOND_CENTER: [number, number] = [-77.455, 37.5405]
export const RICHMOND_BOUNDS: [[number, number], [number, number]] = [
  [-77.62, 37.45], // sw
  [-77.31, 37.63], // ne
]

// territory polygon rings (lng,lat), center column N/C/S flanked by W and E
export const TERRITORY_POLYGONS: Record<string, [number, number][]> = {
  't-north': [
    [-77.52, 37.615], [-77.38, 37.615], [-77.385, 37.565], [-77.45, 37.55], [-77.515, 37.565], [-77.52, 37.615],
  ],
  't-central': [
    [-77.515, 37.565], [-77.45, 37.55], [-77.385, 37.565], [-77.39, 37.515], [-77.45, 37.505], [-77.51, 37.515], [-77.515, 37.565],
  ],
  't-south': [
    [-77.51, 37.515], [-77.45, 37.505], [-77.39, 37.515], [-77.40, 37.465], [-77.50, 37.465], [-77.51, 37.515],
  ],
  't-west': [
    [-77.60, 37.545], [-77.585, 37.60], [-77.52, 37.615], [-77.515, 37.565], [-77.51, 37.515], [-77.50, 37.465], [-77.575, 37.48], [-77.60, 37.545],
  ],
  't-east': [
    [-77.38, 37.615], [-77.32, 37.575], [-77.32, 37.50], [-77.40, 37.465], [-77.39, 37.515], [-77.385, 37.565], [-77.38, 37.615],
  ],
}

// bounding boxes to scatter account points comfortably inside each territory
export const TERRITORY_BBOX: Record<string, { minLng: number; maxLng: number; minLat: number; maxLat: number }> = {
  't-north': { minLng: -77.50, maxLng: -77.40, minLat: 37.570, maxLat: 37.605 },
  't-central': { minLng: -77.50, maxLng: -77.40, minLat: 37.520, maxLat: 37.555 },
  't-south': { minLng: -77.49, maxLng: -77.41, minLat: 37.475, maxLat: 37.510 },
  't-west': { minLng: -77.575, maxLng: -77.525, minLat: 37.500, maxLat: 37.590 },
  't-east': { minLng: -77.375, maxLng: -77.335, minLat: 37.500, maxLat: 37.570 },
}

export const REP_HOME: Record<string, [number, number]> = {
  'r-alex': [-77.45, 37.590],
  'r-maya': [-77.45, 37.535],
  'r-jordan': [-77.45, 37.490],
  'r-taylor': [-77.355, 37.535],
  'r-sam': [-77.550, 37.545],
  'r-riley': [-77.44, 37.540],
}

export type GeoJSONFeature = {
  type: 'Feature'
  geometry: { type: string; coordinates: any }
  properties: Record<string, any>
}
export type GeoJSONFC = { type: 'FeatureCollection'; features: GeoJSONFeature[] }

export function territoriesGeoJSON(props: (id: string) => Record<string, any>): GeoJSONFC {
  return {
    type: 'FeatureCollection',
    features: Object.entries(TERRITORY_POLYGONS).map(([id, ring]) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { territoryId: id, ...props(id) },
    })),
  }
}

export function labelPoints(): Record<string, [number, number]> {
  // centroid-ish label anchor per territory
  return {
    't-north': [-77.45, 37.588],
    't-central': [-77.45, 37.537],
    't-south': [-77.45, 37.492],
    't-west': [-77.552, 37.545],
    't-east': [-77.353, 37.540],
  }
}

// deterministic mock drive-time isochrone (concentric organic polygon) around a center.
// radiusDeg roughly maps to minutes; jitter is deterministic per vertex.
export function isochrone(center: [number, number], radiusDeg: number, seed: number, points = 40): [number, number][] {
  const ring: [number, number][] = []
  const latScale = 1 / Math.cos((center[1] * Math.PI) / 180) // stretch lng so it looks circular on screen
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2
    // deterministic pseudo-noise
    const n = 0.82 + 0.18 * Math.abs(Math.sin(a * 3 + seed) * Math.cos(a * 2 + seed * 0.7))
    const r = radiusDeg * n
    ring.push([center[0] + Math.cos(a) * r * latScale, center[1] + Math.sin(a) * r])
  }
  return ring
}

export function isochroneFC(center: [number, number], seed: number): GeoJSONFC {
  // 60 / 45 / 30 min, painted largest-first so smaller ones layer on top
  const bands = [
    { minutes: 60, radius: 0.030 },
    { minutes: 45, radius: 0.021 },
    { minutes: 30, radius: 0.013 },
  ]
  return {
    type: 'FeatureCollection',
    features: bands.map(b => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [isochrone(center, b.radius, seed + b.minutes)] },
      properties: { minutes: b.minutes },
    })),
  }
}

export function routeLineFC(points: [number, number][]): GeoJSONFC {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: points }, properties: {} }],
  }
}

// ---- Territory Builder: synthetic ZIP-code cells over the market ----
export interface ZipCell { zip: string; ring: [number, number][]; center: [number, number]; territoryId: string }

export function zipCells(): ZipCell[] {
  const labels = labelPoints()
  const entries = Object.entries(labels) // [id, [lng,lat]]
  const minLng = -77.60, maxLng = -77.32, minLat = 37.465, maxLat = 37.615
  const cols = 7, rows = 5
  const cw = (maxLng - minLng) / cols, ch = (maxLat - minLat) / rows
  const cells: ZipCell[] = []
  let n = 10
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const l0 = minLng + c * cw, l1 = l0 + cw, b0 = minLat + r * ch, b1 = b0 + ch
      const center: [number, number] = [(l0 + l1) / 2, (b0 + b1) / 2]
      // nearest territory label (with a lng-distance stretch so regions look natural)
      let best = entries[0][0], bd = Infinity
      for (const [id, [lng, lat]] of entries) {
        const dx = (center[0] - lng) * 0.8, dy = center[1] - lat
        const d = dx * dx + dy * dy
        if (d < bd) { bd = d; best = id }
      }
      cells.push({
        zip: `232${n++}`,
        ring: [[l0, b0], [l1, b0], [l1, b1], [l0, b1], [l0, b0]],
        center, territoryId: best,
      })
    }
  }
  return cells
}

// ---- §13 referral flow map: source → service location ----
const FLOW_STATUS_COLOR: Record<string, string> = { admitted: '#16a34a', pending: '#d99a22', lost: '#c74634' }
export interface ReferralFlow { name: string; from: [number, number]; to: [number, number]; volume: number; status: 'admitted' | 'pending' | 'lost' }
export const REFERRAL_FLOWS: ReferralFlow[] = [
  { name: 'Riverbend Medical Center', from: [-77.44, 37.600], to: [-77.45, 37.537], volume: 6, status: 'admitted' },
  { name: 'Bon Air Senior Living', from: [-77.47, 37.480], to: [-77.45, 37.492], volume: 5, status: 'admitted' },
  { name: 'Stonegate Physicians', from: [-77.41, 37.548], to: [-77.45, 37.537], volume: 3, status: 'pending' },
  { name: 'Chesterfield Medical Center', from: [-77.345, 37.560], to: [-77.353, 37.540], volume: 4, status: 'pending' },
  { name: 'Woodhaven Medical Center', from: [-77.485, 37.500], to: [-77.45, 37.492], volume: 1, status: 'lost' },
]

function curve(a: [number, number], b: [number, number], bend = 0.35): [number, number][] {
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const ctrl: [number, number] = [mid[0] - dy * bend, mid[1] + dx * bend]
  const pts: [number, number][] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, mt = 1 - t
    pts.push([mt * mt * a[0] + 2 * mt * t * ctrl[0] + t * t * b[0], mt * mt * a[1] + 2 * mt * t * ctrl[1] + t * t * b[1]])
  }
  return pts
}

export function referralFlowFC(): GeoJSONFC {
  return {
    type: 'FeatureCollection',
    features: REFERRAL_FLOWS.map(f => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: curve(f.from, f.to) },
      properties: { name: f.name, volume: f.volume, status: f.status, color: FLOW_STATUS_COLOR[f.status], width: 1.5 + f.volume * 0.9 },
    })),
  }
}
export function referralSourceFC(): GeoJSONFC {
  return {
    type: 'FeatureCollection',
    features: REFERRAL_FLOWS.map(f => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: f.from },
      properties: { name: f.name, color: FLOW_STATUS_COLOR[f.status] },
    })),
  }
}
