export const normalizeOverviewMapZoom = (
  mainZoom: number,
  minZoom = 1,
  maxZoom = 6,
): number => {
  if (!Number.isFinite(mainZoom)) {
    return minZoom
  }

  const lowerBound = Math.min(minZoom, maxZoom)
  const upperBound = Math.max(minZoom, maxZoom)
  return Math.min(Math.max(mainZoom, lowerBound), upperBound)
}
