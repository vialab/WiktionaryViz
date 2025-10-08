#!/usr/bin/env node
/**
 * Build Language Family polygons from Glottolog languoid.csv
 * - Group by family_id for each row.
 * - Use only language/dialect rows that have lat/lon; add their coordinates to the group identified by their family_id.
 * - For each family_id, compute a convex hull of its coordinates; fallback to a small rectangle if < 3 points.
 * - Output: public/language_families.geojson (FeatureCollection of Polygon features)
 *
 * Notes:
 * - Uses streaming line-by-line parsing to avoid loading entire CSV into memory.
 * - Implements a minimal CSV line parser supporting quotes and commas within quotes.
 */
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const ROOT = process.cwd()
const CSV_PATH = path.join(ROOT, 'public', 'languoid.csv')
const OUT_PATH = path.join(ROOT, 'public', 'language_families.geojson')

// ---- Utility: parse a CSV line with quotes (simple, adequate for Glottolog export)
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === ',') {
        result.push(current)
        current = ''
      } else if (ch === '"') {
        inQuotes = true
      } else {
        current += ch
      }
    }
  }
  result.push(current)
  return result
}

// ---- Geometry helpers
function rectAround([lon, lat], dx = 0.8, dy = 0.6) {
  return [
    [lon - dx, lat - dy],
    [lon + dx, lat - dy],
    [lon + dx, lat + dy],
    [lon - dx, lat + dy],
    [lon - dx, lat - dy],
  ]
}

function convexHull(points) {
  // Monotone chain; points as [lon,lat]
  if (points.length <= 1) return points.slice()
  // Sort by lon, then lat
  const pts = points.slice().sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]))
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }
  upper.pop()
  lower.pop()
  return lower.concat(upper)
}

function meanPoint(points) {
  let sx = 0,
    sy = 0
  for (const [x, y] of points) {
    sx += x
    sy += y
  }
  const n = points.length || 1
  return [sx / n, sy / n]
}

async function build() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found: ${CSV_PATH}`)
  }

  const idToName = new Map() // any id -> name (useful to label family_id)
  const familyPoints = new Map() // family_id -> Array<[lon,lat]>

  const stream = fs.createReadStream(CSV_PATH, { encoding: 'utf8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  let header = null
  let lineNo = 0
  for await (const line of rl) {
    lineNo++
    if (lineNo === 1) {
      header = parseCSVLine(line)
      continue
    }
    if (!line || !header) continue
    const cols = parseCSVLine(line)
    if (!cols || cols.length < header.length) continue

    // Map columns by name
    const idx = name => header.indexOf(name)
    const id = cols[idx('id')]
    const name = cols[idx('name')]
    const level = cols[idx('level')]
    const family_id = cols[idx('family_id')]
    const latStr = cols[idx('latitude')]
    const lonStr = cols[idx('longitude')]

    // Record name lookup for any id (family_id will reference one of these ids)
    if (id) idToName.set(id, name)

    if ((level === 'language' || level === 'dialect') && family_id) {
      const lat = parseFloat(latStr)
      const lon = parseFloat(lonStr)
      if (!isFinite(lat) || !isFinite(lon)) continue
      if (!familyPoints.has(family_id)) familyPoints.set(family_id, [])
      familyPoints.get(family_id).push([lon, lat])
    }
  }

  const features = []
  for (const [fid, pts] of familyPoints.entries()) {
    if (!pts || pts.length === 0) continue // skip empty
    let coordinates
    if (pts.length === 1) {
      coordinates = [rectAround(pts[0])]
    } else if (pts.length === 2) {
      const m = meanPoint(pts)
      coordinates = [rectAround(m, 1.0, 0.75)]
    } else {
      const hull = convexHull(pts)
      if (hull.length >= 3) {
        const ring = hull.concat([hull[0]])
        coordinates = [ring]
      } else {
        const m = meanPoint(pts)
        coordinates = [rectAround(m, 1.0, 0.75)]
      }
    }

    const center = meanPoint(pts)
    const famName = idToName.get(fid) || fid
    features.push({
      type: 'Feature',
      properties: {
        id: fid,
        name: famName,
        point_count: pts.length,
        label_lon: center[0],
        label_lat: center[1],
      },
      geometry: {
        type: 'Polygon',
        coordinates,
      },
    })
  }

  const fc = { type: 'FeatureCollection', features }
  fs.writeFileSync(OUT_PATH, JSON.stringify(fc))
  console.log(
    `Language family polygons built: ${features.length} features -> ${path.relative(
      ROOT,
      OUT_PATH,
    )}`,
  )
}

if (require.main === module) {
  build().catch(err => {
    console.error('Failed to build language family polygons:', err)
    process.exit(1)
  })
}
