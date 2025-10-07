#!/usr/bin/env node
/*
  Generate proto-language regions:
  - Scans backend/data/language_codes.json for keys ending with '-pro'.
  - Merges into public/proto_regions.geojson.
  - Uses known center mappings to produce small polygons; unknowns get geometry: null with a TODO note.
*/
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const codesPath = path.join(ROOT, 'backend', 'data', 'language_codes.json')
const regionsPath = path.join(ROOT, 'public', 'proto_regions.geojson')

/** Small helper to make a rectangle polygon around [lon, lat] */
function rectAround([lon, lat], dx = 2.0, dy = 1.5) {
  return [
    [lon - dx, lat - dy],
    [lon + dx, lat - dy],
    [lon + dx, lat + dy],
    [lon - dx, lat + dy],
    [lon - dx, lat - dy],
  ]
}

// Known centers for families or specific proto codes (lon, lat)
const centers = {
  // Indo-European and branches
  'ine-pro': [44, 48], // Steppe (already present)
  'itc-pro': [12, 43], // Italy
  'cel-pro': [-2, 50], // Western/Central Europe
  'cel-bry-pro': [-3, 52], // Brythonic in Britain
  'iir-pro': [67, 37], // Steppe south/Transoxiana
  'sla-pro': [24, 52], // Polesie region
  'gmq-pro': [16, 62], // Scandinavia
  'gmw-pro': [7, 51], // West Germanic
  'gem-pro': [12, 56], // Jutland/South Scandinavia
  // Uralic, Turkic, Caucasian
  'urj-pro': [54, 60], // Middle Volga/Ural
  'trk-pro': [88, 45], // Altai-Sayan region
  'cau-nec-pro': [46, 43.5], // NE Caucasus
  // Semitic/Afroasiatic
  'sem-pro': [42, 33], // Northern Arabia/Levant fringe
  'sem-wes-pro': [40, 31], // West Semitic
  // Niger-Congo
  'bnt-pro': [24, -2], // Congo rainforest north of Angola
  // Tai-Kadai
  'tai-pro': [103, 20.5],
  'tai-swe-pro': [102, 18.5], // Southwestern Tai
}

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function main() {
  const codes = loadJSON(codesPath)
  const region = fs.existsSync(regionsPath)
    ? loadJSON(regionsPath)
    : { type: 'FeatureCollection', features: [] }

  const existing = new Set(
    (region.features || []).map(f => f && f.properties && f.properties.lang_code).filter(Boolean),
  )

  const protoEntries = Object.entries(codes).filter(([code, name]) => code.endsWith('-pro'))

  const added = []
  for (const [code, name] of protoEntries) {
    if (existing.has(code)) continue
    const center = centers[code]

    let geometry
    if (center) {
      geometry = {
        type: 'Polygon',
        coordinates: [rectAround(center, 2.5, 1.8)],
      }
    } else {
      // Fallback: leave geometry null and mark TODO to refine
      geometry = null
    }

    region.features.push({
      type: 'Feature',
      properties: {
        lang_code: code,
        name: String(name),
        variant: '',
        note: geometry ? undefined : 'TODO: define region polygon',
      },
      geometry,
    })
    added.push(code)
  }

  fs.writeFileSync(regionsPath, JSON.stringify(region, null, 2) + '\n')
  console.log(`Proto regions update complete. Added ${added.length} features.`)
}

if (require.main === module) {
  try {
    main()
  } catch (e) {
    console.error('Failed to build proto regions:', e)
    process.exit(1)
  }
}
