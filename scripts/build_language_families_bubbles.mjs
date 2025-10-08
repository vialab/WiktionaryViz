#!/usr/bin/env node
// Build Language Family BubbleSet polygons from Glottolog languoid.csv in a memory-friendly way.
// - Stream CSV; aggregate language/dialect coordinates into Web Mercator grid cells keyed by family_id.
// - For each family_id, create rectangles from occupied cells; feed to BubbleSet to get a smooth outline.
// - Convert outline points back to lon/lat and write GeoJSON.

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { BubbleSet } from 'bubblesets'

const ROOT = process.cwd()
const CSV_PATH = path.join(ROOT, 'public', 'languoid.csv')
const OUT_PATH = path.join(ROOT, 'public', 'language_families.geojson')

// Web Mercator helpers (EPSG:3857)
const R = 6378137
const DEG2RAD = Math.PI / 180
function project([lon, lat]) {
  const x = R * lon * DEG2RAD
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * DEG2RAD) / 2))
  // clamp y to max mercator
  const max = 20037508.342789244
  return [x, Math.max(-max, Math.min(max, y))]
}
function unproject([x, y]) {
  const lon = x / R / DEG2RAD
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / DEG2RAD
  return [lon, lat]
}

// Grid size to aggregate points (meters). Larger reduces complexity & memory.
const CELL_SIZE = 150_000 // ~150 km
const PAD = 30_000 // Bubble padding around rectangles

// Lightweight CSV parsing per line (quoted fields supported)
function parseCSVLine(line) {
  const result = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          q = false
        }
      } else {
        cur += ch
      }
    } else if (ch === ',') {
      result.push(cur)
      cur = ''
    } else if (ch === '"') {
      q = true
    } else {
      cur += ch
    }
  }
  result.push(cur)
  return result
}

function gridKey([x, y]) {
  const gx = Math.floor(x / CELL_SIZE)
  const gy = Math.floor(y / CELL_SIZE)
  return `${gx}:${gy}`
}
function gridRectFromKey(key) {
  const [gxStr, gyStr] = key.split(':')
  const gx = Number(gxStr)
  const gy = Number(gyStr)
  const x = gx * CELL_SIZE
  const y = gy * CELL_SIZE
  return { x, y, width: CELL_SIZE, height: CELL_SIZE }
}

// Ramer–Douglas–Peucker simplification to reduce resulting polygon points
function simplifyRDP(points, epsilon) {
  if (points.length < 3) return points
  const d2 = (a, b, p) => {
    const vx = b[0] - a[0]
    const vy = b[1] - a[1]
    const wx = p[0] - a[0]
    const wy = p[1] - a[1]
    const c1 = vx * wx + vy * wy
    const c2 = vx * vx + vy * vy
    const t = c2 ? Math.max(0, Math.min(1, c1 / c2)) : 0
    const px = a[0] + t * vx
    const py = a[1] + t * vy
    const dx = p[0] - px
    const dy = p[1] - py
    return dx * dx + dy * dy
  }
  function rdp(pts) {
    let maxD = 0
    let idx = 0
    const end = pts.length - 1
    for (let i = 1; i < end; i++) {
      const dist = d2(pts[0], pts[end], pts[i])
      if (dist > maxD) {
        idx = i
        maxD = dist
      }
    }
    if (Math.sqrt(maxD) > epsilon) {
      const left = rdp(pts.slice(0, idx + 1))
      const right = rdp(pts.slice(idx))
      return left.slice(0, -1).concat(right)
    }
    return [pts[0], pts[end]]
  }
  return rdp(points)
}

async function build() {
  if (!fs.existsSync(CSV_PATH)) throw new Error(`CSV not found: ${CSV_PATH}`)

  const rl = readline.createInterface({
    input: fs.createReadStream(CSV_PATH, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  let header = null
  const idx = name => header.indexOf(name)

  const idToName = new Map()
  // Map family_id -> Set(cellKey)
  const famCells = new Map()

  let lineNo = 0
  for await (const line of rl) {
    lineNo++
    if (lineNo === 1) {
      header = parseCSVLine(line)
      continue
    }
    if (!line || !header) continue
    const cols = parseCSVLine(line)
    if (cols.length < header.length) continue

    const id = cols[idx('id')]
    const name = cols[idx('name')]
    const level = cols[idx('level')]
    const family_id = cols[idx('family_id')]
    const latStr = cols[idx('latitude')]
    const lonStr = cols[idx('longitude')]

    if (id) idToName.set(id, name)

    if ((level === 'language' || level === 'dialect') && family_id) {
      const lat = parseFloat(latStr)
      const lon = parseFloat(lonStr)
      if (!isFinite(lat) || !isFinite(lon)) continue
      const [x, y] = project([lon, lat])
      const key = gridKey([x, y])
      let set = famCells.get(family_id)
      if (!set) {
        set = new Set()
        famCells.set(family_id, set)
      }
      set.add(key)
    }
  }

  const bubbles = new BubbleSet()
  const features = []
  let processed = 0
  for (const [fid, cells] of famCells.entries()) {
    processed++
    if (!cells || cells.size === 0) continue
    // Build rectangles and pad them
    const rectsRaw = Array.from(cells).map(gridRectFromKey)
    const rects = BubbleSet.addPadding(rectsRaw, PAD)
    let list = []
    try {
      list = bubbles.createOutline(rects, [], null)
    } catch {
      // fallback to bounding box if bubblesets fails
      const xs = rects.map(r => [r.x, r.x + r.width]).flat()
      const ys = rects.map(r => [r.y, r.y + r.height]).flat()
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      const box = [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
      ]
      const ringLonLat = box.concat([box[0]]).map(unproject)
      features.push({
        type: 'Feature',
        properties: {
          id: fid,
          name: idToName.get(fid) || fid,
          method: 'bbox-fallback',
          cell_count: cells.size,
        },
        geometry: { type: 'Polygon', coordinates: [ringLonLat] },
      })
      continue
    }

    // list is an array of points (objects with x,y)
    const pts = Array.isArray(list) ? list.map(p => [p.x, p.y]) : []

    // Ensure closed ring and simplify further with RDP in projected space
    if (pts.length >= 3) {
      const rdp = simplifyRDP(pts, 10_000) // 10km tolerance
      const closed = rdp[0][0] === rdp[rdp.length - 1][0] && rdp[0][1] === rdp[rdp.length - 1][1]
      const ring = closed ? rdp : rdp.concat([rdp[0]])
      const ringLonLat = ring.map(unproject)
      features.push({
        type: 'Feature',
        properties: {
          id: fid,
          name: idToName.get(fid) || fid,
          method: 'bubblesets',
          cell_count: cells.size,
          point_count: rectsRaw.length,
        },
        geometry: { type: 'Polygon', coordinates: [ringLonLat] },
      })
    }
  }

  const fc = { type: 'FeatureCollection', features }
  fs.writeFileSync(OUT_PATH, JSON.stringify(fc))
  console.log(
    `BubbleSets family polygons: ${features.length} features -> ${path.relative(ROOT, OUT_PATH)}`,
  )
}

build().catch(err => {
  console.error('Failed to build bubblesets polygons:', err)
  process.exit(1)
})
