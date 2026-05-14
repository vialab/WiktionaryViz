export function flattenPathsFromTree(node, acc = []) {
  if (!node || typeof node !== 'object') return []

  const cur = {
    word: node.word || node.name,
    lang_code: node.lang_code,
    expansion: node.expansion,
    aggregated: node.aggregated,
    count: node.count,
  }

  const next = [...acc, cur]
  const children = Array.isArray(node.children) ? node.children : []
  if (!children.length) return [next]

  const out = []
  for (const child of children) {
    out.push(...flattenPathsFromTree(child, next))
  }
  return out
}

export function fallbackPoint(base, pathIndex, pointIndex, direction = 1) {
  const latJitter = ((pathIndex + 1) * 0.32 + (pointIndex + 1) * 0.11) * direction
  const lngJitter = ((pathIndex + 1) * 0.46 + (pointIndex + 1) * 0.07) * direction
  return [base[0] + latJitter, base[1] + lngJitter]
}