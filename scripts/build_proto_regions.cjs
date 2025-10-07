#!/usr/bin/env node
/*
  Generate refined proto-language regions:
  - Scans backend/data/language_codes.json for keys ending with '-pro'.
  - Rebuilds public/proto_regions.geojson as ellipses centered on known or fallback locations.
  - Preserves existing properties (name, variant, etc.) when present.
*/
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const codesPath = path.join(ROOT, 'backend', 'data', 'language_codes.json')
const regionsPath = path.join(ROOT, 'public', 'proto_regions.geojson')

/** Create an ellipse polygon around [lon, lat] with radii (rx, ry) in degrees and rotation angleDeg */
function ellipseAround([lon, lat], rx = 2.5, ry = 1.8, angleDeg = 0, points = 48) {
  const theta = (angleDeg * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const ring = []
  for (let i = 0; i < points; i++) {
    const t = (i / points) * 2 * Math.PI
    const x = rx * Math.cos(t)
    const y = ry * Math.sin(t)
    const xr = x * cos - y * sin
    const yr = x * sin + y * cos
    ring.push([lon + xr, lat + yr])
  }
  ring.push(ring[0])
  return ring
}

// Known centers for specific proto codes (lon, lat)
const centers = {
  // Indo-European and branches
  'ine-pro': [44, 48],
  'itc-pro': [12, 43],
  'cel-pro': [-2, 50],
  'cel-bry-pro': [-3, 52],
  'iir-pro': [67, 37],
  'sla-pro': [24, 52],
  'gmq-pro': [16, 62],
  'gmw-pro': [7, 51],
  'gem-pro': [12, 56],
  // Uralic, Turkic, Caucasian
  'urj-pro': [54, 60],
  'trk-pro': [88, 45],
  'cau-nec-pro': [46, 43.5],
  // Semitic/Afroasiatic
  'sem-pro': [42, 33],
  'sem-wes-pro': [40, 31],
  // Niger-Congo
  'bnt-pro': [24, -2],
  // Tai-Kadai
  'tai-pro': [103, 20.5],
  'tai-swe-pro': [102, 18.5],
  // Refinements
  'phi-pro': [122, 13],
  'pqe-pro': [135, -3],
  'ccs-pro': [43.5, 42.2],
  'ine-bsl-pro': [25, 54],
  'alg-pro': [-99.5, 48],
  'aql-pro': [-120, 41],
  'nai-sca-pro': [-94, 38],
  'hmx-pro': [110, 26],
  'urj-ugr-pro': [64, 60.5],
  'smi-pro': [22, 68],
  'ira-pro': [59.5, 35],
  'dru-pro': [121, 23.5],
  'azc-num-pro': [-110, 37],
  'azc-tak-pro': [-116, 33],
  'grk-pro': [22.5, 39],
  'sio-pro': [-98, 44],
  'afa-pro': [40, 15],
  'awd-pro': [-62, 4],
  'awd-taa-pro': [-58, 5],
  'ath-pro': [-120, 59],
  'mkh-vie-pro': [105.5, 18],
  'mkh-pro': [103, 15],
  'ccs-gzn-pro': [42.5, 42.5],
  'nai-pom-pro': [-123, 39],
  'esx-esk-pro': [-168, 66],
  'esx-inu-pro': [-120, 69],
  'cau-nkh-pro': [45, 43.2],
  'sal-pro': [-121, 49],
  'azc-nah-pro': [-100, 20],
  'xsc-sar-pro': [62, 48],
  'inc-pro': [77, 26],
  'mkh-ban-pro': [107.5, 14.5],
  'alv-pro': [10, 5],
  'cau-nwc-pro': [39, 44.5],
  'ine-toc-pro': [83, 42],
  'cau-lzg-pro': [47.5, 41.9],
  'nub-pro': [31, 20],
  'syd-pro': [70, 67],
  'xgn-pro': [105, 46],
  'euq-pro': [-2, 43],
  'nai-miz-pro': [-95, 17],
  'awd-nwk-pro': [-72, -7],
  'bnt-ngu-pro': [30, -28],
  'tup-pro': [-58, -10],
  'tuw-pro': [128, 53],
  'ine-ana-pro': [33, 39],
  'aus-pam-pro': [135, -25],
  'iir-nur-pro': [71, 35.2],
  'csu-sar-pro': [19, 9],
  'myn-pro': [-90, 16],
  'ira-sgc-pro': [68, 39],
  'xsc-sak-pro': [79, 39],
  'cmc-pro': [109, 12.5],
  'ira-shy-pro': [71.5, 38],
  'ira-shr-pro': [71.8, 38.3],
  'ira-sym-pro': [71, 36.9],
  'azc-pro': [-112, 33],
  'omq-pro': [-97, 17],
  'qfa-cka-pro': [170, 64],
  'ber-pro': [4, 29],
  'aus-cww-pro': [147, -32],
  'jpx-pro': [138, 36],
  'jpx-ryu-pro': [129, 27],
  'omq-otp-pro': [-100, 21],
  'oto-otm-pro': [-99, 20],
  'oto-pro': [-99, 20],
  'aus-nyu-pro': [123, -18],
  'omq-cha-pro': [-97, 16],
  'omq-zap-pro': [-96, 17],
  'omq-zpc-pro': [-96.5, 16.7],
  'kar-pro': [97.5, 18],
  'tbq-lol-pro': [103.5, 25],
  'xsc-pro': [58, 47],
  'qfa-adm-pro': [93, 12],
  'cau-cir-pro': [39, 44],
  'urj-prm-pro': [54, 59],
  'urj-mdv-pro': [44, 54.5],
  'omq-tri-pro': [-97.5, 17.3],
  'omq-mxt-pro': [-98, 17.5],
  'cau-abz-pro': [41, 43],
  'qfa-hur-pro': [43, 39.5],
  'qfa-yen-pro': [90, 63],
  'qfa-kor-pro': [127, 37],
  'cau-ava-pro': [46.5, 42.6],
  'cau-drg-pro': [47.5, 42.5],
  'cau-tsz-pro': [46, 42.4],
  'sai-nje-pro': [-46, -10],
  'dra-sdt-pro': [77, 11],
  'qfa-yuk-pro': [154, 67],
  'ngf-pro': [143, -5],
  'btk-pro': [99, 2.5],
  'paa-nha-pro': [128.5, 1.5],
  'iro-pro': [-79, 44],
  'iro-nor-pro': [-78, 44.5],
  'sai-car-pro': [-61, 6],
  'sai-tar-pro': [-66, 1],
  'alv-yrd-pro': [4, 8],
  'tup-gua-pro': [-56, -22],
  'mkh-mnc-pro': [101, 13.5],
  'chm-pro': [47, 57],
  'qfa-kra-pro': [106, 25],
  'xnd-pro': [-138, 62],
  'cdc-pro': [13, 11],
  'nai-mus-pro': [-86, 33],
  'cus-sou-pro': [36, 3],
  'dra-nor-pro': [83, 22],
  'alv-edk-pro': [3.5, 7.2],
  'alv-yor-pro': [4, 8],
  'nai-chu-pro': [-120, 34.5],
  'nai-mdu-pro': [-121, 39],
  'ypk-pro': [-166, 62],
  'ira-pat-pro': [68, 34],
  'qfa-tak-pro': [106, 24],
  'poz-mic-pro': [157, 5],
  'hmn-pro': [104, 26],
  'mns-pro': [63, 62],
  'kca-pro': [67, 62],
  'dra-cen-pro': [78, 15],
  'cau-and-pro': [46.5, 42.1],
  'sel-pro': [80, 63],
  'omv-aro-pro': [150, -5],
  'mkh-pal-pro': [98, 20],
  'auf-pro': [-69, -7],
  'qwe-pro': [-75, -12],
  'sit-khw-pro': [92, 28],
  'sit-khp-pro': [93, 28],
  'sit-khb-pro': [92.5, 28.5],
  'sit-hrs-pro': [93.5, 27.5],
  'cus-pro': [42, 8],
  'cus-som-pro': [45, 7],
  'tbq-kuk-pro': [94, 23],
  'sit-nas-pro': [100, 28],
  'sit-bdi-pro': [92, 29],
  'alv-edo-pro': [6, 7],
  'cus-hec-pro': [39, 6],
  'nic-bco-pro': [8, 6],
}

// Fallback centers by family root (first segment before '-')
const rootCenters = {
  // Eurasia
  ine: [44, 48],
  itc: [12, 43],
  cel: [-2, 50],
  gem: [12, 56],
  gmw: [7, 51],
  gmq: [16, 62],
  grk: [23, 39],
  bal: [25, 55],
  iir: [67, 37],
  ira: [60, 35],
  inc: [78, 26],
  sla: [24, 52],
  sqj: [20, 41],
  hyx: [44, 40],
  urj: [54, 60],
  trk: [88, 45],
  sit: [96, 28],
  aav: [104, 15],
  tai: [103, 20.5],
  dra: [78, 13],
  map: [120, 0],
  poz: [155, -10],
  sem: [42, 33],
  afa: [40, 15],
  ber: [2, 27],
  cus: [42, 8],
  egx: [30, 27],
  // Americas (coarse)
  alg: [-100, 48],
  iro: [-79, 44],
  sio: [-98, 44],
  ath: [-120, 59],
  azc: [-110, 33],
  myn: [-90, 16],
  oto: [-100, 21],
  cba: [-77, 8],
  qwe: [-75, -12],
  tup: [-58, -10],
  awd: [-62, 4],
  car: [-62, 6],
  mge: [-54, -12],
}

function sizeFor(code, root) {
  const big = [6.5, 4.0, 10]
  const medium = [4.0, 2.6, 0]
  const small = [2.6, 1.8, 0]
  const arctic = [7.5, 3.2, 0]
  const steppe = [7.0, 3.2, -15]

  if (code === 'ine-pro') return steppe
  if (root === 'ine') return big
  if (root === 'gem' || root === 'gmw' || root === 'gmq' || root === 'cel' || root === 'itc')
    return medium
  if (root === 'sla' || root === 'bal') return medium
  if (root === 'iir' || root === 'ira' || root === 'inc') return medium
  if (root === 'urj' || root === 'syd') return [4.5, 2.8, 10]
  if (root === 'trk' || root === 'xgn') return [6.0, 3.0, 0]
  if (
    root === 'sem' ||
    root === 'afa' ||
    root === 'ber' ||
    root === 'cus' ||
    root === 'cdc' ||
    root === 'alv'
  )
    return big
  if (root === 'dra') return [5.0, 3.0, 0]
  if (root === 'sit' || root === 'aav' || root === 'hmx' || root === 'kar' || root === 'tbq')
    return big
  if (
    root === 'map' ||
    root.startsWith('poz') ||
    root === 'phi' ||
    root === 'pqe' ||
    root === 'paa'
  )
    return [5.0, 3.0, 0]
  if (root === 'esx' || root === 'ypk' || root === 'qfa' || root === 'xnd') return arctic
  if (root === 'sai' || root === 'tup' || root === 'awd' || root === 'mge') return big
  return small
}

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function main() {
  const codes = loadJSON(codesPath)
  const region = fs.existsSync(regionsPath)
    ? loadJSON(regionsPath)
    : { type: 'FeatureCollection', features: [] }

  const propsByCode = new Map()
  for (const f of region.features || []) {
    if (!f || !f.properties || !f.properties.lang_code) continue
    propsByCode.set(f.properties.lang_code, f.properties)
  }

  const protoEntries = Object.entries(codes).filter(([code]) => code.endsWith('-pro'))

  const newFeatures = []
  let placeholders = 0
  for (const [code, name] of protoEntries) {
    const root = code.split('-')[0]
    const center = centers[code] || rootCenters[root] || [0, 0]
    const [rx, ry, angle] = sizeFor(code, root)
    const ring = ellipseAround(center, rx, ry, angle)
    const geometry = { type: 'Polygon', coordinates: [ring] }

    const existingProps = propsByCode.get(code) || {}
    const properties = {
      ...existingProps,
      lang_code: code,
      name: existingProps.name ?? String(name),
      variant: existingProps.variant ?? '',
    }
    if (!centers[code] && !rootCenters[root]) {
      properties.note = 'placeholder center; refine needed'
      placeholders++
    } else if (properties.note && /placeholder center/.test(String(properties.note))) {
      delete properties.note
    }

    newFeatures.push({ type: 'Feature', properties, geometry })
  }

  const out = { type: 'FeatureCollection', features: newFeatures }
  fs.writeFileSync(regionsPath, JSON.stringify(out, null, 2) + '\n')
  console.log(
    `Proto regions refined. Total ${newFeatures.length} features. Placeholders remaining: ${placeholders}.`,
  )
}

if (require.main === module) {
  try {
    main()
  } catch (e) {
    console.error('Failed to build proto regions:', e)
    process.exit(1)
  }
}
